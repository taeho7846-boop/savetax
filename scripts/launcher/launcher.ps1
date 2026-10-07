param([string]$Url)

$ErrorActionPreference = "Stop"
$logFile = Join-Path $PSScriptRoot "launcher.log"

function Write-Log($msg) {
    "[$([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss'))] $msg" | Add-Content -LiteralPath $logFile -Encoding UTF8
}

# ---- Win32 (창 찾기 / 버튼 클릭 / 자식 창 글자 읽기) ----
Add-Type -Namespace SaveTax -Name Win32 -MemberDefinition @"
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowW(IntPtr lpClassName, string lpWindowName);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowExW(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
[DllImport("user32.dll")] public static extern IntPtr SendMessageW(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
[DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
public delegate bool EnumChildProc(IntPtr hWnd, IntPtr lParam);
[DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWndParent, EnumChildProc lpEnumFunc, IntPtr lParam);
"@

function Get-WinText($h) { $sb = New-Object System.Text.StringBuilder 1024; [void][SaveTax.Win32]::GetWindowTextW($h, $sb, 1024); $sb.ToString() }
function Get-WinClass($h) { $sb = New-Object System.Text.StringBuilder 256; [void][SaveTax.Win32]::GetClassNameW($h, $sb, 256); $sb.ToString() }
function Get-ChildWindows($parent) {
    $list = New-Object System.Collections.ArrayList
    $cb = [SaveTax.Win32+EnumChildProc]{ param($h, $l) [void]$list.Add($h); return $true }
    [void][SaveTax.Win32]::EnumChildWindows($parent, $cb, [IntPtr]::Zero)
    return $list
}

# 같은 이름의 파일이 이미 있으면(같은 날 다시 제작) 위하고 에이전트가
#   "질의 — 이미 기록된 파일이 있습니다. 덮어쓰시겠습니까?  [예(Y)] [아니요(N)]" 창을 띄운다 → 예(Y)를 눌러 준다.
# '질의'라는 제목은 흔하므로 본문에 '덮어쓰'가 있을 때만 누른다. 본문을 못 읽은 경우에는
# 방금 폴더 선택 창에서 확인을 누른 직후($recent)이고 예/아니요 버튼이 둘 다 있을 때만 누른다.
function Confirm-OverwriteDialog([bool]$recent) {
    $q = [SaveTax.Win32]::FindWindowW([IntPtr]::Zero, '질의')
    if ($q -eq [IntPtr]::Zero -or -not [SaveTax.Win32]::IsWindowVisible($q)) { return $false }
    $yes = [IntPtr]::Zero; $no = [IntPtr]::Zero; $qText = ''
    foreach ($c in (Get-ChildWindows $q)) {
        $cls = Get-WinClass $c; $txt = Get-WinText $c
        if ($cls -match 'static' -and $txt) { $qText += ' ' + $txt }
        if ($cls -match 'button' -and $txt -match '^예') { $yes = $c }
        if ($cls -match 'button' -and $txt -match '^아니') { $no = $c }
    }
    $qText = $qText.Trim()
    $isOverwrite = ($qText -match '덮어쓰') -or (-not $qText -and $recent -and $yes -ne [IntPtr]::Zero -and $no -ne [IntPtr]::Zero)
    if (-not $isOverwrite) { return $false }
    Write-Log "  질의 창(덮어쓰기): '$qText' -> 예"
    if ($yes -ne [IntPtr]::Zero) { [void][SaveTax.Win32]::PostMessageW($yes, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) }   # BM_CLICK
    else { [void][SaveTax.Win32]::PostMessageW($q, 0x0111, [IntPtr]6, [IntPtr]::Zero) }                                  # WM_COMMAND IDYES
    Start-Sleep -Milliseconds 500
    if ([SaveTax.Win32]::IsWindowVisible($q)) {
        # 버튼 클릭이 안 먹었으면 창에 직접 '예' 명령
        [void][SaveTax.Win32]::PostMessageW($q, 0x0111, [IntPtr]6, [IntPtr]::Zero)
        Start-Sleep -Milliseconds 400
        if ([SaveTax.Win32]::IsWindowVisible($q)) { Write-Log "  질의 창이 닫히지 않음" }
    }
    return $true
}

# 위하고 전자신고 "폴더 선택" 창을 기다렸다가 확인을 눌러 주고, 선택된 폴더에 생긴 전자신고 파일을
# C:\savetax-efile\ 로 복사한 뒤 latest.json 에 기록 (크롬 확장이 이 고정 경로를 읽어 서버에 올리고 홈택스에 넣음)
function Invoke-EfileDialog([int]$count, [int]$timeoutSec) {
    $outDir = 'C:\savetax-efile'
    if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
    $latestPath = Join-Path $outDir 'latest.json'
    $entries = @()
    if (Test-Path -LiteralPath $latestPath) {
        try { $entries = @((Get-Content -LiteralPath $latestPath -Raw -Encoding UTF8 | ConvertFrom-Json)) } catch { $entries = @() }
    }
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    $handled = 0
    $seen = @{}
    # 도우미 상태 파일: 확장이 "도우미가 돌고 있는지 / 폴더 선택 창을 봤는지"를 알 수 있게 남긴다.
    #   제작 버튼 클릭이 빗나가 저장 창이 안 뜬 경우(= seenAt이 클릭 시각보다 이전)에만 확장이 버튼을 다시 누른다.
    $helperPath = Join-Path $outDir 'helper.json'
    $epoch = [datetime]'1970-01-01'
    $startedMs = [int64]((Get-Date).ToUniversalTime() - $epoch).TotalMilliseconds
    $untilMs = $startedMs + [int64]$timeoutSec * 1000
    $saveHelper = {
        param([int64]$seenAt)
        try { ([pscustomobject]@{ startedAt = $startedMs; until = $untilMs; seenAt = $seenAt } | ConvertTo-Json -Compress) | Set-Content -LiteralPath $helperPath -Encoding UTF8 } catch {}
    }
    & $saveHelper 0
    while ($handled -lt $count -and (Get-Date) -lt $deadline) {
        if (Confirm-OverwriteDialog $false) { continue }
        $h = [SaveTax.Win32]::FindWindowW([IntPtr]::Zero, '폴더 선택')
        if ($h -eq [IntPtr]::Zero -or -not [SaveTax.Win32]::IsWindowVisible($h) -or $seen.ContainsKey([string]$h)) { Start-Sleep -Milliseconds 400; continue }
        Write-Log "폴더 선택 창 발견: $h"
        & $saveHelper ([int64]((Get-Date).ToUniversalTime() - $epoch).TotalMilliseconds)
        # 선택된 폴더 경로 (Static 컨트롤 중 드라이브 경로 형태)
        $folder = ''
        $okBtn = [IntPtr]::Zero
        foreach ($c in (Get-ChildWindows $h)) {
            $cls = Get-WinClass $c; $txt = Get-WinText $c
            if ($cls -match 'static' -and $txt -match '^[A-Za-z]:\\') { $folder = $txt }
            if ($cls -match 'button' -and $txt -eq '확인') { $okBtn = $c }
        }
        Write-Log "  선택 폴더: '$folder'  확인버튼: $okBtn"
        $before = @{}
        if ($folder -and (Test-Path -LiteralPath $folder)) {
            Get-ChildItem -LiteralPath $folder -File | Where-Object { $_.Name -match '^\d{8}[AC]103900\.0?1$' } | ForEach-Object { $before[$_.Name] = $_.LastWriteTimeUtc }
        }
        $startedAt = Get-Date
        if ($okBtn -ne [IntPtr]::Zero) {
            [void][SaveTax.Win32]::PostMessageW($okBtn, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)   # BM_CLICK (Post: 뒤이어 뜨는 안내 창에 막히지 않게)
        } else {
            [void][SaveTax.Win32]::SetForegroundWindow($h)
            [void][SaveTax.Win32]::PostMessageW($h, 0x0100, [IntPtr]13, [IntPtr]::Zero)          # WM_KEYDOWN Enter
            [void][SaveTax.Win32]::PostMessageW($h, 0x0101, [IntPtr]13, [IntPtr]::Zero)
        }
        $seen[[string]$h] = $true
        $handled++
        Write-Log "  확인 클릭 ($handled/$count)"
        # 저장 후 뜨는 "안내 — 지정한 경로에 저장되었습니다. C:\...\파일명" 창 → 경로 읽고 확인 클릭 (최대 25초)
        $savedPath = ''
        $untilA = (Get-Date).AddSeconds(25)
        while ((Get-Date) -lt $untilA -and -not $savedPath) {
            Start-Sleep -Milliseconds 400
            # 이미 제작한 파일이 있으면 덮어쓰기 질의가 먼저 뜬다 → 예 누르고 안내 창을 다시 기다림
            if (Confirm-OverwriteDialog $true) { $untilA = (Get-Date).AddSeconds(25); continue }
            $a = [SaveTax.Win32]::FindWindowW([IntPtr]::Zero, '안내')
            if ($a -eq [IntPtr]::Zero -or -not [SaveTax.Win32]::IsWindowVisible($a)) { continue }
            $aOk = [IntPtr]::Zero; $aText = ''
            foreach ($c in (Get-ChildWindows $a)) {
                $cls = Get-WinClass $c; $txt = Get-WinText $c
                if ($cls -match 'static' -and $txt) { $aText += ' ' + $txt }
                if ($cls -match 'button' -and $txt -eq '확인') { $aOk = $c }
            }
            if ($aText -match '([A-Za-z]:\\[^\r\n"]*?\d{8}[AC]103900\.0?1)') { $savedPath = $Matches[1] }
            if ($aText -match '저장') {
                Write-Log "  안내 창: $($aText.Trim())"
                if ($aOk -ne [IntPtr]::Zero) { [void][SaveTax.Win32]::PostMessageW($aOk, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) }
                else { [void][SaveTax.Win32]::PostMessageW($a, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }  # WM_CLOSE
                if (-not $savedPath) { break }
            }
        }
        # 저장된 파일 찾기: 안내 창의 경로 → 없으면 폴더에 새로 생긴 파일 (최대 20초)
        $found = $null
        if ($savedPath -and (Test-Path -LiteralPath $savedPath)) { $found = Get-Item -LiteralPath $savedPath; $folder = Split-Path -Parent $savedPath }
        if ($folder) {
            $until = (Get-Date).AddSeconds(20)
            while ((Get-Date) -lt $until -and -not $found) {
                Start-Sleep -Milliseconds 500
                if (Confirm-OverwriteDialog $true) { $until = (Get-Date).AddSeconds(20) }
                $cands = Get-ChildItem -LiteralPath $folder -File -ErrorAction SilentlyContinue | Where-Object {
                    $_.Name -match '^\d{8}[AC]103900\.0?1$' -and (-not $before.ContainsKey($_.Name) -or $_.LastWriteTimeUtc -gt $before[$_.Name])
                } | Sort-Object LastWriteTimeUtc -Descending
                if ($cands) { $found = $cands[0] }
            }
            if ($found) {
                Start-Sleep -Milliseconds 300
                $dest = Join-Path $outDir $found.Name
                Copy-Item -LiteralPath $found.FullName -Destination $dest -Force
                $kind = if ($found.Name -match 'C103900') { 'income' } else { 'local' }
                $entries = @($entries | Where-Object { $_.kind -ne $kind }) + @([pscustomobject]@{ kind = $kind; name = $found.Name; path = $dest; source = $found.FullName; at = [int64]((Get-Date).ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds })
                ($entries | ConvertTo-Json -Compress) | Set-Content -LiteralPath $latestPath -Encoding UTF8
                Write-Log "  파일 복사: $($found.FullName) -> $dest ($kind)"
            } else {
                Write-Log "  새 파일을 찾지 못함: $folder"
            }
        }
    }
    Write-Log "efile-dialog 종료 (처리 $handled/$count)"
}

try {
    Write-Log "Received: $Url"
    Add-Type -AssemblyName System.Web

    if (-not $Url) { Write-Log "Empty URL"; exit 1 }

    $rest = $Url -replace '^savetax-app://', ''
    $parts = $rest -split '\?', 2
    $action = $parts[0].TrimEnd('/')
    $queryString = if ($parts.Length -gt 1) { $parts[1].TrimEnd('/') } else { '' }

    $params = @{}
    if ($queryString) {
        foreach ($pair in ($queryString -split '&')) {
            $kv = $pair -split '=', 2
            if ($kv.Length -eq 2) {
                $params[$kv[0]] = [System.Web.HttpUtility]::UrlDecode($kv[1])
            }
        }
    }

    Write-Log "Action: $action"
    foreach ($k in $params.Keys) { Write-Log "  param[$k] = $($params[$k])" }

    switch ($action) {
        'folder' {
            $path = $params['path']
            if (-not $path) { Write-Log "No path param"; exit 1 }
            if (Test-Path -LiteralPath $path) {
                Start-Process -FilePath 'explorer.exe' -ArgumentList "`"$path`""
                Write-Log "Opened folder: $path"
            } else {
                Write-Log "Folder not found: $path"
                Add-Type -AssemblyName PresentationFramework
                [System.Windows.MessageBox]::Show("Folder not found:`n$path", "Savetax Launcher", 'OK', 'Warning') | Out-Null
            }
        }
        'launch' {
            $path = $params['path']
            if (-not $path) { Write-Log "No path param"; exit 1 }
            if (Test-Path -LiteralPath $path) {
                Start-Process -FilePath $path
                Write-Log "Launched: $path"
            } else {
                Write-Log "App not found: $path"
                Add-Type -AssemblyName PresentationFramework
                [System.Windows.MessageBox]::Show("App not found:`n$path", "Savetax Launcher", 'OK', 'Warning') | Out-Null
            }
        }
        'efile-dialog' {
            # 원천세 자동신고: 위하고 전자신고 파일 제작 시 뜨는 '폴더 선택' 창 자동 확인 + 파일 복사
            $count = 1; $timeout = 180
            if ($params['count']) { $count = [int]$params['count'] }
            if ($params['timeout']) { $timeout = [int]$params['timeout'] }
            Invoke-EfileDialog $count $timeout
        }
        default {
            Write-Log "Unknown action: $action"
        }
    }
} catch {
    Write-Log "ERROR: $_"
    Write-Log $_.ScriptStackTrace
}

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
    while ($handled -lt $count -and (Get-Date) -lt $deadline) {
        $h = [SaveTax.Win32]::FindWindowW([IntPtr]::Zero, '폴더 선택')
        if ($h -eq [IntPtr]::Zero -or -not [SaveTax.Win32]::IsWindowVisible($h) -or $seen.ContainsKey([string]$h)) { Start-Sleep -Milliseconds 400; continue }
        Write-Log "폴더 선택 창 발견: $h"
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
            [void][SaveTax.Win32]::SendMessageW($okBtn, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)   # BM_CLICK
        } else {
            [void][SaveTax.Win32]::SetForegroundWindow($h)
            [void][SaveTax.Win32]::PostMessageW($h, 0x0100, [IntPtr]13, [IntPtr]::Zero)          # WM_KEYDOWN Enter
            [void][SaveTax.Win32]::PostMessageW($h, 0x0101, [IntPtr]13, [IntPtr]::Zero)
        }
        $seen[[string]$h] = $true
        $handled++
        Write-Log "  확인 클릭 ($handled/$count)"
        # 새 파일 대기 (최대 20초) → 복사 + 기록
        if ($folder) {
            $found = $null
            $until = (Get-Date).AddSeconds(20)
            while ((Get-Date) -lt $until -and -not $found) {
                Start-Sleep -Milliseconds 500
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

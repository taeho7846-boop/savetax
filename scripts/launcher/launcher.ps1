param([string]$Url)

$ErrorActionPreference = "Stop"
$logFile = Join-Path $PSScriptRoot "launcher.log"

function Write-Log($msg) {
    "[$([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss'))] $msg" | Add-Content -LiteralPath $logFile -Encoding UTF8
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
                [System.Windows.MessageBox]::Show("폴더를 찾을 수 없습니다:`n$path", "Savetax Launcher", 'OK', 'Warning') | Out-Null
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
                [System.Windows.MessageBox]::Show("앱을 찾을 수 없습니다:`n$path", "Savetax Launcher", 'OK', 'Warning') | Out-Null
            }
        }
        default {
            Write-Log "Unknown action: $action"
        }
    }
} catch {
    Write-Log "ERROR: $_"
    Write-Log $_.ScriptStackTrace
}

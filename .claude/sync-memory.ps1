# sync-memory.ps1 — Export or import Claude Code memory for this project
# Run from the project root on any device.
#
# Export (this device → .claude-memory/ folder in repo):
#   .\sync-memory.ps1 export
#
# Import (repo .claude-memory/ → this device's Claude memory):
#   .\sync-memory.ps1 import

param([string]$Action = "export")

$projectPath = (Get-Location).Path -replace '\\', '/'
# Claude Code stores memory keyed by the project directory path
$escapedPath = $projectPath -replace '/', '-' -replace ':', '-' -replace ' ', '-'
$memorySource = "$env:USERPROFILE\.claude\projects\$escapedPath\memory"
$repoMemory   = Join-Path (Get-Location) ".claude-memory"

if ($Action -eq "export") {
    if (-not (Test-Path $memorySource)) {
        Write-Host "No memory found at: $memorySource" -ForegroundColor Yellow
        exit
    }
    New-Item -ItemType Directory -Force -Path $repoMemory | Out-Null
    Copy-Item "$memorySource\*" $repoMemory -Recurse -Force
    Write-Host "Memory exported to .claude-memory/ — commit and push to sync to other devices." -ForegroundColor Green
}
elseif ($Action -eq "import") {
    if (-not (Test-Path $repoMemory)) {
        Write-Host "No .claude-memory/ folder found in repo." -ForegroundColor Yellow
        exit
    }
    New-Item -ItemType Directory -Force -Path $memorySource | Out-Null
    Copy-Item "$repoMemory\*" $memorySource -Recurse -Force
    Write-Host "Memory imported to: $memorySource" -ForegroundColor Green
    Write-Host "Restart Claude Code to load the memory." -ForegroundColor Cyan
}
else {
    Write-Host "Usage: .\sync-memory.ps1 [export|import]"
}

Param(
  [int]$Port = 8080
)

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RepoRoot

if (Test-Path "$RepoRoot\scripts\validate_reports.py") {
  python "$RepoRoot\scripts\validate_reports.py"
}

if (Test-Path "$RepoRoot\update_dashboard.py") {
  python "$RepoRoot\update_dashboard.py"
} elseif (Test-Path "$RepoRoot\scripts\update_dashboard.py") {
  python "$RepoRoot\scripts\update_dashboard.py"
} else {
  Write-Error "Could not find update_dashboard.py in repo root or scripts/."
  exit 1
}

python -m http.server $Port

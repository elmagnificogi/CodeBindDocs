# Launch a standalone VS Code Extension Development Host for CIM.
# Prefer: npm run debug  (scripts/debug.ps1)

param(
  [switch]$Watch
)

& "$PSScriptRoot\debug.ps1" -Watch:$Watch

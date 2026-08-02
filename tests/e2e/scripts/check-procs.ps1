$ErrorActionPreference = 'Continue'
Write-Output '--- node processes ---'
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize
Write-Output '--- 3101 port ---'
Get-NetTCPConnection -LocalPort 3101 -ErrorAction SilentlyContinue | Select-Object LocalPort, State, OwningProcess | Format-Table -AutoSize
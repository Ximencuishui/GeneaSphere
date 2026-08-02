$ErrorActionPreference = 'Continue'
Write-Output '--- 3000 端口监听 ---'
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess | Format-Table
Write-Output '--- node 进程 ---'
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, StartTime, MainWindowTitle | Format-Table -AutoSize
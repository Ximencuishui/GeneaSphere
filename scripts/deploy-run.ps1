$log = 'e:\GeneaSphere\deploy-run.log'
$exit = 'e:\GeneaSphere\deploy-run.exit'
Remove-Item $log, $exit -ErrorAction SilentlyContinue
& powershell -NoProfile -ExecutionPolicy Bypass -File "e:\GeneaSphere\deploy.ps1" -ServerIP "43.134.232.175" -SkipBuild 2>&1 |
    ForEach-Object { "$_" | Add-Content -Path $log -Encoding UTF8 }
$LASTEXITCODE | Add-Content -Path $exit -Encoding UTF8

$ErrorActionPreference = 'Continue'
try {
  $r = Invoke-WebRequest -Uri 'http://localhost:3101/api/tree/clan/zhuxi-demo/full' -UseBasicParsing -TimeoutSec 15
  Write-Output ('STATUS:' + $r.StatusCode + ' LEN:' + $r.Content.Length)
} catch {
  Write-Output ('ERR:' + $_.Exception.Message)
}
try {
  $r = Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 5
  Write-Host "Frontend OK - status: $($r.StatusCode)"
} catch {
  Write-Host "Frontend Error: $($_.Exception.Message)"
}

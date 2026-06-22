try {
  $r = Invoke-RestMethod -Uri 'http://localhost:3001/auth/demo-login' -Method Post -ContentType 'application/json'
  Write-Host "Backend OK - access_token present: $($null -ne $r.access_token)"
} catch {
  Write-Host "Backend Error: $($_.Exception.Message)"
}

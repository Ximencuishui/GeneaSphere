$ErrorActionPreference = 'Continue'
$urls = @(
    'http://localhost:5173/api/health/ready',
    'http://localhost:5173/api/health',
    'http://localhost:5173/api',
    'http://localhost:5173/login',
    'http://localhost:5173/'
)
foreach ($u in $urls) {
    try {
        $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 10 -Headers @{ Host = 'localhost' }
        Write-Output ("{0} -> {1}" -f $u, $r.StatusCode)
    } catch {
        $code = 'unknown'
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        Write-Output ("{0} -> ERR_{1} msg={2}" -f $u, $code, $_.Exception.Message)
    }
}
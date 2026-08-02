$ErrorActionPreference = 'Continue'
$urls = @(
    'http://127.0.0.1:5173/api/health/ready',
    'http://127.0.0.1:5173/api/health',
    'http://127.0.0.1:5173/api',
    'http://127.0.0.1:5173/login',
    'http://127.0.0.1:5173/'
)
foreach ($u in $urls) {
    try {
        $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 10
        Write-Output ("{0} -> {1}" -f $u, $r.StatusCode)
    } catch {
        $code = 'unknown'
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        Write-Output ("{0} -> ERR_{1}" -f $u, $code)
    }
}
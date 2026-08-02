$ErrorActionPreference = 'Continue'
function Test-Url {
    param($Url, $Label)
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        Write-Output ("{0}:{1}" -f $Label, $r.StatusCode)
    } catch {
        $code = 'unknown'
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        Write-Output ("{0}:ERR_{1}" -f $Label, $code)
    }
}
Test-Url 'http://127.0.0.1:3101/api/health/ready' 'API_HEALTH_R'
Test-Url 'http://127.0.0.1:3101/api/health' 'API_HEALTH'
Test-Url 'http://127.0.0.1:3101/api' 'API_ROOT'
Test-Url 'http://127.0.0.1:5173/api/health/ready' 'WEB_PROXY'
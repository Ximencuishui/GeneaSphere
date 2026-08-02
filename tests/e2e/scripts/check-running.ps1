$ErrorActionPreference = 'Continue'
function Test-Url {
    param($Url, $Label)
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        Write-Output ("{0}:{1}" -f $Label, $r.StatusCode)
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        Write-Output ("{0}:ERR_{1}" -f $Label, $code)
    }
}
Test-Url 'http://127.0.0.1:3000/api/health/ready' 'HEALTH'
Test-Url 'http://127.0.0.1:3000/api/health' 'HEALTH_SIMPLE'
Test-Url 'http://127.0.0.1:3000/api' 'ROOT'
Test-Url 'http://127.0.0.1:5173/' 'WEB'
Test-Url 'http://127.0.0.1:5173/login' 'LOGIN'
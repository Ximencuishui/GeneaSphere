# GeneaSphere Demo Data Refresh Script
# Usage: .\scripts\refresh-demo.ps1 [-SkipHealthCheck] [-KeepServerRunning]

param(
    [switch]$SkipHealthCheck,
    [switch]$KeepServerRunning
)

$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor White
Write-Host "  GeneaSphere Demo Data Refresh" -ForegroundColor White
Write-Host "========================================" -ForegroundColor White
Write-Host ""

# Step 0: Check prerequisites
Write-Host ">> Checking prerequisites..." -ForegroundColor Cyan
try {
    $null = node --version
    $null = pnpm --version
    Write-Host "   OK  Node.js and pnpm found" -ForegroundColor Green
} catch {
    Write-Host "   FAIL Node.js or pnpm not found" -ForegroundColor Red
    exit 1
}

# Check SSH tunnel (database connection)
Write-Host ">> Checking database connection..." -ForegroundColor Cyan
$dbPort = 15432
$dbReady = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect("127.0.0.1", $dbPort)
    $dbReady = $tcp.Connected
    $tcp.Close()
} catch {}

if (-not $dbReady) {
    Write-Host "   !! Database port $dbPort not reachable, starting SSH tunnel..." -ForegroundColor Yellow
    $sshKey = Join-Path $env:USERPROFILE ".ssh\id_ed25519"
    if (-not (Test-Path $sshKey)) {
        Write-Host "   FAIL SSH key not found: $sshKey" -ForegroundColor Red
        Write-Host "   Please start SSH tunnel manually:" -ForegroundColor Red
        Write-Host "   ssh -L 127.0.0.1:15432:127.0.0.1:15432 root@43.134.232.175 -N" -ForegroundColor Red
        exit 1
    }
    
    # Start SSH tunnel in background
    $sshProcess = Start-Process -FilePath "ssh" `
        -ArgumentList "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", "-i", $sshKey, "-L", "127.0.0.1:${dbPort}:127.0.0.1:${dbPort}", "root@43.134.232.175", "-N" `
        -PassThru `
        -WindowStyle Hidden
    
    # Wait for tunnel to establish
    Write-Host "   Waiting for SSH tunnel..." -ForegroundColor Gray
    $tunnelTimeout = 30
    $tunnelElapsed = 0
    while ($tunnelElapsed -lt $tunnelTimeout) {
        Start-Sleep -Seconds 2
        $tunnelElapsed += 2
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect("127.0.0.1", $dbPort)
            $dbReady = $tcp.Connected
            $tcp.Close()
            if ($dbReady) { break }
        } catch {}
        Write-Host "   ... ${tunnelElapsed}s" -ForegroundColor DarkGray
    }
    
    if (-not $dbReady) {
        Write-Host "   FAIL SSH tunnel failed to establish" -ForegroundColor Red
        if ($sshProcess) { Stop-Process $sshProcess -Force -ErrorAction SilentlyContinue }
        exit 1
    }
    Write-Host "   OK  SSH tunnel established" -ForegroundColor Green
} else {
    Write-Host "   OK  Database port $dbPort is reachable" -ForegroundColor Green
}

# Step 1: Delete old demo data
Write-Host ""
Write-Host ">> [1/4] Deleting old demo data..." -ForegroundColor Cyan

$resetScript = Join-Path $ROOT "scripts\reset-zhuxi-demo.mjs"
if (-not (Test-Path $resetScript)) {
    Write-Host "   FAIL Script not found: $resetScript" -ForegroundColor Red
    exit 1
}

Push-Location $ROOT
node $resetScript
$exitCode = $LASTEXITCODE
Pop-Location

if ($exitCode -ne 0) {
    Write-Host "   FAIL Reset script failed with code: $exitCode" -ForegroundColor Red
    exit 1
}
Write-Host "   OK  Old demo data deleted" -ForegroundColor Green

# Step 2: Start backend service
Write-Host ""
Write-Host ">> [2/4] Starting backend service (auto-seed)..." -ForegroundColor Cyan

$logFile = Join-Path $ROOT "temp\refresh-demo.log"
$tempDir = Join-Path $ROOT "temp"
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}

$serverProcess = Start-Process -FilePath "pnpm" `
    -ArgumentList "--filter", "server", "dev" `
    -WorkingDirectory $ROOT `
    -RedirectStandardOutput $logFile `
    -RedirectStandardError (Join-Path $ROOT "temp\refresh-demo-err.log") `
    -PassThru `
    -NoNewWindow

Write-Host "   Waiting for service startup (max 300s)..." -ForegroundColor Gray

$serverReady = $false
$elapsed = 0
$seedTimeoutSec = 300
$pollIntervalSec = 5

while ($elapsed -lt $seedTimeoutSec) {
    Start-Sleep -Seconds $pollIntervalSec
    $elapsed += $pollIntervalSec

    if (Test-Path $logFile) {
        $logContent = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        
        if ($logContent -match "Listening on|successfully") {
            Start-Sleep -Seconds 5
            $serverReady = $true
            break
        }
        
        if ($logContent -match "EADDRINUSE|Error:.*listen") {
            Write-Host "   FAIL Service startup failed" -ForegroundColor Red
            if ($serverProcess) { Stop-Process $serverProcess -Force -ErrorAction SilentlyContinue }
            exit 1
        }
    }

    Write-Host "   ... ${elapsed}s" -ForegroundColor DarkGray
    
    if ($serverProcess.HasExited) {
        Write-Host "   FAIL Service process exited unexpectedly" -ForegroundColor Red
        exit 1
    }
}

if (-not $serverReady) {
    Write-Host "   !! Timeout (${seedTimeoutSec}s), continuing..." -ForegroundColor Yellow
} else {
    Write-Host "   OK  Service ready (${elapsed}s)" -ForegroundColor Green
}

# Step 3: Health check
if (-not $SkipHealthCheck) {
    Write-Host ""
    Write-Host ">> [3/4] Running health check..." -ForegroundColor Cyan

    $healthScript = Join-Path $ROOT "scripts\check-demo-seed-health.mjs"
    if (Test-Path $healthScript) {
        Push-Location $ROOT
        node $healthScript
        $healthExitCode = $LASTEXITCODE
        Pop-Location

        if ($healthExitCode -eq 0) {
            Write-Host "   OK  Health check passed" -ForegroundColor Green
        } else {
            Write-Host "   !! Health check failed (code: $healthExitCode)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   !! Health script not found, skipping" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host ">> [3/4] Skipping health check" -ForegroundColor Cyan
}

# Step 4: Cleanup
Write-Host ""
Write-Host ">> [4/4] Cleanup..." -ForegroundColor Cyan

if (-not $KeepServerRunning) {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process $serverProcess -Force -ErrorAction SilentlyContinue
        Write-Host "   OK  Service stopped" -ForegroundColor Green
    }
} else {
    Write-Host "   OK  Service kept running" -ForegroundColor Green
}

# Done
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Demo data refresh completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Demo accounts:" -ForegroundColor White
Write-Host "    13800000000 / demo123 (admin)" -ForegroundColor White
Write-Host "    13800000001 / demo123 (member)" -ForegroundColor White
Write-Host ""

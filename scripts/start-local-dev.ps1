# ============================================================
# GeneaSphere Local Dev Startup Script
# ============================================================
param(
    [string]$ServerIP = "43.134.232.175",
    [int]$SSHPort = 22,
    [string]$SSHUser = "root",
    [int]$LocalDBPort = 15432,
    [int]$RemoteDBPort = 15432
)

$ErrorActionPreference = "Stop"

function Write-Info { param($msg) Write-Host "[INFO]  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-ErrorColored { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

$ProjectDir = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectDir

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  GeneaSphere Local Dev Startup             " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check SSH tunnel
Write-Info "Checking SSH tunnel (127.0.0.1:${LocalDBPort})..."
$existingTunnel = Get-NetTCPConnection -LocalPort $LocalDBPort -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
if ($existingTunnel) {
    Write-Warn "Port ${LocalDBPort} already in use, skip SSH tunnel"
} else {
    Write-Info "Creating SSH tunnel: ${LocalDBPort} -> ${ServerIP}:${RemoteDBPort} ..."
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "ssh -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -L 127.0.0.1:${LocalDBPort}:127.0.0.1:${RemoteDBPort} -p ${SSHPort} ${SSHUser}@${ServerIP}"
    ) -WindowStyle Minimized

    $maxWait = 15
    $connected = $false
    for ($i = 1; $i -le $maxWait; $i++) {
        Start-Sleep -Seconds 1
        $check = Get-NetTCPConnection -LocalPort $LocalDBPort -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
        if ($check) {
            $connected = $true
            break
        }
    }

    if (-not $connected) {
        Write-ErrorColored "SSH tunnel failed. Please check:"
        Write-ErrorColored "  1. Server ${ServerIP}:${SSHPort} is reachable"
        Write-ErrorColored "  2. SSH key/password is configured"
        Write-ErrorColored "  3. Remote PostgreSQL listens on 127.0.0.1:${RemoteDBPort}"
        exit 1
    }
    Write-Info "SSH tunnel created"
}

# 2. Start backend
Write-Info "Starting backend..."
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$ProjectDir'; pnpm --filter server dev"
) -WindowStyle Minimized

# 3. Start frontend
Write-Info "Starting frontend..."
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$ProjectDir'; pnpm --filter web dev"
) -WindowStyle Minimized

Write-Host ""
Write-Info "Services starting, please wait..."
Write-Info "Frontend: http://localhost:5173"
Write-Info "Backend:  http://localhost:3000"
Write-Host ""
Write-Host "Tip: Close the popup PowerShell windows to stop services" -ForegroundColor Cyan
Write-Host ""

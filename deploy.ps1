# ============================================================
#  GeneaSphere Deploy - Windows PowerShell
#  Usage: .\deploy.ps1 -ServerIP "43.134.232.175"
# ============================================================
param(
    [Parameter(Mandatory=$true)]
    [string]$ServerIP,

    [int]$SSHPort = 22,

    [string]$ProjectDir = ".",

    [string]$RemoteDir = "/opt/geneasphere",

    [switch]$BuildOnly = $false,

    [switch]$DeployOnly = $false,

    [switch]$SkipBuild = $false
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  GeneaSphere Deploy - Windows PowerShell  " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Resolve to absolute path
$ProjectDir = (Resolve-Path $ProjectDir).Path
Write-Host "Project dir: $ProjectDir" -ForegroundColor Green
Write-Host "Target server: ${ServerIP}:${SSHPort}" -ForegroundColor Green
Write-Host ""

# ==================== SSH Check ====================
function Test-SSHConnection {
    Write-Host "[Check] SSH connection..." -ForegroundColor Yellow
    $result = ssh -p $SSHPort -o ConnectTimeout=5 -o StrictHostKeyChecking=no "root@$ServerIP" "echo OK" 2>&1
    if ($result -match "OK") {
        Write-Host "  SSH OK" -ForegroundColor Green
        return $true
    } else {
        Write-Host "  SSH FAILED: $result" -ForegroundColor Red
        return $false
    }
}

# ==================== Upload Files ====================
function Upload-Files {
    Write-Host "[Upload] Project files to server..." -ForegroundColor Yellow

    $tempTar = "$env:TEMP\geneasphere-deploy.tar.gz"

    Write-Host "  Packaging project files..."
    if (Test-Path "$ProjectDir\.git") {
        git -C $ProjectDir archive --format=tar.gz -o $tempTar HEAD
    } else {
        & tar -czf $tempTar `
            --exclude='node_modules' `
            --exclude='.git' `
            --exclude='temp' `
            --exclude='storage' `
            --exclude='uploads' `
            --exclude='*.7z' `
            --exclude='*.tgz' `
            --exclude='*.tar.gz' `
            --exclude='GraphicsMagick-*' `
            --exclude='install_output.txt' `
            --exclude='run_pnpm.bat' `
            --exclude='create-schema.ps1' `
            -C $ProjectDir .
    }

    Write-Host "  Uploading to server..."
    scp -P $SSHPort $tempTar "root@${ServerIP}:${RemoteDir}/deploy.tar.gz"

    Write-Host "  Extracting..."
    ssh -p $SSHPort "root@$ServerIP" "
        cd $RemoteDir
        tar -xzf deploy.tar.gz
        rm -f deploy.tar.gz
        echo 'Extract done'
    "

    Remove-Item $tempTar -Force -ErrorAction SilentlyContinue
    Write-Host "  Upload done" -ForegroundColor Green
}

# ==================== Upload deploy.sh ====================
function Upload-DeployScript {
    Write-Host "[Upload] Deploy script..." -ForegroundColor Yellow
    scp -P $SSHPort "$ProjectDir\deploy.sh" "root@${ServerIP}:${RemoteDir}/deploy.sh"
    ssh -p $SSHPort "root@$ServerIP" "chmod +x $RemoteDir/deploy.sh"
    Write-Host "  Deploy script done" -ForegroundColor Green
}

# ==================== Build Project (Local) ====================
function Build-Local {
    Write-Host "[Build] Local build..." -ForegroundColor Yellow

    Set-Location $ProjectDir

    if (-not (Test-Path "node_modules")) {
        Write-Host "  Installing dependencies..."
        pnpm install
    }

    Write-Host "  Generating Prisma Client..."
    npx prisma generate

    Write-Host "  Building server..."
    pnpm --filter server build

    Write-Host "  Building web..."
    Set-Location "$ProjectDir\apps\web"
    $env:NODE_OPTIONS = '--max-old-space-size=1024'
    npx vite build --mode production
    Set-Location $ProjectDir

    Write-Host "  Build done" -ForegroundColor Green
}

# ==================== Remote Deploy ====================
function Deploy-Remote {
    Write-Host "[Deploy] Running deploy on server..." -ForegroundColor Yellow

    ssh -p $SSHPort "root@$ServerIP" "
        export USE_MIRROR=false
        export INSTALL_TESSERACT=false
        bash $RemoteDir/deploy.sh
    "
}

# ==================== Main ====================
function Main {
    if (-not (Test-SSHConnection)) {
        Write-Host "Please ensure:" -ForegroundColor Yellow
        Write-Host "  1. Server IP is correct" -ForegroundColor Yellow
        Write-Host "  2. SSH port is correct (default 22)" -ForegroundColor Yellow
        Write-Host "  3. SSH key configured or password available" -ForegroundColor Yellow
        exit 1
    }

    if ($BuildOnly) {
        Build-Local
        return
    }

    if ($DeployOnly) {
        Upload-Files
        Deploy-Remote
        return
    }

    if (-not $SkipBuild) {
        Build-Local
    }
    Upload-Files
    Upload-DeployScript
    Deploy-Remote
}

Main

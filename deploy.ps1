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
    # 始终用 tar 打包：git archive 只包含已提交文件，会漏掉未跟踪的新增文件（如新图片资源）
    # 只传源码：本地构建产物 / 依赖缓存 / 大二进制一律排除，否则包体过大会被跨境链路掐断
    & tar -czf $tempTar `
        --exclude='node_modules' `
        --exclude='.pnpm-store' `
        --exclude='.git' `
        --exclude='videos' `
        --exclude='temp' `
        --exclude='tmp' `
        --exclude='storage' `
        --exclude='uploads' `
        --exclude='tests' `
        --exclude='deploy_bundle' `
        --exclude='deploy_light' `
        --exclude='*.7z' `
        --exclude='*.tgz' `
        --exclude='*.tar.gz' `
        --exclude='*.log' `
        --exclude='*.traineddata' `
        --exclude='GraphicsMagick-*' `
        --exclude='install_output.txt' `
        --exclude='run_pnpm.bat' `
        --exclude='create-schema.ps1' `
        --exclude='apps/web/dist' `
        --exclude='apps/web/dist.new' `
        --exclude='apps/web/node_modules' `
        --exclude='apps/server/dist' `
        -C $ProjectDir .

    $tarMB = [math]::Round((Get-Item $tempTar).Length / 1MB)
    Write-Host "  Package size: ${tarMB} MB"
    if ($tarMB -gt 500) {
        Write-Host "  Package too large (>500MB), aborting" -ForegroundColor Red
        exit 1
    }

    Write-Host "  Uploading to server..."
    $uploaded = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        scp -P $SSHPort $tempTar "root@${ServerIP}:${RemoteDir}/deploy.tar.gz"
        if ($LASTEXITCODE -eq 0) {
            # 校验远端压缩包完整性，避免半截传输被当完整包解压
            ssh -p $SSHPort "root@$ServerIP" "gzip -t $RemoteDir/deploy.tar.gz"
            if ($LASTEXITCODE -eq 0) { $uploaded = $true; break }
            Write-Host "  Server archive corrupted, retrying..." -ForegroundColor Yellow
        }
        Write-Host "  Upload attempt $attempt failed, retrying..." -ForegroundColor Yellow
    }
    if (-not $uploaded) {
        Write-Host "  Upload failed after 3 attempts, aborting" -ForegroundColor Red
        exit 1
    }

    Write-Host "  Extracting..."
    # 解压逻辑放在独立 shell 脚本中（scripts/remote/extract-deploy.sh），
    # 避免 PowerShell 内联多行命令的转义/换行符问题（生产事故 2026-11-11）。
    ssh -p $SSHPort "root@$ServerIP" "mkdir -p $RemoteDir/scripts/remote"
    scp -P $SSHPort -q "$ProjectDir\scripts\remote\extract-deploy.sh" "root@${ServerIP}:${RemoteDir}/scripts/remote/extract-deploy.sh"
    ssh -p $SSHPort "root@$ServerIP" "bash $RemoteDir/scripts/remote/extract-deploy.sh $RemoteDir"

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
    npx prisma generate --schema=packages/db/prisma/schema.prisma
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Prisma generate failed, aborting" -ForegroundColor Red
        exit 1
    }

    Write-Host "  Building server..."
    pnpm --filter server build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Server build failed, aborting" -ForegroundColor Red
        exit 1
    }

    Write-Host "  Building web..."
    Set-Location "$ProjectDir\apps\web"
    $env:NODE_OPTIONS = '--max-old-space-size=3072'
    npx vite build --mode production
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Web build failed (heap OOM?), aborting" -ForegroundColor Red
        exit 1
    }
    Set-Location $ProjectDir

    Write-Host "  Build done" -ForegroundColor Green
}

# ==================== Remote Deploy ====================
function Deploy-Remote {
    Write-Host "[Deploy] Running deploy on server..." -ForegroundColor Yellow

    # 单行简单命令链，禁用镜像源与 Tesseract 安装
    ssh -p $SSHPort "root@$ServerIP" "cd $RemoteDir && USE_MIRROR=false INSTALL_TESSERACT=false bash deploy.sh"
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

# ============================================================
#  GeneaSphere 部署 - Windows PowerShell 版本
#  用法: .\deploy.ps1 -ServerIP "43.134.232.175"
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
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     GeneaSphere 寻根路 - Windows 部署脚本     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 解析为绝对路径
$ProjectDir = (Resolve-Path $ProjectDir).Path
Write-Host "项目目录: $ProjectDir" -ForegroundColor Green
Write-Host "目标服务器: ${ServerIP}:${SSHPort}" -ForegroundColor Green
Write-Host ""

# ==================== 检查 SSH 连接 ====================
function Test-SSHConnection {
    Write-Host "[检查] SSH 连接..." -ForegroundColor Yellow
    $result = ssh -p $SSHPort -o ConnectTimeout=5 -o StrictHostKeyChecking=no "root@$ServerIP" "echo OK" 2>&1
    if ($result -match "OK") {
        Write-Host "  SSH 连接正常" -ForegroundColor Green
        return $true
    } else {
        Write-Host "  SSH 连接失败: $result" -ForegroundColor Red
        return $false
    }
}

# ==================== 上传文件 ====================
function Upload-Files {
    Write-Host "[上传] 项目文件到服务器..." -ForegroundColor Yellow
    
    # 使用 scp 上传（Windows 下 rsync 不可用，用 scp + tar）
    $tempTar = "$env:TEMP\geneasphere-deploy.tar.gz"
    
    Write-Host "  打包项目文件..."
    # 使用 git archive 或 tar 打包
    if (Test-Path "$ProjectDir\.git") {
        git -C $ProjectDir archive --format=tar.gz -o $tempTar HEAD
    } else {
        # 手动打包，排除不必要文件
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

    Write-Host "  上传到服务器..."
    scp -P $SSHPort $tempTar "root@${ServerIP}:${RemoteDir}/deploy.tar.gz"
    
    Write-Host "  解压..."
    ssh -p $SSHPort "root@$ServerIP" "
        cd $RemoteDir
        tar -xzf deploy.tar.gz
        rm -f deploy.tar.gz
        echo '文件解压完成'
    "
    
    Remove-Item $tempTar -Force -ErrorAction SilentlyContinue
    Write-Host "  上传完成" -ForegroundColor Green
}

# ==================== 上传 deploy.sh ====================
function Upload-DeployScript {
    Write-Host "[上传] 部署脚本..." -ForegroundColor Yellow
    scp -P $SSHPort "$ProjectDir\deploy.sh" "root@${ServerIP}:${RemoteDir}/deploy.sh"
    ssh -p $SSHPort "root@$ServerIP" "chmod +x $RemoteDir/deploy.sh"
    Write-Host "  部署脚本上传完成" -ForegroundColor Green
}

# ==================== 构建项目（本地） ====================
function Build-Local {
    Write-Host "[构建] 本地构建项目..." -ForegroundColor Yellow
    
    Set-Location $ProjectDir
    
    # 安装依赖
    if (-not (Test-Path "node_modules")) {
        Write-Host "  安装依赖..."
        pnpm install
    }
    
    # 构建数据库
    Write-Host "  生成 Prisma Client..."
    npx prisma generate
    
    # 构建后端
    Write-Host "  构建后端..."
    pnpm --filter server build
    
    # 构建前端
    Write-Host "  构建前端..."
    Set-Location "$ProjectDir\apps\web"
    $env:NODE_OPTIONS = '--max-old-space-size=1024'
    npx vite build --mode production
    Set-Location $ProjectDir
    
    Write-Host "  构建完成" -ForegroundColor Green
}

# ==================== 远程执行部署 ====================
function Deploy-Remote {
    Write-Host "[部署] 在服务器上执行部署..." -ForegroundColor Yellow
    
    ssh -p $SSHPort "root@$ServerIP" "
        export USE_MIRROR=false
        export INSTALL_TESSERACT=false
        bash $RemoteDir/deploy.sh
    "
}

# ==================== 主流程 ====================
function Main {
    # 测试连接
    if (-not (Test-SSHConnection)) {
        Write-Host "请确保:" -ForegroundColor Yellow
        Write-Host "  1. 服务器 IP 正确" -ForegroundColor Yellow
        Write-Host "  2. SSH 端口正确（默认 22）" -ForegroundColor Yellow
        Write-Host "  3. 已配置 SSH 密钥或知道 root 密码" -ForegroundColor Yellow
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
    
    # 完整部署流程
    if (-not $SkipBuild) {
        Build-Local
    }
    Upload-Files
    Upload-DeployScript
    Deploy-Remote
}

Main

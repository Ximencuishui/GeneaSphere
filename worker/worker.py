"""
线下服务器 Worker — Windows 版
用途：轮询 Lighthouse 服务器上的重任务（OCR / 视频生成 / Puppeteer），处理后回调结果

使用方法：
  1. 修改下面的 LIGHTHOUSE_URL 和 INTERNAL_API_KEY
  2. 安装依赖: pip install requests
  3. 运行: python worker.py

支持的任务类型：
  - ocr:          从 COS 下载图片 → Tesseract OCR → 回传文字结果
  - puppeteer:    从 COS 下载 HTML → Puppeteer 渲染 → 上传截图到 COS
  - video:        视频生成任务
  - image_process: 图片处理（如 Sharp 做不到的重度处理）
"""

import json
import os
import sys
import time
import traceback
import subprocess
import tempfile
import shutil
from datetime import datetime

# ==================== 配置 ====================

# Lighthouse 服务器地址（上线后改成 https://xungenlu.cn）
LIGHTHOUSE_URL = "http://localhost:3001"

# 内部 API Key（和 Lighthouse 端 .env 里的 INTERNAL_API_KEY 保持一致）
INTERNAL_API_KEY = "geneasphere-internal-key-change-me"

# 轮询间隔（秒）
POLL_INTERVAL = 5

# 日志文件
LOG_FILE = os.path.join(os.path.dirname(__file__), "worker.log")

# 工作目录（存放下载的文件）
WORK_DIR = os.path.join(os.path.dirname(__file__), "work")
os.makedirs(WORK_DIR, exist_ok=True)

# Tesseract 路径（Windows 默认安装路径）
TESSERACT_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# ==================== 日志 ====================

def log(msg: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

# ==================== HTTP 工具 ====================

try:
    import requests
except ImportError:
    print("请先安装 requests: pip install requests")
    sys.exit(1)

def api_get(path: str, params: dict = None):
    """调用 Lighthouse API（GET）"""
    url = f"{LIGHTHOUSE_URL}/api/jobs/{path}"
    headers = {"X-Internal-Key": INTERNAL_API_KEY}
    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()

def api_post(path: str, data: dict):
    """调用 Lighthouse API（POST）"""
    url = f"{LIGHTHOUSE_URL}/api/jobs/{path}"
    headers = {
        "X-Internal-Key": INTERNAL_API_KEY,
        "Content-Type": "application/json",
    }
    resp = requests.post(url, headers=headers, json=data, timeout=30)
    resp.raise_for_status()
    return resp.json()

def download_file(url: str, local_path: str):
    """从 URL 下载文件到本地"""
    resp = requests.get(url, timeout=300, stream=True)
    resp.raise_for_status()
    with open(local_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)

# ==================== 任务处理器 ====================

def handle_ocr(job: dict) -> dict:
    """
    处理 OCR 任务
    job.payload 包含:
      - file_url: 要识别的图片 URL（COS 链接）
      - language: 语言（默认 chi_sim+eng）
    """
    file_url = job["payload"].get("file_url")
    language = job["payload"].get("language", "chi_sim+eng")

    if not file_url:
        raise ValueError("OCR 任务缺少 file_url")

    # 下载图片
    ext = os.path.splitext(file_url.split("?")[0])[1] or ".png"
    local_file = os.path.join(WORK_DIR, f"ocr_{job['id']}{ext}")
    log(f"下载 OCR 文件: {file_url} → {local_file}")
    download_file(file_url, local_file)

    # 调用 Tesseract OCR
    if os.path.exists(TESSERACT_PATH):
        # 使用本地安装的 Tesseract（更快）
        output_base = local_file + "_out"
        cmd = [
            TESSERACT_PATH,
            local_file,
            output_base,
            "-l", language,
        ]
        log(f"执行 Tesseract: {' '.join(cmd)}")
        subprocess.run(cmd, check=True, timeout=300)
        with open(output_base + ".txt", "r", encoding="utf-8") as f:
            text = f.read()
        # 清理
        os.remove(output_base + ".txt")
    else:
        # 使用 pytesseract（pip install pytesseract）
        try:
            from PIL import Image
            import pytesseract
            img = Image.open(local_file)
            text = pytesseract.image_to_string(img, lang=language)
        except ImportError:
            raise RuntimeError("Tesseract 不可用。请安装: 1) Tesseract-OCR Windows 版, 或 2) pip install pytesseract Pillow")

    # 清理临时文件
    os.remove(local_file)

    return {
        "text": text.strip(),
        "length": len(text.strip()),
    }


def handle_puppeteer(job: dict) -> dict:
    """
    处理 Puppeteer 渲染任务
    job.payload 包含:
      - html_url 或 html_content: HTML 内容
      - format: 输出格式（pdf | png）
      - upload_url: COS 预签名上传 URL（结果上传到这里）
    """
    payload = job["payload"]

    # 使用 Node.js + Puppeteer 渲染
    html_url = payload.get("html_url")
    html_content = payload.get("html_content")
    output_format = payload.get("format", "png")

    if html_url:
        log(f"Puppeteer 渲染 URL: {html_url}")
    elif html_content:
        # 写入临时文件
        html_file = os.path.join(WORK_DIR, f"render_{job['id']}.html")
        with open(html_file, "w", encoding="utf-8") as f:
            f.write(html_content)
        html_url = f"file:///{html_file.replace(os.sep, '/')}"
    else:
        raise ValueError("Puppeteer 任务缺少 html_url 或 html_content")

    output_file = os.path.join(WORK_DIR, f"puppeteer_{job['id']}.{output_format}")

    # 调用 Node.js 渲染脚本
    render_script = os.path.join(os.path.dirname(__file__), "puppeteer_render.js")
    if os.path.exists(render_script):
        cmd = [
            "node", render_script,
            "--url", html_url,
            "--output", output_file,
            "--format", output_format,
        ]
        log(f"执行 Puppeteer: {' '.join(cmd)}")
        subprocess.run(cmd, check=True, timeout=120)
    else:
        raise RuntimeError(f"渲染脚本不存在: {render_script}")

    # 如果提供了上传 URL，上传结果到 COS
    upload_url = payload.get("upload_url")
    if upload_url and os.path.exists(output_file):
        log(f"上传渲染结果到 COS")
        with open(output_file, "rb") as f:
            resp = requests.put(upload_url, data=f, timeout=120)
            resp.raise_for_status()

    return {
        "output_format": output_format,
        "file_size": os.path.getsize(output_file) if os.path.exists(output_file) else 0,
    }


def handle_video(job: dict) -> dict:
    """
    处理视频生成任务
    job.payload 包含视频生成所需参数
    具体实现取决于你现有的视频生成逻辑
    """
    payload = job["payload"]
    log(f"视频生成任务: {json.dumps(payload, ensure_ascii=False)[:200]}")

    # TODO: 接入你现有的视频生成逻辑
    # 这里只是占位，你需要根据实际的视频生成工具来实现
    log("⚠ 视频生成功能尚未实现，请在此添加你的视频生成逻辑")

    return {
        "status": "not_implemented",
        "message": "视频生成功能待实现",
    }


def handle_image_process(job: dict) -> dict:
    """
    处理图片处理任务
    job.payload 包含:
      - file_url: 图片 URL
      - operations: 操作列表 [{type: 'resize'|'watermark'|'enhance', params: {...}}]
    """
    payload = job["payload"]
    file_url = payload.get("file_url")
    operations = payload.get("operations", [])

    if not file_url:
        raise ValueError("图片处理任务缺少 file_url")

    # 下载图片
    ext = os.path.splitext(file_url.split("?")[0])[1] or ".png"
    local_file = os.path.join(WORK_DIR, f"img_{job['id']}{ext}")
    log(f"下载图片: {file_url} → {local_file}")
    download_file(file_url, local_file)

    try:
        from PIL import Image, ImageFilter, ImageEnhance

        img = Image.open(local_file)

        for op in operations:
            op_type = op.get("type")
            params = op.get("params", {})

            if op_type == "resize":
                w = params.get("width", img.width)
                h = params.get("height", img.height)
                img = img.resize((w, h), Image.LANCZOS)
            elif op_type == "watermark":
                # 简单文字水印
                from PIL import ImageDraw, ImageFont
                draw = ImageDraw.Draw(img)
                text = params.get("text", "Watermark")
                draw.text((10, 10), text, fill=(255, 255, 255, 128))
            elif op_type == "enhance":
                factor = params.get("factor", 1.5)
                enhancer = ImageEnhance.Sharpness(img)
                img = enhancer.enhance(factor)
            else:
                log(f"未知操作类型: {op_type}")

        # 保存结果
        output_file = local_file + "_processed" + ext
        img.save(output_file)

        # 上传到 COS
        upload_url = payload.get("upload_url")
        if upload_url:
            log(f"上传处理结果到 COS")
            with open(output_file, "rb") as f:
                resp = requests.put(upload_url, data=f, timeout=120)
                resp.raise_for_status()

        result = {"file_size": os.path.getsize(output_file)}

        # 清理
        os.remove(local_file)
        os.remove(output_file)

        return result

    except ImportError:
        raise RuntimeError("图片处理需要 Pillow: pip install Pillow")


# ==================== 主循环 ====================

HANDLERS = {
    "ocr": handle_ocr,
    "puppeteer": handle_puppeteer,
    "video": handle_video,
    "image_process": handle_image_process,
}

def process_job(job: dict):
    """处理单个任务"""
    job_id = job["id"]
    job_type = job["type"]
    log(f"========== 开始处理任务 {job_id} ({job_type}) ==========")

    handler = HANDLERS.get(job_type)
    if not handler:
        log(f"未知任务类型: {job_type}")
        api_post("callback", {
            "job_id": job_id,
            "status": "failed",
            "error_message": f"未知任务类型: {job_type}",
        })
        return

    try:
        result = handler(job)
        api_post("callback", {
            "job_id": job_id,
            "status": "completed",
            "result": result,
        })
        log(f"✅ 任务完成: {job_id}")
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        log(f"❌ 任务失败: {job_id} - {error_msg}")
        log(traceback.format_exc())
        api_post("callback", {
            "job_id": job_id,
            "status": "failed",
            "error_message": error_msg,
        })


def main():
    log("=" * 50)
    log("Worker 启动")
    log(f"Lighthouse URL: {LIGHTHOUSE_URL}")
    log(f"轮询间隔: {POLL_INTERVAL}s")
    log(f"工作目录: {WORK_DIR}")
    log("=" * 50)

    while True:
        try:
            # 拉取下一个待处理任务
            resp = api_get("pending")
            if not resp.get("hasJob"):
                time.sleep(POLL_INTERVAL)
                continue

            job = resp["job"]
            process_job(job)

        except requests.exceptions.ConnectionError:
            log(f"⚠ 无法连接 Lighthouse ({LIGHTHOUSE_URL})，{POLL_INTERVAL}s 后重试...")
            time.sleep(POLL_INTERVAL)
        except requests.exceptions.HTTPError as e:
            log(f"⚠ HTTP 错误: {e}，{POLL_INTERVAL}s 后重试...")
            time.sleep(POLL_INTERVAL)
        except Exception as e:
            log(f"⚠ 未知错误: {e}")
            log(traceback.format_exc())
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()

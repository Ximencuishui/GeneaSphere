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
  - video:        家族大事件 / 迁徙历史幻灯片成片（ffmpeg）
  - image_process: 图片处理（如 Sharp 做不到的重度处理）
"""

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


CLAN_VIDEO_KINDS = {"clan-event", "clan-migration"}
CLAN_VIDEO_MAX_SECONDS = 600
# 与服务端 clanVideoSlideSeconds 一致：modern 6 / nostalgic 8 / solemn 10，总长不超过 600 秒。
CLAN_VIDEO_STYLE_SECONDS = {"nostalgic": 8, "modern": 6, "solemn": 10}
CLAN_VIDEO_PALETTE = {
    "nostalgic": {
        "bg": (74, 49, 28),
        "fg": (247, 232, 204),
        "muted": (214, 176, 122),
        "card": (112, 76, 42),
        "accent": (196, 140, 70),
    },
    "modern": {
        "bg": (244, 247, 251),
        "fg": (22, 27, 34),
        "muted": (84, 98, 116),
        "card": (255, 255, 255),
        "accent": (36, 112, 184),
    },
    "solemn": {
        "bg": (16, 16, 16),
        "fg": (236, 236, 236),
        "muted": (168, 168, 168),
        "card": (38, 38, 38),
        "accent": (196, 196, 196),
    },
}
# 色调再过一遍 ffmpeg，避免风格只写在字符串上。
CLAN_VIDEO_VF = {
    "nostalgic": "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
    "modern": "eq=contrast=1.08:saturation=1.25:brightness=0.02",
    "solemn": "hue=s=0,eq=contrast=1.12:brightness=-0.03",
}
_CJK_FONTS = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
]


def _normalize_video_style(style) -> str:
    if style in CLAN_VIDEO_STYLE_SECONDS:
        return style
    return "nostalgic"


def _resolve_slide_seconds(payload: dict, count: int, style: str) -> float:
    raw = payload.get("slide_seconds")
    try:
        seconds = float(raw)
    except (TypeError, ValueError):
        seconds = 0
    if seconds <= 0:
        seconds = float(CLAN_VIDEO_STYLE_SECONDS[style])
    if count > 0 and seconds * count > CLAN_VIDEO_MAX_SECONDS:
        seconds = CLAN_VIDEO_MAX_SECONDS / count
    return seconds


def _require_ffmpeg() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg 不可用，无法生成视频")
    return ffmpeg


def _load_cjk_font(size: int):
    from PIL import ImageFont
    for font_path in _CJK_FONTS:
        if not os.path.isfile(font_path):
            continue
        try:
            return ImageFont.truetype(font_path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _text_width(draw, text: str, font) -> float:
    try:
        return float(draw.textlength(text, font=font))
    except Exception:
        return float(len(text) * getattr(font, "size", 16))


def _wrap_text(draw, text: str, font, width: int, limit: int) -> list:
    if not text:
        return []
    lines = []
    current = ""
    for ch in text:
        trial = current + ch
        if current and _text_width(draw, trial, font) > width:
            lines.append(current)
            current = ch
            if len(lines) >= limit:
                break
        else:
            current = trial
    if current and len(lines) < limit:
        lines.append(current)
    if len(lines) == limit and len("".join(lines)) < len(text):
        lines[-1] = lines[-1].rstrip() + "…"
    return lines


def _tint_photo(img, style: str):
    from PIL import Image, ImageEnhance, ImageOps
    if img.mode in ("RGBA", "LA"):
        base = Image.new("RGB", img.size, (0, 0, 0))
        base.paste(img, mask=img.split()[-1])
        img = base
    else:
        img = img.convert("RGB")
    if style == "solemn":
        return ImageOps.grayscale(img).convert("RGB")
    if style == "modern":
        img = ImageEnhance.Color(img).enhance(1.25)
        return ImageEnhance.Contrast(img).enhance(1.1)
    img = ImageEnhance.Color(img).enhance(0.35)
    warm = Image.new("RGB", img.size, (176, 126, 74))
    return Image.blend(img, warm, 0.35)


def _try_download(url: str, dest: str):
    try:
        download_file(url, dest)
    except Exception as exc:
        log(f"图片下载失败，改用文字卡: {exc}")
        return None
    return dest if os.path.isfile(dest) else None


def _open_slide_image(url, work_dir: str, style: str):
    if not isinstance(url, str) or not url.strip():
        return None
    url = url.strip()
    local = None
    if url.startswith("/media/"):
        name = url[len("/media/"):].lstrip("/").replace("\\", "/")
        root = os.environ.get("STORAGE_PATH") or os.path.join(os.getcwd(), "storage", "media")
        flattened = os.path.join(root, name.replace("/", "_"))
        nested = os.path.join(root, name)
        if os.path.isfile(flattened):
            local = flattened
        elif os.path.isfile(nested):
            local = nested
        else:
            local = _try_download(LIGHTHOUSE_URL.rstrip("/") + url, os.path.join(work_dir, "photo"))
    elif url.startswith("http://") or url.startswith("https://"):
        local = _try_download(url, os.path.join(work_dir, "photo"))
    elif os.path.isfile(url):
        local = url
    if not local:
        return None
    try:
        from PIL import Image
        img = Image.open(local)
        img.load()
        return _tint_photo(img, style)
    except Exception as exc:
        log(f"事件图片无法使用，改用文字卡: {exc}")
        return None


def _render_slide(path: str, event: dict, style: str, project_title: str, work_dir: str):
    try:
        from PIL import Image, ImageDraw, ImageOps
    except ImportError as exc:
        raise RuntimeError("幻灯片渲染需要 Pillow: pip install Pillow") from exc

    palette = CLAN_VIDEO_PALETTE[style]
    canvas = Image.new("RGB", (1920, 1080), palette["bg"])
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 1920, 14), fill=palette["accent"])

    photo = _open_slide_image(event.get("image_url"), work_dir, style)
    text_x = 96
    text_width = 1728
    if photo is not None:
        fitted = ImageOps.fit(photo, (820, 820), Image.LANCZOS)
        card = (1040, 110, 1880, 970)
        draw.rectangle(card, fill=palette["card"])
        canvas.paste(fitted, (1050, 130))
        text_width = 880

    title_font = _load_cjk_font(64)
    meta_font = _load_cjk_font(36)
    body_font = _load_cjk_font(32)
    header_font = _load_cjk_font(28)
    y = 80
    header = (project_title or "").strip()
    if header:
        draw.text((text_x, y), header[:40], font=header_font, fill=palette["muted"])
        y += 56

    title = str(event.get("title") or "未命名").strip() or "未命名"
    for line in _wrap_text(draw, title, title_font, text_width, 2):
        draw.text((text_x, y), line, font=title_font, fill=palette["fg"])
        y += 78

    year = event.get("year")
    year_text = f"{year}年" if isinstance(year, int) or (isinstance(year, float) and year == int(year)) else "年份不详"
    if isinstance(year, float):
        year_text = f"{int(year)}年"
    place = str(event.get("place") or "").strip()
    meta = year_text if not place else f"{year_text}  ·  {place}"
    y += 8
    draw.text((text_x, y), meta[:80], font=meta_font, fill=palette["accent"])
    y += 64

    description = str(event.get("description") or "").replace("\n", " ").strip()
    for line in _wrap_text(draw, description, body_font, text_width, 6):
        draw.text((text_x, y), line, font=body_font, fill=palette["fg"])
        y += 48

    if photo is None:
        draw.rectangle((text_x, 980, text_x + 180, 988), fill=palette["accent"])

    canvas.save(path, "PNG")


def _assemble_mp4(frame_dir: str, count: int, seconds: float, style: str, output_path: str):
    ffmpeg = _require_ffmpeg()
    # 输入帧率 = 1/每条秒数，再拉到 30fps，这样静帧会按设定时长停留。
    rate = 1.0 / seconds if seconds > 0 else 1.0
    pattern = os.path.join(frame_dir, "frame_%04d.png").replace("\\", "/")
    cmd = [
        ffmpeg, "-y",
        "-framerate", f"{rate:.6f}",
        "-start_number", "0",
        "-i", pattern,
        "-vf", f"fps=30,{CLAN_VIDEO_VF[style]},format=yuv420p",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output_path,
    ]
    proc = subprocess.run(cmd, check=False, timeout=900, capture_output=True, text=True)
    if proc.returncode != 0 or not os.path.isfile(output_path) or os.path.getsize(output_path) <= 0:
        tail = (proc.stderr or proc.stdout or "")[-500:]
        raise RuntimeError(f"ffmpeg 生成失败: {tail}")
    if count < 1:
        raise RuntimeError("ffmpeg 没有可合成的画面")


def _publish_video(payload: dict, output_file: str):
    size = os.path.getsize(output_file)
    upload_url = payload.get("upload_url")
    public_url = payload.get("public_url")
    storage_path = payload.get("storage_path")
    if isinstance(upload_url, str) and upload_url.strip():
        log("上传成片")
        with open(output_file, "rb") as handle:
            resp = requests.put(upload_url.strip(), data=handle, timeout=300)
            resp.raise_for_status()
        if not isinstance(public_url, str) or not public_url.strip():
            raise RuntimeError("已上传成片，但任务没有可访问地址 public_url")
        return public_url.strip(), size
    if (
        isinstance(storage_path, str) and storage_path.strip()
        and isinstance(public_url, str) and public_url.strip()
    ):
        dest = storage_path.strip()
        parent = os.path.dirname(dest)
        if parent:
            os.makedirs(parent, exist_ok=True)
        shutil.copyfile(output_file, dest)
        if not os.path.isfile(dest) or os.path.getsize(dest) <= 0:
            raise RuntimeError("成片没有写入本地存储")
        log(f"成片已写入 {dest}")
        return public_url.strip(), size
    raise RuntimeError("没有 upload_url 或本地存储路径，无法产出可访问的视频地址")


def handle_video(job: dict) -> dict:
    """
    clan-event / clan-migration：按事件快照做成图片或文字幻灯片，ffmpeg 合成 MP4。
    未知 kind 仍抛错。缺 ffmpeg、缺事件快照、上传失败都会抛错，由 process_job 走 failed。
    不做 TTS、背景音乐、分享链接、朝代疆域。
    """
    payload = job.get("payload") if isinstance(job, dict) else None
    if not isinstance(payload, dict):
        raise NotImplementedError("视频生成尚未实现，阶段一不产出文件")
    kind = payload.get("kind")
    if kind not in CLAN_VIDEO_KINDS:
        log(f"视频生成任务尚未实现: {kind}")
        raise NotImplementedError(f"视频生成尚未实现: {kind}")

    events = payload.get("events")
    if not isinstance(events, list) or not events:
        raise ValueError("视频任务缺少事件快照")

    style = _normalize_video_style(payload.get("style"))
    seconds = _resolve_slide_seconds(payload, len(events), style)
    _require_ffmpeg()
    log(f"生成{kind}幻灯片: {len(events)} 条, style={style}, 每条 {seconds:.2f}s")

    work = tempfile.mkdtemp(prefix=f"video_{job.get('id')}_", dir=WORK_DIR)
    try:
        frames = []
        for index, event in enumerate(events):
            if not isinstance(event, dict):
                event = {}
            frame = os.path.join(work, f"frame_{index:04d}.png")
            _render_slide(frame, event, style, str(payload.get("title") or ""), work)
            frames.append(frame)
        output = os.path.join(work, "out.mp4")
        _assemble_mp4(work, len(frames), seconds, style, output)
        video_url, file_size = _publish_video(payload, output)
        duration = int(round(min(CLAN_VIDEO_MAX_SECONDS, seconds * len(frames))))
        return {
            "video_url": video_url,
            "videoUrl": video_url,
            "duration_seconds": duration,
            "durationSeconds": duration,
            "file_size": file_size,
            "fileSize": file_size,
        }
    finally:
        shutil.rmtree(work, ignore_errors=True)


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

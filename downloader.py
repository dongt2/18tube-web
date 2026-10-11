"""
18TUBE Downloader - Core module & CLI
Tự động tải toàn bộ Ảnh chất lượng gốc và Video HD từ 18tube.nl
Hỗ trợ:
- Tự động khắc phục lỗi 404 stream ẩn trên CDN (Dual-Stream Isolation)
- Kiểm tra tính đầy đủ / kiểm tra đủ file (File Integrity & Completeness Check)
- Tùy chọn chất lượng Video (720p HD, 480p, 360p, Best, Lowest)
- Tải đa luồng tốc độ cao (Multi-threading)
- Tối ưu hóa kết nối mạng HTTP Keep-Alive & FFmpeg HLS stream
"""

import os
import sys
import re
import time
import argparse
import subprocess
import requests
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from requests.adapters import HTTPAdapter
from bs4 import BeautifulSoup
from tqdm import tqdm

# Thiết lập encoding UTF-8 cho Windows Terminal
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Cờ ẩn hoàn toàn cửa sổ console/CMD cho các tiến trình con trên Windows
NO_WINDOW = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://18tube.nl/"
}

def create_optimized_session(pool_size=16):
    """Tạo requests Session với Connection Pooling tái sử dụng socket TCP."""
    session = requests.Session()
    adapter = HTTPAdapter(
        pool_connections=pool_size,
        pool_maxsize=pool_size,
        max_retries=3
    )
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(HEADERS)
    return session

def format_speed(bytes_per_sec):
    """Định dạng tốc độ tải thành chuỗi dễ đọc (B/s, KB/s, MB/s)."""
    if bytes_per_sec >= 1024 * 1024:
        return f"{bytes_per_sec / (1024 * 1024):.2f} MB/s"
    elif bytes_per_sec >= 1024:
        return f"{bytes_per_sec / 1024:.1f} KB/s"
    else:
        return f"{int(bytes_per_sec)} B/s"

def format_size(bytes_num):
    """Định dạng dung lượng byte thành KB, MB, GB."""
    if bytes_num >= 1024 * 1024 * 1024:
        return f"{bytes_num / (1024 * 1024 * 1024):.2f} GB"
    elif bytes_num >= 1024 * 1024:
        return f"{bytes_num / (1024 * 1024):.2f} MB"
    elif bytes_num >= 1024:
        return f"{bytes_num / 1024:.1f} KB"
    else:
        return f"{int(bytes_num)} B"

def get_ffmpeg_path():
    """Tìm đường dẫn ffmpeg trong hệ thống, bundle PyInstaller hoặc thư viện imageio_ffmpeg."""
    # 1. Kiểm tra trong bundle PyInstaller hoặc cùng thư mục file exe
    if getattr(sys, 'frozen', False):
        base_dir = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
        for cand in [
            os.path.join(base_dir, "ffmpeg.exe"),
            os.path.join(base_dir, "bin", "ffmpeg.exe"),
            os.path.join(os.path.dirname(sys.executable), "ffmpeg.exe"),
            os.path.join(os.path.dirname(sys.executable), "bin", "ffmpeg.exe")
        ]:
            if os.path.isfile(cand):
                return cand

    # 2. Kiểm tra thư mục bin/ cục bộ
    local_bin = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin", "ffmpeg.exe")
    if os.path.isfile(local_bin):
        return local_bin

    # 3. Kiểm tra qua PATH hệ thống
    import shutil
    p = shutil.which("ffmpeg")
    if p:
        return p

    # 4. Kiểm tra qua imageio_ffmpeg
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        if os.path.isfile(ffmpeg_exe):
            return ffmpeg_exe
    except Exception:
        pass

    return None

def extract_creator_slug(url):
    """Trích xuất tên creator từ URL."""
    clean = url.strip()
    m = re.search(r"18tube\.nl/([^/?#]+)", clean)
    if m:
        return m.group(1)
    parts = [p for p in clean.replace("\\", "/").split("/") if p]
    if parts:
        return parts[-1]
    return "unknown"

def fetch_creator_metadata(creator_slug):
    """Lấy thông tin nhanh của creator từ trang đầu tiên."""
    url = f"https://18tube.nl/{creator_slug}/"
    meta = {
        "slug": creator_slug,
        "name": creator_slug,
        "avatar_url": None,
        "total_images": 0,
        "total_videos": 0,
        "total_all": 0
    }
    try:
        session = create_optimized_session(4)
        resp = session.get(url, timeout=12)
        if resp.status_code == 200:
            html = resp.text
            m_totals = re.search(r'\"totals\":\{([^}]+)\}', html)
            if m_totals:
                t_str = m_totals.group(1)
                m_all = re.search(r'\"all\":(\d+)', t_str)
                m_img = re.search(r'\"images\":(\d+)', t_str)
                m_vid = re.search(r'\"videos\":(\d+)', t_str)
                if m_all: meta["total_all"] = int(m_all.group(1))
                if m_img: meta["total_images"] = int(m_img.group(1))
                if m_vid: meta["total_videos"] = int(m_vid.group(1))
            
            m_creator = re.search(r'\"creator\":\{([^}]+)\}', html)
            if m_creator:
                c_str = m_creator.group(1)
                m_name = re.search(r'\"name\":\"([^\"]+)\"', c_str)
                m_ava = re.search(r'\"avatarUrl\":\"([^\"]+)\"', c_str)
                if m_name: meta["name"] = m_name.group(1)
                if m_ava: meta["avatar_url"] = m_ava.group(1).replace("\\/", "/")
    except Exception:
        pass
    return meta

def collect_media_items(creator_slug, progress_callback=None, cancel_check=None):
    """Quét toàn bộ danh sách ảnh và video từ feed của creator."""
    base_url = f"https://18tube.nl/{creator_slug}"
    photos = []
    videos = []
    seen_keys = set()
    page = 1
    
    session = create_optimized_session(8)

    while True:
        if cancel_check and cancel_check():
            break

        url = f"{base_url}/all/page/{page}/" if page > 1 else f"{base_url}/"
        try:
            resp = session.get(url, timeout=15)
            if resp.status_code == 404:
                break
            resp.raise_for_status()
        except Exception as e:
            if progress_callback:
                progress_callback(f"[!] Lỗi tải trang {page}: {e}")
            break

        soup = BeautifulSoup(resp.text, "html.parser")
        items = soup.find_all("a", class_="light-gallery-item")
        
        new_items = 0
        for a in items:
            key = a.get("data-media-key")
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            m_type = a.get("data-media-type")
            src_url = a.get("data-source-url") or a.get("data-src")
            thumb_url = a.get("data-thumbnail-url")

            if m_type == "image":
                photos.append({
                    "key": key,
                    "url": src_url,
                    "thumbnail": thumb_url
                })
                new_items += 1
            elif m_type == "video":
                videos.append({
                    "key": key,
                    "url": src_url,
                    "thumbnail": thumb_url
                })
                new_items += 1

        if progress_callback:
            progress_callback(page, new_items, len(photos), len(videos))

        if new_items == 0:
            break
        page += 1

    return photos, videos

def verify_downloaded_media(creator_slug, base_out_dir, photos=None, videos=None):
    """
    Kiểm tra tình trạng tải đủ file của creator trong thư mục lưu trữ.
    Trả về dict thống kê chi tiết các file đã có và file còn thiếu.
    """
    creator_dir = os.path.join(base_out_dir, creator_slug)
    photos_dir = os.path.join(creator_dir, "photos")
    videos_dir = os.path.join(creator_dir, "videos")

    if photos is None or videos is None:
        p_list, v_list = collect_media_items(creator_slug)
        if photos is None: photos = p_list
        if videos is None: videos = v_list

    existing_photos = []
    missing_photos = []
    total_photo_bytes = 0

    for item in photos:
        key = item["key"]
        p_jpg = os.path.join(photos_dir, f"{key}.jpg")
        p_webp = os.path.join(photos_dir, f"{key}.webp")
        found = False
        for p in [p_jpg, p_webp]:
            if os.path.exists(p) and os.path.getsize(p) > 0:
                sz = os.path.getsize(p)
                existing_photos.append((item, p, sz))
                total_photo_bytes += sz
                found = True
                break
        if not found:
            missing_photos.append(item)

    existing_videos = []
    missing_videos = []
    total_video_bytes = 0

    for item in videos:
        key = item["key"]
        v_mp4 = os.path.join(videos_dir, f"{key}.mp4")
        if os.path.exists(v_mp4) and os.path.getsize(v_mp4) > 1024:
            sz = os.path.getsize(v_mp4)
            existing_videos.append((item, v_mp4, sz))
            total_video_bytes += sz
        else:
            missing_videos.append(item)

    total_expected = len(photos) + len(videos)
    total_existing = len(existing_photos) + len(existing_videos)
    is_complete = (len(missing_photos) == 0 and len(missing_videos) == 0) and total_expected > 0

    return {
        "creator_slug": creator_slug,
        "creator_dir": creator_dir,
        "photos_dir": photos_dir,
        "videos_dir": videos_dir,
        "total_photos": len(photos),
        "existing_photos_count": len(existing_photos),
        "missing_photos": missing_photos,
        "total_photo_bytes": total_photo_bytes,
        "total_videos": len(videos),
        "existing_videos_count": len(existing_videos),
        "missing_videos": missing_videos,
        "total_video_bytes": total_video_bytes,
        "is_complete": is_complete,
        "total_expected": total_expected,
        "total_existing": total_existing,
        "total_bytes": total_photo_bytes + total_video_bytes
    }

def resolve_best_video_stream(base_url, target_quality="720p"):
    """
    Xác định độ phân giải video hợp lệ (tránh các stream bị lỗi 404 trên CDN).
    Trả về tên phân giải (ví dụ: '720', '480', '360')
    """
    if "360" in target_quality:
        order = ["360", "480", "720"]
    elif "480" in target_quality:
        order = ["480", "720", "360"]
    else: # 720p hoặc best
        order = ["720", "480", "360"]

    for res in order:
        v_url = f"{base_url}/{res}/"
        req = urllib.request.Request(v_url, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                text = resp.read().decode("utf-8")
            
            # Kiểm tra xem init.mp4 có tồn tại không (tránh lỗi 404 của CDN)
            m_init = re.search(r'#EXT-X-MAP:URI="([^"]+)"', text)
            if m_init:
                init_url = m_init.group(1)
                req_init = urllib.request.Request(init_url, headers=HEADERS)
                with urllib.request.urlopen(req_init, timeout=5) as resp_init:
                    if resp_init.status == 200:
                        return res
            else:
                # Nếu không có EXT-X-MAP, kiểm tra segment đầu tiên
                lines = [l.strip() for l in text.split("\n") if l.strip() and not l.startswith("#")]
                if lines:
                    req_seg = urllib.request.Request(lines[0], headers=HEADERS)
                    with urllib.request.urlopen(req_seg, timeout=5) as resp_s:
                        if resp_s.status == 200:
                            return res
        except Exception:
            continue

    return order[0]

def get_hls_duration(stream_url):
    """Lấy tổng thời lượng video (tính bằng giây) từ subplaylist HLS."""
    try:
        req = urllib.request.Request(stream_url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=8) as resp:
            text = resp.read().decode("utf-8", errors="ignore")
        durations = [float(d) for d in re.findall(r"#EXTINF:([0-9.]+),", text)]
        return sum(durations) if durations else None
    except Exception:
        return None

def parse_time_str(time_str):
    """Chuyển đổi HH:MM:SS.microsec sang số giây."""
    try:
        parts = time_str.split(":")
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    except Exception:
        pass
    return 0.0

def download_photo(item, out_dir, session, progress_callback=None, cancel_check=None):
    """Tải 1 ảnh chất lượng cao (.jpg) tối ưu buffer đọc 128KB."""
    key = item["key"]
    url = item["url"]
    ext = ".jpg" if ".jpg" in url.lower() else ".webp"
    filename = f"{key}{ext}"
    filepath = os.path.join(out_dir, filename)

    if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
        return True, filepath, "already_exists"

    candidates = [url]
    if ext == ".jpg" and item.get("thumbnail"):
        candidates.append(item["thumbnail"])

    for target_url in candidates:
        if cancel_check and cancel_check():
            break
        try:
            r = session.get(target_url, stream=True, timeout=25)
            if r.status_code == 200:
                total_size = int(r.headers.get("content-length", 0))
                downloaded = 0
                last_time = time.time()
                last_bytes = 0
                
                with open(filepath, "wb") as f:
                    for chunk in r.iter_content(chunk_size=131072):
                        if cancel_check and cancel_check():
                            break
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            now = time.time()
                            dt = now - last_time
                            if dt >= 0.1 and progress_callback:
                                speed = (downloaded - last_bytes) / dt
                                last_time = now
                                last_bytes = downloaded
                                pct = int((downloaded / total_size) * 100) if total_size > 0 else 0
                                progress_callback(downloaded, total_size, speed, pct)

                if cancel_check and cancel_check():
                    if os.path.exists(filepath):
                        try: os.remove(filepath)
                        except OSError: pass
                    return False, filepath, "cancelled"

                if progress_callback:
                    progress_callback(downloaded, total_size, 0, 100)
                return True, filepath, "downloaded"
        except Exception:
            continue

    return False, filepath, "failed"

def download_video(item, out_dir, ffmpeg_exe, quality="best", progress_callback=None, cancel_check=None):
    """
    Tải 1 video HLS m3u8 bằng ffmpeg với cơ chế tách luồng Video & Audio độc lập,
    tự động bỏ qua và cô lập các stream bị lỗi 404 trên CDN 18tube.
    """
    key = item["key"]
    url = item["url"]
    filename = f"{key}.mp4"
    filepath = os.path.join(out_dir, filename)

    if os.path.exists(filepath) and os.path.getsize(filepath) > 1024:
        return True, filepath, "already_exists"

    base_url = url.rsplit("/", 1)[0]
    
    # 1. Tìm phân giải video thực tế có sẵn trên server (bỏ qua các stream 404)
    chosen_res = resolve_best_video_stream(base_url, quality)
    vid_url = f"{base_url}/{chosen_res}/"
    aud_url = f"{base_url}/audio/"

    total_duration = get_hls_duration(vid_url) or get_hls_duration(url)

    # 2. Xây dựng lệnh ffmpeg ghép nối trực tiếp Video + Audio
    # Tránh nạp master playlist bị lỗi của server
    header_arg = f"Referer: https://18tube.nl/\r\nUser-Agent: {HEADERS['User-Agent']}\r\n"
    cmd = [
        ffmpeg_exe,
        "-headers", header_arg,
        "-http_persistent", "1",
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-probesize", "1000000",
        "-analyzeduration", "1000000",
        "-f", "hls",
        "-i", vid_url,
        "-headers", header_arg,
        "-http_persistent", "1",
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-probesize", "1000000",
        "-analyzeduration", "1000000",
        "-f", "hls",
        "-i", aud_url,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c", "copy",
        "-bsf:a", "aac_adtstoasc",
        "-progress", "pipe:1",
        "-nostats",
        "-y",
        filepath
    ]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            creationflags=NO_WINDOW
        )

        curr_bytes = 0
        last_bytes = 0
        last_time = time.time()
        speed = 0.0
        pct = 0.0
        out_s = 0.0

        for line in proc.stdout:
            if cancel_check and cancel_check():
                proc.kill()
                break

            line = line.strip()
            if line.startswith("total_size="):
                try:
                    curr_bytes = int(line.split("=")[1])
                    now = time.time()
                    dt = now - last_time
                    if dt >= 0.2:
                        speed = (curr_bytes - last_bytes) / dt if dt > 0 else 0.0
                        last_time = now
                        last_bytes = curr_bytes
                        if progress_callback:
                            est_total = int((curr_bytes / (pct / 100))) if pct > 1 else 0
                            progress_callback(curr_bytes, est_total, speed, int(pct))
                except Exception:
                    pass
            elif line.startswith("out_time="):
                t_str = line.split("=")[1]
                out_s = parse_time_str(t_str)
                if total_duration and total_duration > 0:
                    pct = min(100.0, (out_s / total_duration) * 100)
                    if progress_callback:
                        est_total = int((curr_bytes / (pct / 100))) if pct > 1 else 0
                        progress_callback(curr_bytes, est_total, speed, int(pct))

        proc.wait()

        if cancel_check and cancel_check():
            if os.path.exists(filepath):
                try: os.remove(filepath)
                except OSError: pass
            return False, filepath, "cancelled"

        if proc.returncode == 0 and os.path.exists(filepath) and os.path.getsize(filepath) > 1024:
            if progress_callback:
                final_sz = os.path.getsize(filepath)
                progress_callback(final_sz, final_sz, 0, 100)
            return True, filepath, "downloaded"
        else:
            if os.path.exists(filepath):
                try: os.remove(filepath)
                except OSError: pass
            return False, filepath, "ffmpeg_error"

    except Exception as e:
        if os.path.exists(filepath):
            try: os.remove(filepath)
            except OSError: pass
        return False, filepath, str(e)

def get_rclone_path():
    """Tìm đường dẫn rclone trong bundle PyInstaller, thư mục bin/ cục bộ hoặc PATH hệ thống."""
    # 1. Kiểm tra PyInstaller bundle hoặc cùng thư mục file exe
    if getattr(sys, 'frozen', False):
        base_dir = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
        for cand in [
            os.path.join(base_dir, "rclone.exe"),
            os.path.join(base_dir, "bin", "rclone.exe"),
            os.path.join(os.path.dirname(sys.executable), "rclone.exe"),
            os.path.join(os.path.dirname(sys.executable), "bin", "rclone.exe")
        ]:
            if os.path.isfile(cand):
                return cand

    # 2. Kiểm tra thư mục bin/ cục bộ
    local_bin = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin", "rclone.exe")
    if os.path.isfile(local_bin):
        return local_bin

    # 3. Kiểm tra trong PATH hệ thống
    import shutil
    p = shutil.which("rclone")
    if p:
        return p

    # 4. Kiểm tra thư mục winget mặc định nếu có
    winget_cand = r"C:\Users\dongt\AppData\Local\Microsoft\WinGet\Packages\Rclone.Rclone_Microsoft.Winget.Source_8wekyb3d8bbwe\rclone-v1.75.1-windows-amd64\rclone.EXE"
    if os.path.isfile(winget_cand):
        return winget_cand

    return "rclone"

def check_rclone_available():
    """Kiểm tra xem rclone đã sẵn sàng hoạt động hay chưa."""
    rc = get_rclone_path()
    try:
        res = subprocess.run([rc, "version"], capture_output=True, text=True, timeout=5, creationflags=NO_WINDOW)
        return res.returncode == 0
    except Exception:
        return False

def get_drive_info(remote="gg"):
    """
    Lấy thông tin tài khoản, trạng thái kết nối và dung lượng Google Drive.
    """
    info = {
        "status": "not_connected",
        "status_text": "Chưa kết nối",
        "message": "Chưa xác thực Google Drive",
        "email": "--",
        "name": "--",
        "used_bytes": 0,
        "total_bytes": 0,
        "free_bytes": 0,
        "used_str": "--",
        "total_str": "--",
        "free_str": "--",
        "percent_used": 0.0,
        "project_id": "",
        "enable_url": ""
    }

    if not check_rclone_available():
        info["message"] = "Chưa cài đặt rclone"
        return info

    rc = get_rclone_path()

    try:
        res = subprocess.run([rc, "config", "show", remote], capture_output=True, text=True, timeout=5, creationflags=NO_WINDOW)
        config_text = res.stdout
    except Exception as e:
        info["message"] = f"Lỗi đọc cấu hình: {e}"
        return info

    if not config_text or f"[{remote}]" not in config_text:
        info["message"] = f"Remote '[{remote}]' chưa được tạo"
        return info

    token_m = re.search(r'token\s*=\s*(\{.*?\})', config_text)
    client_id_m = re.search(r'client_id\s*=\s*([0-9]+)-', config_text)
    if client_id_m:
        info["project_id"] = client_id_m.group(1)
        info["enable_url"] = f"https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project={info['project_id']}"

    if not token_m:
        info["status"] = "not_connected"
        info["status_text"] = "Chưa đăng nhập"
        info["message"] = "Chưa có token xác thực"
        return info

    try:
        import json
        token_data = json.loads(token_m.group(1))
        access_token = token_data.get("access_token")
    except Exception:
        access_token = None

    if not access_token:
        info["status"] = "not_connected"
        info["status_text"] = "Chưa đăng nhập"
        info["message"] = "Token rclone bị trống"
        return info

    # Gọi Google Drive v3 About API
    def call_api(token):
        return requests.get(
            "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota",
            headers={"Authorization": f"Bearer {token}"},
            timeout=8
        )

    try:
        api_res = call_api(access_token)
        if api_res.status_code == 401:
            subprocess.run([rc, "about", f"{remote}:", "--json"], capture_output=True, text=True, timeout=8, creationflags=NO_WINDOW)
            res2 = subprocess.run([rc, "config", "show", remote], capture_output=True, text=True, timeout=5, creationflags=NO_WINDOW)
            token_m2 = re.search(r'token\s*=\s*(\{.*?\})', res2.stdout)
            if token_m2:
                token_data = json.loads(token_m2.group(1))
                access_token = token_data.get("access_token")
                api_res = call_api(access_token)

        data = api_res.json()
    except Exception as e:
        info["status"] = "error"
        info["status_text"] = "Lỗi mạng"
        info["message"] = f"Không thể kết nối Google: {e}"
        return info

    if "error" in data:
        err = data["error"]
        msg = err.get("message", "")
        if err.get("code") == 403 and "Google Drive API has not been used" in msg:
            info["status"] = "api_disabled"
            info["status_text"] = "Cần bật Drive API"
            info["message"] = "Google Drive API chưa được bật trên Google Cloud Console"
            return info
        info["status"] = "error"
        info["status_text"] = "Lỗi quyền"
        info["message"] = msg
        return info

    info["status"] = "connected"
    info["status_text"] = "Đã kết nối"
    info["message"] = "Sẵn sàng sao lưu"

    user = data.get("user", {})
    info["email"] = user.get("emailAddress", "--")
    info["name"] = user.get("displayName", "--")

    quota = data.get("storageQuota", {})
    total = int(quota.get("limit", 0)) if quota.get("limit") else 0
    used = int(quota.get("usage", 0)) if quota.get("usage") else 0
    free = max(0, total - used) if total > 0 else 0

    info["used_bytes"] = used
    info["total_bytes"] = total
    info["free_bytes"] = free

    def fmt_sz(b):
        if b <= 0: return "0 B"
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if b < 1024.0: return f"{b:.2f} {unit}"
            b /= 1024.0
        return f"{b:.2f} PB"

    info["used_str"] = fmt_sz(used)
    info["total_str"] = fmt_sz(total) if total > 0 else "Không giới hạn"
    info["free_str"] = fmt_sz(free) if total > 0 else "--"
    info["percent_used"] = round((used / total) * 100, 1) if total > 0 else 0.0

    return info

def check_rclone_remote_auth(remote="gg"):
    """Kiểm tra xem remote rclone (Google Drive) đã sẵn sàng hoạt động hay chưa."""
    info = get_drive_info(remote)
    if info["status"] == "connected":
        return True, "Kết nối Google Drive thành công!"
    return False, info["message"]

def upload_to_google_drive(local_dir, remote_name="gg", drive_folder="18TUBE", progress_callback=None, cancel_check=None, log_callback=None):
    """
    Tải thư mục lên Google Drive sử dụng rclone với tiến trình thời gian thực.
    - local_dir: Thư mục máy tính cần tải lên
    - remote_name: Tên remote trong rclone (mặc định: 'gg')
    - drive_folder: Thư mục trên Google Drive (mặc định: '18TUBE')
    - progress_callback: fn(pct: int, speed: str, transferred: str, eta: str)
    - cancel_check: fn() -> bool
    - log_callback: fn(line: str)
    """
    if not check_rclone_available():
        return False, "Không tìm thấy công cụ rclone trên hệ thống."

    if not os.path.exists(local_dir):
        return False, f"Thư mục nguồn không tồn tại: {local_dir}"

    rc = get_rclone_path()
    target = f"{remote_name}:{drive_folder.strip('/')}"
    cmd = [
        rc, "copy",
        local_dir,
        target,
        "--stats", "1s",
        "--stats-log-level", "NOTICE",
        "--transfers", "4",
        "--fast-list",
        "--drive-chunk-size", "64M"
    ]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=NO_WINDOW
        )

        curr_pct = 0
        curr_speed = "0 B/s"
        curr_tf = ""
        curr_eta = "--"
        curr_files = ""
        last_log_time = 0

        for line in proc.stdout:
            if cancel_check and cancel_check():
                proc.kill()
                break

            line_str = line.strip()
            if not line_str:
                continue

            # Phân tích tiến trình dung lượng rclone
            # Dòng: "Transferred:   \t   1.250 GiB / 18.930 GiB, 7%, 15.2 MiB/s, ETA 19m20s"
            if line_str.startswith("Transferred:") and any(u in line_str for u in ["B", "KiB", "MiB", "GiB", "TiB"]):
                pct_m = re.search(r'(\d+)%', line_str)
                if pct_m:
                    curr_pct = int(pct_m.group(1))

                speed_m = re.search(r'([0-9.]+\s*[a-zA-Z]+/s)', line_str)
                if speed_m:
                    curr_speed = speed_m.group(1)

                tf_m = re.search(r'([0-9.]+\s*[a-zA-Z]+)\s*/\s*([0-9.]+\s*[a-zA-Z]+)', line_str)
                if tf_m:
                    curr_tf = tf_m.group(0)

                eta_m = re.search(r'ETA\s*([^\s,]+)', line_str)
                if eta_m:
                    curr_eta = eta_m.group(1)

                if progress_callback:
                    progress_callback(curr_pct, curr_speed, curr_tf, curr_eta, curr_files)

                # Định kỳ ghi log tóm tắt ra console mỗi 4 giây
                now = time.time()
                if log_callback and (now - last_log_time >= 4):
                    last_log_time = now
                    f_info = f" ({curr_files} file)" if curr_files else ""
                    log_callback(f"[Tiến trình] {curr_pct}% | Tốc độ: {curr_speed} | Đã tải: {curr_tf}{f_info} | Còn lại: {curr_eta}")

            # Dòng tiến trình số lượng file: "Transferred:          235 / 312, 75%"
            elif line_str.startswith("Transferred:") and not any(u in line_str for u in ["KiB", "MiB", "GiB", "TiB"]):
                fc_m = re.search(r'(\d+\s*/\s*\d+)', line_str)
                if fc_m:
                    curr_files = fc_m.group(1)
                    if progress_callback:
                        progress_callback(curr_pct, curr_speed, curr_tf, curr_eta, curr_files)

            # Ghi nhận các file đang upload hoặc thông báo quan trọng
            elif line_str.startswith("*") or "ERROR" in line_str or "Failed" in line_str:
                if log_callback:
                    log_callback(line_str)

        proc.wait()

        if cancel_check and cancel_check():
            return False, "Quá trình tải lên Google Drive đã bị dừng."

        if proc.returncode == 0:
            if progress_callback:
                progress_callback(100, "0 B/s", curr_tf, "0s", curr_files)
            return True, f"Tải lên Google Drive thành công vào '{target}'!"
        else:
            return False, f"Rclone kết thúc với mã lỗi {proc.returncode}."

    except Exception as e:
        return False, str(e)

def main():
    parser = argparse.ArgumentParser(description="18TUBE Photos & Videos Downloader (Tốc độ cao)")
    parser.add_argument("--url", default="https://18tube.nl/vkcklananh9496/", help="URL trang creator (mặc định: vkcklananh9496)")
    parser.add_argument("--file", help="Đường dẫn file text chứa danh sách link (mỗi dòng 1 link)")
    parser.add_argument("--out", default="downloads", help="Thư mục lưu file tải về (mặc định: ./downloads)")
    parser.add_argument("--only", choices=["all", "photos", "videos"], default="all", help="Chỉ tải photos, videos, hoặc all")
    parser.add_argument("--quality", choices=["best", "720p", "480p", "360p", "lowest"], default="best", help="Chất lượng video: best (mặc định), 720p, 480p, 360p, lowest")
    parser.add_argument("--limit", type=int, default=0, help="Giới hạn số lượng tải (0 là tải tất cả)")
    parser.add_argument("--photo-threads", type=int, default=6, help="Số luồng tải ảnh song song (mặc định: 6)")
    parser.add_argument("--video-threads", type=int, default=2, help="Số luồng tải video song song (mặc định: 2)")
    parser.add_argument("--check", action="store_true", help="Kiểm tra xem đã tải đủ file hay chưa")
    parser.add_argument("--upload-drive", action="store_true", help="Tải thư mục lên Google Drive qua rclone")
    parser.add_argument("--drive-remote", default="gg", help="Tên remote rclone của Google Drive (mặc định: gg)")
    parser.add_argument("--drive-folder", default="18TUBE", help="Thư mục đích trên Google Drive (mặc định: 18TUBE)")
    parser.add_argument("--gui", action="store_true", help="Khởi động giao diện đồ họa (GUI)")
    args = parser.parse_args()

    if args.gui:
        import gui
        gui.launch_gui()
        return

    creator_slugs = []
    if args.file and os.path.exists(args.file):
        with open(args.file, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                c = line.strip()
                if c:
                    s = extract_creator_slug(c)
                    if s and s != "unknown" and s not in creator_slugs:
                        creator_slugs.append(s)
    elif args.url:
        creator_slugs.append(extract_creator_slug(args.url))

    if not creator_slugs:
        print("[!] Không tìm thấy URL hoặc Creator hợp lệ để xử lý.")
        return

    # Chế độ kiểm tra file
    if args.check:
        for s in creator_slugs:
            print(f"[*] Đang kiểm tra tính đầy đủ của file đã tải cho: {s} ...")
            res = verify_downloaded_media(s, args.out)
            print("\n" + "="*50)
            print(f"📋 BÁO CÁO KIỂM TRA FILE: {s}")
            print("="*50)
            print(f"📁 Thư mục kiểm tra: {res['creator_dir']}")
            print(f"🖼️ Ảnh:   Đã có {res['existing_photos_count']}/{res['total_photos']} (Dung lượng: {format_size(res['total_photo_bytes'])})")
            print(f"🎬 Video: Đã có {res['existing_videos_count']}/{res['total_videos']} (Dung lượng: {format_size(res['total_video_bytes'])})")
            print(f"📦 Tổng:  Đã có {res['total_existing']}/{res['total_expected']} (Tổng dung lượng: {format_size(res['total_bytes'])})")
            print("-"*50)
            if res['is_complete']:
                print("✅ TẤT CẢ FILE ĐÃ ĐƯỢC TẢI ĐẦY ĐỦ!")
            else:
                print(f"⚠️ CÒN THIẾU: {len(res['missing_photos'])} ảnh và {len(res['missing_videos'])} video.")
            print("="*50)
        return

    for c_idx, creator_slug in enumerate(creator_slugs, 1):
        if len(creator_slugs) > 1:
            print(f"\n{'='*55}")
            print(f"▶ [{c_idx}/{len(creator_slugs)}] Đang xử lý Creator: {creator_slug}")
            print(f"{'='*55}")

        print(f"[*] Đang quét danh sách media của creator: {creator_slug} ...")
        
        def cli_progress(page, new_items, tot_p, tot_v):
            print(f"  Trang {page}: tìm thấy {new_items} mục mới (Tổng: {tot_p} ảnh, {tot_v} video)")

        photos, videos = collect_media_items(creator_slug, progress_callback=cli_progress)
        print(f"\n[+] Tổng kết phát hiện: {len(photos)} ảnh và {len(videos)} video.")

        base_out = os.path.join(args.out, creator_slug)
        photos_dir = os.path.join(base_out, "photos")
        videos_dir = os.path.join(base_out, "videos")

        ffmpeg_exe = None
        if args.only in ["all", "videos"]:
            ffmpeg_exe = get_ffmpeg_path()
            if not ffmpeg_exe:
                print("[!] CẢNH BÁO: Không tìm thấy ffmpeg trên máy!")
                print("    Để tải video, bạn có thể cài đặt thư viện 'imageio-ffmpeg':")
                print("    pip install imageio-ffmpeg")
                if args.only == "videos":
                    continue

        # 1. Tải Photos đa luồng
        if args.only in ["all", "photos"] and photos:
            os.makedirs(photos_dir, exist_ok=True)
            items_to_dl = photos[:args.limit] if args.limit > 0 else photos
            print(f"\n[*] Bắt đầu tải {len(items_to_dl)} ảnh với {args.photo_threads} luồng song song vào: {photos_dir}")
            session = create_optimized_session(args.photo_threads * 2)
            success_p = 0
            
            with ThreadPoolExecutor(max_workers=args.photo_threads) as executor:
                future_to_item = {
                    executor.submit(download_photo, item, photos_dir, session): item
                    for item in items_to_dl
                }
                with tqdm(total=len(items_to_dl), desc="Tải Ảnh đa luồng", unit="file") as pbar:
                    for future in as_completed(future_to_item):
                        ok, _, _ = future.result()
                        if ok:
                            success_p += 1
                        pbar.update(1)
                        
            print(f"[✓] Đã hoàn thành tải ảnh: {success_p}/{len(items_to_dl)} thành công.")

        # 2. Tải Videos đa luồng
        if args.only in ["all", "videos"] and videos:
            if ffmpeg_exe:
                os.makedirs(videos_dir, exist_ok=True)
                items_to_dl = videos[:args.limit] if args.limit > 0 else videos
                print(f"\n[*] Bắt đầu tải {len(items_to_dl)} video ({args.quality}) với {args.video_threads} luồng song song vào: {videos_dir}")
                success_v = 0
                
                with ThreadPoolExecutor(max_workers=args.video_threads) as executor:
                    future_to_item = {
                        executor.submit(download_video, item, videos_dir, ffmpeg_exe, quality=args.quality): item
                        for item in items_to_dl
                    }
                    with tqdm(total=len(items_to_dl), desc=f"Tải Video ({args.quality})", unit="file") as pbar:
                        for future in as_completed(future_to_item):
                            ok, _, _ = future.result()
                            if ok:
                                success_v += 1
                            pbar.update(1)

                print(f"[✓] Đã hoàn thành tải video: {success_v}/{len(items_to_dl)} thành công.")
            else:
                print("[!] Bỏ qua tải video do thiếu ffmpeg.")

        print(f"\n[🎉] Xong! Dữ liệu được lưu tại: {os.path.abspath(base_out)}")

        if args.upload_drive:
            print(f"\n[*] Đang chuẩn bị tải thư mục lên Google Drive ({args.drive_remote}:{args.drive_folder}/{creator_slug})...")
            ok_auth, msg = check_rclone_remote_auth(args.drive_remote)
            if not ok_auth:
                print(f"[!] Lỗi xác thực Google Drive: {msg}")
                print(f"    Vui lòng chạy 'connect_drive.bat' hoặc 'rclone config reconnect {args.drive_remote}:' trước.")
            else:
                drive_dest = f"{args.drive_folder}/{creator_slug}".strip("/")
                print(f"[*] Bắt đầu tải lên: {base_out} -> {args.drive_remote}:{drive_dest} ...")

                def drive_prog(pct, speed, tf, eta):
                    sys.stdout.write(f"\r  ☁️ Tiến trình: {pct}% | Tốc độ: {speed} | {tf} | Còn lại: {eta}   ")
                    sys.stdout.flush()

                ok_up, msg_up = upload_to_google_drive(
                    base_out,
                    remote_name=args.drive_remote,
                    drive_folder=drive_dest,
                    progress_callback=drive_prog
                )
                print()
                if ok_up:
                    print(f"[✓] {msg_up}")
                else:
                    print(f"[!] {msg_up}")

if __name__ == "__main__":
    main()

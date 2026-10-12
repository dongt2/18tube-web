# -*- coding: utf-8 -*-
"""
18TUBE Media Source Inspector & Verification Web Dashboard
Server backend providing APIs for Google Drive inspection, Local media inspection,
Media streaming, and 18tube online integrity verification.
"""

import os
import sys
import json
import time
import re
import mimetypes
import hashlib
import shutil
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
import requests
from urllib.parse import unquote
from flask import Flask, render_template, jsonify, request, send_file, abort, Response, redirect

# Import core helpers from downloader
import downloader

SUBPROCESS_EXTRA = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}

app = Flask(
    __name__,
    template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), "web", "templates"),
    static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), "web", "static")
)
app.config['TEMPLATES_AUTO_RELOAD'] = True

THUMBNAILS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".thumbnails")
os.makedirs(THUMBNAILS_DIR, exist_ok=True)

def init_cloud_environment():
    """Tự động cấu hình rclone từ biến môi trường Cloud (Botkeep, Render, Railway, v.v.)."""
    import base64
    b64_cfg = os.environ.get("RCLONE_CONFIG_BASE64", "").strip()
    raw_cfg = os.environ.get("RCLONE_CONFIG", "").strip()
    if b64_cfg:
        conf_dir = os.path.expanduser("~/.config/rclone")
        os.makedirs(conf_dir, exist_ok=True)
        conf_file = os.path.join(conf_dir, "rclone.conf")
        try:
            cfg_text = base64.b64decode(b64_cfg.encode("ascii")).decode("utf-8", errors="ignore")
            with open(conf_file, "w", encoding="utf-8") as f:
                f.write(cfg_text)
            os.environ["RCLONE_CONFIG"] = conf_file
            print(f"[OK] Đã tự động cấu hình Google Drive từ biến RCLONE_CONFIG_BASE64 -> {conf_file}")
        except Exception as e:
            print(f"[!] Lỗi khi nạp RCLONE_CONFIG_BASE64: {e}")
    elif raw_cfg and "\n" in raw_cfg:
        conf_dir = os.path.expanduser("~/.config/rclone")
        os.makedirs(conf_dir, exist_ok=True)
        conf_file = os.path.join(conf_dir, "rclone.conf")
        try:
            with open(conf_file, "w", encoding="utf-8") as f:
                f.write(raw_cfg)
            os.environ["RCLONE_CONFIG"] = conf_file
            print(f"[OK] Đã nạp cấu hình Google Drive từ biến RCLONE_CONFIG -> {conf_file}")
        except Exception as e:
            print(f"[!] Lỗi khi ghi RCLONE_CONFIG: {e}")

init_cloud_environment()

# Global persistent cache for rclone results to keep web UI instant
# Structure: { cache_key: { "data": ..., "timestamp": float } }
CACHE_TTL = 3600  # 1 hour
CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".drive_cache.json")
_cache = {}
_cache_lock = threading.Lock()
_save_lock = threading.Lock()
_save_timer = None
_save_timer_lock = threading.Lock()

def _cleanup_stale_tmp_files():
    """Dọn dẹp các file cache tạm cũ do tiến trình trước để lại."""
    try:
        cache_dir = os.path.dirname(os.path.abspath(CACHE_FILE))
        prefix = os.path.basename(CACHE_FILE) + ".tmp"
        for fname in os.listdir(cache_dir):
            if fname.startswith(prefix):
                try:
                    os.remove(os.path.join(cache_dir, fname))
                except OSError:
                    pass
    except Exception:
        pass

def _load_cache_from_disk():
    global _cache
    _cleanup_stale_tmp_files()
    if os.path.isfile(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                content = f.read().strip()
            if not content:
                return
            try:
                loaded = json.loads(content)
            except json.JSONDecodeError as jde:
                if jde.pos and jde.pos > 0:
                    loaded = json.loads(content[:jde.pos])
                else:
                    raise
            if isinstance(loaded, dict):
                if "drive_creator_items_all" in loaded:
                    del loaded["drive_creator_items_all"]
                with _cache_lock:
                    _cache = loaded
        except Exception as e:
            print(f"Lỗi nạp cache từ đĩa: {e}")

def _save_cache_to_disk():
    """Ghi cache RAM ra đĩa an toàn đa tiến trình, retry xử lý xung đột Windows File Lock."""
    with _save_lock:
        tmp_file = None
        try:
            with _cache_lock:
                data_to_save = dict(_cache)

            # Đặt tên file tạm duy nhất theo PID + Thread ID + Timestamp để không bao giờ bị đụng độ file
            pid = os.getpid()
            tid = threading.get_ident()
            timestamp = int(time.time() * 1000)
            tmp_file = f"{CACHE_FILE}.tmp.{pid}.{tid}.{timestamp}"

            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(data_to_save, f, ensure_ascii=False)

            # Trên Windows, os.replace có thể tạm thời gặp WinError 32 nếu file đang bị scanner/đọc mở.
            # Retry tối đa 10 lần với thời gian chờ tăng dần.
            success = False
            last_err = None
            for attempt in range(10):
                try:
                    os.replace(tmp_file, CACHE_FILE)
                    success = True
                    break
                except (PermissionError, OSError) as pe:
                    last_err = pe
                    time.sleep(0.15 * (attempt + 1))

            if not success:
                # Phương án dự phòng: thử sao chép đè nếu replace không thành công
                try:
                    shutil.copyfile(tmp_file, CACHE_FILE)
                    success = True
                except Exception as ce:
                    print(f"Cảnh báo: File cache đang bị tiến trình khác truy cập, sẽ tự động lưu lại ở lần tiếp theo: {last_err or ce}")
        except Exception as e:
            print(f"Lỗi khi lưu cache ra đĩa: {e}")
        finally:
            if tmp_file and os.path.isfile(tmp_file):
                try:
                    os.remove(tmp_file)
                except OSError:
                    pass

def _trigger_save_cache_debounced(delay=1.5):
    """Debounce ghi cache: gom nhiều lần set_cached liên tiếp thành 1 lần ghi ra đĩa duy nhất."""
    global _save_timer
    with _save_timer_lock:
        if _save_timer is not None:
            try:
                _save_timer.cancel()
            except Exception:
                pass
        _save_timer = threading.Timer(delay, _save_cache_to_disk)
        _save_timer.daemon = True
        _save_timer.start()

# Khởi tạo nạp cache sẵn từ đĩa ngay khi server khởi động
_load_cache_from_disk()

DEFAULT_LOCAL_PATHS = [
    r"E:\New folder (3)",
    os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads"))
]

def get_cached(key):
    with _cache_lock:
        item = _cache.get(key)
        if item and (time.time() - item.get("timestamp", 0)) < CACHE_TTL:
            return item.get("data")
        return None

def set_cached(key, data):
    with _cache_lock:
        _cache[key] = {
            "data": data,
            "timestamp": time.time()
        }
    # Gom cụm lưu đĩa ngầm (debounced) tránh nghẽn I/O và xung đột file
    _trigger_save_cache_debounced(delay=1.5)

def clear_cache():
    global _save_timer
    with _save_timer_lock:
        if _save_timer is not None:
            try:
                _save_timer.cancel()
            except Exception:
                pass
            _save_timer = None
    with _cache_lock:
        _cache.clear()
    if os.path.isfile(CACHE_FILE):
        for _ in range(5):
            try:
                os.remove(CACHE_FILE)
                break
            except Exception:
                time.sleep(0.1)

def run_rclone(args, timeout=60):
    """Chạy rclone tương thích đa nền tảng (Windows & Linux)."""
    rc = downloader.get_rclone_path()
    import shutil
    if not rc or (os.path.isabs(rc) and not os.path.isfile(rc)) or (not os.path.isabs(rc) and not shutil.which(rc)):
        raise FileNotFoundError("Không tìm thấy công cụ rclone trên hệ thống")
    
    cmd = [rc] + args
    res = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        **SUBPROCESS_EXTRA
    )
    if res.returncode != 0:
        raise RuntimeError(f"Rclone error (code {res.returncode}): {res.stderr.strip()}")
    return res.stdout

def format_bytes(size):
    if size is None or size < 0:
        return "0 B"
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024.0:
            return f"{size:.1f} {unit}" if unit != 'B' else f"{int(size)} B"
        size /= 1024.0
    return f"{size:.1f} PB"

def is_image_ext(filename):
    ext = os.path.splitext(filename)[1].lower()
    return ext in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".jfif"]

def is_video_ext(filename):
    ext = os.path.splitext(filename)[1].lower()
    return ext in [".mp4", ".m4v", ".webm", ".ts", ".mkv", ".mov", ".avi"]

def requests_quote(path_str):
    import urllib.parse
    return urllib.parse.quote(str(path_str))

COUNTRY_CONFIG = {
    "_Vietnam": {"name": "Việt Nam", "flag": "🇻🇳", "code": "VN"},
    "_UK": {"name": "Anh", "flag": "🇬🇧", "code": "GB"},
    "_USA": {"name": "Mỹ", "flag": "🇺🇸", "code": "US"},
    "_Australia": {"name": "Úc", "flag": "🇦🇺", "code": "AU"},
    "_Poland": {"name": "Ba Lan", "flag": "🇵🇱", "code": "PL"},
    "_Indonesia": {"name": "Indonesia", "flag": "🇮🇩", "code": "ID"},
    "_China": {"name": "Trung Quốc", "flag": "🇨🇳", "code": "CN"},
    "_Japan": {"name": "Nhật Bản", "flag": "🇯🇵", "code": "JP"},
    "_Korea": {"name": "Hàn Quốc", "flag": "🇰🇷", "code": "KR"},
    "_Malaysia": {"name": "Malaysia", "flag": "🇲🇾", "code": "MY"},
    "_Russia": {"name": "Nga", "flag": "🇷🇺", "code": "RU"},
    "_Singapore": {"name": "Singapore", "flag": "🇸🇬", "code": "SG"},
    "_Taiwan": {"name": "Đài Loan", "flag": "🇹🇼", "code": "TW"},
    "_Thailand": {"name": "Thái Lan", "flag": "🇹🇭", "code": "TH"},
}

def get_country_info(folder_name):
    if not folder_name:
        return {"name": "Việt Nam", "flag": "🇻🇳", "code": "VN"}
    f_clean = folder_name.strip()
    if f_clean in COUNTRY_CONFIG:
        return COUNTRY_CONFIG[f_clean]
    with_ = "_" + f_clean.lstrip("_")
    if with_ in COUNTRY_CONFIG:
        return COUNTRY_CONFIG[with_]
    for k, v in COUNTRY_CONFIG.items():
        if v["name"].lower() == f_clean.lower() or v["code"].lower() == f_clean.lower():
            return v
    raw = f_clean.lstrip("_")
    return {"name": raw, "flag": "🌐", "code": raw[:2].upper()}

def build_all_drive_cache(force=False):
    """
    Quét toàn bộ Google Drive 1 lần duy nhất:
    Tự động phân loại và nạp cache danh sách chi tiết (ảnh, video) của TẤT CẢ các creator
    vào bộ nhớ RAM và lưu xuống .drive_cache.json.
    Nhờ vậy, người dùng bấm vào bất kỳ Creator nào cũng mở ra TỨC THÌ (0ms).
    """
    if not force:
        # Tối ưu siêu tốc (0.001s): Tổng hợp trực tiếp từ RAM cache các creator đã nạp
        cached_creators = []
        tot_files = 0
        tot_bytes = 0
        seen_slugs = set()
        with _cache_lock:
            for k, v in _cache.items():
                if k.startswith("drive_creator_items_") and k != "drive_creator_items_all":
                    c_data = v.get("data", {})
                    if isinstance(c_data, dict):
                        c_slug = c_data.get("slug", "")
                        # Bỏ qua nếu là thư mục quốc gia gốc không có sub-creator (VD: _Vietnam, _UK)
                        if not c_slug or (c_slug.startswith("_") and "/" not in c_slug):
                            continue
                        real_c_slug = c_slug if "/" in c_slug else f"_Vietnam/{c_slug}"
                        if real_c_slug in seen_slugs:
                            continue
                        seen_slugs.add(real_c_slug)

                        c_name = c_data.get("name") or real_c_slug.split("/")[-1]
                        c_folder = real_c_slug.split("/")[0] if "/" in real_c_slug else "_Vietnam"
                        c_info = get_country_info(c_folder)
                        c_country = c_data.get("country") or c_info["name"]
                        p_cnt = c_data.get("photos_count", 0)
                        v_cnt = c_data.get("videos_count", 0)
                        t_sz = c_data.get("total_size", 0)
                        tot_files += (p_cnt + v_cnt)
                        tot_bytes += t_sz
                        cached_creators.append({
                            "slug": real_c_slug,
                            "name": c_name,
                            "country": c_country,
                            "country_flag": c_info["flag"],
                            "photos_count": p_cnt,
                            "videos_count": v_cnt,
                            "total_files": p_cnt + v_cnt,
                            "total_size": t_sz,
                            "total_size_str": format_bytes(t_sz),
                            "drive_url": f"https://drive.google.com/drive/folders/{c_data.get('id', '')}" if c_data.get('id') else ""
                        })
        if len(cached_creators) >= 10:
            cached_creators.sort(key=lambda x: (x.get("country") != "Việt Nam", (x.get("country") or "").lower(), x["name"].lower()))
            summary_res = {
                "total_creators": len(cached_creators),
                "total_files": tot_files,
                "total_size": tot_bytes,
                "total_size_str": format_bytes(tot_bytes),
                "creators": cached_creators
            }
            set_cached("drive_summary_all", summary_res)
            return summary_res

        cached_summary = get_cached("drive_summary_all")
        if cached_summary:
            valid_creators = [c for c in cached_summary.get("creators", []) if not (c.get("slug", "").startswith("_") and "/" not in c.get("slug", ""))]
            if len(valid_creators) == len(cached_summary.get("creators", [])):
                return cached_summary

    raw_json = run_rclone([
        "lsjson", "gg:18TUBE", "--recursive", "--max-depth", "3",
        "--fast-list", "--drive-pacer-min-sleep", "10ms"
    ], timeout=60)
    items = json.loads(raw_json)

    creator_map = {}
    creator_files_map = {}
    total_cloud_bytes = 0
    total_cloud_files = 0
    all_photos = []
    all_videos = []

    for it in items:
        path = it.get("Path", "")
        parts = path.replace("\\", "/").split("/")
        if not parts:
            continue

        if parts[0].startswith("_"):
            # Thư mục quốc gia (VD: _Anh/katie hoặc _Úc/eskyperry)
            if len(parts) < 2:
                continue
            country_name = parts[0].lstrip("_")
            creator_name = parts[1]
            creator_slug = f"{parts[0]}/{parts[1]}"
        else:
            country_name = "Việt Nam"
            creator_name = parts[0]
            creator_slug = parts[0]

        if creator_slug not in creator_map:
            creator_map[creator_slug] = {
                "slug": creator_slug,
                "name": creator_name,
                "country": country_name,
                "photos_count": 0,
                "videos_count": 0,
                "total_size": 0,
                "id": "",
                "mod_time": ""
            }
            creator_files_map[creator_slug] = {
                "photos": [],
                "videos": [],
                "issues": [],
                "total_size": 0
            }

        if it.get("IsDir"):
            is_creator_dir = (len(parts) == 2 if parts[0].startswith("_") else len(parts) == 1)
            if is_creator_dir:
                creator_map[creator_slug]["id"] = it.get("ID", "")
                creator_map[creator_slug]["mod_time"] = it.get("ModTime", "")
            continue

        size = it.get("Size", 0)
        fname = it.get("Name", "")
        f_id = it.get("ID", "")
        mod_time = it.get("ModTime", "")

        creator_map[creator_slug]["total_size"] += size
        creator_files_map[creator_slug]["total_size"] += size
        total_cloud_bytes += size
        total_cloud_files += 1

        file_info = {
            "name": fname,
            "path": path,
            "size": size,
            "size_str": format_bytes(size),
            "mod_time": mod_time,
            "id": f_id,
            "creator": creator_name,
            "country": country_name,
            "drive_view_url": f"https://drive.google.com/file/d/{f_id}/view" if f_id else "",
            "drive_preview_url": f"https://drive.google.com/file/d/{f_id}/preview" if f_id else "",
            "thumbnail_url": f"https://lh3.googleusercontent.com/d/{f_id}=w500" if f_id else "",
            "stream_url": f"/api/media/drive/stream?id={f_id}&name={requests_quote(fname)}" if f_id else "",
            "drive_download_url": f"https://drive.google.com/uc?export=download&id={f_id}" if f_id else "",
            "is_empty": size <= 0
        }

        if size <= 0:
            creator_files_map[creator_slug]["issues"].append({
                **file_info,
                "issue_type": "0_byte",
                "issue_desc": "File 0 bytes (tải lên bị lỗi/rỗng)"
            })

        if is_image_ext(fname):
            creator_map[creator_slug]["photos_count"] += 1
            creator_files_map[creator_slug]["photos"].append(file_info)
            all_photos.append(file_info)
        elif is_video_ext(fname):
            if 0 < size < 50 * 1024:
                creator_files_map[creator_slug]["issues"].append({
                    **file_info,
                    "issue_type": "suspicious_small_video",
                    "issue_desc": "Video quá nhỏ (<50KB), có thể bị lỗi stream dở dang"
                })
            creator_map[creator_slug]["videos_count"] += 1
            creator_files_map[creator_slug]["videos"].append(file_info)
            all_videos.append(file_info)

    # 1. Nạp chi tiết cho TỪNG creator vào cache (bấm là ra ngay 0s)
    for c_slug, c_data in creator_files_map.items():
        set_cached(f"drive_creator_items_{c_slug}", {
            "slug": c_slug,
            "name": creator_map[c_slug]["name"],
            "country": creator_map[c_slug]["country"],
            "total_items": len(c_data["photos"]) + len(c_data["videos"]),
            "photos_count": len(c_data["photos"]),
            "videos_count": len(c_data["videos"]),
            "issues_count": len(c_data["issues"]),
            "total_size": c_data["total_size"],
            "total_size_str": format_bytes(c_data["total_size"]),
            "photos": c_data["photos"],
            "videos": c_data["videos"],
            "issues": c_data["issues"]
        })

    # 2. Nạp mục tổng hợp "all" cho trường hợp chọn "Tất cả Creator"
    set_cached("drive_creator_items_all", {
        "slug": "all",
        "name": "Tất cả Creator",
        "total_items": len(all_photos) + len(all_videos),
        "photos_count": len(all_photos),
        "videos_count": len(all_videos),
        "issues_count": 0,
        "total_size": total_cloud_bytes,
        "total_size_str": format_bytes(total_cloud_bytes),
        "photos": all_photos,
        "videos": all_videos,
        "issues": []
    })

    creators_list = []
    for c, val in creator_map.items():
        val["total_files"] = val["photos_count"] + val["videos_count"]
        val["total_size_str"] = format_bytes(val["total_size"])
        val["drive_url"] = f"https://drive.google.com/drive/folders/{val['id']}" if val.get("id") else ""
        creators_list.append(val)

    creators_list.sort(key=lambda x: x["slug"].lower())

    summary_result = {
        "total_creators": len(creators_list),
        "total_files": total_cloud_files,
        "total_size": total_cloud_bytes,
        "total_size_str": format_bytes(total_cloud_bytes),
        "creators": creators_list
    }

    set_cached("drive_summary_all", summary_result)
    set_cached("drive_creators_list", creators_list)
    return summary_result

def _background_prefetch_creators():
    """Luồng quét ngầm từng creator một cách an toàn và bền bỉ (không bao giờ timeout)."""
    try:
        creators = get_cached("drive_creators_list") or []
        for c in creators:
            c_slug = c.get("slug")
            if not c_slug or (c_slug.startswith("_") and "/" not in c_slug):
                continue
            key = f"drive_creator_items_{c_slug}"
            alt_key = f"drive_creator_items_{c_slug.split('/')[-1]}"
            if not get_cached(key) and not get_cached(alt_key):
                try:
                    raw_json = run_rclone([
                        "lsjson", f"gg:18TUBE/{c_slug}", "--recursive",
                        "--fast-list", "--drive-pacer-min-sleep", "10ms"
                    ], timeout=40)
                    items = json.loads(raw_json)
                    c_name = c.get("name") or c_slug.split("/")[-1]
                    c_folder = c_slug.split("/")[0] if "/" in c_slug else "_Vietnam"
                    c_info = get_country_info(c_folder)
                    c_country = c.get("country") or c_info["name"]
                    photos = []
                    videos = []
                    issues = []
                    total_size = 0
                    for it in items:
                        if it.get("IsDir"): continue
                        fname = it.get("Name", "")
                        path = it.get("Path", "")
                        sz = it.get("Size", 0)
                        total_size += sz
                        f_id = it.get("ID", "")
                        mod_time = it.get("ModTime", "")
                        finfo = {
                            "name": fname,
                            "path": path,
                            "size": sz,
                            "size_str": format_bytes(sz),
                            "mod_time": mod_time,
                            "id": f_id,
                            "creator": c_name,
                            "country": c_country,
                            "drive_view_url": f"https://drive.google.com/file/d/{f_id}/view" if f_id else "",
                            "drive_preview_url": f"https://drive.google.com/file/d/{f_id}/preview" if f_id else "",
                            "thumbnail_url": f"https://lh3.googleusercontent.com/d/{f_id}=w500" if f_id else "",
                            "stream_url": f"/api/media/drive/stream?id={f_id}&name={requests_quote(fname)}" if f_id else "",
                            "drive_download_url": f"https://drive.google.com/uc?export=download&id={f_id}" if f_id else "",
                            "is_empty": sz <= 0
                        }
                        if is_image_ext(fname): photos.append(finfo)
                        elif is_video_ext(fname): videos.append(finfo)
                    payload = {
                        "slug": c_slug,
                        "name": c_name,
                        "country": c_country,
                        "total_items": len(photos) + len(videos),
                        "photos_count": len(photos),
                        "videos_count": len(videos),
                        "issues_count": len(issues),
                        "total_size": total_size,
                        "total_size_str": format_bytes(total_size),
                        "photos": photos,
                        "videos": videos,
                        "issues": issues
                    }
                    set_cached(key, payload)
                    set_cached(alt_key, payload)
                    time.sleep(0.3)
                except Exception:
                    pass
    except Exception:
        pass

def get_drive_creators_hierarchy(force=False):
    """
    Quét danh sách creator trên Google Drive theo cấu trúc thư mục mới:
    - gg:18TUBE/_<CountryName>/<CreatorName>
    - Tự động bóc tách tên quốc gia tiếng Việt, cờ emoji, và creator con.
    """
    cache_key = "drive_creators_list_v3"
    if not force:
        cached = get_cached(cache_key)
        if cached and isinstance(cached, dict):
            return cached.get("creators", []), cached.get("countries", [])

    # Quét thư mục gốc gg:18TUBE
    raw_json = run_rclone(["lsjson", "gg:18TUBE", "--max-depth", "1", "--drive-pacer-min-sleep", "10ms"], timeout=15)
    items = json.loads(raw_json)
    
    country_folders = []
    root_creators = []
    
    for it in items:
        if not it.get("IsDir"):
            continue
        name = it.get("Name", "")
        if name.startswith("_"):
            country_folders.append(it)
        else:
            root_creators.append(it)
    
    creators = []
    
    # 1. Thêm các creator ở thư mục gốc (nếu có, mặc định: Việt Nam)
    for it in root_creators:
        name = it.get("Name", "")
        c_id = it.get("ID", "")
        mod_time = it.get("ModTime", "")
        creators.append({
            "slug": name,
            "name": name,
            "country": "Việt Nam",
            "country_code": "VN",
            "country_flag": "🇻🇳",
            "country_folder": "",
            "id": c_id,
            "drive_url": f"https://drive.google.com/drive/folders/{c_id}" if c_id else "",
            "mod_time": mod_time
        })
        
    # 2. Quét các thư mục quốc gia (bắt đầu bằng _)
    if country_folders:
        def scan_country(cf):
            c_dir_name = cf.get("Name", "")
            c_info = get_country_info(c_dir_name)
            try:
                c_raw = run_rclone(["lsjson", f"gg:18TUBE/{c_dir_name}", "--max-depth", "1", "--drive-pacer-min-sleep", "10ms"], timeout=15)
                sub_items = json.loads(c_raw)
                sub_creators = []
                for sit in sub_items:
                    if sit.get("IsDir"):
                        sname = sit.get("Name", "")
                        sid = sit.get("ID", "")
                        smod = sit.get("ModTime", "")
                        sub_creators.append({
                            "slug": f"{c_dir_name}/{sname}",
                            "name": sname,
                            "country": c_info["name"],
                            "country_code": c_info["code"],
                            "country_flag": c_info["flag"],
                            "country_folder": c_dir_name,
                            "id": sid,
                            "drive_url": f"https://drive.google.com/drive/folders/{sid}" if sid else "",
                            "mod_time": smod
                        })
                return sub_creators
            except Exception as ce:
                print(f"Lỗi khi quét quốc gia {c_dir_name}: {ce}")
                return []

        with ThreadPoolExecutor(max_workers=8) as executor:
            country_results = executor.map(scan_country, country_folders)
            for c_res in country_results:
                creators.extend(c_res)

    # 3. Thống kê danh sách Quốc gia
    country_counts = {}
    for c in creators:
        cntry = c.get("country", "Khác")
        country_counts[cntry] = country_counts.get(cntry, 0) + 1

    countries = []
    if "Việt Nam" in country_counts:
        countries.append({
            "name": "Việt Nam",
            "code": "_Vietnam",
            "flag": "🇻🇳",
            "count": country_counts.pop("Việt Nam")
        })
    for c_name in sorted(country_counts.keys()):
        matched_folder = next((f for f, info in COUNTRY_CONFIG.items() if info["name"] == c_name), f"_{c_name}")
        c_info = get_country_info(matched_folder)
        countries.append({
            "name": c_name,
            "code": matched_folder,
            "flag": c_info["flag"],
            "count": country_counts[c_name]
        })

    creators.sort(key=lambda x: (x["country"] != "Việt Nam", x["country"].lower(), x["name"].lower()))
    
    result_payload = {
        "creators": creators,
        "countries": countries
    }
    set_cached(cache_key, result_payload)
    set_cached("drive_creators_list", creators)
    return creators, countries

def _warmup_cache():
    """Tự động nạp sẵn danh sách creator & toàn bộ file trong nền khi server khởi chạy (0s chờ)."""
    time.sleep(1)
    try:
        get_drive_creators_hierarchy(force=False)
        threading.Thread(target=_background_prefetch_creators, daemon=True).start()
    except Exception:
        pass

# Kích hoạt tiến trình nạp cache ngầm
threading.Thread(target=_warmup_cache, daemon=True).start()

# ----------------- ROUTES: WEB PAGES -----------------

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/gallery")
@app.route("/viewer")
def gallery():
    return render_template("gallery.html")

# ----------------- ROUTES: DRIVE API -----------------

@app.route("/api/drive/info")
def api_drive_info():
    """Lấy thông tin tài khoản và dung lượng Google Drive."""
    try:
        remote = request.args.get("remote", "gg")
        cache_key = f"drive_info_{remote}"
        force = request.args.get("force", "0") == "1"
        
        if not force:
            cached = get_cached(cache_key)
            if cached:
                return jsonify({"success": True, "data": cached, "cached": True})

        info = downloader.get_drive_info(remote)
        set_cached(cache_key, info)
        return jsonify({"success": True, "data": info, "cached": False})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/drive/creators")
def api_drive_creators():
    """Lấy danh sách các thư mục creator trên Google Drive (gg:18TUBE), hỗ trợ phân cấp Quốc Gia -> Creator."""
    try:
        force = request.args.get("refresh", "0") == "1"
        creators, countries = get_drive_creators_hierarchy(force=force)
        return jsonify({"success": True, "creators": creators, "countries": countries, "cached": not force})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/drive/creator/<path:slug>")
def api_drive_creator_detail(slug):
    """
    Quét chi tiết tất cả file trong thư mục creator trên Google Drive.
    Hỗ trợ đường dẫn creator thông thường hoặc _QuốcGia/creator.
    """
    try:
        slug = slug.strip().strip("/")
        if not slug or ".." in slug:
            return jsonify({"success": False, "error": "Tên creator không hợp lệ"}), 400

        force = request.args.get("refresh", "0") == "1"

        # 1. HỖ TRỢ CHẾ ĐỘ "ALL" (TẤT CẢ CREATOR): Tự động tổng hợp từ tất cả Creator đang có trong cache
        if slug.lower() == "all":
            all_photos = []
            all_videos = []
            country_filter = request.args.get("country", "").strip()

            with _cache_lock:
                for k, v in _cache.items():
                    if k.startswith("drive_creator_items_") and k != "drive_creator_items_all":
                        c_data = v.get("data", {})
                        if isinstance(c_data, dict):
                            c_country = c_data.get("country", "Việt Nam")
                            if country_filter and country_filter.lower() not in ["all", "__all__"]:
                                if c_country.lower() != country_filter.lower():
                                    continue
                            all_photos.extend(c_data.get("photos", []))
                            all_videos.extend(c_data.get("videos", []))

            total_items = len(all_photos) + len(all_videos)
            total_size = sum(x.get("size", 0) for x in all_photos + all_videos)
            result_data = {
                "slug": "all",
                "name": "Tất cả Creator" if not country_filter else f"Tất cả ({country_filter})",
                "country": country_filter if country_filter else "all",
                "total_items": total_items,
                "photos_count": len(all_photos),
                "videos_count": len(all_videos),
                "issues_count": 0,
                "total_size": total_size,
                "total_size_str": format_bytes(total_size),
                "photos": all_photos,
                "videos": all_videos,
                "issues": []
            }
            return jsonify({"success": True, "data": result_data, "cached": True})

        # Tự động chuẩn hóa slug: tìm kiếm trong danh sách creator hiện có
        real_slug = slug
        c_list = get_cached("drive_creators_list") or []
        matched_c = next((c for c in c_list if c.get("slug") == slug or c.get("name") == slug), None)
        if matched_c:
            real_slug = matched_c.get("slug", slug)

        cache_key = f"drive_creator_items_{real_slug}"
        alt_key1 = f"drive_creator_items_{slug}"
        alt_key2 = f"drive_creator_items_{slug.split('/')[-1]}"

        if not force:
            cached = get_cached(cache_key) or get_cached(alt_key1) or get_cached(alt_key2)
            if cached and cached.get("total_items", 0) > 0:
                if matched_c:
                    cached["slug"] = matched_c.get("slug", cached.get("slug"))
                    cached["country"] = matched_c.get("country", cached.get("country"))
                return jsonify({"success": True, "data": cached, "cached": True})

        # Quét đệ quy rclone với --fast-list và pacer 10ms tối ưu truy vấn Drive
        try:
            raw_json = run_rclone(["lsjson", f"gg:18TUBE/{real_slug}", "--recursive", "--fast-list", "--drive-pacer-min-sleep", "10ms"], timeout=45)
            items = json.loads(raw_json)
        except Exception as rc_err:
            if "directory not found" in str(rc_err).lower():
                items = []
            else:
                raise

        creator_name = real_slug.split("/")[-1]
        c_folder = real_slug.split("/")[0] if "/" in real_slug else "_Vietnam"
        c_info = get_country_info(c_folder)
        creator_country = c_info["name"]

        photos = []
        videos = []
        issues = []
        total_size = 0

        for it in items:
            if it.get("IsDir"):
                continue

            name = it.get("Name", "")
            path = it.get("Path", "")
            size = it.get("Size", 0)
            total_size += size
            f_id = it.get("ID", "")
            mod_time = it.get("ModTime", "")

            file_info = {
                "name": name,
                "path": path,
                "size": size,
                "size_str": format_bytes(size),
                "mod_time": mod_time,
                "id": f_id,
                "creator": creator_name,
                "country": creator_country,
                "drive_view_url": f"https://drive.google.com/file/d/{f_id}/view" if f_id else "",
                "drive_preview_url": f"https://drive.google.com/file/d/{f_id}/preview" if f_id else "",
                "thumbnail_url": f"https://lh3.googleusercontent.com/d/{f_id}=w500" if f_id else "",
                "stream_url": f"/api/media/drive/stream?id={f_id}&name={requests_quote(name)}" if f_id else "",
                "drive_download_url": f"https://drive.google.com/uc?export=download&id={f_id}" if f_id else "",
                "is_empty": size <= 0
            }

            # Kiểm tra lỗi
            if size <= 0:
                issues.append({
                    **file_info,
                    "issue_type": "0_byte",
                    "issue_desc": "File 0 bytes (tải lên bị lỗi/rỗng)"
                })

            if is_image_ext(name):
                photos.append(file_info)
            elif is_video_ext(name):
                # Video dưới 50KB thường là video lỗi tải dở
                if 0 < size < 50 * 1024:
                    issues.append({
                        **file_info,
                        "issue_type": "suspicious_small_video",
                        "issue_desc": "Video quá nhỏ (<50KB), có thể bị lỗi stream dở dang"
                    })
                videos.append(file_info)

        result_data = {
            "slug": real_slug,
            "name": creator_name,
            "country": creator_country,
            "total_items": len(photos) + len(videos),
            "photos_count": len(photos),
            "videos_count": len(videos),
            "issues_count": len(issues),
            "total_size": total_size,
            "total_size_str": format_bytes(total_size),
            "photos": photos,
            "videos": videos,
            "issues": issues
        }

        set_cached(cache_key, result_data)
        set_cached(alt_key1, result_data)
        set_cached(alt_key2, result_data)
        return jsonify({"success": True, "data": result_data, "cached": False})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/drive/summary_all")
def api_drive_summary_all():
    """Lấy thống kê nhanh tổng hợp tất cả creator trên Drive (và nạp sẵn toàn bộ creator)."""
    try:
        force = request.args.get("refresh", "0") == "1"
        data = build_all_drive_cache(force=force)
        return jsonify({"success": True, "data": data, "cached": not force})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/drive/refresh", methods=["POST"])
def api_drive_refresh():
    """Xóa sạch bộ nhớ đệm Drive để làm mới."""
    clear_cache()
    return jsonify({"success": True, "message": "Đã làm mới bộ nhớ đệm Google Drive thành công!"})

# ----------------- ROUTES: LOCAL STORAGE API -----------------

@app.route("/api/local/roots")
def api_local_roots():
    """Lấy danh sách các thư mục lưu cục bộ khả dụng."""
    available = []
    custom = request.args.get("custom")
    if custom and os.path.exists(custom):
        available.append({"path": os.path.abspath(custom), "exists": True, "is_custom": True})

    for p in DEFAULT_LOCAL_PATHS:
        available.append({
            "path": p,
            "exists": os.path.exists(p),
            "is_custom": False
        })
    return jsonify({"success": True, "roots": available})

@app.route("/api/local/creators")
def api_local_creators():
    """Lấy danh sách creator có trong thư mục lưu cục bộ."""
    root_dir = request.args.get("root", "")
    if not root_dir or not os.path.exists(root_dir):
        # Chọn thư mục đầu tiên tồn tại
        for p in DEFAULT_LOCAL_PATHS:
            if os.path.exists(p):
                root_dir = p
                break

    if not root_dir or not os.path.exists(root_dir):
        return jsonify({"success": True, "root": "", "creators": []})

    root_dir = os.path.abspath(root_dir)
    creators = []
    
    try:
        for entry in os.scandir(root_dir):
            if entry.is_dir():
                c_name = entry.name
                c_path = entry.path
                
                # Quét số lượng ảnh/video
                photos_count = 0
                videos_count = 0
                total_size = 0
                
                for dirpath, _, filenames in os.walk(c_path):
                    for fn in filenames:
                        fp = os.path.join(dirpath, fn)
                        try:
                            sz = os.path.getsize(fp)
                            total_size += sz
                        except OSError:
                            sz = 0
                            
                        if is_image_ext(fn):
                            photos_count += 1
                        elif is_video_ext(fn):
                            videos_count += 1

                creators.append({
                    "slug": c_name,
                    "name": c_name,
                    "path": c_path,
                    "photos_count": photos_count,
                    "videos_count": videos_count,
                    "total_files": photos_count + videos_count,
                    "total_size": total_size,
                    "total_size_str": format_bytes(total_size)
                })

        creators.sort(key=lambda x: x["name"].lower())
        return jsonify({"success": True, "root": root_dir, "creators": creators})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/local/creator")
def api_local_creator_detail():
    """Lấy chi tiết danh sách file của creator lưu trên máy."""
    c_path = request.args.get("path", "")
    if not c_path or not os.path.exists(c_path):
        return jsonify({"success": False, "error": "Đường dẫn không tồn tại"}), 404

    photos = []
    videos = []
    issues = []
    total_size = 0

    try:
        for dirpath, _, filenames in os.walk(c_path):
            for fn in filenames:
                full_p = os.path.join(dirpath, fn)
                rel_p = os.path.relpath(full_p, c_path).replace("\\", "/")
                try:
                    stat = os.stat(full_p)
                    sz = stat.st_size
                    mtime = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(stat.st_mtime))
                except OSError:
                    sz = 0
                    mtime = ""

                total_size += sz

                is_img = is_image_ext(fn)
                is_vid = is_video_ext(fn)
                thumb_url = ""
                if is_img:
                    thumb_url = f"/api/media/local/stream?file={requests_quote(full_p)}"
                elif is_vid:
                    thumb_url = f"/api/media/thumbnail?file={requests_quote(full_p)}"

                file_info = {
                    "name": fn,
                    "rel_path": rel_p,
                    "full_path": full_p,
                    "size": sz,
                    "size_str": format_bytes(sz),
                    "mod_time": mtime,
                    "thumbnail_url": thumb_url,
                    "stream_url": f"/api/media/local/stream?file={requests_quote(full_p)}",
                    "is_empty": sz <= 0
                }

                if sz <= 0:
                    issues.append({
                        **file_info,
                        "issue_type": "0_byte",
                        "issue_desc": "File rỗng 0 bytes"
                    })

                if is_image_ext(fn):
                    photos.append(file_info)
                elif is_video_ext(fn):
                    if 0 < sz < 50 * 1024:
                        issues.append({
                            **file_info,
                            "issue_type": "suspicious_small_video",
                            "issue_desc": "Video dung lượng bất thường (<50KB)"
                        })
                    videos.append(file_info)

        return jsonify({
            "success": True,
            "data": {
                "slug": os.path.basename(c_path),
                "path": c_path,
                "total_items": len(photos) + len(videos),
                "photos_count": len(photos),
                "videos_count": len(videos),
                "issues_count": len(issues),
                "total_size": total_size,
                "total_size_str": format_bytes(total_size),
                "photos": photos,
                "videos": videos,
                "issues": issues
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

def requests_quote(path_str):
    import urllib.parse
    return urllib.parse.quote(path_str)

# ----------------- ROUTES: LOCAL MEDIA STREAMING -----------------

@app.route("/api/media/local/stream")
def api_media_local_stream():
    """
    Phát trực tiếp video / xem ảnh từ thư mục máy tính.
    Hỗ trợ HTTP Range requests (206 Partial Content) để tua video mượt mà.
    """
    file_path = request.args.get("file", "")
    if not file_path:
        abort(400)

    file_path = os.path.abspath(unquote(file_path))
    if not os.path.isfile(file_path):
        abort(404)

    # Đoán mime type
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = "application/octet-stream"

    # Hỗ trợ download hoặc inline view
    download = request.args.get("dl", "0") == "1"

    return send_file(
        file_path,
        mimetype=mime_type,
        as_attachment=download,
        download_name=os.path.basename(file_path),
        conditional=True  # Hỗ trợ HTTP Range 206 Partial Content
    )

def get_drive_access_token(remote="gg"):
    """Lấy access_token còn hiệu lực của Google Drive qua rclone."""
    rc = downloader.get_rclone_path()
    if not rc:
        return None
    try:
        res = subprocess.run([rc, "config", "show", remote], capture_output=True, text=True, timeout=5, **SUBPROCESS_EXTRA)
        token_m = re.search(r'token\s*=\s*(\{.*?\})', res.stdout)
        if token_m:
            token_data = json.loads(token_m.group(1))
            return token_data.get("access_token")
    except Exception:
        pass
    return None

@app.route("/api/media/drive/stream")
def api_media_drive_stream():
    """
    Stream video hoặc ảnh trực tiếp từ Google Drive về trình duyệt client player.
    Hỗ trợ Range requests (206) để phát mượt mà không cần chuyển tab hay tải trước.
    """
    file_id = request.args.get("id", "").strip()
    if not file_id:
        abort(400)

    token = get_drive_access_token("gg")
    if not token:
        abort(401)

    url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
    headers = {"Authorization": f"Bearer {token}"}
    
    # Forward Range header nếu có từ trình duyệt video player
    client_range = request.headers.get("Range")
    if client_range:
        headers["Range"] = client_range

    try:
        resp = requests.get(url, headers=headers, stream=True, timeout=30)
        
        # Nếu token hết hạn (401), làm mới token bằng rclone
        if resp.status_code == 401:
            rc = downloader.get_rclone_path()
            subprocess.run([rc, "about", "gg:", "--json"], capture_output=True, text=True, timeout=8, **SUBPROCESS_EXTRA)
            token = get_drive_access_token("gg")
            if token:
                headers["Authorization"] = f"Bearer {token}"
                resp = requests.get(url, headers=headers, stream=True, timeout=30)

        # Chuẩn hóa headers gọn gàng, tránh tuyệt đối duplicate headers gây lỗi format trên trình duyệt
        response_headers = {
            "Accept-Ranges": "bytes",
            "Content-Type": resp.headers.get("Content-Type", "video/mp4"),
            "Cache-Control": "public, max-age=3600",
        }
        
        if "Content-Range" in resp.headers:
            response_headers["Content-Range"] = resp.headers["Content-Range"]
        if "Content-Length" in resp.headers:
            response_headers["Content-Length"] = resp.headers["Content-Length"]

        if request.args.get("dl", "0") == "1":
            filename = request.args.get("name", f"media_{file_id}.mp4")
            response_headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        else:
            response_headers["Content-Disposition"] = "inline"

        def generate():
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    yield chunk

        return Response(generate(), status=resp.status_code, headers=response_headers)
    except Exception:
        abort(500)

@app.route("/api/media/thumbnail")
def api_media_thumbnail():
    """
    Cung cấp thumbnail ảnh hoặc video cho cả Google Drive và tệp cục bộ.
    - Đối với Drive: Redirect hoặc proxy ảnh thu nhỏ chất lượng cao từ Google CDN (lh3).
    - Đối với Local video: Tự động trích xuất frame bằng FFmpeg và lưu đệm (.thumbnails).
    """
    file_id = request.args.get("id", "").strip()
    file_path = request.args.get("file", "").strip()
    proxy = request.args.get("proxy", "0") == "1"

    # 1. GOOGLE DRIVE THUMBNAIL
    if file_id:
        drive_cdn_url = f"https://lh3.googleusercontent.com/d/{file_id}=w500"
        if not proxy:
            return redirect(drive_cdn_url, code=302)

        cache_file = os.path.join(THUMBNAILS_DIR, f"drive_{file_id}.jpg")
        if os.path.isfile(cache_file) and os.path.getsize(cache_file) > 0:
            return send_file(cache_file, mimetype="image/jpeg", max_age=86400)

        try:
            resp = requests.get(drive_cdn_url, timeout=8)
            if resp.status_code == 200 and len(resp.content) > 0:
                with open(cache_file, "wb") as f:
                    f.write(resp.content)
                return send_file(cache_file, mimetype="image/jpeg", max_age=86400)
        except Exception:
            pass

        # Thử endpoint thumbnail thứ 2 của Drive
        try:
            resp2 = requests.get(f"https://drive.google.com/thumbnail?id={file_id}&sz=w500", timeout=8)
            if resp2.status_code == 200 and len(resp2.content) > 0:
                with open(cache_file, "wb") as f:
                    f.write(resp2.content)
                return send_file(cache_file, mimetype="image/jpeg", max_age=86400)
        except Exception:
            pass

        svg_ph = os.path.join(app.static_folder, "placeholder.svg")
        if os.path.isfile(svg_ph):
            return send_file(svg_ph, mimetype="image/svg+xml")
        abort(404)

    # 2. LOCAL FILE THUMBNAIL
    if file_path:
        file_path = os.path.abspath(unquote(file_path))
        if not os.path.isfile(file_path):
            abort(404)

        if is_image_ext(file_path):
            mime_type, _ = mimetypes.guess_type(file_path)
            return send_file(file_path, mimetype=mime_type or "image/jpeg")

        if is_video_ext(file_path):
            try:
                mtime = os.path.getmtime(file_path)
            except OSError:
                mtime = 0
            hash_key = hashlib.md5(f"{file_path}_{mtime}".encode("utf-8")).hexdigest()
            cache_file = os.path.join(THUMBNAILS_DIR, f"vid_{hash_key}.jpg")

            if os.path.isfile(cache_file) and os.path.getsize(cache_file) > 0:
                return send_file(cache_file, mimetype="image/jpeg")

            # Tạo thumbnail bằng FFmpeg
            ff = downloader.get_ffmpeg_path() or "ffmpeg"
            cmd = [ff, "-ss", "00:00:01", "-i", file_path, "-vframes", "1", "-q:v", "3", "-y", cache_file]
            try:
                subprocess.run(cmd, capture_output=True, timeout=10, **SUBPROCESS_EXTRA)
            except Exception:
                pass

            if not os.path.isfile(cache_file) or os.path.getsize(cache_file) == 0:
                # Thử lại tại 0s nếu video ngắn hơn 1 giây
                cmd0 = [ff, "-ss", "00:00:00", "-i", file_path, "-vframes", "1", "-q:v", "3", "-y", cache_file]
                try:
                    subprocess.run(cmd0, capture_output=True, timeout=10, **SUBPROCESS_EXTRA)
                except Exception:
                    pass

            if os.path.isfile(cache_file) and os.path.getsize(cache_file) > 0:
                return send_file(cache_file, mimetype="image/jpeg")

        svg_ph = os.path.join(app.static_folder, "placeholder.svg")
        if os.path.isfile(svg_ph):
            return send_file(svg_ph, mimetype="image/svg+xml")
        abort(404)

    abort(400)

# ----------------- ROUTES: INTEGRITY / VERIFY -----------------

@app.route("/api/verify")
def api_verify_creator():
    """
    Kiểm tra tính toàn vẹn và mức độ đầy đủ:
    Cào tổng số ảnh & video từ 18tube.nl và so khớp với nguồn Google Drive hoặc thư mục máy.
    """
    url_or_slug = request.args.get("target", "").strip()
    source_type = request.args.get("source", "drive").strip() # 'drive' hoặc 'local'
    local_path = request.args.get("local_path", "").strip()

    if not url_or_slug:
        return jsonify({"success": False, "error": "Vui lòng nhập link hoặc tên creator"}), 400

    slug = downloader.extract_creator_slug(url_or_slug)
    if not slug:
        return jsonify({"success": False, "error": "Không trích xuất được slug creator"}), 400

    try:
        # 1. Lấy thông tin online từ 18tube.nl
        online_meta = downloader.fetch_creator_metadata(slug)

        # 2. Lấy thông tin từ kho lưu trữ (Drive hoặc Local)
        stored_photos = 0
        stored_videos = 0
        stored_bytes = 0
        storage_location = ""
        issues = []

        if source_type == "drive":
            real_slug = slug
            c_list = get_cached("drive_creators_list") or []
            matched_c = next((c for c in c_list if c.get("slug") == slug or c.get("name") == slug), None)
            if matched_c:
                real_slug = matched_c.get("slug", slug)

            storage_location = f"Google Drive (gg:18TUBE/{real_slug})"
            cache_key = f"drive_creator_items_{real_slug}"
            data = get_cached(cache_key) or get_cached(f"drive_creator_items_{slug}")
            if not data:
                try:
                    # Quét nhanh rclone với --fast-list và pacer 10ms
                    raw_json = run_rclone(["lsjson", f"gg:18TUBE/{real_slug}", "--recursive", "--fast-list", "--drive-pacer-min-sleep", "10ms"], timeout=30)
                    items = json.loads(raw_json)
                except Exception:
                    items = []
                for it in items:
                    if it.get("IsDir"): continue
                    fname = it.get("Name", "")
                    sz = it.get("Size", 0)
                    stored_bytes += sz
                    if sz <= 0:
                        issues.append(f"0-byte file: {it.get('Path')}")
                    if is_image_ext(fname):
                        stored_photos += 1
                    elif is_video_ext(fname):
                        stored_videos += 1
            else:
                stored_photos = data["photos_count"]
                stored_videos = data["videos_count"]
                stored_bytes = data["total_size"]
                issues = [f"{x['path']} ({x['issue_desc']})" for x in data.get("issues", [])]

        else:
            # Nguồn local
            target_dir = local_path if local_path and os.path.exists(local_path) else None
            if not target_dir:
                for p in DEFAULT_LOCAL_PATHS:
                    cand = os.path.join(p, slug)
                    if os.path.exists(cand):
                        target_dir = cand
                        break
            
            if not target_dir or not os.path.exists(target_dir):
                return jsonify({
                    "success": True,
                    "slug": slug,
                    "online": online_meta,
                    "stored": {
                        "exists": False,
                        "location": "Không tìm thấy thư mục trên máy",
                        "photos": 0,
                        "videos": 0,
                        "total": 0,
                        "size_str": "0 B"
                    },
                    "status": "not_found",
                    "status_label": "Chưa tải về máy",
                    "completion_pct": 0.0
                })

            storage_location = target_dir
            for dirpath, _, filenames in os.walk(target_dir):
                for fn in filenames:
                    fp = os.path.join(dirpath, fn)
                    try:
                        sz = os.path.getsize(fp)
                        stored_bytes += sz
                    except OSError:
                        sz = 0
                    if sz <= 0:
                        issues.append(f"0-byte file: {fn}")
                    if is_image_ext(fn):
                        stored_photos += 1
                    elif is_video_ext(fn):
                        stored_videos += 1

        stored_total = stored_photos + stored_videos
        online_total = online_meta.get("total_all", 0)
        online_photos = online_meta.get("total_images", 0)
        online_videos = online_meta.get("total_videos", 0)

        # Tính tỷ lệ hoàn thành
        if online_total > 0:
            completion_pct = min(100.0, round((stored_total / online_total) * 100, 1))
        elif stored_total > 0:
            completion_pct = 100.0
        else:
            completion_pct = 0.0

        # Phán đoán trạng thái
        diff_photos = max(0, online_photos - stored_photos)
        diff_videos = max(0, online_videos - stored_videos)

        if stored_total == 0:
            status = "empty"
            status_label = "Chưa có dữ liệu tải lên"
            status_color = "danger"
        elif diff_photos == 0 and diff_videos == 0 and len(issues) == 0:
            status = "complete"
            status_label = "Đầy đủ 100% (Không thiếu file)"
            status_color = "success"
        elif len(issues) > 0:
            status = "warning_issues"
            status_label = f"Có {len(issues)} file lỗi/nghi vấn"
            status_color = "warning"
        else:
            status = "missing"
            status_label = f"Thiếu {diff_photos} ảnh, {diff_videos} video"
            status_color = "amber"

        report = {
            "success": True,
            "slug": slug,
            "name": online_meta.get("name", slug),
            "avatar_url": online_meta.get("avatar_url"),
            "online": {
                "total": online_total,
                "photos": online_photos,
                "videos": online_videos
            },
            "stored": {
                "exists": stored_total > 0,
                "location": storage_location,
                "total": stored_total,
                "photos": stored_photos,
                "videos": stored_videos,
                "size_str": format_bytes(stored_bytes),
                "issues": issues
            },
            "missing": {
                "photos": diff_photos,
                "videos": diff_videos,
                "total": max(0, online_total - stored_total)
            },
            "status": status,
            "status_label": status_label,
            "status_color": status_color,
            "completion_pct": completion_pct
        }

        return jsonify(report)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ----------------- SYSTEM ACTION API -----------------

@app.route("/api/system/open_folder", methods=["POST"])
def api_system_open_folder():
    """Mở thư mục trong File Explorer của Windows."""
    try:
        data = request.get_json() or {}
        folder_path = data.get("path", "")
        if hasattr(os, 'startfile'):
            os.startfile(os.path.abspath(folder_path))
            return jsonify({"success": True, "message": f"Đã mở thư mục: {folder_path}"})
        else:
            return jsonify({"success": False, "error": "Chức năng chỉ hỗ trợ khi chạy trên máy tính cá nhân"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"==================================================")
    print(f" 🚀 18TUBE SOURCE INSPECTOR WEB SERVER READY!")
    print(f" 🌐 Truy cập bảng điều khiển: http://localhost:{port}")
    print(f"==================================================")
    app.run(host="0.0.0.0", port=port, debug=False)

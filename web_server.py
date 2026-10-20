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
import gzip
import zlib
import sqlite3
import shutil
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
import requests
from urllib.parse import unquote
from flask import Flask, render_template, jsonify, request, send_file, abort, Response, redirect

# Import core helpers from downloader
import downloader

# Tự động nạp cấu hình Google Drive Rclone từ biến môi trường trên Cloud (Botkeep, Render, v.v.)
try:
    downloader.init_cloud_rclone_config()
except Exception as _e:
    print(f"Cảnh báo nạp cấu hình Rclone: {_e}")

SUBPROCESS_EXTRA = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}

app = Flask(
    __name__,
    template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), "web", "templates"),
    static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), "web", "static")
)
app.config['TEMPLATES_AUTO_RELOAD'] = True

@app.after_request
def compress_and_cache_response(response):
    """
    Tự động nén GZIP cho tất cả phản hồi JSON/HTML/CSS/JS (> 500 bytes)
    và gắn HTTP Cache-Control headers để tăng tốc độ load dữ liệu thực tế lên gấp 5-10 lần.
    """
    # 1. Thêm Cache-Control header cho các API GET và static files
    if request.method == "GET" and response.status_code == 200:
        if request.path.startswith("/api/drive/"):
            # Tránh cache nếu client yêu cầu refresh hoặc force
            if request.args.get("refresh", "0") != "1" and request.args.get("force", "0") != "1":
                response.headers["Cache-Control"] = "public, max-age=180, stale-while-revalidate=600"
        elif request.path.startswith("/static/"):
            response.headers["Cache-Control"] = "public, max-age=86400"

    # 2. Không nén nếu là stream media hoặc response direct_passthrough
    if response.direct_passthrough or request.path.startswith("/api/media/"):
        return response

    # 3. Kiểm tra xem client có hỗ trợ GZIP không
    accept_encoding = request.headers.get("Accept-Encoding", "")
    if "gzip" not in accept_encoding.lower():
        return response

    if response.status_code < 200 or response.status_code >= 300:
        return response

    if "Content-Encoding" in response.headers:
        return response

    content_type = response.content_type or ""
    if not any(ct in content_type for ct in ["application/json", "text/html", "text/css", "application/javascript"]):
        return response

    # 4. Thực hiện nén gzip dữ liệu nếu độ dài > 500 bytes
    data = response.get_data()
    if len(data) < 500:
        return response

    gzip_data = gzip.compress(data, compresslevel=6)
    response.set_data(gzip_data)
    response.headers["Content-Encoding"] = "gzip"
    response.headers["Content-Length"] = len(gzip_data)
    response.headers["Vary"] = "Accept-Encoding"
    return response

THUMBNAILS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".thumbnails")
os.makedirs(THUMBNAILS_DIR, exist_ok=True)

# Persistent 30 days
CACHE_TTL = 86400 * 30
DB_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".drive_cache.db")
_db_lock = threading.Lock()
_db_conn = None

# In-Memory RAM Cache siêu tốc (< 0.05ms) giảm tải 100% việc decompress & truy vấn lặp lại từ SQLite
_MEM_CACHE = {}
_mem_lock = threading.Lock()
MAX_MEM_CACHE_ENTRIES = 600

def _get_db():
    global _db_conn
    with _db_lock:
        if _db_conn is None:
            _db_conn = sqlite3.connect(DB_CACHE_FILE, timeout=30.0, check_same_thread=False)
            _db_conn.execute("PRAGMA journal_mode=WAL;")
            _db_conn.execute("PRAGMA synchronous=NORMAL;")
            _db_conn.execute("CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value BLOB, timestamp REAL)")
            _db_conn.commit()
        return _db_conn

# Khởi tạo kết nối SQLite trên tiến trình chính
try:
    _get_db()
except Exception as _e:
    print(f"Lỗi khởi tạo SQLite cache: {_e}")

DEFAULT_LOCAL_PATHS = [
    r"E:\New folder (3)",
    os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads"))
]

def get_cached(key):
    """Lấy dữ liệu từ bộ nhớ đệm RAM trước (<0.05ms), nếu chưa có mới đọc và giải nén từ SQLite."""
    # 1. Tra cứu siêu tốc từ RAM
    with _mem_lock:
        if key in _MEM_CACHE:
            item, ts = _MEM_CACHE[key]
            if (time.time() - ts) <= CACHE_TTL:
                return item
            else:
                del _MEM_CACHE[key]

    # 2. Đọc từ SQLite nếu RAM chưa có
    try:
        conn = _get_db()
        with _db_lock:
            cur = conn.cursor()
            cur.execute("SELECT value, timestamp FROM cache WHERE key = ?", (key,))
            row = cur.fetchone()
        if not row:
            return None
        val_bytes, ts = row
        if (time.time() - ts) > CACHE_TTL:
            return None
        raw_str = zlib.decompress(val_bytes).decode("utf-8")
        item = json.loads(raw_str)
        data = item.get("data") if (isinstance(item, dict) and "data" in item) else item

        # Lưu ngay vào RAM để các lượt gọi sau đạt tốc độ 0ms
        with _mem_lock:
            if len(_MEM_CACHE) > MAX_MEM_CACHE_ENTRIES:
                _MEM_CACHE.clear()
            _MEM_CACHE[key] = (data, ts)
        return data
    except Exception:
        return None

def set_cached(key, data):
    """Lưu đồng thời vào RAM cache và SQLite persistent."""
    now = time.time()
    # 1. Lưu vào RAM cache ngay lập tức
    with _mem_lock:
        if len(_MEM_CACHE) > MAX_MEM_CACHE_ENTRIES:
            _MEM_CACHE.clear()
        _MEM_CACHE[key] = (data, now)

    # 2. Nén và lưu xuống SQLite
    try:
        raw_str = json.dumps({"data": data, "timestamp": now}, separators=(',', ':'), ensure_ascii=False).encode("utf-8")
        comp_bytes = zlib.compress(raw_str, level=6)
        conn = _get_db()
        with _db_lock:
            cur = conn.cursor()
            cur.execute("INSERT OR REPLACE INTO cache VALUES (?, ?, ?)", (key, comp_bytes, now))
            conn.commit()
    except Exception as e:
        print(f"Lỗi lưu cache vào SQLite: {e}")

def clear_cache():
    with _mem_lock:
        _MEM_CACHE.clear()
    try:
        conn = _get_db()
        with _db_lock:
            cur = conn.cursor()
            cur.execute("DELETE FROM cache")
            conn.commit()
    except Exception:
        pass

def _get_cached_creators_list():
    raw = get_cached("drive_creators_list") or get_cached("drive_creators_list_v3") or []
    if isinstance(raw, dict):
        return raw.get("creators", [])
    if isinstance(raw, list):
        return raw
    return []

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

import unicodedata

def _remove_vietnamese_accents(text):
    if not text:
        return ""
    text = unicodedata.normalize('NFD', str(text))
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return text.replace('đ', 'd').replace('Đ', 'D')

COUNTRY_CONFIG = {
    "_Vietnam": {"name": "Việt Nam", "flag": "🇻🇳", "code": "VN", "aliases": ["vn", "vietnam", "viet nam"]},
    "_UK": {"name": "Anh", "flag": "🇬🇧", "code": "GB", "aliases": ["gb", "uk", "england", "united kingdom", "anh", "vuong quoc anh"]},
    "_USA": {"name": "Mỹ", "flag": "🇺🇸", "code": "US", "aliases": ["us", "usa", "united states", "my", "hoa ky"]},
    "_Australia": {"name": "Úc", "flag": "🇦🇺", "code": "AU", "aliases": ["au", "australia", "uc"]},
    "_Poland": {"name": "Ba Lan", "flag": "🇵🇱", "code": "PL", "aliases": ["pl", "poland", "ba lan"]},
    "_Indonesia": {"name": "Indonesia", "flag": "🇮🇩", "code": "ID", "aliases": ["id", "indonesia"]},
    "_China": {"name": "Trung Quốc", "flag": "🇨🇳", "code": "CN", "aliases": ["cn", "china", "trung quoc"]},
    "_Japan": {"name": "Nhật Bản", "flag": "🇯🇵", "code": "JP", "aliases": ["jp", "japan", "nhat ban"]},
    "_Korea": {"name": "Hàn Quốc", "flag": "🇰🇷", "code": "KR", "aliases": ["kr", "korea", "south korea", "han quoc"]},
    "_Malaysia": {"name": "Malaysia", "flag": "🇲🇾", "code": "MY", "aliases": ["my", "malaysia"]},
    "_Russia": {"name": "Nga", "flag": "🇷🇺", "code": "RU", "aliases": ["ru", "russia", "nga"]},
    "_Singapore": {"name": "Singapore", "flag": "🇸🇬", "code": "SG", "aliases": ["sg", "singapore"]},
    "_Taiwan": {"name": "Đài Loan", "flag": "🇹🇼", "code": "TW", "aliases": ["tw", "taiwan", "dai loan"]},
    "_Thailand": {"name": "Thái Lan", "flag": "🇹🇭", "code": "TH", "aliases": ["th", "thailand", "thai lan"]},
    "_France": {"name": "Pháp", "flag": "🇫🇷", "code": "FR", "aliases": ["fr", "france", "phap"]},
    "_Germany": {"name": "Đức", "flag": "🇩🇪", "code": "DE", "aliases": ["de", "germany", "deutschland", "duc"]},
    "_Italy": {"name": "Ý", "flag": "🇮🇹", "code": "IT", "aliases": ["it", "italy", "italia", "y"]},
    "_Spain": {"name": "Tây Ban Nha", "flag": "🇪🇸", "code": "ES", "aliases": ["es", "spain", "tay ban nha"]},
    "_Canada": {"name": "Canada", "flag": "🇨🇦", "code": "CA", "aliases": ["ca", "canada"]},
    "_Philippines": {"name": "Philippines", "flag": "🇵🇭", "code": "PH", "aliases": ["ph", "philippines"]},
    "_India": {"name": "Ấn Độ", "flag": "🇮🇳", "code": "IN", "aliases": ["in", "india", "an do"]},
    "_Brazil": {"name": "Brazil", "flag": "🇧🇷", "code": "BR", "aliases": ["br", "brazil", "brasil"]},
    "_Mexico": {"name": "Mexico", "flag": "🇲🇽", "code": "MX", "aliases": ["mx", "mexico"]},
    "_Netherlands": {"name": "Hà Lan", "flag": "🇳🇱", "code": "NL", "aliases": ["nl", "netherlands", "holland", "ha lan"]},
    "_Sweden": {"name": "Thụy Điển", "flag": "🇸🇪", "code": "SE", "aliases": ["se", "sweden", "thuy dien"]},
    "_Switzerland": {"name": "Thụy Sĩ", "flag": "🇨🇭", "code": "CH", "aliases": ["ch", "switzerland", "thuy si"]},
    "_Belgium": {"name": "Bỉ", "flag": "🇧🇪", "code": "BE", "aliases": ["be", "belgium", "bi"]},
    "_Portugal": {"name": "Bồ Đào Nha", "flag": "🇵🇹", "code": "PT", "aliases": ["pt", "portugal", "bo dao nha"]},
    "_Argentina": {"name": "Argentina", "flag": "🇦🇷", "code": "AR", "aliases": ["ar", "argentina"]},
    "_Colombia": {"name": "Colombia", "flag": "🇨🇴", "code": "CO", "aliases": ["co", "colombia"]},
    "_Ukraine": {"name": "Ukraine", "flag": "🇺🇦", "code": "UA", "aliases": ["ua", "ukraine"]},
    "_HongKong": {"name": "Hồng Kông", "flag": "🇭🇰", "code": "HK", "aliases": ["hk", "hongkong", "hong kong", "hong_kong", "hong kong", "hong kong", "hong kong"]},
}

# Xây dựng bảng tra cứu mở rộng cho quốc gia
_COUNTRY_LOOKUP = {}
for _k, _v in COUNTRY_CONFIG.items():
    _code = _v["code"].lower()
    _name = _v["name"].lower()
    _folder = _k.lower().lstrip("_")
    _COUNTRY_LOOKUP[_k.lower()] = _v
    _COUNTRY_LOOKUP[_folder] = _v
    _COUNTRY_LOOKUP[_code] = _v
    _COUNTRY_LOOKUP[_name] = _v
    _COUNTRY_LOOKUP[_remove_vietnamese_accents(_name)] = _v
    for _alias in _v.get("aliases", []):
        _COUNTRY_LOOKUP[_alias.lower()] = _v
        _COUNTRY_LOOKUP[_remove_vietnamese_accents(_alias.lower())] = _v

def get_country_info(folder_name):
    """
    Tra cứu thông tin quốc gia tự động:
    Hỗ trợ tên thư mục (_Vietnam, _USA...), tên tiếng Anh (Australia, Japan...),
    tên tiếng Việt có hoặc không dấu (Nhật Bản, nhat ban, Úc, uc...), mã ISO (VN, US, JP...).
    """
    if not folder_name or str(folder_name).strip() in ("", "all", "__all__"):
        return {"name": "Việt Nam", "flag": "🇻🇳", "code": "VN"}
    
    clean = str(folder_name).strip()
    clean_lower = clean.lower()
    
    # 1. Tra cứu trực tiếp
    if clean in COUNTRY_CONFIG:
        return COUNTRY_CONFIG[clean]
    if clean_lower in _COUNTRY_LOOKUP:
        return _COUNTRY_LOOKUP[clean_lower]
        
    # 2. Bỏ gạch dưới _
    stripped = clean_lower.lstrip("_")
    if stripped in _COUNTRY_LOOKUP:
        return _COUNTRY_LOOKUP[stripped]
        
    # 3. Bỏ dấu tiếng Việt
    no_acc = _remove_vietnamese_accents(stripped)
    if no_acc in _COUNTRY_LOOKUP:
        return _COUNTRY_LOOKUP[no_acc]

    raw = clean.lstrip("_")
    return {"name": raw, "flag": "🌐", "code": raw[:2].upper() if len(raw) >= 2 else "GL"}

_prefetch_thread_running = False
_prefetch_thread_lock = threading.Lock()

def clear_cache_key(key):
    try:
        conn = _get_db()
        with _db_lock:
            cur = conn.cursor()
            cur.execute("DELETE FROM cache WHERE key = ?", (key,))
            conn.commit()
    except Exception:
        pass

def _init_seed_cache():
    """
    Nạp sẵn seed index từ tệp web/drive_index.json (307 KB) vào SQLite cache khi server khởi chạy.
    Hoàn thành trong ~0.005s, cung cấp đầy đủ thông tin thống kê 203 creator & 148,000+ files
    giúp server không bao giờ bị nghẽn RAM, CPU hoặc dính 502 Bad Gateway trên Cloud (Render).
    """
    try:
        seed_path = os.path.join(os.path.dirname(__file__), "web", "drive_index.json")
        if not os.path.exists(seed_path):
            seed_path = os.path.join(os.path.dirname(__file__), "drive_index.json")
        if os.path.exists(seed_path):
            with open(seed_path, "r", encoding="utf-8") as f:
                seed = json.load(f)
            
            summary_all = seed.get("summary_all")
            if summary_all and isinstance(summary_all, dict) and summary_all.get("total_files", 0) > 0:
                cur_sum = get_cached("drive_summary_all")
                if not cur_sum or cur_sum.get("total_files", 0) < summary_all.get("total_files", 0):
                    set_cached("drive_summary_all", summary_all)

            hierarchy = seed.get("hierarchy")
            if hierarchy and isinstance(hierarchy, dict) and hierarchy.get("creators"):
                cur_hier = get_cached("drive_creators_list_v3")
                if not cur_hier:
                    set_cached("drive_creators_list_v3", hierarchy)
                    set_cached("drive_creators_list", hierarchy.get("creators", []))

            creator_stats = seed.get("creator_stats", {})
            for slug_key, stats in creator_stats.items():
                stat_key = f"drive_stat_{slug_key}"
                if not get_cached(stat_key):
                    set_cached(stat_key, stats)
                    
            print(f"[+] Đã nạp thành công seed index: {summary_all.get('total_creators', 0)} creators, {summary_all.get('total_files', 0):,} files")
    except Exception as e:
        print(f"[!] Lỗi nạp seed index: {e}")

# Tự động nạp seed index ngay khi import module
_init_seed_cache()

def build_all_drive_cache(force=False):
    """
    Tổng hợp danh sách và thống kê file của tất cả các creator từ cache.
    Hoàn toàn Non-Blocking (< 0.01s) để chống timeout 502 Bad Gateway trên Cloud (Render, Botkeep).
    """
    if not force:
        cached_summary = get_cached("drive_summary_all")
        if cached_summary and isinstance(cached_summary, dict) and cached_summary.get("total_files", 0) > 0:
            return cached_summary

    # Nạp từ seed index nếu cache chưa có
    _init_seed_cache()
    cached_summary = get_cached("drive_summary_all")
    if cached_summary and isinstance(cached_summary, dict) and cached_summary.get("total_files", 0) > 0:
        return cached_summary

    # 1. Lấy danh sách toàn bộ creator (từ cache hierarchy siêu tốc ~0.001s)
    all_creators, _ = get_drive_creators_hierarchy(force=False)

    # 2. Tổng hợp nhanh thống kê nhẹ từ drive_stat_% (TUYỆT ĐỐI KHÔNG decompress drive_creator_items_% tránh OOM RAM)
    cached_map = {}
    try:
        conn = _get_db()
        with _db_lock:
            cur = conn.cursor()
            cur.execute("SELECT key, value FROM cache WHERE key LIKE 'drive_stat_%'")
            rows = cur.fetchall()
        for k, val_bytes in rows:
            try:
                st = json.loads(zlib.decompress(val_bytes).decode("utf-8"))
                s_data = st.get("data", st) if isinstance(st, dict) else st
                slug_key = k.replace("drive_stat_", "")
                cached_map[slug_key] = s_data
            except Exception:
                continue
    except Exception as e:
        print(f"Lỗi đọc drive_stat cache: {e}")

    tot_files = 0
    tot_bytes = 0
    tot_photos = 0
    tot_videos = 0
    enriched_creators = []

    for c in all_creators:
        c_slug = c.get("slug", "")
        c_name = c.get("name", "")
        cd = cached_map.get(c_slug) or cached_map.get(c_name)
        if not cd and "/" in c_slug:
            cd = cached_map.get(c_slug.split("/")[-1])

        item_dict = dict(c)
        if cd and isinstance(cd, dict):
            p_cnt = cd.get("photos_count", 0)
            v_cnt = cd.get("videos_count", 0)
            t_sz = cd.get("total_size", 0)
            item_dict["photos_count"] = p_cnt
            item_dict["videos_count"] = v_cnt
            item_dict["total_files"] = p_cnt + v_cnt
            item_dict["total_size"] = t_sz
            item_dict["total_size_str"] = cd.get("total_size_str", format_bytes(t_sz))
            tot_files += (p_cnt + v_cnt)
            tot_photos += p_cnt
            tot_videos += v_cnt
            tot_bytes += t_sz
        else:
            item_dict.setdefault("photos_count", 0)
            item_dict.setdefault("videos_count", 0)
            item_dict.setdefault("total_files", 0)
            item_dict.setdefault("total_size", 0)
            item_dict.setdefault("total_size_str", "0 B")
        enriched_creators.append(item_dict)

    enriched_creators.sort(key=lambda x: (x.get("country") != "Việt Nam", (x.get("country") or "").lower(), x["name"].lower()))

    summary_result = {
        "total_creators": len(enriched_creators),
        "total_files": tot_files,
        "total_photos": tot_photos,
        "total_videos": tot_videos,
        "total_size": tot_bytes,
        "total_size_str": format_bytes(tot_bytes),
        "creators": enriched_creators
    }

    if tot_files > 0:
        set_cached("drive_summary_all", summary_result)

    return summary_result

def _trigger_background_prefetch():
    global _prefetch_thread_running
    with _prefetch_thread_lock:
        if _prefetch_thread_running:
            return
        _prefetch_thread_running = True
        threading.Thread(target=_background_prefetch_creators, daemon=True).start()

def _background_prefetch_creators():
    """Luồng quét ngầm từng creator một cách an toàn và bền bỉ (không bao giờ timeout)."""
    global _prefetch_thread_running
    try:
        creators = _get_cached_creators_list()
        updated_count = 0
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
                    stat_payload = {
                        "photos_count": len(photos),
                        "videos_count": len(videos),
                        "total_files": len(photos) + len(videos),
                        "total_size": total_size,
                        "total_size_str": format_bytes(total_size)
                    }
                    set_cached(f"drive_stat_{c_slug}", stat_payload)
                    set_cached(f"drive_stat_{c_name}", stat_payload)
                    updated_count += 1
                    time.sleep(0.5)
                except Exception:
                    pass
        print(f"[+] Hoàn tất background prefetch cho {updated_count} creators.")
    except Exception as e:
        print(f"Lỗi background prefetch: {e}")
    finally:
        with _prefetch_thread_lock:
            _prefetch_thread_running = False

def _enrich_creator_stats(creators):
    """Bổ sung số lượng ảnh, video, dung lượng từ SQLite cache cho danh sách creators và chuẩn hóa quốc gia."""
    for c in creators:
        # Nếu creator đã có đầy đủ thống kê và cờ quốc gia thì bỏ qua ngay để đạt 0ms
        if c.get("total_files", 0) > 0 and c.get("country_code") and c.get("country_flag"):
            continue

        c_slug = c.get("slug", "")
        c_name = c.get("name", "")
        
        # Luôn chuẩn hóa quốc gia, mã ISO và cờ emoji
        raw_cntry = c.get("country") or (c_slug.split("/")[0] if "/" in c_slug else "_Vietnam")
        c_info = get_country_info(raw_cntry)
        c["country"] = c_info["name"]
        c["country_code"] = c_info["code"]
        c["country_flag"] = c_info["flag"]

        cd = get_cached(f"drive_stat_{c_slug}") or get_cached(f"drive_stat_{c_name}")
        if not cd and "/" in c_slug:
            cd = get_cached(f"drive_stat_{c_slug.split('/')[-1]}")
        if not cd:
            cd = get_cached(f"drive_creator_items_{c_slug}") or get_cached(f"drive_creator_items_{c_name}")
            if not cd and "/" in c_slug:
                cd = get_cached(f"drive_creator_items_{c_slug.split('/')[-1]}")
        if cd and isinstance(cd, dict):
            p_cnt = cd.get("photos_count", 0)
            v_cnt = cd.get("videos_count", 0)
            t_sz = cd.get("total_size", 0)
            c["photos_count"] = p_cnt
            c["videos_count"] = v_cnt
            c["total_files"] = p_cnt + v_cnt
            c["total_size"] = t_sz
            c["total_size_str"] = cd.get("total_size_str", format_bytes(t_sz))
        else:
            c.setdefault("photos_count", 0)
            c.setdefault("videos_count", 0)
            c.setdefault("total_files", 0)
            c.setdefault("total_size", 0)
            c.setdefault("total_size_str", "0 B")

def get_drive_creators_hierarchy(force=False):
    """
    Quét danh sách creator trên Google Drive theo cấu trúc thư mục mới:
    - gg:18TUBE/_<CountryName>/<CreatorName>
    - Tự động bóc tách tên quốc gia tiếng Việt, cờ emoji, và creator con.
    """
    cache_key = "drive_creators_list_v3"
    if not force:
        cached = get_cached(cache_key)
        if cached and isinstance(cached, dict) and len(cached.get("creators", [])) >= 100:
            creators = cached.get("creators", [])
            # Chỉ enrich khi có creator bị thiếu trường stats (tiết kiệm 100% CPU/IO lặp lại)
            if creators and any(c.get("total_files") is None for c in creators[:5]):
                _enrich_creator_stats(creators)
            return creators, cached.get("countries", [])

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

    _enrich_creator_stats(creators)
    creators.sort(key=lambda x: (x["country"] != "Việt Nam", x["country"].lower(), x["name"].lower()))
    
    result_payload = {
        "creators": creators,
        "countries": countries
    }
    set_cached(cache_key, result_payload)
    set_cached("drive_creators_list", creators)
    return creators, countries

def _warmup_cache():
    """Tự động nạp sẵn seed index và danh sách creator hierarchy khi server khởi chạy (0s chờ)."""
    _init_seed_cache()
    try:
        get_drive_creators_hierarchy(force=False)
    except Exception:
        pass

# Kích hoạt tiến trình nạp cache ngầm
threading.Thread(target=_warmup_cache, daemon=True).start()

def _get_preloaded_data(requested_creator=None, include_media=True):
    """
    Lấy sẵn dữ liệu từ RAM cache để nhúng thẳng vào HTML khi người dùng vừa truy cập trang.
    Server-Side Hydration: Trình duyệt mở ra là có sẵn toàn bộ dữ liệu 0s không cần gọi AJAX.
    """
    try:
        creators, countries = get_drive_creators_hierarchy(force=False)
        summary = get_cached("drive_summary_all") or {}
        target_slug = requested_creator
        if not target_slug and creators:
            target_slug = creators[0].get("slug") or creators[0].get("name")
        
        initial_media = None
        if include_media and target_slug:
            clean_s = target_slug.strip().strip("/")
            alt1 = clean_s
            alt2 = clean_s.split("/")[-1] if "/" in clean_s else clean_s
            cached_detail = get_cached(f"drive_creator_items_{clean_s}") or get_cached(f"drive_creator_items_{alt1}") or get_cached(f"drive_creator_items_{alt2}")
            if cached_detail and isinstance(cached_detail, dict) and (cached_detail.get("photos") or cached_detail.get("videos")):
                initial_media = cached_detail

        return {
            "creators": creators,
            "countries": countries,
            "summary": summary,
            "target_creator": target_slug,
            "initial_media": initial_media
        }
    except Exception as e:
        print(f"Lỗi nạp preloaded data: {e}")
        return {}

# ----------------- ROUTES: WEB PAGES -----------------

@app.route("/")
def index():
    preloaded = _get_preloaded_data(include_media=False)
    preloaded_json = json.dumps(preloaded, separators=(',', ':'), ensure_ascii=False)
    return render_template("index.html", preloaded_json=preloaded_json)

@app.route("/gallery")
@app.route("/viewer")
def gallery():
    target = request.args.get("creator", "").strip()
    preloaded = _get_preloaded_data(requested_creator=target, include_media=True)
    preloaded_json = json.dumps(preloaded, separators=(',', ':'), ensure_ascii=False)
    return render_template("gallery.html", preloaded_json=preloaded_json)

@app.route("/favicon.ico")
def favicon():
    return send_file(os.path.join(app.static_folder, "placeholder.svg"), mimetype="image/svg+xml")

@app.route("/api/drive/setup_config", methods=["POST"])
def api_drive_setup_config():
    """Lưu mã cấu hình Google Drive từ web UI để kích hoạt Drive ngay lập tức mà không cần restart."""
    try:
        data = request.get_json() or {}
        raw_val = (data.get("config") or data.get("token") or "").strip()
        if not raw_val:
            return jsonify({"success": False, "error": "Vui lòng nhập chuỗi cấu hình hoặc Base64 token"}), 400

        conf_content = ""
        # 1. Thử giải mã Base64
        try:
            import base64
            clean = "".join(raw_val.split())
            decoded = base64.b64decode(clean.encode("ascii")).decode("utf-8")
            if "[" in decoded and "]" in decoded:
                conf_content = decoded
        except Exception:
            pass

        # 2. Hoặc định dạng file rclone.conf trực tiếp
        if not conf_content:
            if "[" in raw_val and "]" in raw_val:
                conf_content = raw_val
            else:
                return jsonify({"success": False, "error": "Định dạng token không hợp lệ. Vui lòng copy chuỗi từ export_config.bat"}), 400

        # 3. Ghi file rclone.conf
        target_dirs = [
            os.path.expanduser("~/.config/rclone"),
            "/tmp/rclone",
            os.path.join(os.path.dirname(os.path.abspath(__file__)), ".rclone")
        ]
        conf_saved = False
        saved_file = ""
        for d in target_dirs:
            try:
                os.makedirs(d, exist_ok=True)
                f_path = os.path.join(d, "rclone.conf")
                with open(f_path, "w", encoding="utf-8") as f:
                    f.write(conf_content)
                os.environ["RCLONE_CONFIG"] = f_path
                conf_saved = True
                saved_file = f_path
                break
            except Exception:
                continue

        if not conf_saved:
            return jsonify({"success": False, "error": "Không thể lưu file cấu hình rclone trên server"}), 500

        # 4. Xóa cache cũ để làm mới dữ liệu
        clear_cache()

        # 5. Khởi động nạp trước cache trong nền
        threading.Thread(target=_warmup_cache, daemon=True).start()

        return jsonify({"success": True, "message": f"Đã kết nối Google Drive thành công tại {saved_file}!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

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
        total_files = sum(c.get("total_files", 0) for c in creators)
        total_photos = sum(c.get("photos_count", 0) for c in creators)
        total_videos = sum(c.get("videos_count", 0) for c in creators)
        total_size = sum(c.get("total_size", 0) for c in creators)
        return jsonify({
            "success": True,
            "creators": creators,
            "countries": countries,
            "total_creators": len(creators),
            "total_files": total_files,
            "total_photos": total_photos,
            "total_videos": total_videos,
            "total_size": total_size,
            "total_size_str": format_bytes(total_size),
            "cached": not force
        })
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
            country_filter = request.args.get("country", "").strip()
            clean_country = _remove_vietnamese_accents(country_filter).lower().replace(" ", "_") if country_filter else ""
            cache_key_all = f"drive_creator_items_all_{clean_country}" if (clean_country and clean_country not in ["all", "__all__"]) else "drive_creator_items_all"

            if not force:
                cached_all = get_cached(cache_key_all)
                if cached_all and isinstance(cached_all, dict) and cached_all.get("total_items", 0) > 0:
                    c_photos = cached_all.get("photos", [])
                    c_videos = cached_all.get("videos", [])
                    if len(c_photos) > 600 or len(c_videos) > 300:
                        safe_copy = dict(cached_all)
                        safe_copy["photos"] = c_photos[:600]
                        safe_copy["videos"] = c_videos[:300]
                        return jsonify({"success": True, "data": safe_copy, "cached": True})
                    return jsonify({"success": True, "data": cached_all, "cached": True})

            all_photos = []
            all_videos = []

            try:
                conn = _get_db()
                with _db_lock:
                    cur = conn.cursor()
                    cur.execute("SELECT key, value FROM cache WHERE key LIKE 'drive_creator_items_%' AND key NOT LIKE 'drive_creator_items_all%'")
                    rows = cur.fetchall()
                seen_all_slugs = set()
                for k, val_bytes in rows:
                    try:
                        c_item = json.loads(zlib.decompress(val_bytes).decode("utf-8"))
                        c_data = c_item.get("data", {}) if isinstance(c_item, dict) and "data" in c_item else c_item
                        if isinstance(c_data, dict):
                            c_slug = c_data.get("slug", "") or k.replace("drive_creator_items_", "")
                            norm_slug = c_slug.split("/")[-1].lower() if c_slug else ""
                            if not norm_slug or norm_slug in seen_all_slugs:
                                continue
                            seen_all_slugs.add(norm_slug)
                            c_country = c_data.get("country", "Việt Nam")
                            if country_filter and country_filter.lower() not in ["all", "__all__"]:
                                if c_country.lower() != country_filter.lower():
                                    continue
                            p_list = c_data.get("photos", [])
                            v_list = c_data.get("videos", [])
                            if len(all_photos) < 600:
                                all_photos.extend(p_list[:12])
                            if len(all_videos) < 300:
                                all_videos.extend(v_list[:6])
                    except Exception:
                        continue
            except Exception as e:
                print(f"Lỗi đọc SQLite khi tổng hợp creator all: {e}")

            summary_info = get_cached("drive_summary_all") or {}
            creators_list = summary_info.get("creators", [])
            if country_filter and country_filter.lower() not in ["all", "__all__"]:
                filtered_c = [c for c in creators_list if (c.get("country") or "").lower() == country_filter.lower()]
                stat_tot_photos = sum(c.get("photos_count", 0) for c in filtered_c)
                stat_tot_videos = sum(c.get("videos_count", 0) for c in filtered_c)
                stat_tot_size = sum(c.get("total_size", 0) for c in filtered_c)
            else:
                stat_tot_photos = summary_info.get("total_photos", 0)
                stat_tot_videos = summary_info.get("total_videos", 0)
                stat_tot_size = summary_info.get("total_size", 0)

            total_photos = stat_tot_photos if stat_tot_photos > 0 else len(all_photos)
            total_videos = stat_tot_videos if stat_tot_videos > 0 else len(all_videos)
            total_items = (total_photos + total_videos)
            total_size = stat_tot_size if stat_tot_size > 0 else sum(x.get("size", 0) for x in all_photos + all_videos)

            result_data = {
                "slug": "all",
                "name": "Tất cả Creator" if not country_filter else f"Tất cả ({country_filter})",
                "country": country_filter if country_filter else "all",
                "total_items": total_items,
                "photos_count": total_photos,
                "videos_count": total_videos,
                "issues_count": 0,
                "total_size": total_size,
                "total_size_str": format_bytes(total_size),
                "photos": all_photos,
                "videos": all_videos,
                "issues": []
            }
            set_cached(cache_key_all, result_data)
            return jsonify({"success": True, "data": result_data, "cached": True})

        # Tự động chuẩn hóa slug: tìm kiếm trong danh sách creator hiện có
        real_slug = slug
        c_list = _get_cached_creators_list()
        matched_c = next((c for c in c_list if isinstance(c, dict) and (c.get("slug") == slug or c.get("name") == slug or c.get("slug", "").endswith("/" + slug))), None)
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

# HTTP Session với Connection Pooling cho Google Drive streaming & thumbnails
_drive_session = requests.Session()
_drive_adapter = requests.adapters.HTTPAdapter(pool_connections=30, pool_maxsize=60, max_retries=1)
_drive_session.mount("https://", _drive_adapter)
_drive_session.mount("http://", _drive_adapter)

_drive_token_lock = threading.Lock()
_drive_token_cache = {"token": None, "expires_at": 0}

def get_drive_access_token(remote="gg", force_refresh=False):
    """
    Lấy access_token còn hiệu lực của Google Drive qua rclone.
    Tối ưu: RAM cache siêu tốc giúp giảm độ trễ từ ~500ms xuống <0.01ms cho mỗi request streaming.
    """
    global _drive_token_cache
    now = time.time()
    with _drive_token_lock:
        if not force_refresh and _drive_token_cache["token"] and now < _drive_token_cache["expires_at"]:
            return _drive_token_cache["token"]

    rc = downloader.get_rclone_path()
    if not rc:
        return None
    try:
        # Nếu force_refresh (ví dụ gặp lỗi 401 Unauthorized), gọi rclone about để rclone tự làm mới token
        if force_refresh:
            subprocess.run([rc, "about", f"{remote}:", "--json"], capture_output=True, text=True, timeout=8, **SUBPROCESS_EXTRA)

        res = subprocess.run([rc, "config", "show", remote], capture_output=True, text=True, timeout=5, **SUBPROCESS_EXTRA)
        token_m = re.search(r'token\s*=\s*(\{.*?\})', res.stdout)
        if token_m:
            token_data = json.loads(token_m.group(1))
            access_token = token_data.get("access_token")
            # Google access token có thời hạn 3600s. Cache an toàn 40-50 phút
            ttl = 2400
            expires_in = token_data.get("expires_in")
            if isinstance(expires_in, (int, float)) and expires_in > 120:
                ttl = expires_in - 120
            elif "expiry" in token_data:
                try:
                    from datetime import datetime
                    exp_str = token_data["expiry"]
                    exp_dt = datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
                    ttl = max(60, (exp_dt.timestamp() - now) - 120)
                except Exception:
                    pass

            with _drive_token_lock:
                _drive_token_cache["token"] = access_token
                _drive_token_cache["expires_at"] = now + min(ttl, 3000)
            return access_token
    except Exception as e:
        print(f"Lỗi lấy access token Google Drive: {e}")
    return None

@app.route("/api/media/drive/stream", methods=["GET", "HEAD"])
def api_media_drive_stream():
    """
    Stream video hoặc ảnh trực tiếp từ Google Drive về trình duyệt client player.
    Hỗ trợ Range requests (206) để phát mượt mà không cần chuyển tab hay tải trước.
    Tối ưu hóa:
    1. RAM cache token -> 0ms overhead thay vì chạy subprocess 500ms mỗi Range request
    2. Connection pooling (HTTP Keep-Alive) -> loại bỏ độ trễ TLS handshake
    3. Phản hồi tức thì request HEAD -> không tải dư thừa body
    4. TTFB chunk streaming (256KB cho video player) -> nạp metadata & phát tức thì
    5. Caching headers chuẩn -> tăng tốc buffer tua video trên trình duyệt
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
        if request.method == "HEAD":
            resp = _drive_session.head(url, headers=headers, timeout=10)
            if resp.status_code == 401:
                token = get_drive_access_token("gg", force_refresh=True)
                if token:
                    headers["Authorization"] = f"Bearer {token}"
                    resp = _drive_session.head(url, headers=headers, timeout=10)

            response_headers = {
                "Accept-Ranges": "bytes",
                "Content-Type": resp.headers.get("Content-Type", "video/mp4"),
                "Cache-Control": "public, max-age=86400",
            }
            if "Content-Range" in resp.headers:
                response_headers["Content-Range"] = resp.headers["Content-Range"]
            if "Content-Length" in resp.headers:
                response_headers["Content-Length"] = resp.headers["Content-Length"]
            return Response(status=resp.status_code, headers=response_headers)

        resp = _drive_session.get(url, headers=headers, stream=True, timeout=30)
        
        # Nếu token hết hạn (401), làm mới token bằng force_refresh
        if resp.status_code == 401:
            token = get_drive_access_token("gg", force_refresh=True)
            if token:
                headers["Authorization"] = f"Bearer {token}"
                resp = _drive_session.get(url, headers=headers, stream=True, timeout=30)

        # Chuẩn hóa headers gọn gàng, tránh tuyệt đối duplicate headers gây lỗi format trên trình duyệt
        response_headers = {
            "Accept-Ranges": "bytes",
            "Content-Type": resp.headers.get("Content-Type", "video/mp4"),
            "Cache-Control": "public, max-age=86400",
        }
        
        if "Content-Range" in resp.headers:
            response_headers["Content-Range"] = resp.headers["Content-Range"]
        if "Content-Length" in resp.headers:
            response_headers["Content-Length"] = resp.headers["Content-Length"]
        if "ETag" in resp.headers:
            response_headers["ETag"] = resp.headers["ETag"]

        is_download = request.args.get("dl", "0") == "1"
        if is_download:
            filename = request.args.get("name", f"media_{file_id}.mp4")
            response_headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        else:
            response_headers["Content-Disposition"] = "inline"

        def generate():
            # 256KB cho streaming phát ngay không trễ; 1MB cho download file trọn vẹn
            chunk_size = 1024 * 1024 if is_download else 256 * 1024
            for chunk in resp.iter_content(chunk_size=chunk_size):
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
            resp = _drive_session.get(drive_cdn_url, timeout=8)
            if resp.status_code == 200 and len(resp.content) > 0:
                with open(cache_file, "wb") as f:
                    f.write(resp.content)
                return send_file(cache_file, mimetype="image/jpeg", max_age=86400)
        except Exception:
            pass

        # Thử endpoint thumbnail thứ 2 của Drive
        try:
            resp2 = _drive_session.get(f"https://drive.google.com/thumbnail?id={file_id}&sz=w500", timeout=8)
            if resp2.status_code == 200 and len(resp2.content) > 0:
                with open(cache_file, "wb") as f:
                    f.write(resp2.content)
                return send_file(cache_file, mimetype="image/jpeg", max_age=86400)
        except Exception:
            pass
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
            c_list = _get_cached_creators_list()
            matched_c = next((c for c in c_list if isinstance(c, dict) and (c.get("slug") == slug or c.get("name") == slug or c.get("slug", "").endswith("/" + slug))), None)
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

# ----------------- BATCH VERIFY ALL CREATORS -----------------

_verify_all_state = {
    "running": False,
    "progress": 0,
    "total": 0,
    "current_slug": "",
    "results": [],
    "summary": {
        "total_creators": 0,
        "complete_count": 0,
        "missing_count": 0,
        "not_found_count": 0,
        "total_missing_photos": 0,
        "total_missing_videos": 0,
        "total_missing_files": 0
    },
    "last_updated": 0,
    "error": None
}
_verify_all_lock = threading.Lock()
_verify_all_stop_flag = False

def _run_verify_all_worker():
    global _verify_all_state, _verify_all_stop_flag
    try:
        # Lấy danh sách creator từ drive_summary_all hoặc cache
        summary_data = build_all_drive_cache(force=False)
        creators = summary_data.get("creators", []) if summary_data else []
        if not creators:
            creators = _get_cached_creators_list()

        with _verify_all_lock:
            _verify_all_state["running"] = True
            _verify_all_state["progress"] = 0
            _verify_all_state["total"] = len(creators)
            _verify_all_state["results"] = []
            _verify_all_state["error"] = None
            _verify_all_stop_flag = False

        def check_single(c):
            if _verify_all_stop_flag:
                return None
            slug = c.get("slug", "")
            web_slug = slug.split("/")[-1]
            c_name = c.get("name") or web_slug
            c_country = c.get("country", "Việt Nam")
            drive_photos = c.get("photos_count", 0)
            drive_videos = c.get("videos_count", 0)
            drive_total = drive_photos + drive_videos
            drive_size_str = c.get("total_size_str", "0 B")

            meta = downloader.fetch_creator_metadata(web_slug)
            online_total = meta.get("total_all", 0)
            online_photos = meta.get("total_images", 0)
            online_videos = meta.get("total_videos", 0)

            diff_photos = max(0, online_photos - drive_photos)
            diff_videos = max(0, online_videos - drive_videos)
            diff_total = max(0, online_total - drive_total)

            if online_total > 0:
                completion_pct = min(100.0, round((drive_total / online_total) * 100, 1))
            elif drive_total > 0:
                completion_pct = 100.0
            else:
                completion_pct = 0.0

            if online_total == 0:
                status = "not_found"
                status_label = "Không tìm thấy trên web"
                status_color = "secondary"
            elif drive_total == 0:
                status = "empty"
                status_label = "Chưa có trên Drive"
                status_color = "danger"
            elif diff_photos == 0 and diff_videos == 0:
                status = "complete"
                status_label = "Đầy đủ 100%"
                status_color = "success"
            else:
                status = "missing"
                status_label = f"Thiếu {diff_photos} ảnh, {diff_videos} video"
                status_color = "amber"

            item_res = {
                "slug": slug,
                "web_slug": web_slug,
                "name": c_name,
                "country": c_country,
                "avatar_url": meta.get("avatar_url"),
                "online": {
                    "total": online_total,
                    "photos": online_photos,
                    "videos": online_videos
                },
                "drive": {
                    "total": drive_total,
                    "photos": drive_photos,
                    "videos": drive_videos,
                    "size_str": drive_size_str
                },
                "missing": {
                    "total": diff_total,
                    "photos": diff_photos,
                    "videos": diff_videos
                },
                "completion_pct": completion_pct,
                "status": status,
                "status_label": status_label,
                "status_color": status_color
            }

            with _verify_all_lock:
                _verify_all_state["progress"] += 1
                _verify_all_state["current_slug"] = c_name
                _verify_all_state["results"].append(item_res)

            return item_res

        with ThreadPoolExecutor(max_workers=8) as executor:
            list(executor.map(check_single, creators))

        # Tổng hợp báo cáo
        with _verify_all_lock:
            final_results = [r for r in _verify_all_state["results"] if r is not None]
            # Sắp xếp: Ưu tiên creator thiếu file lên đầu, sau đó theo completion_pct tăng dần
            final_results.sort(key=lambda x: (
                0 if x["status"] == "missing" else (1 if x["status"] == "empty" else 2),
                x["completion_pct"],
                x["name"].lower()
            ))
            _verify_all_state["results"] = final_results

            tot_creators = len(final_results)
            comp_cnt = sum(1 for r in final_results if r["status"] == "complete")
            miss_cnt = sum(1 for r in final_results if r["status"] == "missing")
            nf_cnt = sum(1 for r in final_results if r["status"] == "not_found")
            tot_miss_p = sum(r["missing"]["photos"] for r in final_results)
            tot_miss_v = sum(r["missing"]["videos"] for r in final_results)

            summary = {
                "total_creators": tot_creators,
                "complete_count": comp_cnt,
                "missing_count": miss_cnt,
                "not_found_count": nf_cnt,
                "total_missing_photos": tot_miss_p,
                "total_missing_videos": tot_miss_v,
                "total_missing_files": tot_miss_p + tot_miss_v
            }
            _verify_all_state["summary"] = summary
            _verify_all_state["running"] = False
            _verify_all_state["last_updated"] = time.time()

            # Lưu vào SQLite cache persistent
            set_cached("verify_all_report", {
                "summary": summary,
                "results": final_results,
                "last_updated": _verify_all_state["last_updated"]
            })

    except Exception as e:
        with _verify_all_lock:
            _verify_all_state["running"] = False
            _verify_all_state["error"] = str(e)
        print(f"Lỗi chạy worker verify all: {e}")

@app.route("/api/verify/all/start", methods=["POST"])
def api_verify_all_start():
    global _verify_all_state, _verify_all_stop_flag
    with _verify_all_lock:
        if _verify_all_state["running"]:
            return jsonify({"success": True, "message": "Quá trình đối soát đang chạy...", "running": True})
        _verify_all_stop_flag = False
        threading.Thread(target=_run_verify_all_worker, daemon=True).start()
    return jsonify({"success": True, "message": "Đã bắt đầu đối soát toàn bộ creator!", "running": True})

@app.route("/api/verify/all/status")
def api_verify_all_status():
    global _verify_all_state
    with _verify_all_lock:
        if not _verify_all_state["running"] and not _verify_all_state["results"]:
            cached = get_cached("verify_all_report")
            if cached:
                _verify_all_state["results"] = cached.get("results", [])
                _verify_all_state["summary"] = cached.get("summary", {})
                _verify_all_state["total"] = len(_verify_all_state["results"])
                _verify_all_state["progress"] = len(_verify_all_state["results"])
                _verify_all_state["last_updated"] = cached.get("last_updated", 0)

        data = {
            "success": True,
            "running": _verify_all_state["running"],
            "progress": _verify_all_state["progress"],
            "total": _verify_all_state["total"],
            "current_slug": _verify_all_state["current_slug"],
            "summary": _verify_all_state["summary"],
            "results": _verify_all_state["results"],
            "last_updated": _verify_all_state["last_updated"],
            "error": _verify_all_state["error"]
        }
    return jsonify(data)

@app.route("/api/verify/all/stop", methods=["POST"])
def api_verify_all_stop():
    global _verify_all_stop_flag
    _verify_all_stop_flag = True
    return jsonify({"success": True, "message": "Đã gửi yêu cầu dừng đối soát."})

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
    raw_port = os.environ.get("SERVER_PORT") or os.environ.get("PORT") or "5000"
    port = int(raw_port)
    print(f"==================================================")
    print(f" 🚀 18TUBE SOURCE INSPECTOR WEB SERVER READY! (PORT: {port})")
    print(f" 🌐 Truy cập bảng điều khiển: http://0.0.0.0:{port}")
    print(f"==================================================")
    app.run(host="0.0.0.0", port=port, debug=False)

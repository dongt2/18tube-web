# -*- coding: utf-8 -*-
"""
18TUBE Media Web - Cloudflare Tunnel Deployer
Tạo đường link HTTPS online công khai hoàn toàn miễn phí qua Cloudflare Tunnel.
Giúp bạn truy cập Web Dashboard & Gallery (Xem Video & Ảnh) trên điện thoại,
máy tính bảng hoặc bất kỳ đâu qua mạng Internet mà không cần mở port modem.
"""

import os
import sys
import time
import socket
import subprocess
import threading
import re
import urllib.request
import webbrowser

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    import qrcode
    HAS_QR = True
except ImportError:
    HAS_QR = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BIN_DIR = os.path.join(BASE_DIR, "bin")
CLOUDFLARED_EXE = os.path.join(BIN_DIR, "cloudflared.exe")
WEB_SERVER_SCRIPT = os.path.join(BASE_DIR, "web_server.py")
TUNNEL_URL_FILE = os.path.join(BASE_DIR, "tunnel_url.txt")

CLOUDFLARED_DOWNLOAD_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

def ensure_cloudflared():
    """Kiểm tra và tự động tải cloudflared nếu chưa có."""
    os.makedirs(BIN_DIR, exist_ok=True)
    if os.path.isfile(CLOUDFLARED_EXE) and os.path.getsize(CLOUDFLARED_EXE) > 5 * 1024 * 1024:
        return True

    print("\n[+] Đang tải Cloudflare Tunnel (cloudflared.exe)...")
    print(f"[*] Nguồn: {CLOUDFLARED_DOWNLOAD_URL}")
    try:
        def reporthook(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                percent = min(100.0, downloaded * 100.0 / total_size)
                mb_done = downloaded / (1024 * 1024)
                mb_total = total_size / (1024 * 1024)
                sys.stdout.write(f"\r    -> Đã tải: {mb_done:.1f} MB / {mb_total:.1f} MB ({percent:.1f}%)")
                sys.stdout.flush()

        urllib.request.urlretrieve(CLOUDFLARED_DOWNLOAD_URL, CLOUDFLARED_EXE, reporthook)
        print("\n[OK] Đã tải cloudflared.exe thành công!")
        return True
    except Exception as e:
        print(f"\n[!] Lỗi khi tải cloudflared.exe: {e}")
        return False

def is_port_open(host="127.0.0.1", port=5000):
    """Kiểm tra port 5000 có đang hoạt động không."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        return s.connect_ex((host, port)) == 0

def start_web_server():
    """Khởi động web_server.py nếu chưa chạy."""
    if is_port_open():
        print("[i] Máy chủ Web (web_server.py) đã chạy sẵn tại http://127.0.0.1:5000")
        return None

    print("[*] Đang khởi động Máy chủ Web nội bộ (web_server.py)...")
    creationflags = getattr(subprocess, 'CREATE_NO_WINDOW', 0x08000000) if sys.platform == "win32" else 0
    proc = subprocess.Popen(
        [sys.executable, WEB_SERVER_SCRIPT],
        cwd=BASE_DIR,
        creationflags=creationflags
    )

    # Chờ tối đa 15s cho web server sẵn sàng
    for _ in range(30):
        time.sleep(0.5)
        if is_port_open():
            print("[OK] Máy chủ Web đã hoạt động tại http://127.0.0.1:5000")
            return proc

    print("[!] Cảnh báo: Web server mất nhiều thời gian để khởi động, đang tiếp tục...")
    return proc

def print_banner(tunnel_url):
    """Hiển thị thông tin liên kết và mã QR trong console."""
    gallery_url = f"{tunnel_url}/gallery"
    
    print("\n" + "=" * 68)
    print(" 🚀 18TUBE CLOUD INSPECTOR & GALLERY ĐÃ ĐƯỢC DEPLOY ONLINE THÀNH CÔNG!")
    print("=" * 68)
    print(f"\n 🌐 LINK XEM VIDEO & ẢNH TRÊN ĐIỆN THOẠI / TABLET:")
    print(f"    👉  {gallery_url}")
    print(f"\n 🛠️ LINK BẢNG ĐIỀU KHIỂN & QUẢN LÝ (DASHBOARD):")
    print(f"    👉  {tunnel_url}")
    print("\n" + "-" * 68)
    
    if HAS_QR:
        print(" 📱 QUÉT MÃ QR DƯỚI ĐÂY ĐỂ MỞ NGAY TRÊN ĐIỆN THOẠI (CAMERA HOẶC ZALO):")
        try:
            qr = qrcode.QRCode(border=1)
            qr.add_data(gallery_url)
            qr.print_ascii(invert=True)
        except Exception:
            pass
    
    print("-" * 68)
    print(" 💡 LƯU Ý:")
    print(" - Link HTTPS trên hoạt động 24/7 khi cửa sổ này còn mở.")
    print(" - Có thể chia sẻ link cho bạn bè hoặc mở trên 4G/5G/Wi-Fi bất kỳ.")
    print(" - Nhấn Ctrl + C để dừng chia sẻ online.")
    print("=" * 68 + "\n")

    # Lưu link vào file
    try:
        with open(TUNNEL_URL_FILE, "w", encoding="utf-8") as f:
            f.write(f"GALLERY_URL={gallery_url}\n")
            f.write(f"DASHBOARD_URL={tunnel_url}\n")
    except Exception:
        pass

def main():
    if not ensure_cloudflared():
        print("[!] Không thể tiếp tục do thiếu cloudflared.exe.")
        input("Nhấn Enter để thoát...")
        return

    web_proc = start_web_server()

    print("[*] Đang kết nối tới mạng đám mây Cloudflare Tunnel...")
    creationflags = getattr(subprocess, 'CREATE_NO_WINDOW', 0x08000000) if sys.platform == "win32" else 0
    cmd = [
        CLOUDFLARED_EXE,
        "tunnel",
        "--url", "http://127.0.0.1:5000",
        "--no-autoupdate"
    ]

    tunnel_proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1
    )

    tunnel_url = None
    url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")

    def monitor_output():
        nonlocal tunnel_url
        for line in iter(tunnel_proc.stdout.readline, ''):
            if not line:
                break
            match = url_pattern.search(line)
            if match and not tunnel_url:
                tunnel_url = match.group(0)
                print_banner(tunnel_url)
                # Tự động mở trình duyệt trên máy
                webbrowser.open(f"{tunnel_url}/gallery")

    t = threading.Thread(target=monitor_output, daemon=True)
    t.start()

    try:
        # Chờ tối đa 40s lấy URL
        for _ in range(80):
            if tunnel_url:
                break
            time.sleep(0.5)

        if not tunnel_url:
            print("[...] Đang chờ Cloudflare cấp phát URL, vui lòng đợi thêm giây lát...")

        tunnel_proc.wait()
    except KeyboardInterrupt:
        print("\n[*] Đang dừng Cloudflare Tunnel...")
    finally:
        try:
            tunnel_proc.terminate()
        except Exception:
            pass
        if web_proc:
            try:
                web_proc.terminate()
            except Exception:
                pass
        if os.path.exists(TUNNEL_URL_FILE):
            try:
                os.remove(TUNNEL_URL_FILE)
            except Exception:
                pass
        print("[OK] Đã đóng kết nối online.")

if __name__ == "__main__":
    main()

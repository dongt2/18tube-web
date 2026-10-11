"""
Tự động kết nối và xác thực Google Drive cho 18TUBE Downloader
"""
import sys
import os
import time
import subprocess
import webbrowser
import re

# Thiết lập UTF-8 cho console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

def connect(remote="gg"):
    print("=" * 70)
    print("      KẾT NỐI VÀ XÁC THỰC GOOGLE DRIVE CHO 18TUBE DOWNLOADER")
    print("=" * 70)
    print(f"[*] Remote cấu hình: [{remote}]")
    print("[*] Đang khởi động quy trình xác thực OAuth của Rclone...")

    no_win = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    # Giải phóng tiến trình rclone cũ nếu bị treo trước đó
    try:
        subprocess.run(["powershell", "-Command", "Get-Process rclone -ErrorAction SilentlyContinue | Stop-Process -Force"], capture_output=True, creationflags=no_win)
    except Exception:
        pass

    time.sleep(1)

    cmd = ["rclone", "config", "reconnect", f"{remote}:"]
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=no_win
        )
    except Exception as e:
        print(f"[!] Không thể khởi chạy rclone: {e}")
        return False

    # Tự động gửi 'y\n' cho cả 2 câu hỏi:
    # 1. Token already configured - replace it? -> y
    # 2. Use web browser to automatically authenticate? -> y
    try:
        proc.stdin.write("y\ny\n")
        proc.stdin.flush()
    except Exception:
        pass

    auth_url_opened = False
    print("[*] Đang đợi link xác thực tài khoản từ Google...")

    while True:
        line = proc.stdout.readline()
        if not line:
            break
        line_str = line.strip()
        if not line_str:
            continue
        print(f"  > {line_str}")

        # Nếu rclone tiếp tục hỏi xác nhận bất kỳ câu nào dạng y/n
        if "y) Yes" in line_str or "(default)" in line_str:
            try:
                proc.stdin.write("y\n")
                proc.stdin.flush()
            except Exception:
                pass

        # Tìm link xác thực của rclone
        url_match = re.search(r'(http://127\.0\.0\.1:53682/auth\?[^\s]+)', line_str)
        if url_match and not auth_url_opened:
            auth_url = url_match.group(1)
            print("\n" + "=" * 70)
            print("  🌐 [BƯỚC TIẾP THEO] ĐANG TỰ ĐỘNG MỞ TRÌNH DUYỆT ĐĂNG NHẬP GOOGLE...")
            print(f"  🔗 Đường link đăng nhập: {auth_url}")
            print("  👉 Nếu trình duyệt chưa tự mở, bạn hãy copy link trên dán vào Chrome/Edge!")
            print("=" * 70 + "\n")
            webbrowser.open(auth_url)
            auth_url_opened = True

        if "Waiting for code" in line_str or "Log in and authorize" in line_str:
            if not auth_url_opened:
                webbrowser.open("http://127.0.0.1:53682/")
                auth_url_opened = True

    proc.wait()

    print("\n" + "=" * 70)
    print("[*] Đang kiểm tra trạng thái kết nối Google Drive...")
    check = subprocess.run(["rclone", "lsd", f"{remote}:"], capture_output=True, text=True, creationflags=no_win)
    if check.returncode == 0:
        print("✅ [THÀNH CÔNG] ĐÃ KẾT NỐI VỚI GOOGLE DRIVE THÀNH CÔNG!")
        print("   Bây giờ bạn có thể quay lại giao diện 18TUBE Downloader để bấm 'Tải lên Drive ngay'.")
        print("=" * 70)
        return True
    else:
        err_msg = check.stderr.strip() or check.stdout.strip()
        print(f"⚠️ [CHƯA HOÀN TẤT] Chi tiết: {err_msg}")
        print("=" * 70)
        return False

if __name__ == "__main__":
    remote_arg = sys.argv[1] if len(sys.argv) > 1 else "gg"
    success = connect(remote_arg)
    if not success:
        sys.exit(1)

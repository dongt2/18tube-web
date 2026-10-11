# -*- coding: utf-8 -*-
"""
Công cụ xuất cấu hình Rclone (Google Drive) sang dạng Base64
Dùng để dán vào biến môi trường (Environment Variables) khi deploy lên Cloud (Render, Railway, VPS, v.v.)
"""

import os
import sys
import base64
import subprocess

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def copy_to_clipboard(text):
    """Tự động copy văn bản vào Clipboard của Windows."""
    if sys.platform == "win32":
        try:
            proc = subprocess.Popen(['clip'], stdin=subprocess.PIPE, close_fds=True)
            proc.communicate(input=text.encode('utf-8'))
            return True
        except Exception:
            return False
    return False

def main():
    conf_path = os.path.expandvars(r"%APPDATA%\rclone\rclone.conf")
    if not os.path.isfile(conf_path):
        home_conf = os.path.expanduser("~/.config/rclone/rclone.conf")
        if os.path.isfile(home_conf):
            conf_path = home_conf
        else:
            print("[!] Không tìm thấy file rclone.conf trên máy của bạn!")
            print("    Hãy chắc chắn bạn đã kết nối Google Drive thành công trước đó.")
            input("Nhấn Enter để thoát...")
            return

    with open(conf_path, "r", encoding="utf-8", errors="ignore") as f:
        conf_data = f.read()

    if not conf_data.strip():
        print("[!] File rclone.conf rỗng.")
        return

    b64_str = base64.b64encode(conf_data.encode("utf-8")).decode("utf-8")
    copied = copy_to_clipboard(b64_str)

    print("=" * 70)
    print(" 🚀 XUẤT CẤU HÌNH GOOGLE DRIVE ĐỂ DEPLOY CLOUD (RENDER / RAILWAY / VPS)")
    print("=" * 70)
    print("\n[OK] Đã đọc thành công cấu hình từ: " + conf_path)
    if copied:
        print("[✨] ĐÃ TỰ ĐỘNG COPY MÃ BASE64 VÀO BỘ NHỚ TẠM (CLIPBOARD) CỦA BẠN!")
        print("     Bây giờ bạn chỉ cần sang trang quản trị Render/Railway và bấm Ctrl + V!")
    print("\n" + "-" * 70)
    print("📋 HƯỚNG DẪN ĐIỀN BIẾN MÔI TRƯỜNG TRÊN CLOUD:")
    print("   1. Tên biến (Key):   RCLONE_CONFIG_BASE64")
    print("   2. Giá trị (Value):  (Dán chuỗi đã copy hoặc chuỗi dưới đây)")
    print("-" * 70)
    print(b64_str)
    print("-" * 70)
    print("\n💡 Web trên Cloud sẽ tự động kết nối Google Drive 24/7 mà không cần mở máy tính!")
    print("=" * 70 + "\n")
    input("Nhấn Enter để hoàn tất...")

if __name__ == "__main__":
    main()

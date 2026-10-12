# -*- coding: utf-8 -*-
"""
Botkeep & Cloud Deployment Entrypoint for 18TUBE Web App
"""
import os
import sys
import subprocess
import downloader
from web_server import app

def main():
    # 1. Thêm ~/.local/bin vào PATH để nhận diện pip binaries (gunicorn, rclone, v.v.)
    local_bin = os.path.expanduser("~/.local/bin")
    if os.path.isdir(local_bin) and local_bin not in os.environ.get("PATH", ""):
        os.environ["PATH"] = f"{local_bin}:{os.environ.get('PATH', '')}"

    # 2. Tự động giải mã và nạp cấu hình Google Drive từ biến môi trường
    try:
        downloader.init_cloud_rclone_config()
    except Exception as e:
        print(f"[!] Lỗi nạp cấu hình Rclone: {e}")

    # 3. Đảm bảo rclone có sẵn trên Linux
    if sys.platform != "win32":
        try:
            downloader.ensure_linux_rclone()
        except Exception as e:
            print(f"[!] Cảnh báo kiểm tra rclone: {e}")

    port = int(os.environ.get("PORT", 5000))
    print("==================================================")
    print(f" 🚀 18TUBE CLOUD RUNTIME READY (PORT: {port})")
    print(f" 🌐 Access Gallery: http://0.0.0.0:{port}/gallery")
    print("==================================================")
    sys.stdout.flush()

    # 4. Ưu tiên chạy Gunicorn nếu có để stream video/ảnh mượt mà
    try:
        import gunicorn
        print(f"[*] Khởi động Gunicorn WSGI Server tại 0.0.0.0:{port}...")
        sys.stdout.flush()
        cmd = [
            sys.executable, "-m", "gunicorn",
            "--bind", f"0.0.0.0:{port}",
            "--workers", "1",
            "--threads", "8",
            "--timeout", "180",
            "web_server:app"
        ]
        if hasattr(os, "execv") and sys.platform != "win32":
            os.execv(sys.executable, cmd)
        else:
            subprocess.run(cmd)
            sys.exit(0)
    except Exception as e:
        print(f"[*] Chạy qua Flask server đa luồng (do: {e})...")
        app.run(host="0.0.0.0", port=port, debug=False, threaded=True)

if __name__ == "__main__":
    main()



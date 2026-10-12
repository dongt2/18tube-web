#!/bin/bash
set -e

# Tạo thư mục cấu hình rclone nếu chưa có
mkdir -p ~/.config/rclone

# Tự động nạp cấu hình rclone từ Biến môi trường trên Cloud
if [ -n "$RCLONE_CONFIG_BASE64" ]; then
    echo "[*] Nạp cấu hình Rclone từ biến RCLONE_CONFIG_BASE64..."
    echo "$RCLONE_CONFIG_BASE64" | tr -d '\r\n ' | base64 -d > ~/.config/rclone/rclone.conf
elif [ -n "$RCLONE_CONFIG" ]; then
    echo "[*] Nạp cấu hình Rclone từ biến RCLONE_CONFIG..."
    echo "$RCLONE_CONFIG" > ~/.config/rclone/rclone.conf
fi

export RCLONE_CONFIG="$HOME/.config/rclone/rclone.conf"

if [ -f "$RCLONE_CONFIG" ]; then
    echo "[OK] Cấu hình Rclone đã sẵn sàng."
else
    echo "[!] Cảnh báo: Chưa tìm thấy file rclone.conf. Vui lòng thêm biến môi trường RCLONE_CONFIG_BASE64 trên Cloud."
fi

# Cổng khởi chạy (Render / Railway / Cloud mặc định truyền biến PORT)
PORT="${PORT:-5000}"

echo "=========================================================="
echo " 🚀 KHỞI ĐỘNG 18TUBE CLOUD WEB SERVER TẠI CỔNG :$PORT"
echo "=========================================================="

exec gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 180 web_server:app

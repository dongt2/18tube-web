@echo off
chcp 65001 >nul
title 18TUBE Cinema & Gallery - Trình Xem Video & Ảnh
echo =======================================================
echo  🎬 KHỞI ĐỘNG 18TUBE CINEMA & GALLERY (XEM VIDEO & ẢNH)
echo  🌐 Đang mở trình duyệt tại: http://localhost:5000/gallery
echo =======================================================

start "" http://localhost:5000/gallery

:: Kiểm tra nếu web_server chưa chạy thì khởi động
netstat -ano | findstr :5000 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    python web_server.py
) else (
    echo [OK] Máy chủ Web đã chạy sẵn sàng.
    timeout /t 3 >nul
)

@echo off
chcp 65001 >nul
title 18TUBE Cloud Inspector Web Dashboard
echo =======================================================
echo  🚀 KHỞI ĐỘNG 18TUBE CLOUD INSPECTOR WEB DASHBOARD
echo  🌐 Đang mở trình duyệt tại: http://localhost:5000
echo =======================================================

start "" http://localhost:5000
python web_server.py

pause

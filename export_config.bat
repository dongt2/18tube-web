@echo off
chcp 65001 >nul
title Xuất cấu hình Google Drive cho Cloud Deploy
python export_rclone_config.py

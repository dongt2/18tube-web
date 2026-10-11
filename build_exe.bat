@echo off
title Build 18TUBE Downloader EXE
cd /d "%~dp0"
echo ========================================================
echo     DONG GOI 18TUBE DOWNLOADER THANH FILE EXE
echo ========================================================
echo.
python -m PyInstaller 18TUBE_Downloader.spec --clean
echo.
if exist "dist\18TUBE_Downloader.exe" (
    echo [OK] Da dong goi thanh cong!
    echo File EXE nam tai: dist\18TUBE_Downloader.exe
) else (
    echo [!] Dong goi gap loi, vui long kiem tra log o tren!
)
echo.
pause

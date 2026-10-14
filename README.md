# 🎬 18TUBE Media Web - Cinema Gallery & Cloud Streamer

Hệ thống Web xem Video & Ảnh trực tuyến chất lượng cao từ **18tube**, kết nối trực tiếp với **Google Drive** 24/7, tối ưu hóa giao diện đa nền tảng (Điện thoại, Tablet, PC) với hiệu năng cao và phong cách hiện đại.

---

## ✨ Điểm nổi bật & Tính năng Web

1. **🎬 Cinema Player & Full-Res Gallery**:
   - Trình phát video chuyên nghiệp hỗ trợ chuẩn HLS, MP4 HD/Full HD/4K với thanh tua mượt mà, phím tắt điều khiển và chế độ rạp chiếu (Theater Mode).
   - Bộ sưu tập ảnh lưới thông minh (Smart Grid) kèm Lightbox xem ảnh kích thước gốc, phóng to/thu nhỏ và lướt ảnh bằng cảm ứng hoặc bàn phím.
   - Giao diện Dark Cyberpunk hiện đại, mượt mà và tối ưu 100% cho màn hình cảm ứng di động (Mobile First).

2. **☁️ Tích hợp Google Drive 24/7 (Zero Local Disk)**:
   - Kết nối và stream trực tiếp toàn bộ dữ liệu Media từ Google Drive qua Rclone backend.
   - Bộ nhớ đệm thông minh tự động chỉ mục (Index Cache) giúp tải danh mục hàng nghìn Creator và hàng chục nghìn file gần như tức thì.
   - Không tốn dung lượng ổ cứng máy tính cá nhân khi xem hoặc deploy trên Cloud.

3. **🔍 Source Inspector Dashboard**:
   - Bảng điều khiển đối soát dữ liệu: Tra cứu số lượng ảnh và video thực tế trên nguồn so với Google Drive / Local.
   - Phân loại theo quốc gia (`_Vietnam`, `_Japan`, `_USA`, ...) hoặc thư mục gốc.

4. **🌐 1-Click Chia sẻ Online (Cloudflare Tunnel)**:
   - Tích hợp sẵn `deploy_tunnel.py` tạo đường link HTTPS công khai hoàn toàn miễn phí.
   - Hiển thị mã QR trực tiếp trên màn hình để quét vào điện thoại/iPad xem ngay mà không cần mở port modem hay cấu hình mạng phức tạp.

5. **🚀 Sẵn sàng Deploy Cloud (Botkeep, Render, Railway, VPS, Docker)**:
   - Cung cấp sẵn `Dockerfile`, `entrypoint.sh`, `Procfile`, `main.py` và `requirements.txt` tối ưu siêu nhẹ.
   - Tự động nạp token Google Drive qua biến môi trường `RCLONE_CONFIG_BASE64`.

---

## 🚀 Hướng dẫn Chạy Nhanh (Local PC)

### 1. Yêu cầu hệ thống
- Python 3.10 trở lên.
- Cài đặt các thư viện cần thiết:
  ```bash
  pip install -r requirements.txt
  ```

### 2. Khởi chạy Web Gallery
- **Cách 1 (Khuyên dùng trên Windows)**: Nhấp đúp vào file [`run_gallery.bat`](run_gallery.bat). Trình duyệt sẽ tự động mở trang Gallery.
- **Cách 2 (Dòng lệnh)**:
  ```bash
  python web_server.py
  ```
- **Địa chỉ truy cập**:
  - 🎬 **Cinema Gallery**: [http://localhost:5000/gallery](http://localhost:5000/gallery)
  - 📊 **Source Inspector Dashboard**: [http://localhost:5000](http://localhost:5000)

### 3. Chia sẻ ra Internet để xem trên Điện thoại (4G / Wi-Fi)
- Nhấp đúp vào file [`deploy_online.bat`](deploy_online.bat).
- Hệ thống sẽ cấp một link HTTPS (dạng `https://xxx.trycloudflare.com/gallery`) kèm **mã QR**. Bạn chỉ cần dùng camera điện thoại hoặc Zalo quét mã để xem trực tiếp!

---

## ☁️ Hướng dẫn Deploy Cloud chạy 24/7 (Không cần bật máy tính)

Bạn có thể đưa toàn bộ website lên Cloud miễn phí (Render.com, Botkeep.cloud, Railway, Fly.io, hoặc VPS cá nhân):

1. **Bước 1**: Nhấp đúp file [`export_config.bat`](export_config.bat) (hoặc chạy `python export_rclone_config.py`). Cấu hình token Google Drive sẽ được tự động copy vào bộ nhớ tạm (Clipboard).
2. **Bước 2**: Trên trang quản trị Cloud (ví dụ: Render hoặc Botkeep), tạo ứng dụng từ GitHub repository `18tube-web`.
3. **Bước 3**: Thêm biến môi trường:
   - **Key**: `RCLONE_CONFIG_BASE64`
   - **Value**: Dán chuỗi token vừa copy (`Ctrl + V`).
4. **Bước 4**: Bấm Deploy. Website của bạn sẽ hoạt động online 24/7!

👉 **Xem hướng dẫn chi tiết từng bước tại:** [`README_DEPLOY_CLOUD.md`](README_DEPLOY_CLOUD.md).

---

## 📂 Cấu trúc Repository (Tối ưu cho Web)

```text
├── web/
│   ├── templates/          # Giao diện HTML (index.html, gallery.html)
│   └── static/             # Assets giao diện (CSS, JS, SVG icons)
├── web_server.py           # Backend Flask phục vụ API, streaming và giao diện Web
├── main.py                 # File khởi động sản xuất trên Cloud (hỗ trợ Gunicorn đa luồng)
├── app.py                  # WSGI entrypoint alias
├── downloader.py           # Core logic cào dữ liệu, phân tích media & thao tác Rclone
├── connect_drive.py        # Công cụ xác thực Google Drive qua Rclone
├── export_rclone_config.py # Công cụ xuất token Google Drive sang Base64 cho Cloud
├── deploy_tunnel.py        # Bộ điều phối Cloudflare Tunnel mở link công khai
├── Dockerfile              # Docker container (Python 3.11 + Rclone)
├── entrypoint.sh           # Script khởi động tự động nạp cấu hình trong Docker
├── Procfile                # Cấu hình Web process cho Heroku / Railway / Botkeep
├── requirements.txt        # Danh sách thư viện Python tối ưu siêu nhẹ
├── run_gallery.bat         # 1-Click mở trang Gallery trên Windows
├── run_web.bat             # 1-Click mở trang Dashboard trên Windows
├── deploy_online.bat       # 1-Click tạo link HTTPS online kèm mã QR
└── export_config.bat       # 1-Click xuất token Google Drive
```

---

## 🛡️ Giấy phép & Bản quyền
Dự án được xây dựng phục vụ mục đích học tập, quản lý và sao lưu dữ liệu cá nhân.

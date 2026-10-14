# 🌐 HƯỚNG DẪN DEPLOY WEB 18TUBE CHẠY 24/7 TRÊN CLOUD

Tài liệu hướng dẫn deploy hệ thống Web xem Video & Ảnh lên các nền tảng Cloud (**Botkeep.cloud** hoặc **Render.com**) để bạn có thể tắt máy tính hoàn toàn mà website vẫn hoạt động 24/7 trên điện thoại và máy tính bảng.

---

## 🛠️ CÁC THÔNG SỐ ĐÃ ĐƯỢC CHUẨN BỊ SẴN TRONG PROJECT
- **Repository GitHub:** `https://github.com/dongt2/18tube-web` (Branch: `main`)
- **File khởi động Cloud:** `main.py` hoặc `Procfile`
- **Container Docker:** `Dockerfile` (Python 3.11 + Rclone)
- **Tự động giải mã Google Drive:** Code đã tự động đọc biến `RCLONE_CONFIG_BASE64` và nạp vào máy chủ Cloud.
- **`export_config.bat`**: Công cụ 1-click tự động xuất và copy token Google Drive vào bộ nhớ tạm (Clipboard).

---

## 🚀 CÁCH 1: DEPLOY LÊN BOTKEEP (botkeep.cloud/app/create)

### Bước 1: Mở trang tạo ứng dụng
Truy cập: [https://botkeep.cloud/app/create](https://botkeep.cloud/app/create) (hoặc trang quản trị Botkeep).

### Bước 2: Cấu hình thông số ứng dụng
1. **Source / Nguồn mã nguồn**:
   - Chọn **GitHub** -> Kết nối và chọn repository: `dongt2/18tube-web` (Branch: `main`).
   - *(Hoặc nén toàn bộ thư mục code thành file `.zip` và tải lên nếu không dùng GitHub)*.
2. **Runtime / Môi trường**:
   - Chọn **Python** (hoặc **Docker** nếu có tuỳ chọn Docker).
3. **Startup / Start Command (Lệnh khởi động)**:
   - Nhập: `python main.py`  
   - *(Hoặc: `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 180 web_server:app`)*.
4. **Environment Variables (Biến môi trường)**:
   - Bấm **Add Environment Variable**:
     - **Key**: `RCLONE_CONFIG_BASE64`
     - **Value**: Nhấn `Ctrl + V` để dán chuỗi token Google Drive đã được copy sẵn vào bộ nhớ tạm.
     - *(Tùy chọn) Biến `PORT`: `5000` (nếu Botkeep yêu cầu chỉ định).*
5. **Cổng mạng (Port) & Public Domain**:
   - Nếu Botkeep có mục cấu hình HTTP Port / Domain: chọn port `5000` và gắn domain/subdomain để truy cập từ ngoài Internet.
6. Bấm **Create App** (hoặc **Deploy**).

---

## 🚀 CÁCH 2: DEPLOY LÊN RENDER.COM (HOÀN TOÀN MIỄN PHÍ)

### Bước 1: Tạo Web Service trên Render
1. Truy cập [dashboard.render.com](https://dashboard.render.com/) -> Bấm **New +** -> **Web Service**.
2. Chọn repository GitHub: `dongt2/18tube-web`.
3. Cài đặt các thông số:
   - **Name**: `tube18-cinema`
   - **Region**: `Singapore` (tốc độ về Việt Nam nhanh nhất)
   - **Environment**: **Docker** (Render tự động dùng file `Dockerfile`)
   - **Instance Type**: **Free**
4. Thêm biến môi trường:
   - **Key**: `RCLONE_CONFIG_BASE64`
   - **Value**: Nhấn `Ctrl + V` để dán chuỗi cấu hình.
5. Bấm **Create Web Service**.

---

## 🎉 KẾT QUẢ VÀ TRUY CẬP
Sau khi ứng dụng deploy xong, bạn mở trình duyệt điện thoại/máy tính truy cập:
👉 **`https://<domain-của-bạn>/gallery`**

- Bạn có thể **tắt máy tính hoàn toàn**. 
- Hệ thống trên Cloud tự động kết nối và stream video, ảnh từ Google Drive về điện thoại mọi lúc mọi nơi!


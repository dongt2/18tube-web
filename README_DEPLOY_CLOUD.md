# 🌐 HƯỚNG DẪN DEPLOY WEB 18TUBE CHẠY 24/7 (KHÔNG CẦN MỞ MÁY)

Tài liệu hướng dẫn deploy hệ thống Web xem Video & Ảnh lên nền tảng Cloud miễn phí (**Render.com**) để bạn có thể tắt máy tính hoàn toàn mà website vẫn hoạt động 24/7 trên điện thoại và máy tính bảng.

---

## 🛠️ CÁC FILE ĐÃ ĐƯỢC CHUẨN BỊ SẴN TRONG PROJECT
- **`Dockerfile`**: Cấu hình container chạy Linux, Python 3.11, Rclone và Gunicorn server.
- **`entrypoint.sh`**: Tự động giải mã token Google Drive trên cloud và khởi chạy web.
- **`requirements.txt`**: Danh sách thư viện Python cần thiết.
- **`export_config.bat`**: Công cụ 1-click tự động xuất và copy token Google Drive vào bộ nhớ tạm (Clipboard).

---

## 🚀 3 BƯỚC DEPLOY LÊN RENDER.COM (HOÀN TOÀN MIỄN PHÍ)

### Bước 1: Đẩy mã nguồn lên GitHub
1. Mở [GitHub.com](https://github.com/) và tạo một Repository mới (đặt tên ví dụ: `18tube-web`, có thể chọn chế độ **Private** để bảo mật).
2. Tải toàn bộ thư mục code lên repository đó (qua Git hoặc kéo thả trực tiếp trên web GitHub).

---

### Bước 2: Lấy mã cấu hình Google Drive
1. Nhấp đúp vào file [export_config.bat](file:///g:/Bots/18tube/export_config.bat) trên máy tính.
2. Hệ thống sẽ **tự động copy** chuỗi cấu hình Google Drive (`RCLONE_CONFIG_BASE64`) vào bộ nhớ tạm (Clipboard).

---

### Bước 3: Tạo Web Service trên Render.com
1. Truy cập [dashboard.render.com](https://dashboard.render.com/) (đăng nhập bằng tài khoản GitHub).
2. Bấm nút **New +** ở góc trên cùng bên phải -> Chọn **Web Service**.
3. Chọn Repository GitHub `18tube-web` mà bạn đã tạo ở Bước 1.
4. Cài đặt các thông số như sau:
   - **Name**: Đặt tên ứng dụng (ví dụ: `tube18-cinema`).
   - **Region**: Chọn `Singapore` (để tốc độ tải video về Việt Nam nhanh nhất).
   - **Environment**: Chọn **Docker** *(Render sẽ tự động dùng file `Dockerfile` có sẵn)*.
   - **Instance Type**: Chọn **Free** (Miễn phí 100%).
5. Cuộn xuống phần **Environment Variables** (Biến môi trường) -> Bấm **Add Environment Variable**:
   - **Key**: `RCLONE_CONFIG_BASE64`
   - **Value**: Nhấn `Ctrl + V` để dán chuỗi đã copy ở Bước 2.
6. Bấm nút **Create Web Service** ở cuối trang.

---

## 🎉 KẾT QUẢ
- Render sẽ tự động build và cung cấp cho bạn một đường link HTTPS cố định vĩnh viễn:  
  👉 **`https://<tên-của-bạn>.onrender.com/gallery`**
- Bây giờ bạn có thể **tắt máy tính hoàn toàn**. Web vẫn chạy 24/7 độc lập trên Cloud, tự động kết nối và stream video/ảnh từ Google Drive về điện thoại mọi lúc mọi nơi!

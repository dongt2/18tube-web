# 18TUBE Media Downloader

Công cụ tự động tải ảnh chất lượng gốc và video HD từ **18tube.nl**, hỗ trợ giao diện đồ họa chuyên nghiệp (GUI) và dòng lệnh (CLI).

---

## 🔎 Chức năng: Kiểm tra tải đủ file chưa (File Integrity & Completeness Check)

Hệ thống cung cấp tính năng đối chiếu và kiểm tra tính đầy đủ của file đã tải trên máy với danh sách gốc trực tuyến của Creator:

### 1. Trên Giao diện (GUI):
- Nút **`🔎 Kiểm tra đủ file`** (nằm cạnh nút `Quét dữ liệu` và thanh điều khiển).
- Khi bấm, phần mềm sẽ tự động đối chiếu các file trong thư mục lưu trữ:
  - Nếu **đã tải đủ 100%**: Thông báo chúc mừng, thống kê tổng dung lượng (`XX GB`), số ảnh và số video đã đủ.
  - Nếu **còn thiếu file**: Hiển thị bảng cảnh báo chi tiết số ảnh và số video bị thiếu, đồng thời cung cấp nút bấm **`🚀 Tải bù các file còn thiếu`** để tự động tải nốt các file còn lại mà không cần tải lại các file đã có sẵn!

### 2. Trên Dòng lệnh (CLI):
Chạy lệnh kiểm tra với cờ `--check`:
```powershell
python downloader.py --check
```

Kết quả mẫu:
```text
==================================================
📋 BÁO CÁO KIỂM TRA FILE: vkcklananh9496
==================================================
📁 Thư mục kiểm tra: downloads\vkcklananh9496
🖼️ Ảnh:   Đã có 220/223 (Dung lượng: 520.4 MB)
🎬 Video: Đã có 85/89   (Dung lượng: 12.8 GB)
📦 Tổng:  Đã có 305/312 (Tổng dung lượng: 13.3 GB)
--------------------------------------------------
⚠️ CÒN THIẾU: 3 ảnh và 4 video.
==================================================
```

---

## ⚡ Các tính năng khác trên Giao diện (GUI):

1. **Bảng giám sát các luồng đang tải (Active Threads Table)**:
   - Hiển thị trực tiếp từng luồng tải đang chạy đồng thời (Luồng #1, Luồng #2...).
   - Hiển thị tên file, thanh tiến trình % thu nhỏ, dung lượng, tốc độ và trạng thái.
2. **Huy hiệu Tổng tốc độ (Aggregate Speed)**:
   - Cộng dồn băng thông thực tế từ tất cả các luồng đang chạy cùng lúc (ví dụ: `⚡ Tổng tốc độ: 25.8 MB/s`).
3. **Tùy chọn chất lượng Video (Video Quality)**:
   - `720p HD (Cao nhất - Sắc nét)`
   - `480p (Tiêu chuẩn - Tiết kiệm 50% dung lượng)`
   - `360p (Thấp - Tải siêu nhanh, tiết kiệm 70%)`
4. **Tùy chỉnh số luồng song song**:
   - Tùy chỉnh số luồng tải Ảnh song song (mặc định 6, hỗ trợ 1 – 16).
   - Tùy chỉnh số luồng tải Video song song (mặc định 2, hỗ trợ 1 – 6).

---

## 🖥️ Cách mở Giao diện đồ họa (GUI)

Bạn có thể mở giao diện bằng 1 trong các cách sau:

1. **Cách 1 (Chạy file EXE độc lập - Khuyên dùng)**: Nhấp đúp trực tiếp vào file **[`18TUBE_Downloader.exe`](file:///g:/Bots/18tube/18TUBE_Downloader.exe)** (hoặc trong thư mục `dist/`). File này đã được đóng gói sẵn toàn bộ môi trường Python, PyQt6, công cụ FFmpeg và Rclone, có thể chạy trực tiếp trên bất kỳ máy tính Windows nào mà không cần cài đặt Python!
2. **Cách 2**: Nhấp đúp chuột vào file [`run_gui.bat`](file:///g:/Bots/18tube/run_gui.bat)
3. **Cách 3**: Chạy lệnh từ terminal:
   ```powershell
   python gui.py
   ```
   hoặc:
   ```powershell
   python downloader.py --gui
   ```

*Nếu bạn muốn đóng gói lại file EXE sau khi chỉnh sửa mã nguồn, chỉ cần nhấp đúp file [`build_exe.bat`](file:///g:/Bots/18tube/build_exe.bat).*

---

## ☁️ Hướng dẫn Tải lên Google Drive (Cloud Backup qua Rclone)

Hệ thống đã tích hợp sẵn tính năng sao lưu thư mục tải về trực tiếp lên Google Drive thông qua `rclone`.

### 1. Bước 1: Ủy quyền Google Drive (Chỉ cần làm 1 lần)
Máy bạn đã có sẵn remote `gg` (cấu hình Google Drive). Để cấp quyền truy cập:
- **Cách 1 (Trên GUI)**: Bấm nút **`🔑 Kết nối Drive`**.
- **Cách 2 (File script)**: Nhấp đúp file [connect_drive.bat](file:///g:/Bots/18tube/connect_drive.bat).
- **Cách 3 (Dòng lệnh)**: Chạy `rclone config reconnect gg:` trong PowerShell/CMD.
Trình duyệt web sẽ tự động mở lên, bạn chỉ cần chọn tài khoản Google Drive và bấm **Cho phép (Allow)**.

### 2. Bước 2: Bật Google Drive API (Nếu dùng Client ID cá nhân)
Nếu tài khoản Google Cloud của bạn mới tạo Client ID, hãy bấm nút **`🌐 Bật Google Drive API`** trên phần mềm (hoặc truy cập [Google Cloud Console](https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=394571275778)) và bấm **ENABLE (Bật)**.

### 3. Bước 3: Theo dõi Trạng thái, Tài khoản & Dung lượng
Trên giao diện phần mềm (GUI), khung **☁️ Tải lên Google Drive** tự động hiển thị:
- 🟢 **Trạng thái kết nối**: Đã kết nối / Cần bật Drive API / Chưa đăng nhập.
- 👤 **Tài khoản Google**: Tên hiển thị và email (ví dụ: `user@gmail.com`).
- 💾 **Dung lượng Google Drive**: Đã dùng bao nhiêu GB / Tổng số GB / Còn trống bao nhiêu GB kèm thanh `%` trực quan.
- 🔄 **Nút Làm mới**: Bấm để cập nhật lại thông số bất cứ lúc nào.

### 4. Bước 4: Tải lên Google Drive
- **Trên Giao diện (GUI)**:
  - Chọn thư mục lưu đã tải (ví dụ: `E:\New folder (3)`).
  - Bấm nút **`☁️ Tải lên Drive ngay`** để sao lưu thư mục creator (`vkcklananh9496`) lên Google Drive với tốc độ cao, đa luồng (`--transfers 4`, chunk 64MB) kèm thanh tiến trình và tốc độ thời gian thực.
  - Có thể tích chọn **`Tự động tải lên Google Drive sau khi tải máy xong`** để phần mềm tự động upload ngay khi quá trình tải về hoàn tất!
- **Trên Dòng lệnh (CLI)**:
  ```powershell
  python downloader.py --upload-drive --out "E:\New folder (3)" --drive-remote gg --drive-folder "18TUBE"
  ```
# 18tube-web

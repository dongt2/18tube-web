"""
18TUBE Downloader - Giao diện đồ họa (GUI)
Được xây dựng bằng PyQt6 với Dark Mode hiện đại.
Hỗ trợ:
- Kiểm tra tính đầy đủ / Kiểm tra tải đủ file chưa (Integrity & Completeness Check)
- Tải bù chỉ các file còn thiếu (Download Missing Files Only)
- Danh sách bảng hiển thị trực tiếp các luồng đang tải (Active Threads Table)
- Tùy chọn chất lượng Video (720p HD, 480p, 360p)
- Tải đa luồng tốc độ cao (Multi-threading)
- Báo cáo tốc độ mạng và 2 tầng tiến trình thời gian thực
"""

import os
import sys
import re
import queue
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QLineEdit, QPushButton, QProgressBar, QTextEdit,
    QFileDialog, QCheckBox, QSpinBox, QComboBox, QMessageBox,
    QFrame, QTableWidget, QTableWidgetItem, QHeaderView, QTabWidget,
    QRadioButton, QButtonGroup, QScrollArea
)
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QTimer
from PyQt6.QtGui import QTextCursor, QIcon

import downloader

# Thread quét thông tin Creator & danh sách media
class ScanWorker(QThread):
    progress = pyqtSignal(str)
    finished = pyqtSignal(dict, list, list) # meta, photos, videos
    error = pyqtSignal(str)

    def __init__(self, creator_slug):
        super().__init__()
        self.creator_slug = creator_slug
        self.is_cancelled = False

    def cancel(self):
        self.is_cancelled = True

    def run(self):
        try:
            self.progress.emit(f"[*] Đang lấy thông tin tổng quan của creator: {self.creator_slug}...")
            meta = downloader.fetch_creator_metadata(self.creator_slug)
            
            self.progress.emit(f"[*] Đang quét danh sách các mục media trên các trang feed...")
            
            def scan_cb(page, new_items, tot_p, tot_v):
                self.progress.emit(f"  -> Quét trang {page}: tìm thấy {new_items} mục mới (Đã tìm thấy {tot_p} ảnh, {tot_v} video)")

            photos, videos = downloader.collect_media_items(
                self.creator_slug,
                progress_callback=scan_cb,
                cancel_check=lambda: self.is_cancelled
            )

            if self.is_cancelled:
                self.progress.emit("[!] Quá trình quét đã bị dừng.")
                return

            self.progress.emit(f"[✓] Quét hoàn tất! Tổng cộng: {len(photos)} ảnh và {len(videos)} video.")
            self.finished.emit(meta, photos, videos)
        except Exception as e:
            self.error.emit(str(e))

# Thread kiểm tra tính đầy đủ của file
class CheckWorker(QThread):
    progress = pyqtSignal(str)
    finished = pyqtSignal(dict, list, list) # res_dict, photos, videos
    error = pyqtSignal(str)

    def __init__(self, creator_slug, base_out_dir, photos=None, videos=None):
        super().__init__()
        self.creator_slug = creator_slug
        self.base_out_dir = base_out_dir
        self.photos = photos
        self.videos = videos
        self.is_cancelled = False

    def cancel(self):
        self.is_cancelled = True

    def run(self):
        try:
            current_photos = self.photos
            current_videos = self.videos

            if not current_photos or not current_videos:
                self.progress.emit(f"[*] Đang quét danh sách media trực tuyến để đối chiếu...")
                p_list, v_list = downloader.collect_media_items(
                    self.creator_slug,
                    cancel_check=lambda: self.is_cancelled
                )
                if self.is_cancelled:
                    return
                current_photos = p_list
                current_videos = v_list

            self.progress.emit(f"[*] Đang đối chiếu các file trên ổ cứng với danh sách trực tuyến...")
            res = downloader.verify_downloaded_media(
                self.creator_slug, self.base_out_dir,
                photos=current_photos, videos=current_videos
            )
            self.finished.emit(res, current_photos, current_videos)
        except Exception as e:
            self.error.emit(str(e))

# Thread tải dữ liệu đa luồng tốc độ cao với quản lý Slot
class DownloadWorker(QThread):
    log = pyqtSignal(str)
    overall_progress = pyqtSignal(int, int, str) # current_count, total_count, item_name
    slot_started = pyqtSignal(int, str, str) # slot_id (1-based), filename, type_str
    slot_progress = pyqtSignal(int, int, int, float, int, str) # slot_id, bytes_done, total_bytes, speed, pct, status_str
    slot_finished = pyqtSignal(int, str) # slot_id, status_str
    total_speed_update = pyqtSignal(float, int) # total_speed, total_bytes_done
    finished = pyqtSignal(int, int, int, int) # success_p, total_p, success_v, total_v
    error = pyqtSignal(str)

    def __init__(self, photos, videos, out_dir, dl_photos, dl_videos, limit, quality="best", photo_threads=6, video_threads=2):
        super().__init__()
        self.photos = photos
        self.videos = videos
        self.out_dir = out_dir
        self.dl_photos = dl_photos
        self.dl_videos = dl_videos
        self.limit = limit
        self.quality = quality
        self.photo_threads = max(1, photo_threads)
        self.video_threads = max(1, video_threads)
        self.is_cancelled = False
        self.active_speeds = {}
        self.active_bytes = {}
        self.total_downloaded_bytes = 0

    def cancel(self):
        self.is_cancelled = True
        self.log.emit("[!] Đang yêu cầu dừng tải... xin chờ các luồng hiện tại kết thúc.")

    def run(self):
        try:
            ffmpeg_exe = downloader.get_ffmpeg_path()
            if self.dl_videos and not ffmpeg_exe:
                self.error.emit("Không tìm thấy ffmpeg trên máy! Vui lòng cài đặt ffmpeg hoặc thư viện imageio-ffmpeg.")
                return

            photos_to_dl = []
            if self.dl_photos:
                photos_to_dl = self.photos[:self.limit] if self.limit > 0 else self.photos

            videos_to_dl = []
            if self.dl_videos:
                videos_to_dl = self.videos[:self.limit] if self.limit > 0 else self.videos

            total_items = len(photos_to_dl) + len(videos_to_dl)
            if total_items == 0:
                self.log.emit("[!] Không có mục nào được chọn để tải.")
                self.finished.emit(0, 0, 0, 0)
                return

            photos_dir = os.path.join(self.out_dir, "photos")
            videos_dir = os.path.join(self.out_dir, "videos")

            if photos_to_dl:
                os.makedirs(photos_dir, exist_ok=True)
            if videos_to_dl:
                os.makedirs(videos_dir, exist_ok=True)

            current_done = 0
            success_photos = 0
            success_videos = 0

            # 1. Tải Photos với ThreadPoolExecutor đa luồng
            if photos_to_dl and not self.is_cancelled:
                self.log.emit(f"[*] Bắt đầu tải {len(photos_to_dl)} ảnh với {self.photo_threads} luồng song song...")
                session = downloader.create_optimized_session(self.photo_threads * 2)

                slot_q = queue.Queue()
                for s in range(1, self.photo_threads + 1):
                    slot_q.put(s)

                def worker_photo(item):
                    if self.is_cancelled:
                        return False, "", "cancelled"
                    slot_id = slot_q.get()
                    try:
                        ext = ".jpg" if ".jpg" in item["url"].lower() else ".webp"
                        fname = f"{item['key']}{ext}"
                        self.slot_started.emit(slot_id, fname, "🖼️ Ảnh")

                        def prog_cb(b_done, b_tot, spd, pct, status_str=None):
                            clean_b = max(0, b_done)
                            self.active_speeds[slot_id] = spd
                            self.active_bytes[slot_id] = clean_b
                            st = status_str if status_str else f"{pct}%"
                            self.slot_progress.emit(slot_id, clean_b, b_tot, spd, pct, st)
                            tot_spd = sum(self.active_speeds.values())
                            tot_bytes = self.total_downloaded_bytes + sum(self.active_bytes.values())
                            self.total_speed_update.emit(tot_spd, max(0, tot_bytes))

                        res = downloader.download_photo(
                            item, photos_dir, session,
                            progress_callback=prog_cb,
                            cancel_check=lambda: self.is_cancelled
                        )
                        tag = "Hoàn tất" if res[0] else "Lỗi"
                        if res[2] == "already_exists":
                            tag = "Đã có sẵn"
                        self.slot_finished.emit(slot_id, tag)
                        return res
                    finally:
                        self.active_speeds.pop(slot_id, None)
                        self.active_bytes.pop(slot_id, None)
                        tot_spd = sum(self.active_speeds.values())
                        tot_bytes = self.total_downloaded_bytes + sum(self.active_bytes.values())
                        self.total_speed_update.emit(tot_spd, max(0, tot_bytes))
                        slot_q.put(slot_id)

                with ThreadPoolExecutor(max_workers=self.photo_threads) as executor:
                    futures = {executor.submit(worker_photo, item): item for item in photos_to_dl}
                    for future in as_completed(futures):
                        if self.is_cancelled:
                            break
                        ok, filepath, reason = future.result()
                        current_done += 1
                        if ok:
                            success_photos += 1
                            fname = os.path.basename(filepath)
                            tag = "[Đã có]" if reason == "already_exists" else "[Thành công]"
                            self.log.emit(f"  {tag} Ảnh: {fname}")
                            if reason != "already_exists" and os.path.exists(filepath):
                                self.total_downloaded_bytes += os.path.getsize(filepath)
                        self.overall_progress.emit(current_done, total_items, f"Ảnh ({success_photos}/{len(photos_to_dl)})")

            # Reset các slot ảnh trước khi chuyển sang video
            for s in range(1, max(self.photo_threads, self.video_threads) + 1):
                self.slot_finished.emit(s, "Chờ (Idle)")

            # 2. Tải Videos với ThreadPoolExecutor đa luồng & Lựa chọn chất lượng
            if videos_to_dl and not self.is_cancelled:
                q_label = self.quality.upper() if self.quality != "best" else "Cao nhất (720p HD)"
                self.log.emit(f"[*] Bắt đầu tải {len(videos_to_dl)} video [Độ phân giải: {q_label}] với {self.video_threads} luồng song song...")
                video_session = downloader.create_optimized_session(self.video_threads * 4)

                slot_q = queue.Queue()
                for s in range(1, self.video_threads + 1):
                    slot_q.put(s)

                def worker_video(item):
                    if self.is_cancelled:
                        return False, "", "cancelled"
                    slot_id = slot_q.get()
                    try:
                        fname = f"{item['key']}.mp4"
                        self.slot_started.emit(slot_id, fname, "🎬 Video")

                        def prog_cb(b_done, b_tot, spd, pct, status_str=None):
                            clean_b = max(0, b_done)
                            self.active_speeds[slot_id] = spd
                            self.active_bytes[slot_id] = clean_b
                            st = status_str if status_str else f"{pct}%"
                            self.slot_progress.emit(slot_id, clean_b, b_tot, spd, pct, st)
                            tot_spd = sum(self.active_speeds.values())
                            tot_bytes = self.total_downloaded_bytes + sum(self.active_bytes.values())
                            self.total_speed_update.emit(tot_spd, max(0, tot_bytes))

                        res = downloader.download_video(
                            item, videos_dir, ffmpeg_exe,
                            quality=self.quality,
                            session=video_session,
                            progress_callback=prog_cb,
                            cancel_check=lambda: self.is_cancelled
                        )
                        tag = "Hoàn tất" if res[0] else "Lỗi"
                        if res[2] == "already_exists":
                            tag = "Đã có sẵn"
                        self.slot_finished.emit(slot_id, tag)
                        return res
                    finally:
                        self.active_speeds.pop(slot_id, None)
                        self.active_bytes.pop(slot_id, None)
                        tot_spd = sum(self.active_speeds.values())
                        tot_bytes = self.total_downloaded_bytes + sum(self.active_bytes.values())
                        self.total_speed_update.emit(tot_spd, max(0, tot_bytes))
                        slot_q.put(slot_id)

                with ThreadPoolExecutor(max_workers=self.video_threads) as executor:
                    futures = {executor.submit(worker_video, item): item for item in videos_to_dl}
                    for future in as_completed(futures):
                        if self.is_cancelled:
                            break
                        ok, filepath, reason = future.result()
                        current_done += 1
                        if ok:
                            success_videos += 1
                            fname = os.path.basename(filepath)
                            tag = "[Đã có]" if reason == "already_exists" else "[Thành công]"
                            self.log.emit(f"  {tag} Video ({self.quality}): {fname}")
                            if reason != "already_exists" and os.path.exists(filepath):
                                self.total_downloaded_bytes += os.path.getsize(filepath)
                        self.overall_progress.emit(current_done, total_items, f"Video ({success_videos}/{len(videos_to_dl)})")

            if self.is_cancelled:
                self.log.emit("[!] Đã dừng quá trình tải theo yêu cầu.")
            else:
                self.log.emit("[🎉] Đã hoàn tất phiên tải dữ liệu!")

            for s in range(1, max(self.photo_threads, self.video_threads) + 1):
                self.slot_finished.emit(s, "Hoàn thành")

            self.total_speed_update.emit(0.0, self.total_downloaded_bytes)
            self.finished.emit(success_photos, len(photos_to_dl), success_videos, len(videos_to_dl))

        except Exception as e:
            self.error.emit(f"Lỗi trong quá trình tải: {e}")

# Thread tải hàng loạt nhiều Creator (Batch Download Queue)
class BatchDownloadWorker(QThread):
    log = pyqtSignal(str)
    batch_status = pyqtSignal(int, int, str, str) # cur_idx (1-based), total, slug, status_text
    overall_progress = pyqtSignal(int, int, str)
    slot_started = pyqtSignal(int, str, str)
    slot_progress = pyqtSignal(int, int, int, float, int, str)
    slot_finished = pyqtSignal(int, str)
    total_speed_update = pyqtSignal(float, int)
    drive_progress = pyqtSignal(int, str, str, str, str) # pct, speed, transferred, eta, files
    finished = pyqtSignal(dict) # summary
    error = pyqtSignal(str)

    def __init__(self, creator_slugs, base_out_dir, dl_photos, dl_videos, limit, quality="best", photo_threads=6, video_threads=2, auto_upload_drive=False, drive_remote="gg", drive_folder="18TUBE"):
        super().__init__()
        self.creator_slugs = creator_slugs
        self.base_out_dir = base_out_dir
        self.dl_photos = dl_photos
        self.dl_videos = dl_videos
        self.limit = limit
        self.quality = quality
        self.photo_threads = max(1, photo_threads)
        self.video_threads = max(1, video_threads)
        self.auto_upload_drive = auto_upload_drive
        self.drive_remote = drive_remote
        self.drive_folder = drive_folder
        self.is_cancelled = False
        self.active_speeds = {}
        self.active_bytes = {}
        self.total_downloaded_bytes = 0

    def cancel(self):
        self.is_cancelled = True
        self.log.emit("[!] Đang yêu cầu dừng tải hàng loạt... xin chờ các luồng hiện tại kết thúc.")

    def run(self):
        try:
            ffmpeg_exe = downloader.get_ffmpeg_path()
            if self.dl_videos and not ffmpeg_exe:
                self.error.emit("Không tìm thấy ffmpeg trên máy! Vui lòng cài đặt ffmpeg hoặc thư viện imageio-ffmpeg.")
                return

            total_creators = len(self.creator_slugs)
            summary = {
                "total": total_creators,
                "success": 0,
                "failed": 0,
                "creators": []
            }

            self.log.emit(f"\n{'='*55}")
            self.log.emit(f"🚀 BẮT ĐẦU TIẾN TRÌNH TẢI HÀNG LOẠT: {total_creators} CREATOR")
            self.log.emit(f"{'='*55}")

            for idx, slug in enumerate(self.creator_slugs, 1):
                if self.is_cancelled:
                    self.log.emit("[!] Hàng đợi tải hàng loạt đã dừng theo yêu cầu của bạn.")
                    break

                self.log.emit(f"\n▶ [{idx}/{total_creators}] Đang chuẩn bị Creator: {slug}...")
                self.batch_status.emit(idx, total_creators, slug, "Đang quét danh sách media...")

                # 1. Quét danh sách media
                def scan_cb(page, new_items, tot_p, tot_v):
                    self.batch_status.emit(idx, total_creators, slug, f"Quét trang {page}: {tot_p} ảnh, {tot_v} video")

                photos, videos = downloader.collect_media_items(
                    slug,
                    progress_callback=scan_cb,
                    cancel_check=lambda: self.is_cancelled
                )

                if self.is_cancelled:
                    break

                photos_to_dl = []
                if self.dl_photos:
                    photos_to_dl = photos[:self.limit] if self.limit > 0 else photos

                videos_to_dl = []
                if self.dl_videos:
                    videos_to_dl = videos[:self.limit] if self.limit > 0 else videos

                tot_media = len(photos_to_dl) + len(videos_to_dl)
                if tot_media == 0:
                    self.log.emit(f"  [!] Không tìm thấy ảnh/video hợp lệ cho Creator: {slug}")
                    summary["failed"] += 1
                    summary["creators"].append({"slug": slug, "status": "no_media", "photos": 0, "videos": 0})
                    continue

                self.log.emit(f"  [+] Đã quét xong: {len(photos_to_dl)} ảnh, {len(videos_to_dl)} video. Bắt đầu tải...")
                self.batch_status.emit(idx, total_creators, slug, f"Đang tải ({len(photos_to_dl)} ảnh, {len(videos_to_dl)} video)")

                creator_dir = os.path.join(self.base_out_dir, slug)
                photos_dir = os.path.join(creator_dir, "photos")
                videos_dir = os.path.join(creator_dir, "videos")

                if photos_to_dl:
                    os.makedirs(photos_dir, exist_ok=True)
                if videos_to_dl:
                    os.makedirs(videos_dir, exist_ok=True)

                c_done = 0
                c_succ_p = 0
                c_succ_v = 0

                # Tải Photos đa luồng
                if photos_to_dl and not self.is_cancelled:
                    session = downloader.create_optimized_session(self.photo_threads * 2)
                    slot_q = queue.Queue()
                    for s in range(1, self.photo_threads + 1):
                        slot_q.put(s)

                    def worker_p(item):
                        if self.is_cancelled:
                            return False, "", "cancelled"
                        slot_id = slot_q.get()
                        try:
                            ext = ".jpg" if ".jpg" in item["url"].lower() else ".webp"
                            fname = f"{item['key']}{ext}"
                            self.slot_started.emit(slot_id, fname, "🖼️ Ảnh")

                            def p_cb(b_done, b_tot, spd, pct, status_str=None):
                                clean_b = max(0, b_done)
                                self.active_speeds[slot_id] = spd
                                self.active_bytes[slot_id] = clean_b
                                st = status_str if status_str else f"{pct}%"
                                self.slot_progress.emit(slot_id, clean_b, b_tot, spd, pct, st)
                                tot_spd = sum(self.active_speeds.values())
                                tot_bytes = self.total_downloaded_bytes + sum(self.active_bytes.values())
                                self.total_speed_update.emit(tot_spd, max(0, tot_bytes))

                            res = downloader.download_photo(
                                item, photos_dir, session,
                                progress_callback=p_cb,
                                cancel_check=lambda: self.is_cancelled
                            )
                            tag = "Hoàn tất" if res[0] else "Lỗi"
                            if res[2] == "already_exists":
                                tag = "Đã có sẵn"
                            self.slot_finished.emit(slot_id, tag)
                            return res
                        finally:
                            self.active_speeds.pop(slot_id, None)
                            self.active_bytes.pop(slot_id, None)
                            tot_spd = sum(self.active_speeds.values())
                            tot_bytes = self.total_downloaded_bytes + sum(self.active_bytes.values())
                            self.total_speed_update.emit(tot_spd, max(0, tot_bytes))
                            slot_q.put(slot_id)

                    with ThreadPoolExecutor(max_workers=self.photo_threads) as executor:
                        futs = {executor.submit(worker_p, it): it for it in photos_to_dl}
                        for f in as_completed(futs):
                            if self.is_cancelled:
                                break
                            ok, fpath, reason = f.result()
                            c_done += 1
                            if ok:
                                c_succ_p += 1
                                if reason != "already_exists" and os.path.exists(fpath):
                                    self.total_downloaded_bytes += os.path.getsize(fpath)
                            self.overall_progress.emit(c_done, tot_media, f"[{slug}] Ảnh ({c_succ_p}/{len(photos_to_dl)})")

                # Reset slots
                for s in range(1, max(self.photo_threads, self.video_threads) + 1):
                    self.slot_finished.emit(s, "Chờ (Idle)")

                # Tải Videos đa luồng
                if videos_to_dl and not self.is_cancelled:
                    video_session = downloader.create_optimized_session(self.video_threads * 4)
                    slot_q = queue.Queue()
                    for s in range(1, self.video_threads + 1):
                        slot_q.put(s)

                    def worker_v(item):
                        if self.is_cancelled:
                            return False, "", "cancelled"
                        slot_id = slot_q.get()
                        try:
                            fname = f"{item['key']}.mp4"
                            self.slot_started.emit(slot_id, fname, "🎬 Video")

                            def v_cb(b_done, b_tot, spd, pct, status_str=None):
                                clean_b = max(0, b_done)
                                self.active_speeds[slot_id] = spd
                                self.active_bytes[slot_id] = clean_b
                                st = status_str if status_str else f"{pct}%"
                                self.slot_progress.emit(slot_id, clean_b, b_tot, spd, pct, st)
                                tot_spd = sum(self.active_speeds.values())
                                tot_bytes = self.total_downloaded_bytes + sum(self.active_bytes.values())
                                self.total_speed_update.emit(tot_spd, max(0, tot_bytes))

                            res = downloader.download_video(
                                item, videos_dir, ffmpeg_exe,
                                quality=self.quality,
                                session=video_session,
                                progress_callback=v_cb,
                                cancel_check=lambda: self.is_cancelled
                            )
                            tag = "Hoàn tất" if res[0] else "Lỗi"
                            if res[2] == "already_exists":
                                tag = "Đã có sẵn"
                            self.slot_finished.emit(slot_id, tag)
                            return res
                        finally:
                            self.active_speeds.pop(slot_id, None)
                            self.active_bytes.pop(slot_id, None)
                            tot_spd = sum(self.active_speeds.values())
                            tot_bytes = self.total_downloaded_bytes + sum(self.active_bytes.values())
                            self.total_speed_update.emit(tot_spd, max(0, tot_bytes))
                            slot_q.put(slot_id)

                    with ThreadPoolExecutor(max_workers=self.video_threads) as executor:
                        futs = {executor.submit(worker_v, it): it for it in videos_to_dl}
                        for f in as_completed(futs):
                            if self.is_cancelled:
                                break
                            ok, fpath, reason = f.result()
                            c_done += 1
                            if ok:
                                c_succ_v += 1
                                if reason != "already_exists" and os.path.exists(fpath):
                                    self.total_downloaded_bytes += os.path.getsize(fpath)
                            self.overall_progress.emit(c_done, tot_media, f"[{slug}] Video ({c_succ_v}/{len(videos_to_dl)})")

                # Reset slots
                for s in range(1, max(self.photo_threads, self.video_threads) + 1):
                    self.slot_finished.emit(s, "Chờ (Idle)")

                # Sao lưu lên Google Drive nếu được bật
                if self.auto_upload_drive and not self.is_cancelled:
                    dest_folder = f"{self.drive_folder}/{slug}".strip("/")
                    self.log.emit(f"  ☁️ Đang tự động sao lưu {slug} lên Google Drive ({self.drive_remote}:{dest_folder})...")
                    self.batch_status.emit(idx, total_creators, slug, "Đang tải lên Google Drive...")

                    def up_cb(pct, spd, tf, eta, files=""):
                        self.drive_progress.emit(pct, spd, tf, eta, files)

                    def drive_log_cb(line):
                        self.log.emit(f"    [Drive] {line}")

                    ok_up, msg_up = downloader.upload_to_google_drive(
                        creator_dir,
                        remote_name=self.drive_remote,
                        drive_folder=dest_folder,
                        progress_callback=up_cb,
                        cancel_check=lambda: self.is_cancelled,
                        log_callback=drive_log_cb
                    )
                    if ok_up:
                        self.log.emit(f"  [✓] Drive: {msg_up}")
                    else:
                        self.log.emit(f"  [!] Drive: {msg_up}")

                self.log.emit(f"  [✓] Hoàn thành Creator: {slug} ({c_succ_p} ảnh, {c_succ_v} video)")
                summary["success"] += 1
                summary["creators"].append({
                    "slug": slug, "status": "ok",
                    "photos": c_succ_p, "videos": c_succ_v
                })

            for s in range(1, max(self.photo_threads, self.video_threads) + 1):
                self.slot_finished.emit(s, "Hoàn thành")

            self.total_speed_update.emit(0.0, self.total_downloaded_bytes)
            self.finished.emit(summary)
        except Exception as e:
            self.error.emit(f"Lỗi trong quá trình tải hàng loạt: {e}")

# Thread tải lên Google Drive qua rclone
class UploadDriveWorker(QThread):
    progress = pyqtSignal(int, str, str, str, str) # pct, speed, transferred, eta, files
    log = pyqtSignal(str)
    finished = pyqtSignal(bool, str)

    def __init__(self, local_dir, remote_name="gg", drive_folder="18TUBE"):
        super().__init__()
        self.local_dir = local_dir
        self.remote_name = remote_name
        self.drive_folder = drive_folder
        self.is_cancelled = False

    def cancel(self):
        self.is_cancelled = True

    def run(self):
        try:
            self.log.emit(f"[*] Bắt đầu tải lên Google Drive ({self.remote_name}:{self.drive_folder})...")
            self.log.emit(f"    Thư mục nguồn: {self.local_dir}")

            def prog_cb(pct, spd, tf, eta, files=""):
                self.progress.emit(pct, spd, tf, eta, files)

            def log_cb(line):
                self.log.emit(f"  [Drive] {line}")

            ok, msg = downloader.upload_to_google_drive(
                self.local_dir,
                remote_name=self.remote_name,
                drive_folder=self.drive_folder,
                progress_callback=prog_cb,
                cancel_check=lambda: self.is_cancelled,
                log_callback=log_cb
            )

            if self.is_cancelled:
                self.log.emit("[!] Quá trình tải lên Google Drive đã bị hủy.")
                self.finished.emit(False, "Đã hủy bởi người dùng.")
                return

            if ok:
                self.log.emit(f"[✓] {msg}")
                self.finished.emit(True, msg)
            else:
                self.log.emit(f"[!] Lỗi tải lên Drive: {msg}")
                self.finished.emit(False, msg)

        except Exception as e:
            self.log.emit(f"[!] Ngoại lệ khi tải lên Google Drive: {e}")
            self.finished.emit(False, str(e))

# Thread kiểm tra trạng thái, tài khoản & dung lượng Google Drive
class DriveInfoWorker(QThread):
    finished = pyqtSignal(dict)

    def __init__(self, remote_name="gg"):
        super().__init__()
        self.remote_name = remote_name

    def run(self):
        info = downloader.get_drive_info(self.remote_name)
        self.finished.emit(info)

class ModernDarkStyle:
    STYLESHEET = """
    QMainWindow, QWidget#MainContainer {
        background-color: #12151c;
        color: #e6edf3;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    QFrame#CardFrame {
        background-color: #1a1e29;
        border: 1px solid #282e3f;
        border-radius: 10px;
        padding: 8px 12px;
    }
    QFrame#GuideCard {
        background-color: #121824;
        border: 1px dashed #243b55;
        border-radius: 8px;
        padding: 8px 12px;
    }
    QScrollArea {
        background: transparent;
        border: none;
    }
    QScrollArea > QWidget > QWidget {
        background: transparent;
    }
    QTabWidget::pane {
        border: 1px solid #282e3f;
        background-color: #12151c;
        border-radius: 8px;
        top: -1px;
    }
    QTabBar::tab {
        background-color: #161922;
        color: #8b949e;
        border: 1px solid #282e3f;
        border-bottom: none;
        border-top-left-radius: 8px;
        border-top-right-radius: 8px;
        padding: 8px 22px;
        margin-right: 4px;
        font-size: 13px;
        font-weight: bold;
    }
    QTabBar::tab:selected {
        background-color: #1a1e29;
        color: #00ffff;
        border-color: #00adb5;
        border-bottom: 2px solid #00adb5;
    }
    QTabBar::tab:hover:!selected {
        background-color: #212736;
        color: #e6edf3;
    }
    QLabel {
        color: #e6edf3;
        font-size: 13px;
    }
    QLabel#TitleLabel {
        font-size: 19px;
        font-weight: bold;
        color: #00adb5;
    }
    QLabel#SubtitleLabel {
        font-size: 12px;
        color: #8b949e;
    }
    QLabel#BadgeLabel {
        background-color: #242938;
        border: 1px solid #373e54;
        border-radius: 6px;
        padding: 3px 8px;
        font-weight: bold;
        font-size: 12px;
    }
    QLabel#SpeedBadge {
        background-color: #0c3547;
        color: #00ffff;
        border: 1px solid #00adb5;
        border-radius: 6px;
        padding: 4px 12px;
        font-weight: bold;
        font-size: 13px;
    }
    QLineEdit {
        background-color: #161922;
        border: 1px solid #30374a;
        border-radius: 6px;
        padding: 7px 10px;
        color: #ffffff;
        font-size: 13px;
        selection-background-color: #00adb5;
    }
    QLineEdit:focus {
        border: 1px solid #00adb5;
    }
    QComboBox {
        background-color: #161922;
        border: 1px solid #30374a;
        border-radius: 6px;
        padding: 5px 10px;
        color: #ffffff;
        font-size: 12px;
        font-weight: bold;
    }
    QComboBox:hover {
        border-color: #00adb5;
    }
    QComboBox::drop-down {
        border: none;
        width: 20px;
    }
    QComboBox QAbstractItemView {
        background-color: #1a1e29;
        border: 1px solid #30374a;
        selection-background-color: #00adb5;
        selection-color: #ffffff;
        color: #ffffff;
        padding: 4px;
    }
    QPushButton {
        background-color: #242b3d;
        border: 1px solid #37415c;
        border-radius: 6px;
        padding: 5px 12px;
        color: #ffffff;
        font-size: 12px;
        font-weight: bold;
        min-height: 28px;
    }
    QPushButton:hover {
        background-color: #313a52;
        border-color: #00adb5;
    }
    QPushButton:pressed {
        background-color: #1e2433;
    }
    QPushButton#PrimaryButton {
        background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0072ff, stop:1 #00c6ff);
        border: none;
        color: #ffffff;
        font-size: 13px;
        font-weight: bold;
        min-height: 38px;
        padding: 6px 18px;
    }
    QPushButton#PrimaryButton:hover {
        background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0060d6, stop:1 #00b0e6);
    }
    QPushButton#PrimaryButton:disabled {
        background-color: #252b3b;
        color: #6c757d;
    }
    QPushButton#CheckButton {
        background-color: #1b3a4b;
        border: 1px solid #00adb5;
        color: #00ffff;
        font-size: 12px;
        font-weight: bold;
        min-height: 38px;
        padding: 6px 14px;
    }
    QPushButton#CheckButton:hover {
        background-color: #214d64;
    }
    QPushButton#StopButton {
        background-color: #e84118;
        border: none;
        color: #ffffff;
        font-size: 12px;
        font-weight: bold;
        min-height: 38px;
        padding: 6px 16px;
    }
    QPushButton#StopButton:hover {
        background-color: #c23616;
    }
    QPushButton#StopButton:disabled {
        background-color: #252b3b;
        color: #6c757d;
    }
    QPushButton#DriveButton {
        background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #1a73e8, stop:1 #4285f4);
        border: none;
        color: #ffffff;
        font-size: 12px;
        font-weight: bold;
        min-height: 34px;
        padding: 6px 15px;
    }
    QPushButton#DriveButton:hover {
        background-color: #1765cc;
    }
    QPushButton#DriveButton:disabled {
        background-color: #252b3b;
        color: #6c757d;
    }
    QPushButton#AuthButton {
        background-color: #2c2514;
        border: 1px solid #f39c12;
        color: #f1c40f;
        font-size: 12px;
        font-weight: bold;
        min-height: 30px;
        padding: 6px 13px;
    }
    QPushButton#AuthButton:hover {
        background-color: #443719;
    }
    QPushButton#RefreshButton {
        background-color: #1b263b;
        border: 1px solid #415a77;
        color: #e0e1dd;
        font-size: 11px;
        font-weight: bold;
        min-height: 26px;
        padding: 4px 10px;
    }
    QPushButton#RefreshButton:hover {
        background-color: #273b5a;
        color: #ffffff;
    }
    QPushButton#ApiWarnButton {
        background-color: #d35400;
        border: 1px solid #e67e22;
        color: #ffffff;
        font-weight: bold;
        font-size: 11px;
        padding: 4px 10px;
    }
    QPushButton#ApiWarnButton:hover {
        background-color: #e67e22;
    }
    QCheckBox {
        color: #e6edf3;
        font-size: 12px;
        spacing: 6px;
    }
    QCheckBox::indicator {
        width: 16px;
        height: 16px;
        border-radius: 4px;
        border: 1px solid #37415c;
        background-color: #161922;
    }
    QCheckBox::indicator:checked {
        background-color: #00adb5;
        border-color: #00adb5;
    }
    QRadioButton {
        color: #e6edf3;
        font-size: 12px;
        font-weight: bold;
        spacing: 7px;
    }
    QRadioButton::indicator {
        width: 16px;
        height: 16px;
        border-radius: 8px;
        border: 2px solid #37415c;
        background-color: #161922;
    }
    QRadioButton::indicator:checked {
        background-color: #00adb5;
        border: 3px solid #161922;
    }
    QRadioButton::indicator:hover {
        border-color: #00adb5;
    }
    QSpinBox {
        background-color: #161922;
        border: 1px solid #30374a;
        border-radius: 6px;
        padding: 5px 8px;
        color: #ffffff;
        font-size: 12px;
    }
    QProgressBar {
        background-color: #161922;
        border: 1px solid #2b3245;
        border-radius: 6px;
        text-align: center;
        color: #ffffff;
        font-weight: bold;
        height: 18px;
        font-size: 11px;
    }
    QProgressBar#OverallProgress::chunk {
        background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #00adb5, stop:1 #00d2d3);
        border-radius: 5px;
    }
    QProgressBar#DriveProgress::chunk {
        background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #4285f4, stop:1 #34a853);
        border-radius: 5px;
    }
    QProgressBar#QuotaProgress {
        background-color: #12151c;
        border: 1px solid #282e3f;
        border-radius: 4px;
        height: 12px;
        font-size: 9px;
        color: #e6edf3;
        text-align: center;
    }
    QProgressBar#QuotaProgress::chunk {
        background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #00adb5, stop:1 #00b4db);
        border-radius: 3px;
    }
    QProgressBar#CellProgress {
        background-color: #131722;
        border: 1px solid #282e3f;
        border-radius: 4px;
        height: 14px;
        font-size: 10px;
    }
    QProgressBar#CellProgress::chunk {
        background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #7158e2, stop:1 #3ae374);
        border-radius: 3px;
    }
    QTableWidget {
        background-color: #141720;
        border: 1px solid #242938;
        border-radius: 8px;
        gridline-color: #1f2430;
        color: #e6edf3;
        font-size: 12px;
        selection-background-color: #1e2433;
    }
    QTableWidget::item {
        padding: 2px 6px;
        border-bottom: 1px solid #1a1e28;
    }
    QHeaderView::section {
        background-color: #1b1f2b;
        color: #00adb5;
        font-weight: bold;
        border: 1px solid #242938;
        padding: 3px 6px;
        font-size: 12px;
        height: 26px;
    }
    QTextEdit {
        background-color: #10131a;
        border: 1px solid #242938;
        border-radius: 6px;
        padding: 8px;
        color: #c9d1d9;
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 12px;
    }
    QScrollBar:vertical {
        background: #12151c;
        width: 10px;
        border-radius: 5px;
    }
    QScrollBar::handle:vertical {
        background: #2b3245;
        border-radius: 5px;
        min-height: 20px;
    }
    QScrollBar::handle:vertical:hover {
        background: #00adb5;
    }
    """

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("18TUBE Downloader - Quản Lý & Tải Đa Luồng Tốc Độ Cao")
        self.resize(1040, 860)
        self.setMinimumSize(880, 620)

        # Cài đặt biểu tượng icon ứng dụng
        icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app_icon.ico")
        if getattr(sys, 'frozen', False):
            base_dir = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
            icon_path = os.path.join(base_dir, "app_icon.ico")
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))
        
        self.photos_list = []
        self.videos_list = []
        self.current_slug = ""
        self.scan_thread = None
        self.check_thread = None
        self.download_thread = None
        self.batch_thread = None
        self.upload_thread = None
        self.drive_info_thread = None
        self.drive_enable_url = ""
        self.last_verify_result = None

        self.init_ui()
        QTimer.singleShot(600, self.refresh_drive_info)

    def init_ui(self):
        central_widget = QWidget()
        central_widget.setObjectName("MainContainer")
        self.setCentralWidget(central_widget)

        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(14, 12, 14, 12)
        main_layout.setSpacing(8)

        # 1. Header
        header_layout = QVBoxLayout()
        header_layout.setSpacing(1)
        title = QLabel("⚡ 18TUBE Media Downloader")
        title.setObjectName("TitleLabel")
        subtitle = QLabel("Tự động tải Ảnh gốc & Video HD từ 18tube.nl với chức năng kiểm tra tính toàn vẹn file")
        subtitle.setObjectName("SubtitleLabel")
        header_layout.addWidget(title)
        header_layout.addWidget(subtitle)
        main_layout.addLayout(header_layout)

        # 2. Section: Nhập URL Creator & Chế độ tải (Đơn lẻ / Hàng loạt)
        url_card = QFrame()
        url_card.setObjectName("CardFrame")
        url_layout = QVBoxLayout(url_card)
        url_layout.setSpacing(8)

        # Header: Tiêu đề + Chuyển đổi chế độ tải
        mode_header = QHBoxLayout()
        url_title = QLabel("🔗 Địa chỉ Creator / Trang cần tải:")
        url_title.setStyleSheet("font-weight: bold; color: #00adb5; font-size: 13px;")
        mode_header.addWidget(url_title)
        mode_header.addStretch()

        self.radio_mode_single = QRadioButton("Tải 1 link (Đơn lẻ)")
        self.radio_mode_single.setChecked(True)
        self.radio_mode_batch = QRadioButton("Tải nhiều link (Hàng loạt - Batch)")

        self.mode_group = QButtonGroup(self)
        self.mode_group.addButton(self.radio_mode_single)
        self.mode_group.addButton(self.radio_mode_batch)

        mode_header.addWidget(self.radio_mode_single)
        mode_header.addSpacing(14)
        mode_header.addWidget(self.radio_mode_batch)
        url_layout.addLayout(mode_header)

        # 2.1 Khung Tải 1 link (Single Mode)
        self.single_mode_widget = QWidget()
        single_layout = QVBoxLayout(self.single_mode_widget)
        single_layout.setContentsMargins(0, 0, 0, 0)
        single_layout.setSpacing(6)

        input_row = QHBoxLayout()
        self.url_input = QLineEdit()
        self.url_input.setPlaceholderText("Nhập URL (ví dụ: https://18tube.nl/vkcklananh9496/)")

        self.btn_scan = QPushButton("🔍 Quét dữ liệu")
        self.btn_scan.setFixedWidth(130)
        self.btn_scan.clicked.connect(self.start_scan)

        self.btn_check_files = QPushButton("🔎 Kiểm tra đủ file")
        self.btn_check_files.setObjectName("CheckButton")
        self.btn_check_files.setFixedWidth(150)
        self.btn_check_files.clicked.connect(self.start_check_files)

        input_row.addWidget(self.url_input)
        input_row.addWidget(self.btn_scan)
        input_row.addWidget(self.btn_check_files)
        single_layout.addLayout(input_row)

        # Info Badges cho 1 link
        self.badges_layout = QHBoxLayout()
        self.badges_layout.setSpacing(8)

        self.lbl_creator_name = QLabel("👤 Creator: vkcklananh9496")
        self.lbl_creator_name.setObjectName("BadgeLabel")

        self.lbl_photos_count = QLabel("🖼️ Ảnh: --")
        self.lbl_photos_count.setObjectName("BadgeLabel")
        self.lbl_photos_count.setStyleSheet("background-color: #1e3328; color: #2ed573; border-color: #2ed573;")

        self.lbl_videos_count = QLabel("🎬 Video: --")
        self.lbl_videos_count.setObjectName("BadgeLabel")
        self.lbl_videos_count.setStyleSheet("background-color: #2d1f3b; color: #a55eea; border-color: #a55eea;")

        self.lbl_status_badge = QLabel("Trạng thái: Chưa quét")
        self.lbl_status_badge.setObjectName("BadgeLabel")

        self.badges_layout.addWidget(self.lbl_creator_name)
        self.badges_layout.addWidget(self.lbl_photos_count)
        self.badges_layout.addWidget(self.lbl_videos_count)
        self.badges_layout.addWidget(self.lbl_status_badge)
        self.badges_layout.addStretch()
        single_layout.addLayout(self.badges_layout)
        url_layout.addWidget(self.single_mode_widget)

        # 2.2 Khung Tải nhiều link (Batch Mode)
        self.batch_mode_widget = QWidget()
        batch_layout = QVBoxLayout(self.batch_mode_widget)
        batch_layout.setContentsMargins(0, 0, 0, 0)
        batch_layout.setSpacing(6)

        batch_toolbar = QHBoxLayout()
        lbl_batch_hint = QLabel("📝 Dán danh sách link (mỗi dòng 1 link hoặc phân cách bằng dấu phẩy):")
        lbl_batch_hint.setStyleSheet("color: #a0aec0; font-size: 12px;")

        self.btn_import_txt = QPushButton("📂 Nạp file .txt...")
        self.btn_import_txt.setToolTip("Chọn file text chứa danh sách link để nạp tự động")
        self.btn_import_txt.clicked.connect(self.import_batch_from_file)

        self.btn_clear_batch = QPushButton("🧹 Xóa hết")
        self.btn_clear_batch.clicked.connect(self.clear_batch_input)

        self.lbl_batch_count = QLabel("📋 Sẵn sàng: 0 Creator")
        self.lbl_batch_count.setObjectName("BadgeLabel")
        self.lbl_batch_count.setStyleSheet("background-color: #1b263b; color: #00adb5; border-color: #00adb5;")

        batch_toolbar.addWidget(lbl_batch_hint)
        batch_toolbar.addStretch()
        batch_toolbar.addWidget(self.btn_import_txt)
        batch_toolbar.addWidget(self.btn_clear_batch)
        batch_toolbar.addWidget(self.lbl_batch_count)
        batch_layout.addLayout(batch_toolbar)

        self.txt_batch_input = QTextEdit()
        self.txt_batch_input.setFixedHeight(75)
        self.txt_batch_input.setPlaceholderText(
            "Dán danh sách các link 18tube vào đây (mỗi dòng 1 link). Ví dụ:\n"
            "https://18tube.nl/vkcklananh9496/\n"
            "https://18tube.nl/aryminh/\n"
            "https://18tube.nl/kimxu1209/"
        )
        self.txt_batch_input.textChanged.connect(self.on_batch_text_changed)
        batch_layout.addWidget(self.txt_batch_input)

        url_layout.addWidget(self.batch_mode_widget)
        self.batch_mode_widget.setVisible(False)

        self.radio_mode_single.toggled.connect(self.on_mode_toggled)
        self.radio_mode_batch.toggled.connect(self.on_mode_toggled)

        # 3. Section: Cài đặt tải, Chất lượng video & Đa luồng
        opt_card = QFrame()
        opt_card.setObjectName("CardFrame")
        opt_layout = QVBoxLayout(opt_card)
        opt_layout.setSpacing(6)

        opt_title = QLabel("⚙️ Cài đặt tải về, Chất lượng Video & Đa luồng:")
        opt_title.setStyleSheet("font-weight: bold; color: #00adb5;")
        opt_layout.addWidget(opt_title)

        # Hàng 1: Checkboxes & Limit
        check_row = QHBoxLayout()
        self.chk_photos = QCheckBox("Tải toàn bộ Ảnh (.jpg gốc)")
        self.chk_photos.setChecked(True)

        self.chk_videos = QCheckBox("Tải toàn bộ Video")
        self.chk_videos.setChecked(True)

        lbl_limit = QLabel("Giới hạn số lượng (0 = Tải hết):")
        self.spin_limit = QSpinBox()
        self.spin_limit.setRange(0, 5000)
        self.spin_limit.setValue(0)
        self.spin_limit.setFixedWidth(75)

        check_row.addWidget(self.chk_photos)
        check_row.addWidget(self.chk_videos)
        check_row.addSpacing(15)
        check_row.addWidget(lbl_limit)
        check_row.addWidget(self.spin_limit)
        check_row.addStretch()
        opt_layout.addLayout(check_row)

        # Hàng 2: Chọn chất lượng Video & Số luồng tải
        settings_row = QHBoxLayout()

        lbl_quality = QLabel("🎬 Chất lượng Video:")
        lbl_quality.setStyleSheet("color: #00adb5; font-weight: bold;")
        self.combo_quality = QComboBox()
        self.combo_quality.addItem("720p HD (Cao nhất - Sắc nét)", "720p")
        self.combo_quality.addItem("480p (Tiêu chuẩn - Tiết kiệm 50% dung lượng)", "480p")
        self.combo_quality.addItem("360p (Thấp - Tải siêu nhanh, tiết kiệm 70%)", "360p")
        self.combo_quality.setToolTip("Chọn độ phân giải mong muốn khi tải video")

        lbl_p_threads = QLabel("🚀 Luồng Ảnh:")
        lbl_p_threads.setStyleSheet("color: #2ed573; font-weight: bold;")
        self.spin_p_threads = QSpinBox()
        self.spin_p_threads.setRange(1, 16)
        self.spin_p_threads.setValue(6)
        self.spin_p_threads.setFixedWidth(80)

        lbl_v_threads = QLabel("🚀 Luồng Video:")
        lbl_v_threads.setStyleSheet("color: #a55eea; font-weight: bold;")
        self.spin_v_threads = QSpinBox()
        self.spin_v_threads.setRange(1, 6)
        self.spin_v_threads.setValue(2)
        self.spin_v_threads.setFixedWidth(80)

        settings_row.addWidget(lbl_quality)
        settings_row.addWidget(self.combo_quality)
        settings_row.addSpacing(15)
        settings_row.addWidget(lbl_p_threads)
        settings_row.addWidget(self.spin_p_threads)
        settings_row.addSpacing(10)
        settings_row.addWidget(lbl_v_threads)
        settings_row.addWidget(self.spin_v_threads)
        settings_row.addStretch()
        opt_layout.addLayout(settings_row)

        # Hàng 3: Thư mục lưu máy tính
        folder_row = QHBoxLayout()
        lbl_dir = QLabel("Thư mục lưu:")
        lbl_dir.setFixedWidth(85)
        
        default_dl = r"E:\New folder (3)" if os.path.exists(r"E:\New folder (3)") else os.path.abspath(os.path.join(os.path.dirname(__file__), "downloads"))
        self.txt_out_dir = QLineEdit(default_dl)

        self.btn_browse = QPushButton("📁 Chọn thư mục...")
        self.btn_browse.clicked.connect(self.browse_folder)

        self.btn_open_folder = QPushButton("📂 Mở thư mục")
        self.btn_open_folder.clicked.connect(self.open_output_folder)

        folder_row.addWidget(lbl_dir)
        folder_row.addWidget(self.txt_out_dir)
        folder_row.addWidget(self.btn_browse)
        folder_row.addWidget(self.btn_open_folder)
        opt_layout.addLayout(folder_row)

        # 4. Section: Tiến trình tổng thể & Bảng các luồng đang tải (Tab 1)
        ctrl_card = QFrame()
        ctrl_card.setObjectName("CardFrame")
        ctrl_layout = QVBoxLayout(ctrl_card)
        ctrl_layout.setSpacing(6)

        # Điều khiển & Thông số tổng
        btn_row = QHBoxLayout()
        self.btn_download = QPushButton("▶ Bắt đầu tải tốc độ cao")
        self.btn_download.setObjectName("PrimaryButton")
        self.btn_download.setMinimumHeight(38)
        self.btn_download.clicked.connect(self.on_btn_download_clicked)

        self.btn_stop = QPushButton("⏹ Dừng lại")
        self.btn_stop.setObjectName("StopButton")
        self.btn_stop.setMinimumHeight(38)
        self.btn_stop.setEnabled(False)
        self.btn_stop.clicked.connect(self.stop_action)

        self.btn_check_quick = QPushButton("🔎 Kiểm tra đủ file")
        self.btn_check_quick.setObjectName("CheckButton")
        self.btn_check_quick.setMinimumHeight(38)
        self.btn_check_quick.clicked.connect(self.start_check_files)

        self.lbl_speed_badge = QLabel("⚡ Tổng tốc độ: 0 B/s")
        self.lbl_speed_badge.setObjectName("SpeedBadge")
        self.lbl_speed_badge.setMinimumHeight(38)
        self.lbl_speed_badge.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.lbl_size_badge = QLabel("📦 Đã tải: 0 B")
        self.lbl_size_badge.setObjectName("BadgeLabel")
        self.lbl_size_badge.setMinimumHeight(38)
        self.lbl_size_badge.setAlignment(Qt.AlignmentFlag.AlignCenter)

        btn_row.addWidget(self.btn_download)
        btn_row.addWidget(self.btn_stop)
        btn_row.addWidget(self.btn_check_quick)
        btn_row.addSpacing(15)
        btn_row.addWidget(self.lbl_speed_badge)
        btn_row.addWidget(self.lbl_size_badge)
        btn_row.addStretch()
        ctrl_layout.addLayout(btn_row)

        # Thanh tiến trình tổng thể
        overall_title_row = QHBoxLayout()
        self.lbl_overall_title = QLabel("📊 Tiến trình tổng thể:")
        self.lbl_overall_title.setStyleSheet("font-weight: bold; color: #00adb5;")
        self.lbl_overall_info = QLabel("Chưa bắt đầu (0/0 mục)")
        self.lbl_overall_info.setStyleSheet("color: #8b949e;")
        overall_title_row.addWidget(self.lbl_overall_title)
        overall_title_row.addStretch()
        overall_title_row.addWidget(self.lbl_overall_info)
        ctrl_layout.addLayout(overall_title_row)

        self.progress_bar_overall = QProgressBar()
        self.progress_bar_overall.setObjectName("OverallProgress")
        self.progress_bar_overall.setValue(0)
        self.progress_bar_overall.setFormat("0%")
        ctrl_layout.addWidget(self.progress_bar_overall)

        # Bảng danh sách các luồng đang tải (Active Threads Table)
        threads_header_row = QHBoxLayout()
        lbl_tbl_title = QLabel("⚡ Danh sách các luồng đang tải (Active Threads):")
        lbl_tbl_title.setStyleSheet("font-weight: bold; color: #2ed573;")
        threads_header_row.addWidget(lbl_tbl_title)
        threads_header_row.addStretch()
        ctrl_layout.addLayout(threads_header_row)

        self.table_threads = QTableWidget()
        self.table_threads.setFixedHeight(176)
        self.table_threads.setColumnCount(7)
        self.table_threads.setHorizontalHeaderLabels([
            "Luồng", "Loại", "Tên file / Mục", "Tiến trình", "Dung lượng", "Tốc độ", "Trạng thái"
        ])
        
        header = self.table_threads.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)
        self.table_threads.setColumnWidth(3, 140)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.Fixed)
        self.table_threads.setColumnWidth(4, 130)
        header.setSectionResizeMode(5, QHeaderView.ResizeMode.Fixed)
        self.table_threads.setColumnWidth(5, 100)
        header.setSectionResizeMode(6, QHeaderView.ResizeMode.Fixed)
        self.table_threads.setColumnWidth(6, 95)
        
        self.table_threads.verticalHeader().setVisible(False)
        self.table_threads.verticalHeader().setDefaultSectionSize(25)
        ctrl_layout.addWidget(self.table_threads)
        self.setup_threads_table(6)

        # ==============================================================
        # 5. Các Card cho Google Drive (Tab 2)
        # ==============================================================
        # 5.1 Card: Thông tin tài khoản & Dung lượng Cloud
        drive_account_card = QFrame()
        drive_account_card.setObjectName("CardFrame")
        drive_acc_layout = QVBoxLayout(drive_account_card)
        drive_acc_layout.setSpacing(8)

        acc_header = QHBoxLayout()
        lbl_acc_title = QLabel("☁️ Trạng thái & Tài khoản Google Drive:")
        lbl_acc_title.setStyleSheet("font-weight: bold; color: #4285f4; font-size: 14px;")

        self.btn_refresh_drive = QPushButton("🔄 Làm mới thông tin")
        self.btn_refresh_drive.setObjectName("RefreshButton")
        self.btn_refresh_drive.setToolTip("Cập nhật lại trạng thái kết nối, tài khoản và dung lượng Drive")
        self.btn_refresh_drive.clicked.connect(self.refresh_drive_info)

        self.btn_launch_web_online = QPushButton("🚀 Mở Web Online (Điện thoại / Tablet)")
        self.btn_launch_web_online.setObjectName("DriveButton")
        self.btn_launch_web_online.setToolTip("Tạo link HTTPS online miễn phí (Cloudflare Tunnel) để xem trên điện thoại hoặc máy tính bảng")
        self.btn_launch_web_online.clicked.connect(self.launch_web_online)

        acc_header.addWidget(lbl_acc_title)
        acc_header.addSpacing(8)
        acc_header.addWidget(self.btn_refresh_drive)
        acc_header.addSpacing(6)
        acc_header.addWidget(self.btn_launch_web_online)
        acc_header.addStretch()
        drive_acc_layout.addLayout(acc_header)

        # Badges trạng thái & tài khoản
        acc_badges_row = QHBoxLayout()
        acc_badges_row.setSpacing(8)

        self.lbl_drive_conn = QLabel("Trạng thái: ⏳ Đang kiểm tra...")
        self.lbl_drive_conn.setObjectName("BadgeLabel")

        self.lbl_drive_account = QLabel("👤 Tài khoản: --")
        self.lbl_drive_account.setObjectName("BadgeLabel")

        self.lbl_drive_quota = QLabel("💾 Dung lượng: --")
        self.lbl_drive_quota.setObjectName("BadgeLabel")

        self.btn_enable_api = QPushButton("🌐 Bật Google Drive API")
        self.btn_enable_api.setObjectName("ApiWarnButton")
        self.btn_enable_api.setToolTip("Bấm để mở trang bật Drive API trên Google Cloud Console")
        self.btn_enable_api.clicked.connect(self.open_enable_api_url)
        self.btn_enable_api.setVisible(False)

        acc_badges_row.addWidget(self.lbl_drive_conn)
        acc_badges_row.addWidget(self.lbl_drive_account)
        acc_badges_row.addWidget(self.lbl_drive_quota)
        acc_badges_row.addWidget(self.btn_enable_api)
        acc_badges_row.addStretch()
        drive_acc_layout.addLayout(acc_badges_row)

        # Thanh % dung lượng lưu trữ Google Drive đã dùng
        quota_row = QHBoxLayout()
        quota_row.setSpacing(8)
        self.lbl_quota_hint = QLabel("Dung lượng Drive: Đang kiểm tra...")
        self.lbl_quota_hint.setStyleSheet("font-size: 11px; color: #8b949e;")

        self.progress_bar_quota = QProgressBar()
        self.progress_bar_quota.setObjectName("QuotaProgress")
        self.progress_bar_quota.setValue(0)
        self.progress_bar_quota.setFormat("0%")

        quota_row.addWidget(self.lbl_quota_hint)
        quota_row.addWidget(self.progress_bar_quota)
        drive_acc_layout.addLayout(quota_row)

        # 5.2 Card: Cấu hình đồng bộ & Sao lưu Google Drive
        drive_sync_card = QFrame()
        drive_sync_card.setObjectName("CardFrame")
        drive_sync_layout = QVBoxLayout(drive_sync_card)
        drive_sync_layout.setSpacing(8)

        sync_header = QHBoxLayout()
        lbl_sync_title = QLabel("🚀 Cấu hình Đồng bộ & Sao lưu lên Google Drive:")
        lbl_sync_title.setStyleSheet("font-weight: bold; color: #2ed573; font-size: 14px;")

        self.chk_auto_upload = QCheckBox("Tự động tải lên Google Drive sau khi tải máy xong")
        self.chk_auto_upload.setChecked(False)
        self.chk_auto_upload.setToolTip("Sau khi tải toàn bộ ảnh & video về máy tính, tự động sao lưu lên Google Drive")

        sync_header.addWidget(lbl_sync_title)
        sync_header.addStretch()
        sync_header.addWidget(self.chk_auto_upload)
        drive_sync_layout.addLayout(sync_header)

        # Hàng 1: Thư mục nguồn máy tính cần sao lưu
        src_row = QHBoxLayout()
        lbl_src_dir = QLabel("📁 Thư mục nguồn (máy tính):")
        lbl_src_dir.setFixedWidth(175)
        
        default_src_folder = os.path.abspath(os.path.join(default_dl, "vkcklananh9496"))
        self.txt_drive_source = QLineEdit(default_src_folder)
        self.txt_drive_source.setPlaceholderText("Chọn thư mục ảnh/video trên máy cần tải lên Google Drive")

        self.btn_browse_drive_src = QPushButton("📁 Chọn thư mục...")
        self.btn_browse_drive_src.clicked.connect(self.browse_drive_source)

        self.btn_open_drive_src = QPushButton("📂 Mở thư mục")
        self.btn_open_drive_src.clicked.connect(self.open_drive_source)

        src_row.addWidget(lbl_src_dir)
        src_row.addWidget(self.txt_drive_source)
        src_row.addWidget(self.btn_browse_drive_src)
        src_row.addWidget(self.btn_open_drive_src)
        drive_sync_layout.addLayout(src_row)

        # Hàng 2: Remote & Thư mục đích trên Google Drive
        dest_row = QHBoxLayout()
        lbl_remote = QLabel("Remote Rclone:")
        lbl_remote.setStyleSheet("color: #8b949e;")
        self.txt_drive_remote = QLineEdit("gg")
        self.txt_drive_remote.setFixedWidth(60)
        self.txt_drive_remote.setToolTip("Tên remote Google Drive trong Rclone (mặc định: gg)")

        lbl_drive_folder = QLabel("Thư mục trên Google Drive:")
        lbl_drive_folder.setStyleSheet("color: #8b949e;")
        self.txt_drive_folder = QLineEdit("18TUBE")
        self.txt_drive_folder.setToolTip("Tên thư mục lưu trữ trên Google Drive (ví dụ: 18TUBE)")

        dest_row.addWidget(lbl_remote)
        dest_row.addWidget(self.txt_drive_remote)
        dest_row.addSpacing(15)
        dest_row.addWidget(lbl_drive_folder)
        dest_row.addWidget(self.txt_drive_folder)
        dest_row.addStretch()
        drive_sync_layout.addLayout(dest_row)

        # Hàng 3: Nút hành động
        action_row = QHBoxLayout()
        self.btn_upload_drive = QPushButton("☁️ Bắt đầu tải lên Google Drive ngay")
        self.btn_upload_drive.setObjectName("PrimaryButton")
        self.btn_upload_drive.setMinimumHeight(38)
        self.btn_upload_drive.clicked.connect(self.start_drive_upload)

        self.btn_auth_drive = QPushButton("🔑 Đổi tài khoản / Kết nối lại")
        self.btn_auth_drive.setObjectName("AuthButton")
        self.btn_auth_drive.setMinimumHeight(38)
        self.btn_auth_drive.setToolTip("Mở trình duyệt để đăng nhập tài khoản Google Drive khác cho Rclone")
        self.btn_auth_drive.clicked.connect(self.connect_google_drive)

        action_row.addWidget(self.btn_upload_drive, 2)
        action_row.addWidget(self.btn_auth_drive, 1)
        drive_sync_layout.addLayout(action_row)

        # Hàng 4: Bảng theo dõi tiến trình truyền tải
        drive_monitor_row = QHBoxLayout()
        self.lbl_drive_status = QLabel("Trạng thái tải lên: Sẵn sàng")
        self.lbl_drive_status.setStyleSheet("color: #00adb5; font-weight: bold; font-size: 12px;")

        self.lbl_drive_speed = QLabel("⚡ 0 B/s")
        self.lbl_drive_speed.setStyleSheet("color: #34a853; font-weight: bold; font-size: 12px;")

        self.lbl_drive_transferred = QLabel("📦 Đã tải: --")
        self.lbl_drive_transferred.setObjectName("BadgeLabel")

        self.lbl_drive_eta = QLabel("⏳ Còn lại: --")
        self.lbl_drive_eta.setObjectName("BadgeLabel")

        drive_monitor_row.addWidget(self.lbl_drive_status)
        drive_monitor_row.addStretch()
        drive_monitor_row.addWidget(self.lbl_drive_speed)
        drive_monitor_row.addWidget(self.lbl_drive_transferred)
        drive_monitor_row.addWidget(self.lbl_drive_eta)
        drive_sync_layout.addLayout(drive_monitor_row)

        self.progress_bar_drive = QProgressBar()
        self.progress_bar_drive.setObjectName("DriveProgress")
        self.progress_bar_drive.setValue(0)
        self.progress_bar_drive.setFormat("0%")
        self.progress_bar_drive.setMinimumHeight(20)
        drive_sync_layout.addWidget(self.progress_bar_drive)

        # ==============================================================
        # 6. Lắp ghép vào QTabWidget
        # ==============================================================
        self.tabs = QTabWidget()

        # Tab 1: 📥 Tải về máy tính
        tab_download = QWidget()
        tab_dl_layout = QVBoxLayout(tab_download)
        tab_dl_layout.setContentsMargins(6, 6, 6, 6)
        tab_dl_layout.setSpacing(8)
        tab_dl_layout.addWidget(url_card)
        tab_dl_layout.addWidget(opt_card)
        tab_dl_layout.addWidget(ctrl_card)
        tab_dl_layout.addStretch()

        scroll_download = QScrollArea()
        scroll_download.setWidgetResizable(True)
        scroll_download.setFrameShape(QFrame.Shape.NoFrame)
        scroll_download.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll_download.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll_download.setWidget(tab_download)
        self.tabs.addTab(scroll_download, "📥 Tải về máy tính")

        # Tab 2: ☁️ Google Drive
        tab_drive = QWidget()
        tab_drive_layout = QVBoxLayout(tab_drive)
        tab_drive_layout.setContentsMargins(6, 6, 6, 6)
        tab_drive_layout.setSpacing(10)
        # Thẻ thông tin tiện ích & lưu ý đồng bộ
        guide_card = QFrame()
        guide_card.setObjectName("GuideCard")
        guide_layout = QVBoxLayout(guide_card)
        guide_layout.setSpacing(5)

        lbl_guide_title = QLabel("💡 Lưu ý & Tiện ích khi đồng bộ Google Drive:")
        lbl_guide_title.setStyleSheet("font-weight: bold; color: #00adb5; font-size: 12px;")
        lbl_guide_1 = QLabel("• <b>Đồng bộ thông minh:</b> Rclone tự động kiểm tra và chỉ tải các file mới hoặc thiếu, không tải lại file đã có.")
        lbl_guide_1.setStyleSheet("color: #a0aec0; font-size: 11px;")
        lbl_guide_2 = QLabel("• <b>Tiến trình thời gian thực:</b> Hiển thị chi tiết tốc độ mạng, dung lượng đã tải và thời gian ước tính (ETA).")
        lbl_guide_2.setStyleSheet("color: #a0aec0; font-size: 11px;")
        lbl_guide_3 = QLabel("• <b>Tự động sao lưu:</b> Khi bật ô 'Tự động tải lên...' ở trên, hệ thống sẽ tự động upload lên Drive ngay sau khi tải máy hoàn tất.")
        lbl_guide_3.setStyleSheet("color: #a0aec0; font-size: 11px;")

        guide_layout.addWidget(lbl_guide_title)
        guide_layout.addWidget(lbl_guide_1)
        guide_layout.addWidget(lbl_guide_2)
        guide_layout.addWidget(lbl_guide_3)

        tab_drive_layout.addWidget(drive_account_card)
        tab_drive_layout.addWidget(drive_sync_card)
        tab_drive_layout.addWidget(guide_card)
        tab_drive_layout.addStretch()

        scroll_drive = QScrollArea()
        scroll_drive.setWidgetResizable(True)
        scroll_drive.setFrameShape(QFrame.Shape.NoFrame)
        scroll_drive.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll_drive.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll_drive.setWidget(tab_drive)
        self.tabs.addTab(scroll_drive, "☁️ Google Drive")

        main_layout.addWidget(self.tabs)

        # 5. Section: Nhật ký hoạt động
        log_header = QHBoxLayout()
        lbl_log = QLabel("📜 Nhật ký hoạt động (Console Log):")
        lbl_log.setStyleSheet("font-weight: bold; color: #8b949e;")

        self.btn_clear_log = QPushButton("🗑 Xóa log")
        self.btn_clear_log.setMinimumWidth(85)
        self.btn_clear_log.setFixedHeight(28)
        self.btn_clear_log.clicked.connect(self.clear_log)

        log_header.addWidget(lbl_log)
        log_header.addStretch()
        log_header.addWidget(self.btn_clear_log)
        main_layout.addLayout(log_header)

        self.txt_log = QTextEdit()
        self.txt_log.setReadOnly(True)
        self.txt_log.setFixedHeight(95)
        main_layout.addWidget(self.txt_log)

        self.append_log("[i] Chào mừng bạn đến với 18TUBE Downloader.")
        self.append_log("[i] Bạn có thể bấm 'Kiểm tra đủ file' bất cứ lúc nào để biết máy đã tải đủ bao nhiêu % nội dung.")

    def setup_threads_table(self, count):
        """Khởi tạo bảng các luồng với số hàng tương ứng."""
        self.table_threads.setRowCount(count)
        self.table_threads.verticalHeader().setDefaultSectionSize(25)
        for i in range(count):
            self.table_threads.setRowHeight(i, 25)
            item_slot = QTableWidgetItem(f"Luồng #{i+1}")
            item_slot.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table_threads.setItem(i, 0, item_slot)

            item_type = QTableWidgetItem("--")
            item_type.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table_threads.setItem(i, 1, item_type)

            self.table_threads.setItem(i, 2, QTableWidgetItem("Chờ nhận mục tải..."))

            pbar = QProgressBar()
            pbar.setObjectName("CellProgress")
            pbar.setValue(0)
            pbar.setFormat("0%")
            self.table_threads.setCellWidget(i, 3, pbar)

            item_sz = QTableWidgetItem("0 B / 0 B")
            item_sz.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table_threads.setItem(i, 4, item_sz)

            item_spd = QTableWidgetItem("0 B/s")
            item_spd.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table_threads.setItem(i, 5, item_spd)

            item_st = QTableWidgetItem("Chờ (Idle)")
            item_st.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table_threads.setItem(i, 6, item_st)

    def on_slot_started(self, slot_id, fname, type_str):
        row = slot_id - 1
        if row < self.table_threads.rowCount():
            self.table_threads.item(row, 1).setText(type_str)
            self.table_threads.item(row, 2).setText(fname)
            pbar = self.table_threads.cellWidget(row, 3)
            if pbar:
                pbar.setValue(0)
                pbar.setFormat("0%")
            self.table_threads.item(row, 4).setText("Đang kết nối...")
            self.table_threads.item(row, 5).setText("0 B/s")
            self.table_threads.item(row, 6).setText("Đang tải...")

    def on_slot_progress(self, slot_id, bytes_done, total_bytes, speed, pct, status_str=""):
        row = slot_id - 1
        if row < self.table_threads.rowCount():
            pbar = self.table_threads.cellWidget(row, 3)
            if pbar:
                pbar.setValue(pct)
                pbar.setFormat(f"{pct}%")
            
            clean_bytes = max(0, bytes_done)
            done_s = downloader.format_size(clean_bytes)
            tot_s = downloader.format_size(total_bytes) if total_bytes > 0 else "? MB"
            self.table_threads.item(row, 4).setText(f"{done_s} / {tot_s}")
            
            spd_text = downloader.format_speed(speed)
            if status_str in ["Đang ghép nối...", "Đang đóng gói MP4...", "Đang tải bù segment..."]:
                spd_text = "Xử lý..."
            self.table_threads.item(row, 5).setText(spd_text)
            self.table_threads.item(row, 6).setText(status_str if status_str else f"{pct}%")

    def on_slot_finished(self, slot_id, status_str):
        row = slot_id - 1
        if row < self.table_threads.rowCount():
            pbar = self.table_threads.cellWidget(row, 3)
            if pbar and status_str in ["Hoàn tất", "Đã có sẵn"]:
                pbar.setValue(100)
                pbar.setFormat("100%")
            self.table_threads.item(row, 5).setText("0 B/s")
            self.table_threads.item(row, 6).setText(status_str)

    def on_total_speed_update(self, total_spd, total_bytes_done):
        self.lbl_speed_badge.setText(f"⚡ Tổng tốc độ: {downloader.format_speed(total_spd)}")
        self.lbl_size_badge.setText(f"📦 Đã tải: {downloader.format_size(total_bytes_done)}")

    def append_log(self, text):
        self.txt_log.append(text)
        self.txt_log.moveCursor(QTextCursor.MoveOperation.End)

    def clear_log(self):
        self.txt_log.clear()

    def browse_folder(self):
        dir_selected = QFileDialog.getExistingDirectory(self, "Chọn thư mục lưu tải về", self.txt_out_dir.text())
        if dir_selected:
            self.txt_out_dir.setText(dir_selected)
            slug = downloader.extract_creator_slug(self.url_input.text().strip())
            self.txt_drive_source.setText(os.path.join(dir_selected, slug))

    def open_output_folder(self):
        folder = self.txt_out_dir.text().strip()
        slug = downloader.extract_creator_slug(self.url_input.text())
        target_path = os.path.join(folder, slug)
        if not os.path.exists(target_path):
            target_path = folder
        if os.path.exists(target_path):
            os.startfile(target_path)
        else:
            QMessageBox.information(self, "Thông báo", f"Thư mục chưa được tạo: {target_path}")

    def start_scan(self):
        url = self.url_input.text().strip()
        if not url:
            QMessageBox.warning(self, "Cảnh báo", "Vui lòng nhập đường dẫn trang creator!")
            return

        self.current_slug = downloader.extract_creator_slug(url)
        base_dir = self.txt_out_dir.text().strip()
        self.txt_drive_source.setText(os.path.join(base_dir, self.current_slug))
        self.lbl_creator_name.setText(f"👤 Creator: {self.current_slug}")
        self.lbl_status_badge.setText("Trạng thái: Đang quét...")
        self.btn_scan.setEnabled(False)
        self.btn_check_files.setEnabled(False)
        self.btn_check_quick.setEnabled(False)
        self.btn_download.setEnabled(False)
        self.btn_stop.setEnabled(True)

        self.scan_thread = ScanWorker(self.current_slug)
        self.scan_thread.progress.connect(self.append_log)
        self.scan_thread.finished.connect(self.on_scan_finished)
        self.scan_thread.error.connect(self.on_scan_error)
        self.scan_thread.start()

    def on_scan_finished(self, meta, photos, videos):
        self.photos_list = photos
        self.videos_list = videos
        
        self.lbl_photos_count.setText(f"🖼️ Ảnh: {len(photos)}")
        self.lbl_videos_count.setText(f"🎬 Video: {len(videos)}")
        self.lbl_status_badge.setText(f"Đã quét: {len(photos) + len(videos)} mục")
        
        self.btn_scan.setEnabled(True)
        self.btn_check_files.setEnabled(True)
        self.btn_check_quick.setEnabled(True)
        self.btn_download.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.lbl_overall_info.setText(f"Sẵn sàng tải: {len(photos) + len(videos)} mục")

    def on_scan_error(self, err_msg):
        self.append_log(f"[!] Lỗi quét: {err_msg}")
        self.lbl_status_badge.setText("Lỗi quét dữ liệu")
        self.btn_scan.setEnabled(True)
        self.btn_check_files.setEnabled(True)
        self.btn_check_quick.setEnabled(True)
        self.btn_download.setEnabled(True)
        self.btn_stop.setEnabled(False)
        QMessageBox.critical(self, "Lỗi", f"Không thể quét dữ liệu: {err_msg}")

    # Chức năng: Kiểm tra tải đủ file chưa
    def start_check_files(self):
        url = self.url_input.text().strip()
        if not url:
            QMessageBox.warning(self, "Cảnh báo", "Vui lòng nhập URL Creator!")
            return

        self.current_slug = downloader.extract_creator_slug(url)
        base_out = self.txt_out_dir.text().strip()

        self.btn_check_files.setEnabled(False)
        self.btn_check_quick.setEnabled(False)
        self.btn_scan.setEnabled(False)
        self.btn_download.setEnabled(False)
        self.btn_stop.setEnabled(True)
        self.lbl_status_badge.setText("Đang kiểm tra đủ file...")

        self.check_thread = CheckWorker(
            self.current_slug, base_out,
            photos=self.photos_list if self.photos_list else None,
            videos=self.videos_list if self.videos_list else None
        )
        self.check_thread.progress.connect(self.append_log)
        self.check_thread.finished.connect(self.on_check_finished)
        self.check_thread.error.connect(self.on_check_error)
        self.check_thread.start()

    def on_check_finished(self, res, photos, videos):
        self.photos_list = photos
        self.videos_list = videos
        self.last_verify_result = res

        self.lbl_photos_count.setText(f"🖼️ Ảnh: {len(photos)}")
        self.lbl_videos_count.setText(f"🎬 Video: {len(videos)}")
        self.btn_check_files.setEnabled(True)
        self.btn_check_quick.setEnabled(True)
        self.btn_scan.setEnabled(True)
        self.btn_download.setEnabled(True)
        self.btn_stop.setEnabled(False)

        # In chi tiết ra log
        self.append_log("\n" + "="*50)
        self.append_log(f"📋 KẾT QUẢ KIỂM TRA ĐỦ FILE CHO: {res['creator_slug']}")
        self.append_log(f"📁 Thư mục lưu: {res['creator_dir']}")
        self.append_log(f"🖼️ Ảnh:   Đã tải {res['existing_photos_count']} / {res['total_photos']} (Dung lượng: {downloader.format_size(res['total_photo_bytes'])})")
        self.append_log(f"🎬 Video: Đã tải {res['existing_videos_count']} / {res['total_videos']} (Dung lượng: {downloader.format_size(res['total_video_bytes'])})")
        self.append_log(f"📦 Tổng:  Đã tải {res['total_existing']} / {res['total_expected']} (Tổng: {downloader.format_size(res['total_bytes'])})")
        self.append_log("="*50)

        # Cập nhật huy hiệu trạng thái
        if res['is_complete']:
            self.lbl_status_badge.setText("✅ Đã đủ 100% file!")
            self.lbl_status_badge.setStyleSheet("background-color: #1e3328; color: #2ed573; border-color: #2ed573;")
            
            box = QMessageBox(self)
            box.setWindowTitle("Kiểm tra hoàn tất: ĐỦ 100% FILE!")
            box.setIcon(QMessageBox.Icon.Information)
            box.setText(
                f"🎉 CHÚC MỪNG: BẠN ĐÃ TẢI ĐẦY ĐỦ 100% FILE!\n\n"
                f"• Creator: {res['creator_slug']}\n"
                f"• Ảnh: {res['existing_photos_count']}/{res['total_photos']} file ({downloader.format_size(res['total_photo_bytes'])})\n"
                f"• Video: {res['existing_videos_count']}/{res['total_videos']} file ({downloader.format_size(res['total_video_bytes'])})\n"
                f"• Tổng dung lượng: {downloader.format_size(res['total_bytes'])}\n"
                f"• Thư mục: {res['creator_dir']}\n\n"
                f"Không có file nào bị thiếu."
            )
            btn_open = box.addButton("📂 Mở thư mục", QMessageBox.ButtonRole.ActionRole)
            box.addButton("Đóng", QMessageBox.ButtonRole.RejectRole)
            box.exec()
            if box.clickedButton() == btn_open:
                self.open_output_folder()

        else:
            pct_have = int((res['total_existing'] / res['total_expected']) * 100) if res['total_expected'] > 0 else 0
            self.lbl_status_badge.setText(f"⚠️ Thiếu {len(res['missing_photos'])} ảnh, {len(res['missing_videos'])} video")
            self.lbl_status_badge.setStyleSheet("background-color: #3b281e; color: #ff9f43; border-color: #ff9f43;")

            box = QMessageBox(self)
            box.setWindowTitle("Kết quả kiểm tra: CÒN THIẾU FILE")
            box.setIcon(QMessageBox.Icon.Warning)
            box.setText(
                f"⚠️ PHÁT HIỆN CÒN THIẾU FILE CHƯA TẢI!\n\n"
                f"• Tổng tiến độ đã có: {res['total_existing']}/{res['total_expected']} mục ({pct_have}%)\n"
                f"• Đã có trên máy: {downloader.format_size(res['total_bytes'])}\n\n"
                f"❌ File còn thiếu:\n"
                f"  - Ảnh còn thiếu: {len(res['missing_photos'])} / {res['total_photos']} ảnh\n"
                f"  - Video còn thiếu: {len(res['missing_videos'])} / {res['total_videos']} video\n\n"
                f"Bạn có muốn tự động TẢI BÙ chỉ các file còn thiếu này không?"
            )
            btn_fix = box.addButton("🚀 Tải bù các file còn thiếu", QMessageBox.ButtonRole.AcceptRole)
            btn_open = box.addButton("📂 Mở thư mục", QMessageBox.ButtonRole.ActionRole)
            box.addButton("Đóng", QMessageBox.ButtonRole.RejectRole)
            box.exec()

            if box.clickedButton() == btn_fix:
                self.start_download_missing_only()
            elif box.clickedButton() == btn_open:
                self.open_output_folder()

    def on_check_error(self, err_msg):
        self.append_log(f"[!] Lỗi khi kiểm tra: {err_msg}")
        self.btn_check_files.setEnabled(True)
        self.btn_check_quick.setEnabled(True)
        self.btn_scan.setEnabled(True)
        self.btn_download.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.lbl_status_badge.setText("Lỗi kiểm tra file")
        QMessageBox.critical(self, "Lỗi kiểm tra", err_msg)

    # Tải bù riêng các file còn thiếu
    def start_download_missing_only(self):
        if not self.last_verify_result:
            return
        
        miss_p = self.last_verify_result["missing_photos"]
        miss_v = self.last_verify_result["missing_videos"]
        
        if not miss_p and not miss_v:
            QMessageBox.information(self, "Thông báo", "Tất cả các file đều đã được tải đầy đủ!")
            return

        self.append_log(f"[*] Bắt đầu tiến trình tải bù {len(miss_p)} ảnh và {len(miss_v)} video còn thiếu...")
        slug = downloader.extract_creator_slug(self.url_input.text())
        creator_out_dir = os.path.join(self.txt_out_dir.text().strip(), slug)
        quality = self.combo_quality.currentData() or "720p"
        p_threads = self.spin_p_threads.value()
        v_threads = self.spin_v_threads.value()

        max_active_threads = max(p_threads if miss_p else 0, v_threads if miss_v else 0)
        self.setup_threads_table(max(1, max_active_threads))

        self.btn_download.setEnabled(False)
        self.btn_scan.setEnabled(False)
        self.btn_check_files.setEnabled(False)
        self.btn_check_quick.setEnabled(False)
        self.btn_stop.setEnabled(True)

        self.progress_bar_overall.setValue(0)

        self.download_thread = DownloadWorker(
            miss_p, miss_v, creator_out_dir,
            dl_photos=bool(miss_p), dl_videos=bool(miss_v), limit=0,
            quality=quality,
            photo_threads=p_threads, video_threads=v_threads
        )
        self.download_thread.log.connect(self.append_log)
        self.download_thread.overall_progress.connect(self.on_overall_progress)
        self.download_thread.slot_started.connect(self.on_slot_started)
        self.download_thread.slot_progress.connect(self.on_slot_progress)
        self.download_thread.slot_finished.connect(self.on_slot_finished)
        self.download_thread.total_speed_update.connect(self.on_total_speed_update)
        self.download_thread.finished.connect(self.on_download_finished)
        self.download_thread.error.connect(self.on_download_error)
        self.download_thread.start()

    def on_mode_toggled(self, checked):
        if not hasattr(self, 'single_mode_widget') or not hasattr(self, 'batch_mode_widget'):
            return
        is_single = self.radio_mode_single.isChecked()
        self.single_mode_widget.setVisible(is_single)
        self.batch_mode_widget.setVisible(not is_single)
        if hasattr(self, 'btn_download'):
            if is_single:
                self.btn_download.setText("▶ Bắt đầu tải tốc độ cao")
                self.lbl_overall_title.setText("📊 Tiến trình tổng thể:")
                self.lbl_overall_info.setText("Chưa bắt đầu (0/0 mục)")
            else:
                slugs = self.parse_batch_slugs()
                count = len(slugs)
                self.btn_download.setText(f"🚀 Bắt đầu tải hàng loạt ({count} Creator)" if count > 0 else "🚀 Bắt đầu tải hàng loạt")
                self.lbl_overall_title.setText("📊 Tiến trình Hàng loạt (Batch):")
                self.lbl_overall_info.setText(f"Đã chuẩn bị {count} Creator trong hàng đợi" if count > 0 else "Chưa có link nào")

    def parse_batch_slugs(self):
        text = self.txt_batch_input.toPlainText()
        raw_items = re.split(r'[\r\n,;]+', text)
        slugs = []
        seen = set()
        for item in raw_items:
            clean = item.strip()
            if not clean:
                continue
            slug = downloader.extract_creator_slug(clean)
            if slug and slug != "unknown" and slug not in seen:
                seen.add(slug)
                slugs.append(slug)
        return slugs

    def on_batch_text_changed(self):
        slugs = self.parse_batch_slugs()
        self.lbl_batch_count.setText(f"📋 Sẵn sàng: {len(slugs)} Creator")
        if self.radio_mode_batch.isChecked():
            if slugs:
                self.btn_download.setText(f"🚀 Bắt đầu tải hàng loạt ({len(slugs)} Creator)")
                self.lbl_overall_info.setText(f"Đã chuẩn bị {len(slugs)} Creator trong hàng đợi")
            else:
                self.btn_download.setText("🚀 Bắt đầu tải hàng loạt (Chưa có link)")
                self.lbl_overall_info.setText("Chưa có link nào trong hàng đợi")

    def clear_batch_input(self):
        self.txt_batch_input.clear()
        self.lbl_batch_count.setText("📋 Sẵn sàng: 0 Creator")

    def import_batch_from_file(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Chọn file text danh sách link", "", "Text Files (*.txt);;All Files (*)"
        )
        if file_path and os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                self.txt_batch_input.setPlainText(content)
                slugs = self.parse_batch_slugs()
                self.append_log(f"[✓] Đã nạp thành công {len(slugs)} Creator từ file: {os.path.basename(file_path)}")
            except Exception as e:
                QMessageBox.warning(self, "Lỗi đọc file", f"Không thể đọc file: {e}")

    def on_btn_download_clicked(self):
        if self.radio_mode_batch.isChecked():
            self.start_batch_download()
        else:
            self.start_download()

    def start_batch_download(self):
        slugs = self.parse_batch_slugs()
        if not slugs:
            QMessageBox.warning(self, "Cảnh báo", "Vui lòng dán ít nhất 1 link hoặc nạp file .txt danh sách!")
            return

        dl_photos = self.chk_photos.isChecked()
        dl_videos = self.chk_videos.isChecked()
        if not dl_photos and not dl_videos:
            QMessageBox.warning(self, "Cảnh báo", "Vui lòng tích chọn tải Ảnh hoặc Video!")
            return

        base_out = self.txt_out_dir.text().strip()
        limit = self.spin_limit.value()
        quality = self.combo_quality.currentData() or "720p"
        p_threads = self.spin_p_threads.value()
        v_threads = self.spin_v_threads.value()
        auto_upload = self.chk_auto_upload.isChecked()
        drive_remote = self.txt_drive_remote.text().strip() or "gg"
        drive_folder = self.txt_drive_folder.text().strip() or "18TUBE"

        max_active_threads = max(p_threads if dl_photos else 0, v_threads if dl_videos else 0)
        self.setup_threads_table(max(1, max_active_threads))

        self.btn_download.setEnabled(False)
        self.btn_scan.setEnabled(False)
        self.btn_check_files.setEnabled(False)
        self.btn_check_quick.setEnabled(False)
        self.btn_stop.setEnabled(True)
        self.radio_mode_single.setEnabled(False)
        self.radio_mode_batch.setEnabled(False)

        self.progress_bar_overall.setValue(0)
        self.lbl_overall_title.setText(f"📊 Tiến trình Hàng loạt (0/{len(slugs)} Creator):")
        self.lbl_overall_info.setText("Khởi động hàng đợi...")

        self.batch_thread = BatchDownloadWorker(
            creator_slugs=slugs,
            base_out_dir=base_out,
            dl_photos=dl_photos,
            dl_videos=dl_videos,
            limit=limit,
            quality=quality,
            photo_threads=p_threads,
            video_threads=v_threads,
            auto_upload_drive=auto_upload,
            drive_remote=drive_remote,
            drive_folder=drive_folder
        )
        self.batch_thread.log.connect(self.append_log)
        self.batch_thread.batch_status.connect(self.on_batch_status_update)
        self.batch_thread.overall_progress.connect(self.on_overall_progress)
        self.batch_thread.slot_started.connect(self.on_slot_started)
        self.batch_thread.slot_progress.connect(self.on_slot_progress)
        self.batch_thread.slot_finished.connect(self.on_slot_finished)
        self.batch_thread.total_speed_update.connect(self.on_total_speed_update)
        self.batch_thread.drive_progress.connect(self.on_batch_drive_progress)
        self.batch_thread.finished.connect(self.on_batch_download_finished)
        self.batch_thread.error.connect(self.on_batch_download_error)
        self.batch_thread.start()

    def on_batch_status_update(self, cur_idx, total, slug, status_text):
        self.lbl_overall_title.setText(f"📊 Tiến trình Hàng loạt ({cur_idx}/{total} Creator):")
        self.lbl_overall_info.setText(f"[{slug}] {status_text}")
        batch_pct = int(((cur_idx - 1) / total) * 100) if total > 0 else 0
        self.progress_bar_overall.setValue(batch_pct)
        self.progress_bar_overall.setFormat(f"Creator {cur_idx}/{total} ({batch_pct}%)")
        self.lbl_creator_name.setText(f"👤 Creator ({cur_idx}/{total}): {slug}")
        self.lbl_status_badge.setText(status_text)

    def on_batch_drive_progress(self, pct, spd, tf, eta, files=""):
        self.progress_bar_drive.setValue(pct)
        self.progress_bar_drive.setFormat(f"{pct}%")
        self.lbl_drive_speed.setText(f"🚀 Tốc độ: {spd}")
        if tf:
            self.lbl_drive_transferred.setText(f"📦 {tf}")
        elif files:
            self.lbl_drive_transferred.setText(f"📦 {files} file")
        if eta:
            self.lbl_drive_eta.setText(f"⏳ Còn lại: {eta}")

    def on_batch_download_finished(self, summary):
        self.btn_download.setEnabled(True)
        self.btn_scan.setEnabled(True)
        self.btn_check_files.setEnabled(True)
        self.btn_check_quick.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.radio_mode_single.setEnabled(True)
        self.radio_mode_batch.setEnabled(True)
        self.lbl_speed_badge.setText("⚡ Tổng tốc độ: 0 B/s")

        self.progress_bar_overall.setValue(100)
        self.progress_bar_overall.setFormat("100% Hoàn tất hàng loạt")
        self.lbl_overall_info.setText(f"Đã hoàn thành {summary['success']}/{summary['total']} Creator")

        QMessageBox.information(
            self,
            "Hoàn tất tải hàng loạt",
            f"🎉 ĐÃ HOÀN TẤT TẢI HÀNG LOẠT!\n\n"
            f"• Tổng Creator: {summary['total']}\n"
            f"• Thành công: {summary['success']} Creator\n"
            f"• Thất bại/Trống: {summary['failed']} Creator\n\n"
            f"Thư mục lưu trữ: {self.txt_out_dir.text().strip()}"
        )

    def on_batch_download_error(self, err_msg):
        self.append_log(f"[!] Lỗi tải hàng loạt: {err_msg}")
        self.btn_download.setEnabled(True)
        self.btn_scan.setEnabled(True)
        self.btn_check_files.setEnabled(True)
        self.btn_check_quick.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.radio_mode_single.setEnabled(True)
        self.radio_mode_batch.setEnabled(True)
        self.lbl_speed_badge.setText("⚡ Tổng tốc độ: 0 B/s")
        QMessageBox.critical(self, "Lỗi tải hàng loạt", err_msg)

    def start_download(self):
        if not self.photos_list and not self.videos_list:
            self.append_log("[*] Chưa có danh sách mục media, tiến hành quét tự động trước khi tải...")
            self.auto_scan_and_download()
            return

        dl_photos = self.chk_photos.isChecked()
        dl_videos = self.chk_videos.isChecked()
        if not dl_photos and not dl_videos:
            QMessageBox.warning(self, "Cảnh báo", "Vui lòng tích chọn tải Ảnh hoặc Video!")
            return

        slug = downloader.extract_creator_slug(self.url_input.text())
        creator_out_dir = os.path.join(self.txt_out_dir.text().strip(), slug)
        limit = self.spin_limit.value()
        quality = self.combo_quality.currentData() or "720p"
        p_threads = self.spin_p_threads.value()
        v_threads = self.spin_v_threads.value()

        max_active_threads = max(p_threads if dl_photos else 0, v_threads if dl_videos else 0)
        self.setup_threads_table(max(1, max_active_threads))

        self.btn_download.setEnabled(False)
        self.btn_scan.setEnabled(False)
        self.btn_check_files.setEnabled(False)
        self.btn_check_quick.setEnabled(False)
        self.btn_stop.setEnabled(True)

        self.progress_bar_overall.setValue(0)

        self.download_thread = DownloadWorker(
            self.photos_list, self.videos_list, creator_out_dir,
            dl_photos, dl_videos, limit,
            quality=quality,
            photo_threads=p_threads, video_threads=v_threads
        )
        self.download_thread.log.connect(self.append_log)
        self.download_thread.overall_progress.connect(self.on_overall_progress)
        self.download_thread.slot_started.connect(self.on_slot_started)
        self.download_thread.slot_progress.connect(self.on_slot_progress)
        self.download_thread.slot_finished.connect(self.on_slot_finished)
        self.download_thread.total_speed_update.connect(self.on_total_speed_update)
        self.download_thread.finished.connect(self.on_download_finished)
        self.download_thread.error.connect(self.on_download_error)
        self.download_thread.start()

    def auto_scan_and_download(self):
        url = self.url_input.text().strip()
        if not url:
            QMessageBox.warning(self, "Cảnh báo", "Vui lòng nhập URL Creator!")
            return

        self.current_slug = downloader.extract_creator_slug(url)
        self.btn_scan.setEnabled(False)
        self.btn_check_files.setEnabled(False)
        self.btn_check_quick.setEnabled(False)
        self.btn_download.setEnabled(False)
        self.btn_stop.setEnabled(True)

        self.scan_thread = ScanWorker(self.current_slug)
        self.scan_thread.progress.connect(self.append_log)
        self.scan_thread.finished.connect(self.on_auto_scan_done)
        self.scan_thread.error.connect(self.on_scan_error)
        self.scan_thread.start()

    def on_auto_scan_done(self, meta, photos, videos):
        self.on_scan_finished(meta, photos, videos)
        self.start_download()

    def on_overall_progress(self, current, total, item_name):
        percent = int((current / total) * 100) if total > 0 else 0
        self.progress_bar_overall.setValue(percent)
        self.progress_bar_overall.setFormat(f"{percent}%")
        self.lbl_overall_info.setText(f"{current}/{total} mục ({percent}%)")

    def on_download_finished(self, succ_p, tot_p, succ_v, tot_v):
        self.btn_download.setEnabled(True)
        self.btn_scan.setEnabled(True)
        self.btn_check_files.setEnabled(True)
        self.btn_check_quick.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.lbl_speed_badge.setText("⚡ Tổng tốc độ: 0 B/s")

        slug = downloader.extract_creator_slug(self.url_input.text())
        folder = os.path.join(self.txt_out_dir.text().strip(), slug)

        if self.chk_auto_upload.isChecked():
            self.append_log("[*] Tùy chọn 'Tự động tải lên Google Drive' được bật -> Đang khởi chạy tải lên...")
            self.start_drive_upload()

        res = QMessageBox.information(
            self,
            "Thành công!",
            f"🎉 Đã hoàn tất phiên tải!\n\n"
            f"• Ảnh: {succ_p}/{tot_p} thành công\n"
            f"• Video: {succ_v}/{tot_v} thành công\n\n"
            f"Thư mục lưu: {folder}\n\n"
            f"Bạn có muốn mở thư mục ngay bây giờ?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.Yes
        )
        if res == QMessageBox.StandardButton.Yes:
            self.open_output_folder()

    def on_download_error(self, err_msg):
        self.append_log(f"[!] Lỗi: {err_msg}")
        self.btn_download.setEnabled(True)
        self.btn_scan.setEnabled(True)
        self.btn_check_files.setEnabled(True)
        self.btn_check_quick.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.lbl_speed_badge.setText("⚡ Tổng tốc độ: 0 B/s")
        QMessageBox.critical(self, "Lỗi tải", err_msg)

    def connect_google_drive(self):
        remote = self.txt_drive_remote.text().strip() or "gg"
        self.append_log(f"[*] Đang mở cửa sổ ủy quyền Google Drive cho remote '{remote}'...")
        py_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "connect_drive.py"))
        rc = downloader.get_rclone_path()
        try:
            import subprocess
            subprocess.Popen(["cmd.exe", "/c", "start", "cmd", "/k", f'"{rc}" config reconnect {remote}:'], shell=True)
            self.append_log(f"[i] Cửa sổ xác thực đã được mở. Trình duyệt web sẽ tự động mở lên để bạn đăng nhập Google.")
        except Exception as e:
            self.append_log(f"[!] Không thể mở cửa sổ kết nối: {e}")

    def refresh_drive_info(self):
        remote = self.txt_drive_remote.text().strip() or "gg"
        self.lbl_drive_conn.setText("Trạng thái: ⏳ Đang kiểm tra...")
        self.lbl_drive_conn.setStyleSheet("background-color: #242938; color: #8b949e; border: 1px solid #373e54;")
        self.btn_refresh_drive.setEnabled(False)

        self.drive_info_thread = DriveInfoWorker(remote)
        self.drive_info_thread.finished.connect(self.on_drive_info_loaded)
        self.drive_info_thread.start()

    def on_drive_info_loaded(self, info):
        self.btn_refresh_drive.setEnabled(True)
        status = info.get("status", "not_connected")
        status_text = info.get("status_text", "Chưa kết nối")
        email = info.get("email", "--")
        name = info.get("name", "--")
        used_str = info.get("used_str", "--")
        total_str = info.get("total_str", "--")
        free_str = info.get("free_str", "--")
        pct = info.get("percent_used", 0.0)
        enable_url = info.get("enable_url", "")
        self.drive_enable_url = enable_url

        if status == "connected":
            self.lbl_drive_conn.setText("🟢 Trạng thái: Đã kết nối")
            self.lbl_drive_conn.setStyleSheet("background-color: #1e3328; color: #2ed573; border: 1px solid #2ed573;")

            user_display = f"👤 Tài khoản: {email}" if email != "--" else "👤 Tài khoản: Google Drive"
            if name and name != "--":
                user_display += f" ({name})"
            self.lbl_drive_account.setText(user_display)
            self.lbl_drive_account.setStyleSheet("background-color: #1a2736; color: #58a6ff; border: 1px solid #58a6ff;")

            self.lbl_drive_quota.setText(f"💾 Dung lượng: {used_str} / {total_str} (Trống: {free_str})")
            self.lbl_drive_quota.setStyleSheet("background-color: #2d1f3b; color: #a55eea; border: 1px solid #a55eea;")

            self.lbl_quota_hint.setText(f"Đã sử dụng: {pct}% ({used_str} / {total_str})")
            self.progress_bar_quota.setValue(int(pct))
            self.progress_bar_quota.setFormat(f"{pct}%")
            self.btn_enable_api.setVisible(False)

        elif status == "api_disabled":
            self.lbl_drive_conn.setText("🟡 Trạng thái: Cần bật Drive API")
            self.lbl_drive_conn.setStyleSheet("background-color: #3b2c14; color: #f1c40f; border: 1px solid #f1c40f;")
            self.lbl_drive_account.setText("👤 Tài khoản: Đã cấp quyền OAuth")
            self.lbl_drive_quota.setText("💾 Dung lượng: Cần bật API để đọc")
            self.btn_enable_api.setVisible(True)
            self.lbl_quota_hint.setText("⚠️ Hãy bấm 'Bật Google Drive API' để kích hoạt quyền trên Google Cloud")
            self.progress_bar_quota.setValue(0)
            self.progress_bar_quota.setFormat("Chưa bật API")

        else:
            self.lbl_drive_conn.setText(f"🔴 Trạng thái: {status_text}")
            self.lbl_drive_conn.setStyleSheet("background-color: #3a1c1c; color: #ff6b6b; border: 1px solid #ff6b6b;")
            self.lbl_drive_account.setText("👤 Tài khoản: Chưa đăng nhập")
            self.lbl_drive_quota.setText("💾 Dung lượng: --")
            self.btn_enable_api.setVisible(False)
            self.lbl_quota_hint.setText("Chưa kết nối Google Drive")
            self.progress_bar_quota.setValue(0)
            self.progress_bar_quota.setFormat("0%")

    def open_enable_api_url(self):
        url = self.drive_enable_url or "https://console.developers.google.com/apis/api/drive.googleapis.com/overview"
        import webbrowser
        self.append_log(f"[*] Đang mở trang bật Google Drive API: {url}")
        webbrowser.open(url)

    def browse_drive_source(self):
        folder = QFileDialog.getExistingDirectory(self, "Chọn thư mục nguồn máy tính cần tải lên Google Drive", self.txt_drive_source.text())
        if folder:
            self.txt_drive_source.setText(os.path.normpath(folder))

    def open_drive_source(self):
        folder = self.txt_drive_source.text().strip()
        if os.path.exists(folder):
            import subprocess
            subprocess.Popen(f'explorer "{os.path.abspath(folder)}"')
        else:
            QMessageBox.warning(self, "Không tìm thấy", f"Thư mục không tồn tại:\n{folder}")

    def start_drive_upload(self):
        remote = self.txt_drive_remote.text().strip() or "gg"
        drive_folder = self.txt_drive_folder.text().strip() or "18TUBE"

        # Lấy từ ô thư mục nguồn máy tính
        local_dir = self.txt_drive_source.text().strip()
        if not local_dir:
            slug = downloader.extract_creator_slug(self.url_input.text().strip())
            local_dir = os.path.join(self.txt_out_dir.text().strip(), slug)

        if not os.path.exists(local_dir):
            if os.path.exists(self.txt_out_dir.text().strip()):
                local_dir = self.txt_out_dir.text().strip()
            else:
                QMessageBox.warning(self, "Chưa có file", f"Không tìm thấy thư mục file để tải lên:\n{local_dir}\nHãy kiểm tra lại đường dẫn thư mục nguồn!")
                return

        # Kiểm tra ủy quyền remote
        ok_auth, auth_msg = downloader.check_rclone_remote_auth(remote)
        if not ok_auth:
            res = QMessageBox.question(
                self,
                "Chưa kết nối Google Drive",
                f"Tài khoản Google Drive cho remote '{remote}' chưa được xác thực hoặc chưa sẵn sàng.\n\n"
                f"Chi tiết: {auth_msg}\n\n"
                f"Bạn có muốn mở cửa sổ đăng nhập Google Drive ngay bây giờ không?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.Yes
            )
            if res == QMessageBox.StandardButton.Yes:
                self.connect_google_drive()
            return

        folder_basename = os.path.basename(os.path.normpath(local_dir))
        dest_path = f"{drive_folder}/{folder_basename}".strip("/")
        self.append_log(f"[*] Bắt đầu tải lên Google Drive: '{local_dir}' -> '{remote}:{dest_path}'")
        self.btn_upload_drive.setEnabled(False)
        self.btn_auth_drive.setEnabled(False)
        self.btn_stop.setEnabled(True)
        self.progress_bar_drive.setValue(0)
        self.progress_bar_drive.setFormat("0%")
        self.lbl_drive_status.setText(f"Đang tải lên '{remote}:{dest_path}'...")
        self.lbl_drive_speed.setText("⚡ 0 B/s")
        self.lbl_drive_transferred.setText("📦 Đang kết nối...")
        self.lbl_drive_eta.setText("⏳ Đang tính...")

        # Chuyển sang Tab 2 (Google Drive) để người dùng theo dõi
        self.tabs.setCurrentIndex(1)

        self.upload_thread = UploadDriveWorker(local_dir, remote_name=remote, drive_folder=dest_path)
        self.upload_thread.progress.connect(self.on_drive_progress)
        self.upload_thread.log.connect(self.append_log)
        self.upload_thread.finished.connect(self.on_drive_finished)
        self.upload_thread.start()

    def on_drive_progress(self, pct, spd, tf, eta, files=""):
        self.progress_bar_drive.setValue(pct)
        self.progress_bar_drive.setFormat(f"{pct}%")
        status_txt = f"Đang truyền tải: {pct}%" if (pct > 0 or spd or tf) else "Đang khởi tạo kết nối..."
        self.lbl_drive_status.setText(status_txt)
        if spd:
            self.lbl_drive_speed.setText(f"⚡ {spd}")
        if tf:
            display_tf = f"📦 {tf}"
            if files:
                display_tf += f" ({files} file)"
            self.lbl_drive_transferred.setText(display_tf)
        elif files:
            self.lbl_drive_transferred.setText(f"📦 {files} file")
        if eta:
            self.lbl_drive_eta.setText(f"⏳ Còn lại: {eta}")

    def on_drive_finished(self, success, msg):
        self.btn_upload_drive.setEnabled(True)
        self.btn_auth_drive.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.lbl_drive_speed.setText("⚡ 0 B/s")
        if success:
            self.progress_bar_drive.setValue(100)
            self.progress_bar_drive.setFormat("100% Hoàn tất")
            self.lbl_drive_status.setText("✅ Tải lên Google Drive thành công!")
            self.lbl_drive_transferred.setText("📦 Hoàn tất 100%")
            self.lbl_drive_eta.setText("⏳ 0s")
            self.refresh_drive_info()
            QMessageBox.information(self, "Đồng bộ Drive thành công", f"🎉 {msg}")
        else:
            self.lbl_drive_status.setText(f"❌ {msg}")
            if "Đã hủy" not in msg:
                QMessageBox.warning(self, "Lỗi tải lên Drive", msg)

    def stop_action(self):
        if self.scan_thread and self.scan_thread.isRunning():
            self.scan_thread.cancel()
        if self.check_thread and self.check_thread.isRunning():
            self.check_thread.cancel()
        if self.download_thread and self.download_thread.isRunning():
            self.download_thread.cancel()
        if hasattr(self, 'batch_thread') and self.batch_thread and self.batch_thread.isRunning():
            self.batch_thread.cancel()
        if self.upload_thread and self.upload_thread.isRunning():
            self.upload_thread.cancel()
        self.btn_download.setEnabled(True)
        self.btn_scan.setEnabled(True)
        self.btn_check_files.setEnabled(True)
        self.btn_check_quick.setEnabled(True)
        self.radio_mode_single.setEnabled(True)
        self.radio_mode_batch.setEnabled(True)
        self.btn_upload_drive.setEnabled(True)
        self.btn_auth_drive.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.lbl_speed_badge.setText("⚡ Tổng tốc độ: 0 B/s")

    def launch_web_online(self):
        """Khởi động Deploy Web Online qua Cloudflare Tunnel."""
        bat_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "deploy_online.bat")
        self.append_log("[*] Đang khởi động tiến trình Deploy Web Online qua Cloudflare Tunnel...")
        if os.path.exists(bat_path):
            os.system(f'start "" "{bat_path}"')
        else:
            py_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "deploy_tunnel.py")
            os.system(f'start cmd /k python "{py_path}"')

def launch_gui():
    app = QApplication(sys.argv)
    app.setStyleSheet(ModernDarkStyle.STYLESHEET)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    launch_gui()

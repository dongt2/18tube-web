"""
sync_drive_index.py
Công cụ đồng bộ nhanh số liệu thống kê Google Drive vào web/drive_index.json.
Giúp Web trên Render luôn hiển thị số liệu mới nhất mà không tốn tài nguyên server.
"""

import os
import sys
import json
import sqlite3
import zlib

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def format_bytes(size):
    if not size or size <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    s = float(size)
    while s >= 1024.0 and i < len(units) - 1:
        s /= 1024.0
        i += 1
    return f"{s:.2f} {units[i]}"

def main():
    print("=" * 60)
    print("18TUBE - ĐỒNG BỘ DỮ LIỆU INDEX DRIVE CHO WEB")
    print("=" * 60)

    db_path = os.path.abspath(".drive_cache.db")
    if not os.path.exists(db_path):
        print(f"[!] Không tìm thấy database {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # 1. Đọc hierarchy từ cache
    cur.execute("SELECT value FROM cache WHERE key = 'drive_creators_list_v3'")
    hier_row = cur.fetchone()
    
    hierarchy = {}
    if hier_row:
        try:
            raw_d = json.loads(zlib.decompress(hier_row[0]).decode("utf-8"))
            hierarchy = raw_d.get("data", raw_d) if isinstance(raw_d, dict) else raw_d
        except Exception:
            pass

    creators_list = hierarchy.get("creators", []) if isinstance(hierarchy, dict) else []
    countries = hierarchy.get("countries", []) if isinstance(hierarchy, dict) else []

    # Nếu cache rỗng, đọc từ web/drive_index.json hiện tại
    if not creators_list:
        old_seed_path = os.path.abspath("web/drive_index.json")
        if os.path.exists(old_seed_path):
            try:
                with open(old_seed_path, "r", encoding="utf-8") as f:
                    old_seed = json.load(f)
                    old_h = old_seed.get("hierarchy", {})
                    creators_list = old_h.get("creators", [])
                    countries = old_h.get("countries", [])
            except Exception:
                pass

    # 2. Đọc tất cả thống kê creator
    cur.execute("SELECT key, value FROM cache WHERE key LIKE 'drive_stat_%'")
    stat_rows = cur.fetchall()
    stats_map = {}
    for k, v in stat_rows:
        try:
            s = json.loads(zlib.decompress(v).decode("utf-8"))
            s_data = s.get("data", s) if isinstance(s, dict) else s
            stats_map[k.replace("drive_stat_", "")] = s_data
        except Exception:
            pass

    # Nếu stat_rows ít, đọc thêm từ drive_creator_items_%
    cur.execute("SELECT key, value FROM cache WHERE key LIKE 'drive_creator_items_%' AND key != 'drive_creator_items_all'")
    item_rows = cur.fetchall()
    for k, v in item_rows:
        try:
            wrapper = json.loads(zlib.decompress(v).decode("utf-8"))
            cdata = wrapper.get("data", wrapper) if isinstance(wrapper, dict) else wrapper
            if isinstance(cdata, dict):
                slug = cdata.get("slug") or ""
                name = cdata.get("name") or ""
                raw_k = k.replace("drive_creator_items_", "")
                p_cnt = cdata.get("photos_count", len(cdata.get("photos", [])))
                v_cnt = cdata.get("videos_count", len(cdata.get("videos", [])))
                t_sz = cdata.get("total_size", 0)
                st = {
                    "photos_count": p_cnt,
                    "videos_count": v_cnt,
                    "total_files": p_cnt + v_cnt,
                    "total_size": t_sz,
                    "total_size_str": format_bytes(t_sz)
                }
                if slug and (slug not in stats_map or stats_map[slug].get("total_files", 0) < st["total_files"]):
                    stats_map[slug] = st
                if name and (name not in stats_map or stats_map[name].get("total_files", 0) < st["total_files"]):
                    stats_map[name] = st
                if raw_k and (raw_k not in stats_map or stats_map[raw_k].get("total_files", 0) < st["total_files"]):
                    stats_map[raw_k] = st
        except Exception:
            pass

    # 3. Tổng hợp
    tot_files = 0
    tot_photos = 0
    tot_videos = 0
    tot_size = 0
    merged_creators = []

    for c in creators_list:
        slug = c.get("slug", "")
        name = c.get("name", "")
        st = stats_map.get(slug) or stats_map.get(name) or (stats_map.get(slug.split("/")[-1]) if "/" in slug else None)
        
        p_cnt = c.get("photos_count", 0)
        v_cnt = c.get("videos_count", 0)
        t_sz = c.get("total_size", 0)

        if st:
            if st["total_files"] > (p_cnt + v_cnt):
                p_cnt = st["photos_count"]
                v_cnt = st["videos_count"]
                t_sz = st["total_size"]

        t_files = p_cnt + v_cnt
        tot_files += t_files
        tot_photos += p_cnt
        tot_videos += v_cnt
        tot_size += t_sz

        item = dict(c)
        item["photos_count"] = p_cnt
        item["videos_count"] = v_cnt
        item["total_files"] = t_files
        item["total_size"] = t_sz
        item["total_size_str"] = format_bytes(t_sz)
        merged_creators.append(item)

    merged_creators.sort(key=lambda x: (x.get("country") != "Việt Nam", (x.get("country") or "").lower(), x["name"].lower()))

    summary_all = {
        "total_creators": len(merged_creators),
        "total_files": tot_files,
        "total_photos": tot_photos,
        "total_videos": tot_videos,
        "total_size": tot_size,
        "total_size_str": format_bytes(tot_size),
        "creators": merged_creators
    }

    hierarchy_payload = {
        "creators": merged_creators,
        "countries": countries
    }

    final_seed = {
        "summary_all": summary_all,
        "hierarchy": hierarchy_payload,
        "creator_stats": stats_map
    }

    out_path = os.path.abspath("web/drive_index.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(final_seed, f, ensure_ascii=False, indent=2)

    sz_kb = os.path.getsize(out_path) / 1024
    print(f"[+] Đã cập nhật thành công: {out_path} ({sz_kb:.1f} KB)")
    print(f"    - Tổng Creator: {len(merged_creators)}")
    print(f"    - Tổng Files: {tot_files:,} ({tot_photos:,} Ảnh / {tot_videos:,} Video)")
    print(f"    - Tổng Dung Lượng: {format_bytes(tot_size)}")
    print("=" * 60)
    print("Mẹo: Để đưa số liệu mới này lên Render, bạn chỉ cần chạy:")
    print("     git add web/drive_index.json")
    print("     git commit -m 'update index'")
    print("     git push origin main")
    print("=" * 60)

if __name__ == "__main__":
    main()

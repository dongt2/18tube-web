# -*- coding: utf-8 -*-
"""
WSGI / Cloud Entrypoint Alias for 18TUBE Web App
"""
import os
import downloader
from web_server import app

try:
    downloader.init_cloud_rclone_config()
except Exception:
    pass

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"==================================================")
    print(f" 🚀 18TUBE CLOUD RUNTIME READY (PORT: {port})")
    print(f" 🌐 Access Gallery: http://0.0.0.0:{port}/gallery")
    print(f"==================================================")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)


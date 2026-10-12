# -*- coding: utf-8 -*-
"""
WSGI / Cloud Entrypoint Alias for 18TUBE Web App
"""
import os
from web_server import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)

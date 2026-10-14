FROM python:3.11-slim

# Cài đặt các gói hệ thống cần thiết và Rclone
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    unzip \
    && curl -fsSL https://rclone.org/install.sh | bash \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cài đặt thư viện Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Sao chép mã nguồn ứng dụng
COPY . .

# Phân quyền thực thi cho entrypoint
RUN chmod +x entrypoint.sh

ENV PORT=5000
EXPOSE 5000

ENTRYPOINT ["./entrypoint.sh"]

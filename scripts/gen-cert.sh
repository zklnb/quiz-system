#!/usr/bin/env bash
# (Tuỳ chọn) Sinh chứng chỉ tự ký thủ công. Mặc định service cert-gen trong docker-compose đã làm việc này.
set -euo pipefail
mkdir -p certs
openssl req -x509 -nodes -newkey rsa:2048 -days 365 -keyout certs/server.key -out certs/server.crt \
  -subj "/C=VN/O=Quiz System/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
chmod 600 certs/server.key

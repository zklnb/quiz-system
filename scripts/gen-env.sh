#!/usr/bin/env bash
# Sinh file .env với mật khẩu ngẫu nhiên mạnh + COMPOSE_FILE theo các file compose hiện có.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then echo ".env đã tồn tại, không ghi đè."; exit 0; fi
rand() { openssl rand -base64 36 | tr -dc 'A-Za-z0-9' | head -c "${1:-24}"; }
cp .env.example .env
sed -i "s|^MYSQL_ROOT_PASSWORD=.*|MYSQL_ROOT_PASSWORD=$(rand 24)|" .env
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(rand 24)|" .env
sed -i "s|^EXPORTER_DB_PASSWORD=.*|EXPORTER_DB_PASSWORD=$(rand 24)|" .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(rand 48)|" .env
sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$(rand 16)|" .env
sed -i "s|^GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=$(rand 16)|" .env
files="docker-compose.yml"
for f in docker-compose.monitoring.yml docker-compose.logging.yml; do [ -f "$f" ] && files="$files:$f"; done
echo "COMPOSE_FILE=$files" >> .env
chmod 600 .env
echo "Đã tạo .env (quyền 600). Mật khẩu admin web / Grafana xem trong file .env"

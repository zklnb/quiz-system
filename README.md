# Hệ thống Quiz / Thi trắc nghiệm (Đề 35)

Môn: **Triển khai và Quản trị Hệ thống Phần mềm**. Toàn bộ hệ thống triển khai bằng **Docker Compose**.

| Thành phần | Công nghệ | Truy cập |
|---|---|---|
| Website Quiz | Node.js (Express + EJS) | https://localhost |
| Cơ sở dữ liệu | MySQL 8.0 | (mạng nội bộ, không publish) |
| Công cụ quản lý DB | phpMyAdmin | http://127.0.0.1:8081 |
| Reverse proxy | Nginx (HTTPS tự ký + security headers) | cổng 80 / 443 |
| Giám sát | Prometheus + Grafana + cAdvisor + exporters | http://127.0.0.1:9090 , http://127.0.0.1:3000 |
| Log tập trung | Loki + Promtail | xem qua Grafana → Explore |

## 1. Yêu cầu
- Docker Engine ≥ 24 và Docker Compose v2 (`docker compose version`)
- Linux / WSL2 / macOS. Cổng 80, 443 chưa bị chiếm (nếu bị chiếm, sửa `HTTP_PORT`, `HTTPS_PORT` trong `.env`).

## 2. Chạy hệ thống
```bash
git clone https://github.com/<MSSV>/quiz-system.git
cd quiz-system
./scripts/gen-env.sh        # sinh .env với mật khẩu ngẫu nhiên mạnh
docker compose up -d --build
docker compose ps           # chờ các service healthy
./scripts/verify.sh         # kiểm tra nhanh toàn hệ thống
```
Xem mật khẩu quản trị: `grep -E "ADMIN_PASSWORD|GRAFANA_ADMIN" .env`

- Website: https://localhost (trình duyệt cảnh báo chứng chỉ tự ký → chọn *Tiếp tục*)
- Admin web: `admin` / giá trị `ADMIN_PASSWORD`
- phpMyAdmin: http://127.0.0.1:8081 — đăng nhập `quizapp` / `DB_PASSWORD` (hoặc `root` / `MYSQL_ROOT_PASSWORD`)
- Grafana: http://127.0.0.1:3000 — `admin` / `GRAFANA_ADMIN_PASSWORD` → Dashboards → *Quiz System - Tổng quan*
- Dừng: `docker compose down` (giữ dữ liệu). Xoá cả dữ liệu: `docker compose down -v`

> Demo từ máy khác: đặt `BIND_ADDR=0.0.0.0` trong `.env` rồi `docker compose up -d`.

## 3. Cấu trúc thư mục
```
quiz-system/
├── docker-compose.yml             # app + MySQL + phpMyAdmin + Nginx
├── docker-compose.monitoring.yml  # Prometheus + Grafana + exporters
├── docker-compose.logging.yml     # Loki + Promtail
├── app/                           # mã nguồn website (Dockerfile non-root)
├── db/                            # schema, dữ liệu mẫu, phân quyền DB
├── nginx/                         # reverse proxy, HTTPS, security headers
├── prometheus/  grafana/  loki/  promtail/
├── scripts/                       # gen-env, verify, firewall, gen-cert
└── docs/screenshots/              # ảnh minh chứng cho báo cáo
```
Các file compose được gộp tự động nhờ biến `COMPOSE_FILE` trong `.env` (do `gen-env.sh` tạo).

## 4. Truy vấn LogQL (Grafana → Explore → datasource Loki)
```logql
# 1) Lỗi HTTP 4xx/5xx của Nginx
{service="nginx"} |~ "status=[45][0-9][0-9]"

# 2) Đăng nhập thất bại của ứng dụng (log JSON)
{service="webapp"} | json | event="login_failed"

# 3) Lỗi/ngoại lệ trong mọi container
{job=~".+"} |~ "(?i)(error|exception|failed)"

# 4) Tốc độ log Nginx theo phút
sum(rate({service="nginx"}[1m]))

# 5) Số bài thi đã nộp trong 1 giờ
count_over_time({service="webapp"} | json | event="quiz_submitted" [1h])
```

## 5. Các biện pháp hardening
1. Container chạy **non-root** (`USER node`, `nginx-unprivileged`, Prometheus/Grafana/Loki mặc định non-root).
2. **Network isolation**: `backend` là `internal: true`, MySQL chỉ nằm ở mạng này và **không publish cổng**.
3. **Mật khẩu mạnh**: sinh ngẫu nhiên bằng `openssl`, lưu trong `.env` (chmod 600, đã `.gitignore`); mật khẩu người dùng băm bằng bcrypt.
4. **Hạn chế quyền DB**: user ứng dụng chỉ có `SELECT/INSERT/UPDATE/DELETE`; user exporter chỉ có quyền giám sát.
5. **Security headers Nginx**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, HSTS, CSP, Referrer-Policy, Permissions-Policy; ẩn phiên bản Nginx; chặn `/metrics`.
6. **Rate limiting** đăng nhập (10 req/phút/IP) chống brute-force.
7. Container: `read_only`, `cap_drop: ALL`, `no-new-privileges`, giới hạn RAM; công cụ quản trị chỉ bind `127.0.0.1`.
8. Firewall host: `sudo ./scripts/firewall.sh` (UFW chỉ mở 22/80/443).

## 6. Kế hoạch commit (đặt tên tài khoản GitHub theo MSSV)
```bash
git init && git branch -M main
git remote add origin https://github.com/<MSSV>/quiz-system.git

# Commit 1: ứng dụng + DB + phpMyAdmin + Nginx reverse proxy (HTTPS, security headers)
git add .gitignore .env.example docker-compose.yml app db nginx scripts
git commit -m "feat: web quiz + MySQL + phpMyAdmin + Nginx reverse proxy (HTTPS, security headers)"

# Commit 2: Prometheus + Grafana
git add docker-compose.monitoring.yml prometheus grafana
git commit -m "feat: monitoring Prometheus + Grafana (cAdvisor, nginx/mysql exporters, dashboard)"

# Commit 3: Loki + Promtail + hardening + tài liệu
git add docker-compose.logging.yml loki promtail docs README.md
git commit -m "feat: centralized logging, hardening, and documentation"
git push -u origin main
```
> Sau commit 1, kiểm thử riêng bằng: `docker compose -f docker-compose.yml up -d --build`.

## 7. Kịch bản demo (≈ 7 phút)
1. `docker compose ps` — tất cả healthy. Mở https://localhost, HTTP tự chuyển sang HTTPS.
2. Đăng ký tài khoản sinh viên → làm bài "Docker & DevOps cơ bản" → nộp → xem điểm/đáp án.
3. Đăng nhập admin → tạo bài thi mới, thêm câu hỏi.
4. phpMyAdmin: mở bảng `attempts`, thấy bản ghi vừa nộp.
5. `curl -skI https://localhost` → chỉ ra các security header; `curl -sk https://localhost/metrics` → 404.
6. Grafana dashboard: CPU/RAM container, request Nginx, MySQL, bài thi đã nộp.
7. Grafana Explore (Loki): chạy 3 truy vấn LogQL; cố tình đăng nhập sai để thấy `login_failed`.
8. Hardening: `docker exec quiz-webapp id` (uid 1000), `docker network inspect quiz-system_backend` (Internal: true), `docker port quiz-mysql` (rỗng), mô tả quyền DB.

## 8. Xử lý sự cố
| Hiện tượng | Cách xử lý |
|---|---|
| Cổng 80/443 bị chiếm | Đổi `HTTP_PORT`/`HTTPS_PORT` trong `.env` |
| `thiếu ...` khi up | Chưa tạo `.env` → chạy `./scripts/gen-env.sh` |
| MySQL đổi mật khẩu không có tác dụng | Dữ liệu cũ còn trong volume: `docker compose down -v` rồi up lại |
| Dashboard container trống (Docker Desktop/WSL) | cAdvisor chỉ đầy đủ trên Linux; kiểm tra bằng Prometheus targets |
| Loki không có log | `docker compose logs promtail`; kiểm tra socket `/var/run/docker.sock` |

#!/usr/bin/env bash
# Kiểm tra nhanh toàn hệ thống sau khi chạy docker compose up -d
cd "$(dirname "$0")/.."
set +e
ok(){ echo "  [OK]   $1"; }; bad(){ echo "  [FAIL] $1"; }
echo "== Container =="; docker compose ps
echo "== HTTPS =="
curl -skI https://localhost/ | head -1 | grep -q 200 && ok "https://localhost trả 200" || bad "https://localhost"
curl -sI http://localhost/ | head -1 | grep -q 301 && ok "HTTP chuyển hướng 301 -> HTTPS" || bad "HTTP redirect"
echo "== Security headers =="
for h in X-Frame-Options X-Content-Type-Options X-XSS-Protection Strict-Transport-Security Content-Security-Policy; do
  curl -skI https://localhost/ | grep -qi "^$h" && ok "$h" || bad "$h"
done
echo "== /metrics bị chặn ngoài Nginx =="
[ "$(curl -sk -o /dev/null -w '%{http_code}' https://localhost/metrics)" = "404" ] && ok "/metrics -> 404" || bad "/metrics lộ ra ngoài"
echo "== Non-root =="
for c in quiz-webapp quiz-nginx; do echo "  $c: $(docker exec $c id -u 2>/dev/null) (khác 0 là đúng)"; done
echo "== Prometheus targets =="
curl -s http://127.0.0.1:${PROMETHEUS_PORT:-9090}/api/v1/targets | grep -o '"health":"[a-z]*"' | sort | uniq -c
echo "== MySQL không publish ra host =="
docker port quiz-mysql 2>/dev/null | grep -q . && bad "MySQL đang publish cổng" || ok "MySQL không có cổng publish"

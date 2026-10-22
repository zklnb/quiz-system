-- Dữ liệu mẫu: 1 bài thi về Docker & DevOps
SET NAMES utf8mb4;
INSERT INTO quizzes (id, title, description, duration_minutes) VALUES
 (1, 'Docker & DevOps cơ bản', 'Kiểm tra kiến thức nền tảng về Docker, Nginx, giám sát và log tập trung.', 10);
INSERT INTO questions (quiz_id, content, option_a, option_b, option_c, option_d, correct_option) VALUES
 (1, 'Lệnh nào khởi chạy toàn bộ dịch vụ trong docker-compose.yml ở chế độ nền?', 'docker compose run', 'docker compose up -d', 'docker compose build -d', 'docker start all', 'B'),
 (1, 'Vai trò chính của Nginx trong hệ thống này là gì?', 'Cơ sở dữ liệu', 'Reverse proxy', 'Thu thập log', 'Chấm điểm bài thi', 'B'),
 (1, 'Prometheus thu thập dữ liệu theo cơ chế nào?', 'Push từ ứng dụng', 'Pull (scrape) qua HTTP', 'Đọc file log', 'Gửi email', 'B'),
 (1, 'Grafana dùng để làm gì?', 'Trực quan hoá dữ liệu giám sát', 'Lưu trữ mã nguồn', 'Biên dịch ứng dụng', 'Cấp chứng chỉ SSL', 'A'),
 (1, 'Loki khác Elasticsearch ở điểm nào?', 'Index toàn bộ nội dung log', 'Chỉ index nhãn (label), lưu log dạng nén', 'Không hỗ trợ truy vấn', 'Chỉ chạy trên Windows', 'B'),
 (1, 'Promtail có chức năng gì?', 'Đọc log và đẩy về Loki', 'Vẽ biểu đồ', 'Sao lưu database', 'Mã hoá mật khẩu', 'A'),
 (1, 'Biện pháp nào giúp hạn chế leo thang đặc quyền trong container?', 'Chạy bằng root', 'Chạy bằng user non-root', 'Mở mọi cổng', 'Tắt firewall', 'B'),
 (1, 'Header nào giúp chống Clickjacking?', 'X-Frame-Options', 'Accept-Language', 'Content-Length', 'Cache-Control', 'A'),
 (1, 'Docker network "internal: true" có tác dụng gì?', 'Tăng tốc mạng', 'Chặn container trong network đó ra/vào Internet', 'Tự động tạo SSL', 'Mở cổng 3306 ra ngoài', 'B'),
 (1, 'Truy vấn LogQL nào lọc log chứa chữ ERROR của service webapp?', '{service="webapp"} |= "ERROR"', 'SELECT * FROM logs', 'up{job="webapp"}', 'GET /logs?error', 'A');

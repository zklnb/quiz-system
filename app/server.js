'use strict';
/**
 * Hệ thống Quiz / Thi trắc nghiệm - Express + MySQL
 * - Đăng ký / đăng nhập (bcrypt + JWT trong cookie httpOnly)
 * - Admin: tạo bài thi, thêm/xoá câu hỏi
 * - Sinh viên: làm bài có đếm giờ, chấm điểm tự động, xem lịch sử
 * - /metrics (Prometheus), /health, log JSON ra stdout (Promtail -> Loki)
 */
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const client = require('prom-client');

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error('JWT_SECRET bắt buộc và phải >= 16 ký tự');
  process.exit(1);
}

/* ---------- Logging dạng JSON (dễ truy vấn bằng LogQL | json) ---------- */
function log(event, fields = {}, level = 'info') {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields }));
}

/* ---------- Prometheus metrics ---------- */
const register = new client.Registry();
client.collectDefaultMetrics({ register });
const httpCounter = new client.Counter({
  name: 'http_requests_total', help: 'Tổng số HTTP request',
  labelNames: ['method', 'route', 'status'], registers: [register],
});
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds', help: 'Thời gian xử lý request',
  labelNames: ['method', 'route'], buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5], registers: [register],
});
const submissionsCounter = new client.Counter({
  name: 'quiz_submissions_total', help: 'Số bài thi đã nộp', registers: [register],
});
const authFailCounter = new client.Counter({
  name: 'auth_failures_total', help: 'Số lần đăng nhập thất bại', registers: [register],
});

/* ---------- Kết nối DB (pool) ---------- */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});
const q = (sql, params = []) => pool.execute(sql, params).then(([rows]) => rows);

async function connectWithRetry(retries = 30) {
  for (let i = 1; i <= retries; i++) {
    try { await pool.query('SELECT 1'); log('db_connected'); return; }
    catch (e) { log('db_retry', { attempt: i, error: e.code || e.message }, 'warn'); await new Promise(r => setTimeout(r, 2000)); }
  }
  throw new Error('Không kết nối được MySQL');
}

async function bootstrapAdmin() {
  const admins = await q("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (admins.length) return;
  const u = process.env.ADMIN_USERNAME || 'admin';
  const p = process.env.ADMIN_PASSWORD;
  if (!p || p.length < 8) { log('admin_bootstrap_skipped', { reason: 'ADMIN_PASSWORD thiếu/yếu' }, 'warn'); return; }
  await q("INSERT INTO users (username, password_hash, role) VALUES (?,?, 'admin')", [u, await bcrypt.hash(p, 12)]);
  log('admin_created', { username: u });
}

/* ---------- App ---------- */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// Đo metrics cho mỗi request
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.baseUrl + req.route.path : 'static_or_404';
    httpCounter.inc({ method: req.method, route, status: res.statusCode });
    end({ method: req.method, route });
  });
  next();
});

// Xác thực: đọc JWT từ cookie
app.use((req, res, next) => {
  res.locals.user = null;
  const token = req.cookies.token;
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); res.locals.user = req.user; } catch (_) { res.clearCookie('token'); }
  }
  next();
});
const requireLogin = (req, res, next) => (req.user ? next() : res.redirect('/login'));
const requireAdmin = (req, res, next) =>
  req.user && req.user.role === 'admin' ? next() : res.status(403).render('error', { title: 'Từ chối truy cập', message: 'Bạn không có quyền admin.' });

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);
const setToken = (req, res, user) => {
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 2 * 3600 * 1000 });
};

/* ---------- Health & metrics ---------- */
app.get('/health', wrap(async (req, res) => { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }));
app.get('/metrics', wrap(async (req, res) => { res.set('Content-Type', register.contentType); res.end(await register.metrics()); }));

/* ---------- Trang công khai ---------- */
app.get('/', wrap(async (req, res) => {
  const quizzes = await q(`SELECT z.id, z.title, z.description, z.duration_minutes,
      (SELECT COUNT(*) FROM questions WHERE quiz_id = z.id) AS num_questions FROM quizzes z ORDER BY z.id DESC`);
  res.render('index', { title: 'Danh sách bài thi', quizzes });
}));

app.get('/register', (req, res) => res.render('register', { title: 'Đăng ký', error: null }));
app.post('/register', wrap(async (req, res) => {
  const { username = '', password = '' } = req.body;
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return res.status(400).render('register', { title: 'Đăng ký', error: 'Tên đăng nhập 3-30 ký tự (chữ, số, _).' });
  if (password.length < 8) return res.status(400).render('register', { title: 'Đăng ký', error: 'Mật khẩu tối thiểu 8 ký tự.' });
  const exist = await q('SELECT id FROM users WHERE username=?', [username]);
  if (exist.length) return res.status(400).render('register', { title: 'Đăng ký', error: 'Tên đăng nhập đã tồn tại.' });
  await q("INSERT INTO users (username, password_hash, role) VALUES (?,?, 'student')", [username, await bcrypt.hash(password, 12)]);
  log('user_registered', { username });
  res.redirect('/login');
}));

app.get('/login', (req, res) => res.render('login', { title: 'Đăng nhập', error: null }));
app.post('/login', wrap(async (req, res) => {
  const { username = '', password = '' } = req.body;
  const rows = await q('SELECT * FROM users WHERE username=?', [username]);
  const ok = rows.length && await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) {
    authFailCounter.inc();
    log('login_failed', { username, ip: req.ip }, 'warn');
    return res.status(401).render('login', { title: 'Đăng nhập', error: 'Sai tên đăng nhập hoặc mật khẩu.' });
  }
  setToken(req, res, rows[0]);
  log('login_success', { username, role: rows[0].role, ip: req.ip });
  res.redirect(rows[0].role === 'admin' ? '/admin' : '/');
}));
app.post('/logout', (req, res) => { res.clearCookie('token'); res.redirect('/'); });

/* ---------- Làm bài thi ---------- */
app.get('/quiz/:id(\\d+)', requireLogin, wrap(async (req, res) => {
  const [quiz] = await q('SELECT * FROM quizzes WHERE id=?', [req.params.id]);
  if (!quiz) return res.status(404).render('error', { title: '404', message: 'Không tìm thấy bài thi.' });
  const questions = await q('SELECT id, content, option_a, option_b, option_c, option_d FROM questions WHERE quiz_id=? ORDER BY id', [quiz.id]);
  res.render('quiz', { title: quiz.title, quiz, questions });
}));

app.post('/quiz/:id(\\d+)/submit', requireLogin, wrap(async (req, res) => {
  const [quiz] = await q('SELECT * FROM quizzes WHERE id=?', [req.params.id]);
  if (!quiz) return res.status(404).render('error', { title: '404', message: 'Không tìm thấy bài thi.' });
  const questions = await q('SELECT id, correct_option FROM questions WHERE quiz_id=?', [quiz.id]);
  let score = 0;
  const chosenList = questions.map(qs => {
    const c = String(req.body['q_' + qs.id] || '').toUpperCase();
    const chosen = ['A', 'B', 'C', 'D'].includes(c) ? c : null;
    if (chosen === qs.correct_option) score++;
    return { qid: qs.id, chosen };
  });
  const result = await pool.execute('INSERT INTO attempts (user_id, quiz_id, score, total) VALUES (?,?,?,?)',
    [req.user.id, quiz.id, score, questions.length]);
  const attemptId = result[0].insertId;
  for (const c of chosenList) await q('INSERT INTO attempt_answers (attempt_id, question_id, chosen_option) VALUES (?,?,?)', [attemptId, c.qid, c.chosen]);
  submissionsCounter.inc();
  log('quiz_submitted', { user: req.user.username, quiz_id: quiz.id, score, total: questions.length });
  res.redirect('/result/' + attemptId);
}));

app.get('/result/:id(\\d+)', requireLogin, wrap(async (req, res) => {
  const [attempt] = await q(`SELECT a.*, z.title FROM attempts a JOIN quizzes z ON z.id=a.quiz_id WHERE a.id=? AND (a.user_id=? OR ?='admin')`,
    [req.params.id, req.user.id, req.user.role]);
  if (!attempt) return res.status(404).render('error', { title: '404', message: 'Không tìm thấy kết quả.' });
  const details = await q(`SELECT qs.content, qs.option_a, qs.option_b, qs.option_c, qs.option_d, qs.correct_option, aa.chosen_option
      FROM attempt_answers aa JOIN questions qs ON qs.id=aa.question_id WHERE aa.attempt_id=? ORDER BY qs.id`, [attempt.id]);
  res.render('result', { title: 'Kết quả', attempt, details });
}));

app.get('/history', requireLogin, wrap(async (req, res) => {
  const rows = await q(`SELECT a.id, a.score, a.total, a.submitted_at, z.title FROM attempts a JOIN quizzes z ON z.id=a.quiz_id
      WHERE a.user_id=? ORDER BY a.id DESC`, [req.user.id]);
  res.render('history', { title: 'Lịch sử làm bài', rows });
}));

/* ---------- Admin ---------- */
app.get('/admin', requireLogin, requireAdmin, wrap(async (req, res) => {
  const quizzes = await q(`SELECT z.*, (SELECT COUNT(*) FROM questions WHERE quiz_id=z.id) AS num_questions,
      (SELECT COUNT(*) FROM attempts WHERE quiz_id=z.id) AS num_attempts FROM quizzes z ORDER BY z.id DESC`);
  const recent = await q(`SELECT a.score, a.total, a.submitted_at, u.username, z.title FROM attempts a
      JOIN users u ON u.id=a.user_id JOIN quizzes z ON z.id=a.quiz_id ORDER BY a.id DESC LIMIT 10`);
  res.render('admin', { title: 'Quản trị', quizzes, recent });
}));

app.post('/admin/quiz', requireLogin, requireAdmin, wrap(async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 200);
  const description = String(req.body.description || '').trim().slice(0, 1000);
  const duration = Math.min(Math.max(parseInt(req.body.duration_minutes, 10) || 15, 1), 180);
  if (!title) return res.redirect('/admin');
  const r = await pool.execute('INSERT INTO quizzes (title, description, duration_minutes, created_by) VALUES (?,?,?,?)', [title, description, duration, req.user.id]);
  log('quiz_created', { by: req.user.username, title });
  res.redirect('/admin/quiz/' + r[0].insertId);
}));

app.get('/admin/quiz/:id(\\d+)', requireLogin, requireAdmin, wrap(async (req, res) => {
  const [quiz] = await q('SELECT * FROM quizzes WHERE id=?', [req.params.id]);
  if (!quiz) return res.status(404).render('error', { title: '404', message: 'Không tìm thấy bài thi.' });
  const questions = await q('SELECT * FROM questions WHERE quiz_id=? ORDER BY id', [quiz.id]);
  res.render('admin_quiz', { title: 'Quản lý: ' + quiz.title, quiz, questions });
}));

app.post('/admin/quiz/:id(\\d+)/question', requireLogin, requireAdmin, wrap(async (req, res) => {
  const b = req.body;
  const correct = String(b.correct_option || '').toUpperCase();
  if (!b.content || !b.option_a || !b.option_b || !b.option_c || !b.option_d || !['A', 'B', 'C', 'D'].includes(correct)) return res.redirect('/admin/quiz/' + req.params.id);
  await q('INSERT INTO questions (quiz_id, content, option_a, option_b, option_c, option_d, correct_option) VALUES (?,?,?,?,?,?,?)',
    [req.params.id, b.content.slice(0, 1000), b.option_a.slice(0, 500), b.option_b.slice(0, 500), b.option_c.slice(0, 500), b.option_d.slice(0, 500), correct]);
  res.redirect('/admin/quiz/' + req.params.id);
}));

app.post('/admin/question/:id(\\d+)/delete', requireLogin, requireAdmin, wrap(async (req, res) => {
  const [qs] = await q('SELECT quiz_id FROM questions WHERE id=?', [req.params.id]);
  await q('DELETE FROM questions WHERE id=?', [req.params.id]);
  res.redirect('/admin/quiz/' + (qs ? qs.quiz_id : ''));
}));

app.post('/admin/quiz/:id(\\d+)/delete', requireLogin, requireAdmin, wrap(async (req, res) => {
  await q('DELETE FROM quizzes WHERE id=?', [req.params.id]);
  log('quiz_deleted', { by: req.user.username, quiz_id: req.params.id });
  res.redirect('/admin');
}));

/* ---------- Lỗi ---------- */
app.use((req, res) => res.status(404).render('error', { title: '404', message: 'Trang không tồn tại.' }));
app.use((err, req, res, next) => { // eslint-disable-line
  log('server_error', { path: req.path, error: err.message }, 'error');
  res.status(500).render('error', { title: 'Lỗi', message: 'Đã xảy ra lỗi hệ thống.' });
});

(async () => {
  await connectWithRetry();
  await bootstrapAdmin();
  app.listen(PORT, '0.0.0.0', () => log('server_started', { port: PORT }));
})().catch(e => { log('fatal', { error: e.message }, 'error'); process.exit(1); });

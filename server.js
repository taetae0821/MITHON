// .env 파일에서 환경 변수를 로드
require('dotenv').config(); 

const express = require('express');
const mysql = require('mysql2');
const jwt = require('jsonwebtoken');
const path = require('path');
const bcrypt = require('bcrypt');
const os = require('os'); // IP 주소 확인을 위해 다시 추가

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev'; 
const SALT_ROUNDS = 10; 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ⚠️ 환경 변수에서 DB 연결 정보를 가져옵니다. 
const connection = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'MITHON'
});

connection.connect(err => {
    if (err) return console.error("MySQL 연결 실패:", err);
    console.log("MySQL 연결 성공!");
});

async function hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
}

// ⚠️ authenticateToken 함수 (Type Error 최종 해결 버전) ⚠️
function authenticateToken(req, res, next) {
    let token = req.headers['authorization'];
    let fromQueryOrBody = false;

    if (typeof token === 'string' && token.startsWith('Bearer ')) {
        token = token.slice(7).trim();
    } else {
        // 쿼리나 바디에서 토큰을 찾을 때, 객체 존재 여부 안전하게 확인
        const bodyToken = req.body && req.body.token;
        const queryToken = req.query && req.query.token;
        
        token = bodyToken || queryToken;
        fromQueryOrBody = !!token; // 쿼리나 바디에서 토큰을 찾았는지 기록
    }

    if (!token) {
        // API 호출이 아닌 경우 (브라우저 주소창 직접 접근)에만 리디렉션
        if (req.accepts('html')) {
            return res.status(401).send('<script>alert("로그인이 필요합니다.");window.location.href="/login";</script>');
        }
        // API 호출인 경우 (채팅 메시지 전송 등) JSON 응답
        return res.status(401).json({ success: false, message: "Authentication required" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
             // API 호출이 아닌 경우 (브라우저 주소창 직접 접근)에만 리디렉션
            if (req.accepts('html')) {
                return res.status(403).send('<script>alert("세션이 만료되었습니다. 다시 로그인해주세요.");window.location.href="/login";</script>');
            }
            // API 호출인 경우 JSON 응답
            return res.status(403).json({ success: false, message: "Token expired or invalid" });
        }
        req.user = user;
        next();
    });
}


// ----------------------
// 라우팅 (채팅방 진입 로직 수정)
// ----------------------
app.get('/', (req, res) => res.redirect('/main'));
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/main', (req, res) => res.sendFile(path.join(__dirname, 'public', 'main.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/event', (req, res) => res.sendFile(path.join(__dirname, 'public', 'event.html')))

// 🔒 /chat 페이지 자체는 인증 없이 전송 (클라이언트 JS가 이후 인증 처리)
app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// 🔑 토큰의 유효성을 검사하는 API 엔드포인트
app.get('/verify-token', authenticateToken, (req, res) => {
    // 토큰이 authenticateToken을 통과했다면 유효함
    res.json({ success: true, userId: req.user.userId });
});

// 📝 회원가입 로직
app.post('/signup', async (req, res) => {
    const { username, userId, password, emailPart1, emailPart2, ago, school } = req.body;
    const email = `${emailPart1}@${emailPart2}`;
    if (!username || !userId || !password || !emailPart1 || !emailPart2 || !ago || !school) {
        return res.status(400).send('<script>alert("모든 필드를 채워주세요."); window.history.back();</script>');
    }
    const hashedPassword = await hashPassword(password);

    const checkQuery = 'SELECT user_id FROM MITHON WHERE user_id = ?';
    connection.query(checkQuery, [userId], (err, results) => {
        if (err) return res.status(500).send('<script>alert("DB 오류"); window.history.back();</script>');
        if (results.length > 0) return res.status(409).send('<script>alert("이미 존재하는 아이디입니다."); window.history.back();</script>');

        const insertQuery = 'INSERT INTO MITHON (username, user_id, password, email, age, school) VALUES (?, ?, ?, ?, ?, ?)';
        connection.query(insertQuery, [username, userId, hashedPassword, email, ago, school], (err2) => {
            if (err2) return res.status(500).send('<script>alert("회원가입 실패"); window.history.back();</script>');
            res.status(201).send('<script>alert("회원가입 완료"); window.location.href="/login";</script>');
        });
    });
});

// 🔑 로그인 로직
app.post('/login', (req, res) => {
    const { userId, password } = req.body;
    if (!userId || !password) return res.status(400).send('<script>alert("아이디와 비밀번호를 입력하세요."); window.history.back();</script>');

    const query = 'SELECT user_id, password FROM MITHON WHERE user_id = ?';
    connection.query(query, [userId], async (err, results) => {
        if (err) return res.status(500).send('<script>alert("DB 오류"); window.history.back();</script>');
        if (results.length === 0) return res.status(401).send('<script>alert("아이디 또는 비밀번호가 올바르지 않습니다."); window.history.back();</script>');

        const user = results[0];
        const passwordMatch = await comparePassword(password, user.password);

        if (!passwordMatch) {
            return res.status(401).send('<script>alert("아이디 또는 비밀번호가 올바르지 않습니다."); window.history.back();</script>');
        }

        const token = jwt.sign({ userId: user.user_id }, JWT_SECRET, { expiresIn: '1h' });
        const fullToken = `Bearer ${token}`;

        res.status(200).send(`
            <script>
                alert("로그인 성공!");
                localStorage.setItem('token', '${fullToken}'); 
                window.location.href="/chat"; // 토큰 없이 /chat으로 리다이렉트
            </script>
        `);
    });
});

// 💬 메시지 전송 로직 (인증 미들웨어 적용)
app.post('/send', authenticateToken, (req, res) => { // 🔑 authenticateToken 적용
    const sender = req.user.userId; // 인증된 사용자 ID를 sender로 사용
    const { content } = req.body; 
    if (!content) return res.status(400).json({ success: false, message: '내용 없음' });

    const sql = "INSERT INTO messages (sender, content) VALUES (?, ?)";
    connection.query(sql, [sender, content], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'DB 저장 오류' });
        res.json({ success: true, id: result.insertId });
    });
});

// 📥 새로운 메시지 가져오기 로직 (인증 미들웨어 적용)
app.get('/get_new_messages', authenticateToken, (req, res) => { // 🔑 authenticateToken 적용
    const lastId = parseInt(req.query.last_id) || 0;

    const selectSql = "SELECT id, sender, content FROM messages WHERE id > ? ORDER BY id ASC";
    connection.query(selectSql, [lastId], (err, rows) => {
        if (err) return res.status(500).json({ messages: [], last_id: lastId });
        const newLastId = rows.length > 0 ? rows[rows.length - 1].id : lastId;
        res.json({
            messages: rows.map(r => ({ sender: r.sender, content: r.content })),
            last_id: newLastId
        });
    });
});

// ----------------------
// 서버 시작 및 IP 주소 안내 
// ----------------------

app.listen(port, () => {
    // 서버 컴퓨터의 사설 IP 주소를 찾아서 출력하는 로직
    const interfaces = os.networkInterfaces();
    let ipAddress = 'localhost';

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ipAddress = iface.address;
                break;
            }
        }
    }
    
    console.log(`서버 실행: http://localhost:${port}`);
    if (ipAddress !== 'localhost') {
        console.log(`🌐 다른 기기 접속 주소 (사설망): http://${ipAddress}:${port}/chat`);
        console.log(`⚠️ 접속이 안 된다면 서버 컴퓨터의 방화벽(3000번 포트)을 반드시 확인하세요!`);
    }
});

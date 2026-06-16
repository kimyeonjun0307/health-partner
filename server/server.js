require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const { initDb, dbRun, dbGet, dbAll } = require('./db');

const app = express();
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST']
  }
});
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'gym_partner_secret_key_9988';

app.use(cors({
  origin: ALLOWED_ORIGIN
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Centralized error responder helper to prevent leaking stack traces or inner details in production
function sendError(res, err, status = 500) {
  console.error("Error encountered:", err);
  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction ? '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' : err.message;
  res.status(status).json({ error: message });
}

// Helper to convert "HH:MM" to minutes
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// 인기도 점수 조정 헬퍼 함수
async function adjustPopularity(userId, points) {
  try {
    const user = await dbGet('SELECT popularity_score FROM User WHERE userId = ?', [userId]);
    if (!user) return;
    let newScore = (user.popularity_score || 0) + points;
    if (newScore < 0) newScore = 0;
    if (newScore > 999) newScore = 999;
    await dbRun('UPDATE User SET popularity_score = ? WHERE userId = ?', [newScore, userId]);
    console.log(`[Popularity] Adjusted ${userId}'s score by ${points}. New score: ${newScore}`);
  } catch (err) {
    console.error('adjustPopularity error:', err.message);
  }
}
app.use((req, res, next) => {
  console.log("🔥 REQUEST:", req.method, req.url);
  next();
});

// 알림 생성 및 실시간 전송 헬퍼 함수
async function createNotification(userId, type, title, content) {
  try {
    const result = await dbRun(
      'INSERT INTO notifications (user_id, type, title, content) VALUES (?, ?, ?, ?)',
      [userId, type, title, content]
    );
    const notiId = result.lastID;

    // 실시간 소켓 브로드캐스팅
    io.to(`user_${userId}`).emit('notification', {
      id: notiId,
      user_id: userId,
      type,
      title,
      content,
      is_read: 0,
      created_at: new Date().toISOString()
    });
    console.log(`[Notification] Created and emitted to user_${userId}: ${title}`);
  } catch (err) {
    console.error('createNotification error:', err.message);
  }
}

// Socket.io 연결 이벤트 설정
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  if (userId && userId !== 'null' && userId !== 'undefined') {
    socket.join(`user_${userId}`);
    console.log(`User socket joined personal room: user_${userId}`);
  }

  socket.on('join_room', (roomId) => {
    socket.join(`room_${roomId}`);
    console.log(`User socket joined chat room: room_${roomId}`);
  });

  socket.on('send_message', async (data) => {
    const { room_id, sender_id, message } = data;
    if (!room_id || !sender_id || !message) return;
    try {
      const room = await dbGet('SELECT * FROM chat_rooms WHERE id = ?', [room_id]);
      if (!room) return;
      if (room.owner_left === 1 || room.participant_left === 1) {
        console.log(`[Socket] Rejected message to room ${room_id} because a participant has left.`);
        return;
      }
      const result = await dbRun(
        'INSERT INTO messages (room_id, sender_id, message, is_read) VALUES (?, ?, ?, 0)',
        [room_id, sender_id, message]
      );
      const msgId = result.lastID;

      const savedMsg = {
        id: msgId,
        room_id,
        sender_id,
        message,
        created_at: new Date().toISOString(),
        is_read: 0
      };

      const targetId =
        room.owner_id === sender_id
          ? room.participant_id
          : room.owner_id;

      io.to(`user_${targetId}`).emit('new_message_alert', {
        room_id,
        message
      });

      await createNotification(
        targetId,
        '새 채팅',
        '새로운 메시지',
        `${sender_id}: ${message}`
      );
    } catch (err) {
      console.error('Socket send_message error:', err.message);
    }
  });

  socket.on('read_messages', async (data) => {
    const { room_id, user_id } = data;
    if (!room_id || !user_id) return;
    try {
      await dbRun(
        'UPDATE messages SET is_read = 1 WHERE room_id = ? AND sender_id != ?',
        [room_id, user_id]
      );
      io.to(`room_${room_id}`).emit('messages_read', { room_id, reader_id: user_id });
    } catch (err) {
      console.error('Socket read_messages error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// JWT Authentication Middleware
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: '유효하지 않은 토큰입니다. 다시 로그인해 주세요.' });
      }
      req.user = user;
      next();
    });
  } else {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
}

// Admin Authorization Middleware
function authorizeAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }
}

// ----------------- AUTH & USER ROUTES -----------------

// 회원 가입
app.post('/api/auth/register', async (req, res) => {
  try {
    const { userId, password, gymName, threeLiftWeight, preferredWorkoutTime } = req.body;
    if (!userId || !password || !gymName || !threeLiftWeight || !preferredWorkoutTime) {
      return res.status(400).json({ error: '모든 필드를 입력해야 합니다.' });
    }

    // 아이디 중복 체크
    const existingUser = await dbGet('SELECT * FROM User WHERE userId = ?', [userId]);
    if (existingUser) {
      return res.status(409).json({ error: '이미 존재하는 아이디입니다.' });
    }

    // 패스워드 해싱
    const hashedPassword = await bcrypt.hash(password, 10);

    const defaultBench = Math.floor(Number(threeLiftWeight) / 3);
    const defaultSquat = Math.floor(Number(threeLiftWeight) / 3);
    const defaultDeadlift = Number(threeLiftWeight) - defaultBench - defaultSquat;
    await dbRun(
      'INSERT INTO User (userId, password, gymName, threeLiftWeight, preferredWorkoutTime, points, nickname, bench_press, squat, deadlift, workout_career, profile_image, role) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, "미입력", "avatar1", "user")',
      [userId, hashedPassword, gymName, Number(threeLiftWeight), preferredWorkoutTime, userId, defaultBench, defaultSquat, defaultDeadlift]
    );

    res.status(201).json({ success: true, message: '회원가입이 완료되었습니다.' });
  } catch (err) {
    sendError(res, err)
  }
});

// 로그인 및 JWT 발급
app.post('/api/auth/login', async (req, res) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 모두 입력해주세요.' });
    }

    const user = await dbGet('SELECT * FROM User WHERE userId = ?', [userId]);

    console.log("    요청 userId:", userId);
    console.log("    DB에서 가져온 user:", user);
    if (!user) {
      return res.status(401).json({ error: '존재하지 않는 아이디입니다.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
    }

    // 토큰 생성
    const token = jwt.sign(
      { userId: user.userId, gymName: user.gymName, role: user.role },
      JWT_SECRET,
      { expiresIn: '3h' }
    );

    const { password: _, ...userWithoutPassword } = user;
    res.json({
      success: true,
      token,
      user: userWithoutPassword
    });
  } catch (err) {
    sendError(res, err)
  }
});

// Helper to resolve administrative neighborhood ('dong') from coordinates or address
async function getRegionFromCoordsOrAddress(lat, lng, address) {
  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

  if (address) {
    // Extract something like '우동', '서교동', '우1동'
    const dongMatch = address.match(/([가-힣A-Za-z0-9]+동)/);
    if (dongMatch) {
      // For user friendliness, clean up numbers (e.g. '우1동' -> '우동') if they are part of admin division
      // This helps boundary users searching and matching easily.
      return dongMatch[1];
    }
  }

  if (lat && lng) {
    if (KAKAO_KEY) {
      try {
        const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`;
        const response = await fetch(url, {
          headers: { 'Authorization': `KakaoAK ${KAKAO_KEY}` }
        });
        const data = await response.json();
        if (data.documents && data.documents.length > 0) {
          const hRegion = data.documents.find(doc => doc.region_type === 'H');
          if (hRegion) return hRegion.region_3depth_name;
          return data.documents[0].region_3depth_name;
        }
      } catch (err) {
        console.error('Kakao API Reverse Geocoding failed, falling back to mock:', err.message);
      }
    }

    // Mock Geocoding Fallback based on coordinates (Busan Haeundae vs Seoul Mapo)
    const y = Number(lat);
    const x = Number(lng);
    if (y >= 35.14 && y <= 35.18 && x >= 129.14 && x <= 129.18) {
      return '우동';
    }
    if (y >= 37.53 && y <= 37.57 && x >= 126.90 && x <= 126.94) {
      return '서교동';
    }
  }

  return '우동'; // Global default fallback
}

// 로그인 본인 정보 확인
app.get('/api/auth/me', authenticateJWT, async (req, res) => {
  try {
    const user = await dbGet(
      'SELECT userId, gymName, threeLiftWeight, preferredWorkoutTime, points, user_region, user_gym, user_lat, user_lng, popularity_score, workout_count, received_reviews_count, nickname, bench_press, squat, deadlift, workout_career, profile_image, role FROM User WHERE userId = ?',
      [req.user.userId]
    );
    if (!user) {
      return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
    }
    // Parse user_gym JSON string if it exists
    if (user.user_gym) {
      try {
        user.user_gym = JSON.parse(user.user_gym);
      } catch (e) {
        // Leave as string if parsing fails
      }
    }
    res.json(user);
  } catch (err) {
    sendError(res, err)
  }
});

// ----------------- NEIGHBORHOOD & GYM REGISTRATION API -----------------

// 1. GPS 기반 동네 인증 (Reverse Geocoding)
app.post('/api/region/authenticate', authenticateJWT, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) {
      return res.status(400).json({ error: '위도(lat)와 경도(lng) 좌표가 필요합니다.' });
    }

    const regionName = await getRegionFromCoordsOrAddress(lat, lng, null);

    // 유저 DB 업데이트
    await dbRun(
      'UPDATE User SET user_region = ?, user_lat = ?, user_lng = ? WHERE userId = ?',
      [regionName, Number(lat), Number(lng), req.user.userId]
    );

    const updatedUser = await dbGet(
      'SELECT userId, gymName, threeLiftWeight, preferredWorkoutTime, points, user_region, user_gym, user_lat, user_lng FROM User WHERE userId = ?',
      [req.user.userId]
    );

    if (updatedUser.user_gym) {
      try { updatedUser.user_gym = JSON.parse(updatedUser.user_gym); } catch (e) { }
    }

    res.json({
      success: true,
      message: `동네 인증 완료: ${regionName}`,
      user: updatedUser
    });
  } catch (err) {
    sendError(res, err)
  }
});

// 2. 인증된 동네 기반 헬스장 검색
app.get('/api/gyms/search', authenticateJWT, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: '검색어를 입력해 주세요.' });
    }

    // 유저 정보 조회
    const user = await dbGet('SELECT user_region, user_lat, user_lng FROM User WHERE userId = ?', [req.user.userId]);
    if (!user || !user.user_region) {
      return res.status(403).json({ error: '동네 인증을 먼저 완료해 주세요.' });
    }

    // 검색어에 user_region 강제 포함 및 "헬스장" 키워드 추가
    const cleanedRegion = user.user_region.replace(/[0-9]동$/, '동'); // '우1동' -> '우동'으로 변경하여 검색 범위 확장
    const searchQuery = `${cleanedRegion} ${query} 헬스장`;

    const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
    let gymList = [];

    if (KAKAO_KEY) {
      try {
        // x=lng, y=lat, radius=2000 (2km 반경 제한)
        const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(searchQuery)}&x=${user.user_lng}&y=${user.user_lat}&radius=2000`;
        const response = await fetch(url, {
          headers: { 'Authorization': `KakaoAK ${KAKAO_KEY}` }
        });
        const data = await response.json();
        if (data.documents) {
          gymList = data.documents.map(doc => ({
            id: doc.id,
            name: doc.place_name,
            address: doc.road_address_name || doc.address_name,
            x: doc.x,
            y: doc.y
          }));
        }
      } catch (err) {
        console.error('Kakao Gym Search API failed, using mock:', err.message);
      }
    }

    // Fallback: Mock Gym Search (Kakao Key가 없거나 API 에러인 경우)
    if (gymList.length === 0) {
      const mockGyms = [
        {
          id: "gym_1",
          name: "마블 피트니스 우동점",
          address: "부산 해운대구 우동 123",
          x: "129.1633519",
          y: "35.1593306"
        },
        {
          id: "gym_2",
          name: "우동 원피트니스",
          address: "부산 해운대구 우동 456",
          x: "129.1650",
          y: "35.1610"
        },
        {
          id: "gym_3",
          name: "해운대 자이 헬스클럽",
          address: "부산 해운대구 우동 789",
          x: "129.1600",
          y: "35.1580"
        },
        {
          id: "gym_4",
          name: "벡스코 피트니스",
          address: "부산 해운대구 우2동 100", // Adjacent boundary gym
          x: "129.1550",
          y: "35.1650"
        },
        {
          id: "gym_5",
          name: "서교 피트니스",
          address: "서울 마포구 서교동 11",
          x: "126.9200",
          y: "37.5500"
        },
        {
          id: "gym_6",
          name: "홍대 에이원 헬스장",
          address: "서울 마포구 서교동 22",
          x: "126.9230",
          y: "37.5530"
        },
        {
          id: "gym_7",
          name: "합정 자이언트 짐",
          address: "서울 마포구 합정동 33", // Adjacent boundary gym
          x: "126.9150",
          y: "37.5450"
        }
      ];

      // Filter mock gyms by user region and input query
      gymList = mockGyms.filter(gym => {
        const address = gym.address;
        const name = gym.name;
        const regionBase = cleanedRegion.replace('동', ''); // '우동' -> '우'
        const matchesRegion = address.includes(regionBase);
        const matchesQuery = name.toLowerCase().includes(query.toLowerCase()) || address.toLowerCase().includes(query.toLowerCase());
        return matchesRegion && matchesQuery;
      });
    }

    res.json(Array.isArray(gymList) ? gymList : []);
  } catch (err) {
    sendError(res, err)
  }
});

// 3. 헬스장 선택 저장 및 활동 지역 동기화
app.post('/api/users/gym', authenticateJWT, async (req, res) => {
  try {
    const { id, name, address, x, y } = req.body;
    if (!id || !name || !address || !x || !y) {
      return res.status(400).json({ error: '헬스장의 필수 정보(id, name, address, x, y)가 누락되었습니다.' });
    }

    // 헬스장의 위치를 기반으로 새로운 활동지역(행정동) 도출
    const gymRegion = await getRegionFromCoordsOrAddress(y, x, address);
    const gymInfo = JSON.stringify({ id, name, address, x, y });

    // 유저의 user_gym, gymName, user_region을 모두 업데이트
    await dbRun(
      'UPDATE User SET user_gym = ?, gymName = ?, user_region = ? WHERE userId = ?',
      [gymInfo, name, gymRegion, req.user.userId]
    );

    const updatedUser = await dbGet(
      'SELECT userId, gymName, threeLiftWeight, preferredWorkoutTime, points, user_region, user_gym, user_lat, user_lng FROM User WHERE userId = ?',
      [req.user.userId]
    );

    if (updatedUser.user_gym) {
      try { updatedUser.user_gym = JSON.parse(updatedUser.user_gym); } catch (e) { }
    }

    res.json({
      success: true,
      message: `헬스장 등록 완료 및 활동 지역이 '${gymRegion}'(으)로 동기화되었습니다.`,
      user: updatedUser
    });
  } catch (err) {
    sendError(res, err)
  }
});

// Get all users (for user switcher and display)
app.get('/api/users', authenticateJWT, async (req, res) => {
  try {
    const users = await dbAll('SELECT userId, gymName, threeLiftWeight, preferredWorkoutTime, points FROM User');
    res.json(users);
  } catch (err) {
    sendError(res, err)
  }
});

// Update user details (to test dynamic filtering changes)
app.put('/api/users/:id', authenticateJWT, async (req, res) => {
  try {
    const {
      gymName, preferredWorkoutTime, nickname,
      bench_press, squat, deadlift, workout_career, profile_image
    } = req.body;
    const userId = req.params.id;

    if (req.user.userId !== userId) {
      return res.status(403).json({ error: '본인 정보만 수정할 수 있습니다.' });
    }

    const user = await dbGet('SELECT * FROM User WHERE userId = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
    }

    const finalGymName = gymName !== undefined ? gymName : user.gymName;
    const finalPreferredWorkoutTime = preferredWorkoutTime !== undefined ? preferredWorkoutTime : user.preferredWorkoutTime;
    const finalNickname = nickname !== undefined ? nickname : user.nickname;
    const finalBenchPress = bench_press !== undefined ? Number(bench_press) : user.bench_press;
    const finalSquat = squat !== undefined ? Number(squat) : user.squat;
    const finalDeadlift = deadlift !== undefined ? Number(deadlift) : user.deadlift;
    const finalWorkoutCareer = workout_career !== undefined ? workout_career : user.workout_career;
    const finalProfileImage = profile_image !== undefined ? profile_image : user.profile_image;

    const finalThreeLift = (bench_press !== undefined || squat !== undefined || deadlift !== undefined)
      ? (finalBenchPress + finalSquat + finalDeadlift)
      : user.threeLiftWeight;

    await dbRun(
      `UPDATE User 
       SET gymName = ?, preferredWorkoutTime = ?, nickname = ?, 
           bench_press = ?, squat = ?, deadlift = ?, workout_career = ?, 
           profile_image = ?, threeLiftWeight = ?
       WHERE userId = ?`,
      [
        finalGymName, finalPreferredWorkoutTime, finalNickname,
        finalBenchPress, finalSquat, finalDeadlift, finalWorkoutCareer,
        finalProfileImage, finalThreeLift, userId
      ]
    );

    const updatedUser = await dbGet(
      `SELECT userId, nickname, gymName, threeLiftWeight, bench_press, squat, deadlift, 
              workout_career, profile_image, points, user_region, user_gym, user_lat, user_lng, 
              popularity_score, workout_count, received_reviews_count 
       FROM User WHERE userId = ?`,
      [userId]
    );

    if (updatedUser.user_gym) {
      try { updatedUser.user_gym = JSON.parse(updatedUser.user_gym); } catch (e) { }
    }

    res.json(updatedUser);
  } catch (err) {
    sendError(res, err)
  }
});

// ----------------- POST ROUTES (고도화 버전) -----------------

// 7일 경과 게시글 자동 마감 백엔드 스케줄러 (1시간 마다 실행)
setInterval(async () => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await dbRun(
      "UPDATE Post SET recruit_status = 'closed' WHERE recruit_status = 'recruiting' AND created_at < ?",
      [sevenDaysAgo]
    );
    if (result && result.changes > 0) {
      console.log(`[Scheduler] ${result.changes}개의 만료된 게시글을 자동 마감했습니다.`);
    }
  } catch (err) {
    console.error('[Scheduler Error] 자동 마감 실패:', err.message);
  }
}, 60 * 60 * 1000); // 1시간

// 게시판 목록 조회 (사용자 지역 기반 서버 사이드 필터링)
app.get('/api/posts', authenticateJWT, async (req, res) => {
  try {
    const currentUserId = req.user.userId;

    // 현재 로그인한 유저 정보 조회
    const user = await dbGet('SELECT * FROM User WHERE userId = ?', [currentUserId]);
    if (!user) {
      return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
    }

    // [Ver.2 Guard] 동네 인증 및 헬스장 등록 여부 확인
    if (!user.user_region || !user.user_gym) {
      return res.status(403).json({
        error: '동네 인증 및 헬스장 등록을 완료하지 않으면 글을 조회하거나 작성할 수 없습니다.',
        unauthorizedReason: 'LOCATION_REQUIRED'
      });
    }

    const { category, timeMatch, sortBy } = req.query;

    // 필수 보안 규칙: 내 동네(user_region)와 같은 글만 조회
    let sql = `
      SELECT 
        p.*, 
        u.threeLiftWeight as authorThreeLiftWeight,
        u.preferredWorkoutTime as authorPreferredTime,
        u.nickname as authorNickname,
        u.profile_image as authorAvatar,
        EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.postId AND b.user_id = ?) as isBookmarked
      FROM Post p
      JOIN User u ON p.authorId = u.userId
      WHERE p.region = ? AND p.status != '보조완료'
    `;
    const params = [currentUserId, user.user_region];

    if (category && category !== 'all') {
      sql += ` AND p.category = ?`;
      params.push(category);
    }

    let posts = await dbAll(sql, params);

    // 시간대 매칭 토글
    if (timeMatch === 'true') {
      const userTimeMins = timeToMinutes(user.preferredWorkoutTime);
      posts = posts.filter(post => {
        const postTimeMins = timeToMinutes(post.promiseTime);
        return Math.abs(postTimeMins - userTimeMins) <= 60;
      });
    }

    // 정렬 로직
    if (sortBy === 'highest') {
      posts.sort((a, b) => b.authorThreeLiftWeight - a.authorThreeLiftWeight);
    } else if (sortBy === 'similar') {
      posts.sort((a, b) => {
        const diffA = Math.abs(a.authorThreeLiftWeight - user.threeLiftWeight);
        const diffB = Math.abs(b.authorThreeLiftWeight - user.threeLiftWeight);
        return diffA - diffB;
      });
    } else {
      posts.sort((a, b) => b.postId - a.postId);
    }

    let parsedGym = null;
    if (user.user_gym) {
      try { parsedGym = JSON.parse(user.user_gym); } catch (e) { }
    }

    res.json({
      currentUser: {
        userId: user.userId,
        nickname: user.nickname,
        gymName: user.gymName,
        threeLiftWeight: user.threeLiftWeight,
        bench_press: user.bench_press,
        squat: user.squat,
        deadlift: user.deadlift,
        workout_career: user.workout_career,
        profile_image: user.profile_image,
        preferredWorkoutTime: user.preferredWorkoutTime,
        points: user.points,
        user_region: user.user_region,
        user_gym: parsedGym,
        user_lat: user.user_lat,
        user_lng: user.user_lng,
        popularity_score: user.popularity_score,
        workout_count: user.workout_count,
        received_reviews_count: user.received_reviews_count
      },
      posts: Array.isArray(posts) ? posts : []
    });
  } catch (err) {
    sendError(res, err)
  }
});

// 단일 게시물 상세, 댓글 목록, 참가 신청 목록 조회
app.get('/api/posts/:id', authenticateJWT, async (req, res) => {
  try {
    const postId = req.params.id;
    const currentUserId = req.user.userId;

    const user = await dbGet('SELECT user_region FROM User WHERE userId = ?', [currentUserId]);
    if (!user) {
      return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
    }

    const post = await dbGet(`
      SELECT 
        p.*, 
        u.threeLiftWeight as authorThreeLiftWeight, 
        u.preferredWorkoutTime as authorPreferredTime, 
        u.points as authorPoints,
        u.nickname as authorNickname,
        u.profile_image as authorAvatar,
        EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.postId AND b.user_id = ?) as isBookmarked
      FROM Post p
      JOIN User u ON p.authorId = u.userId
      WHERE p.postId = ?
    `, [currentUserId, postId]);

    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    // 서버 사이드 지역 검증
    if (post.region !== user.user_region) {
      return res.status(403).json({ error: '동일한 동네 인증을 마친 사용자만 이 글을 볼 수 있습니다.' });
    }

    // 댓글 및 대댓글 조회
    const comments = await dbAll(`
      SELECT c.*, u.threeLiftWeight as commenterThreeLiftWeight, u.gymName as commenterGym, u.nickname as commenterNickname, u.profile_image as commenterAvatar
      FROM Comment c
      JOIN User u ON c.user_id = u.userId
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC, c.id ASC
    `, [postId]);

    // 참가 신청 목록 조회 (게시글 작성자는 전체 신청 목록, 신청자는 본인 것만)
    let applications = [];
    if (post.authorId === currentUserId) {
      applications = await dbAll(`
        SELECT a.*, u.threeLiftWeight as applicantThreeLiftWeight, u.gymName as applicantGym, u.nickname as applicantNickname, u.profile_image as applicantAvatar
        FROM post_applications a
        JOIN User u ON a.applicant_id = u.userId
        WHERE a.post_id = ?
        ORDER BY a.created_at DESC
      `, [postId]);
    } else {
      applications = await dbAll(`
        SELECT a.*, u.nickname as applicantNickname, u.profile_image as applicantAvatar
        FROM post_applications a
        JOIN User u ON a.applicant_id = u.userId
        WHERE a.post_id = ? AND a.applicant_id = ?
      `, [postId, currentUserId]);
    }

    res.json({ post, comments: Array.isArray(comments) ? comments : [], applications: Array.isArray(applications) ? applications : [] });
  } catch (err) {
    sendError(res, err)
  }
});

// 새 게시글 등록
app.post('/api/posts', authenticateJWT, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const {
      title, content, category, max_members, workout_time,
      workoutType, targetWeight, requestedSets, promiseTime, detailedLocation
    } = req.body;

    if (!title || !content || !category || !max_members || !workout_time ||
      !workoutType || !targetWeight || !requestedSets || !promiseTime || !detailedLocation) {
      return res.status(400).json({ error: '필수 작성 칸이 비어있습니다.' });
    }

    const user = await dbGet('SELECT gymName, user_region, user_gym FROM User WHERE userId = ?', [currentUserId]);
    if (!user) {
      return res.status(404).json({ error: '유효하지 않은 작성자입니다.' });
    }

    // 필수 조건 서버사이드 검증
    if (!user.user_region || !user.user_gym) {
      return res.status(403).json({ error: '동네 인증 및 헬스장 등록을 완료하지 않으면 글을 올릴 수 없습니다.' });
    }

    const result = await dbRun(`
      INSERT INTO Post (
        authorId, gymName, workoutType, targetWeight, requestedSets, promiseTime, detailedLocation, 
        status, region, title, content, category, recruit_status, max_members, current_members, workout_time
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, '대기중', ?, ?, ?, ?, 'recruiting', ?, 1, ?)
    `, [
      currentUserId, user.gymName, workoutType, Number(targetWeight), requestedSets, promiseTime, detailedLocation,
      user.user_region, title, content, category, Number(max_members), workout_time
    ]);

    res.status(201).json({ success: true, postId: result.lastID });
  } catch (err) {
    sendError(res, err)
  }
});

// ----------------- BOOKMARK (찜) ROUTES -----------------

// 찜 추가
app.post('/api/posts/:id/bookmark', authenticateJWT, async (req, res) => {
  try {
    const postId = req.params.id;
    const currentUserId = req.user.userId;

    const existing = await dbGet('SELECT * FROM bookmarks WHERE user_id = ? AND post_id = ?', [currentUserId, postId]);
    if (existing) {
      return res.json({ success: true, message: '이미 찜한 게시글입니다.' });
    }

    await dbRun('INSERT INTO bookmarks (user_id, post_id) VALUES (?, ?)', [currentUserId, postId]);
    res.json({ success: true, message: '게시글을 찜했습니다.' });
  } catch (err) {
    sendError(res, err)
  }
});

// 찜 해제
app.delete('/api/posts/:id/bookmark', authenticateJWT, async (req, res) => {
  try {
    const postId = req.params.id;
    const currentUserId = req.user.userId;

    await dbRun('DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?', [currentUserId, postId]);
    res.json({ success: true, message: '찜을 해제했습니다.' });
  } catch (err) {
    sendError(res, err)
  }
});

// 내가 찜한 게시글 목록 조회 (내 동네 게시글만 한정)
app.get('/api/users/me/bookmarks', authenticateJWT, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const user = await dbGet('SELECT user_region FROM User WHERE userId = ?', [currentUserId]);
    if (!user || !user.user_region) {
      return res.status(403).json({ error: '동네 인증이 필요합니다.' });
    }

    const posts = await dbAll(`
      SELECT 
        p.*, 
        u.threeLiftWeight as authorThreeLiftWeight,
        u.preferredWorkoutTime as authorPreferredTime,
        1 as isBookmarked
      FROM bookmarks b
      JOIN Post p ON b.post_id = p.postId
      JOIN User u ON p.authorId = u.userId
      WHERE b.user_id = ? AND p.region = ?
      ORDER BY b.created_at DESC
    `, [currentUserId, user.user_region]);

    res.json(posts);
  } catch (err) {
    sendError(res, err)
  }
});

// ----------------- APPLICATION (참가 신청) ROUTES -----------------

// 참가 신청 넣기
app.post('/api/posts/:id/apply', authenticateJWT, async (req, res) => {
  try {
    const postId = req.params.id;
    const currentUserId = req.user.userId;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: '신청 메시지를 입력해주세요.' });
    }

    const post = await dbGet('SELECT * FROM Post WHERE postId = ?', [postId]);
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    if (post.authorId === currentUserId) {
      return res.status(400).json({ error: '본인이 작성한 글에는 신청할 수 없습니다.' });
    }

    if (post.recruit_status === 'closed') {
      return res.status(400).json({ error: '이미 모집이 마감된 글입니다.' });
    }

    const existing = await dbGet('SELECT * FROM post_applications WHERE post_id = ? AND applicant_id = ?', [postId, currentUserId]);
    if (existing) {
      return res.status(400).json({ error: '이미 이 글에 참가 신청을 하셨습니다.' });
    }

    await dbRun(`
      INSERT INTO post_applications (post_id, applicant_id, owner_id, message, status)
      VALUES (?, ?, ?, ?, 'pending')
    `, [postId, currentUserId, post.authorId, message]);

    // [알림 발송]
    await createNotification(
      post.authorId,
      '신청',
      '새 참가 신청',
      `'${post.title}' 모집글에 ${currentUserId}님이 참가 신청을 보냈습니다.`
    );

    res.status(201).json({ success: true, message: '참가 신청이 완료되었습니다.' });
  } catch (err) {
    sendError(res, err)
  }
});

// 참가 신청 승인/거절 상태 변경
app.post('/api/applications/:id/status', authenticateJWT, async (req, res) => {
  try {
    const applicationId = req.params.id;
    const currentUserId = req.user.userId;
    const { status } = req.body;

    if (status !== 'accepted' && status !== 'rejected') {
      return res.status(400).json({ error: '올바른 상태(accepted/rejected)를 지정해주세요.' });
    }

    const application = await dbGet('SELECT * FROM post_applications WHERE id = ?', [applicationId]);
    if (!application) {
      return res.status(404).json({ error: '신청 내역을 찾을 수 없습니다.' });
    }

    if (application.owner_id !== currentUserId) {
      return res.status(403).json({ error: '승인 및 거절 권한이 없습니다.' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ error: '이미 처리 완료된 신청입니다.' });
    }

    if (status === 'accepted') {
      const post = await dbGet('SELECT * FROM Post WHERE postId = ?', [application.post_id]);
      if (!post) {
        return res.status(404).json({ error: '연관된 게시글을 찾을 수 없습니다.' });
      }

      if (post.current_members >= post.max_members || post.recruit_status === 'closed') {
        return res.status(400).json({ error: '모집 인원이 가득 찼거나 이미 마감되었습니다.' });
      }

      await dbRun('UPDATE post_applications SET status = ? WHERE id = ?', [status, applicationId]);

      const newCurrentMembers = post.current_members + 1;
      let newRecruitStatus = post.recruit_status;
      if (newCurrentMembers >= post.max_members) {
        newRecruitStatus = 'closed';
      }

      await dbRun('UPDATE Post SET current_members = ?, recruit_status = ? WHERE postId = ?', [newCurrentMembers, newRecruitStatus, post.postId]);

      // [자동 1:1 채팅방 생성]
      const existingRoom = await dbGet(
        'SELECT id FROM chat_rooms WHERE post_id = ? AND owner_id = ? AND participant_id = ?',
        [application.post_id, application.owner_id, application.applicant_id]
      );

      let roomId;
      if (!existingRoom) {
        const roomResult = await dbRun(
          'INSERT INTO chat_rooms (post_id, owner_id, participant_id) VALUES (?, ?, ?)',
          [application.post_id, application.owner_id, application.applicant_id]
        );
        roomId = roomResult.lastID;
      } else {
        roomId = existingRoom.id;
      }

      // [알림 발송]
      await createNotification(
        application.applicant_id,
        '승인',
        '참가 신청 승인',
        `'${post.title}' 모집글 참가 신청이 승인되어 채팅방이 개설되었습니다.`
      );

      res.json({
        success: true,
        message: '신청을 승인했습니다. 채팅방이 자동으로 개설되었습니다.',
        current_members: newCurrentMembers,
        recruit_status: newRecruitStatus,
        roomId
      });
    } else {
      await dbRun('UPDATE post_applications SET status = ? WHERE id = ?', [status, applicationId]);

      // [거절 알림 발송]
      await createNotification(
        application.applicant_id,
        '거절',
        '참가 신청 거절',
        `보내신 참가 신청이 거절되었습니다.`
      );

      res.json({ success: true, message: '신청을 거절했습니다.' });
    }
  } catch (err) {
    sendError(res, err)
  }
});

// 내가 신청한 글 목록 조회
app.get('/api/users/me/applications', authenticateJWT, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const applications = await dbAll(`
      SELECT 
        a.*, 
        p.title as postTitle, 
        p.workout_time as postWorkoutTime, 
        p.recruit_status as postRecruitStatus, 
        p.current_members as postCurrentMembers, 
        p.max_members as postMaxMembers,
        u.gymName as gymName
      FROM post_applications a
      JOIN Post p ON a.post_id = p.postId
      JOIN User u ON p.authorId = u.userId
      WHERE a.applicant_id = ?
      ORDER BY a.created_at DESC
    `, [currentUserId]);

    res.json(applications);
  } catch (err) {
    sendError(res, err)
  }
});

// 내가 작성한 글 목록 조회
app.get('/api/users/me/posts', authenticateJWT, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const posts = await dbAll(`
      SELECT * FROM Post
      WHERE authorId = ?
      ORDER BY postId DESC
    `, [currentUserId]);
    res.json(posts);
  } catch (err) {
    sendError(res, err)
  }
});

// ----------------- COMMENT ROUTES (고도화 버전) -----------------

// 댓글 및 대댓글 등록
app.post('/api/posts/:id/comments', authenticateJWT, async (req, res) => {
  try {
    const postId = req.params.id;
    const currentUserId = req.user.userId;
    const { content, parent_comment_id } = req.body;

    if (!content) {
      return res.status(400).json({ error: '댓글 내용을 입력해 주세요.' });
    }

    if (parent_comment_id) {
      const parent = await dbGet('SELECT * FROM Comment WHERE id = ?', [parent_comment_id]);
      if (!parent) {
        return res.status(404).json({ error: '부모 댓글을 찾을 수 없습니다.' });
      }
    }

    const result = await dbRun(`
      INSERT INTO Comment (post_id, user_id, content, parent_comment_id)
      VALUES (?, ?, ?, ?)
    `, [postId, currentUserId, content, parent_comment_id || null]);

    res.status(201).json({ success: true, commentId: result.lastID });
  } catch (err) {
    sendError(res, err)
  }
});

// 댓글 수정
app.put('/api/comments/:id', authenticateJWT, async (req, res) => {
  try {
    const commentId = req.params.id;
    const currentUserId = req.user.userId;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: '댓글 내용을 입력해 주세요.' });
    }

    const comment = await dbGet('SELECT * FROM Comment WHERE id = ?', [commentId]);
    if (!comment) {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    }

    if (comment.user_id !== currentUserId) {
      return res.status(403).json({ error: '본인의 댓글만 수정할 수 있습니다.' });
    }

    await dbRun('UPDATE Comment SET content = ? WHERE id = ?', [content, commentId]);
    res.json({ success: true, message: '댓글이 수정되었습니다.' });
  } catch (err) {
    sendError(res, err)
  }
});

// 댓글 삭제
app.delete('/api/comments/:id', authenticateJWT, async (req, res) => {
  try {
    const commentId = req.params.id;
    const currentUserId = req.user.userId;

    const comment = await dbGet('SELECT * FROM Comment WHERE id = ?', [commentId]);
    if (!comment) {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    }

    if (comment.user_id !== currentUserId) {
      return res.status(403).json({ error: '본인의 댓글만 삭제할 수 있습니다.' });
    }

    // 대댓글 우선 삭제 후 댓글 삭제
    await dbRun('DELETE FROM Comment WHERE parent_comment_id = ?', [commentId]);
    await dbRun('DELETE FROM Comment WHERE id = ?', [commentId]);

    res.json({ success: true, message: '댓글이 삭제되었습니다.' });
  } catch (err) {
    sendError(res, err)
  }
});

// ----------------- CHAT ROOM & REALTIME MESSAGE API -----------------

// 내 채팅방 목록 조회
app.get('/api/chats/rooms', authenticateJWT, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const rooms = await dbAll(`
      SELECT 
        cr.*, 
        p.title as postTitle,
        p.gymName as gymName,
        (SELECT message FROM messages m WHERE m.room_id = cr.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) as lastMessage,
        (SELECT created_at FROM messages m WHERE m.room_id = cr.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) as lastMessageTime,
        (SELECT COUNT(*) FROM messages m WHERE m.room_id = cr.id AND m.sender_id != ? AND m.is_read = 0) as unreadCount,
        u.popularity_score as partnerPopularity,
        u.userId as partnerId,
        u.nickname as partnerNickname,
        u.profile_image as partnerAvatar
      FROM chat_rooms cr
      JOIN Post p ON cr.post_id = p.postId
      JOIN User u ON (CASE WHEN cr.owner_id = ? THEN cr.participant_id ELSE cr.owner_id END) = u.userId
      WHERE (cr.owner_id = ? AND cr.owner_left = 0) OR (cr.participant_id = ? AND cr.participant_left = 0)
      ORDER BY lastMessageTime DESC, cr.created_at DESC
    `, [currentUserId, currentUserId, currentUserId, currentUserId]);

    res.json(Array.isArray(rooms) ? rooms : []);
  } catch (err) {
    sendError(res, err)
  }
});

// 채팅방 메시지 내역 조회 및 실시간 읽음 처리
app.get('/api/chats/rooms/:roomId/messages', authenticateJWT, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const currentUserId = req.user.userId;

    const room = await dbGet('SELECT * FROM chat_rooms WHERE id = ?', [roomId]);
    if (!room) {
      return res.status(404).json({ error: '채팅방을 찾을 수 없습니다.' });
    }
    if (room.owner_id !== currentUserId && room.participant_id !== currentUserId) {
      return res.status(403).json({ error: '이 채팅방에 접근 권한이 없습니다.' });
    }

    // 읽음 처리
    await dbRun('UPDATE messages SET is_read = 1 WHERE room_id = ? AND sender_id != ?', [roomId, currentUserId]);

    // 메시지 목록 로드
    const messages = await dbAll('SELECT * FROM messages WHERE room_id = ? ORDER BY created_at ASC, id ASC', [roomId]);
    res.json(Array.isArray(messages) ? messages : []);
  } catch (err) {
    sendError(res, err)
  }
});

// 유저 프로필 상세 및 받은 후기 목록 조회
app.get('/api/users/:userId/profile', authenticateJWT, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await dbGet(`
      SELECT userId, nickname, gymName, threeLiftWeight, bench_press, squat, deadlift, 
             workout_career, profile_image, points, user_region, user_gym,
             popularity_score, workout_count, received_reviews_count 
      FROM User WHERE userId = ?
    `, [userId]);

    if (!user) {
      return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
    }

    if (user.user_gym) {
      try { user.user_gym = JSON.parse(user.user_gym); } catch (e) { }
    }

    // Get received reviews for this user
    const reviews = await dbAll(`
      SELECT r.*, u.nickname as reviewerNickname, u.profile_image as reviewerAvatar, u.gymName as reviewerGym
      FROM reviews r
      JOIN User u ON r.reviewer_id = u.userId
      WHERE r.target_user_id = ?
      ORDER BY r.created_at DESC
    `, [userId]);

    res.json({ user, reviews });
  } catch (err) {
    sendError(res, err)
  }
});

// 채팅방 나가기
app.post('/api/chats/rooms/:roomId/leave', authenticateJWT, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const currentUserId = req.user.userId;

    const room = await dbGet('SELECT * FROM chat_rooms WHERE id = ?', [roomId]);
    if (!room) {
      return res.status(404).json({ error: '채팅방을 찾을 수 없습니다.' });
    }

    if (room.owner_id !== currentUserId && room.participant_id !== currentUserId) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    let isOwner = room.owner_id === currentUserId;
    if (isOwner) {
      await dbRun('UPDATE chat_rooms SET owner_left = 1 WHERE id = ?', [roomId]);
    } else {
      await dbRun('UPDATE chat_rooms SET participant_left = 1 WHERE id = ?', [roomId]);
    }

    const leavingUser = await dbGet('SELECT nickname, userId FROM User WHERE userId = ?', [currentUserId]);
    const nameToDisplay = leavingUser.nickname || leavingUser.userId;
    const systemMsgContent = `${nameToDisplay}님이 채팅방을 나갔습니다.`;

    await dbRun(
      'INSERT INTO messages (room_id, sender_id, message, is_read) VALUES (?, "system", ?, 0)',
      [roomId, systemMsgContent]
    );

    // Emit system message to socket room
    io.to(`room_${roomId}`).emit('receive_message', {
      id: Date.now(),
      room_id: Number(roomId),
      sender_id: 'system',
      message: systemMsgContent,
      created_at: new Date().toISOString(),
      is_read: 0
    });

    const updatedRoom = await dbGet('SELECT * FROM chat_rooms WHERE id = ?', [roomId]);
    if (updatedRoom.owner_left === 1 && updatedRoom.participant_left === 1) {
      // Both left, clean up
      await dbRun('DELETE FROM messages WHERE room_id = ?', [roomId]);
      await dbRun('DELETE FROM workout_sessions WHERE room_id = ?', [roomId]);
      await dbRun('DELETE FROM chat_rooms WHERE id = ?', [roomId]);
      console.log(`[Chat] Deleted chat room ${roomId} as all participants left.`);
    } else {
      const targetId = isOwner ? room.participant_id : room.owner_id;
      io.to(`user_${targetId}`).emit('partner_left', { room_id: roomId });
    }

    res.json({ success: true, message: '채팅방을 나갔습니다.' });
  } catch (err) {
    sendError(res, err)
  }
});

// ----------------- WORKOUT SESSION API -----------------

// 운동 약속 생성
app.post('/api/chats/rooms/:roomId/workout', authenticateJWT, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const currentUserId = req.user.userId;
    const { gym_id, gym_name, appointment_date, appointment_time } = req.body;

    if (!gym_id || !gym_name || !appointment_date || !appointment_time) {
      return res.status(400).json({ error: '약속 필수 정보가 부족합니다.' });
    }

    const room = await dbGet('SELECT * FROM chat_rooms WHERE id = ?', [roomId]);
    if (!room || (room.owner_id !== currentUserId && room.participant_id !== currentUserId)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const result = await dbRun(
      'INSERT INTO workout_sessions (room_id, gym_id, gym_name, appointment_date, appointment_time, status) VALUES (?, ?, ?, ?, ?, "scheduled")',
      [roomId, gym_id, gym_name, appointment_date, appointment_time]
    );
    const sessionId = result.lastID;

    // 상대방 알림 전송
    const targetId = room.owner_id === currentUserId ? room.participant_id : room.owner_id;
    await createNotification(
      targetId,
      '운동예정',
      '새 운동 약속 생성',
      `${currentUserId}님이 운동 약속(${appointment_date} ${appointment_time})을 생성하셨습니다.`
    );

    res.status(201).json({ success: true, sessionId });
  } catch (err) {
    sendError(res, err)
  }
});

// 운동 완료 제출 및 상호 처리
app.post('/api/workout/sessions/:sessionId/complete', authenticateJWT, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const currentUserId = req.user.userId;
    const { completed } = req.body; // true / false

    const session = await dbGet(`
      SELECT ws.*, cr.owner_id, cr.participant_id, p.title as postTitle 
      FROM workout_sessions ws 
      JOIN chat_rooms cr ON ws.room_id = cr.id 
      JOIN Post p ON cr.post_id = p.postId 
      WHERE ws.id = ?
    `, [sessionId]);

    if (!session) return res.status(404).json({ error: '약속 일정을 찾을 수 없습니다.' });
    if (session.owner_id !== currentUserId && session.participant_id !== currentUserId) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const isOwner = session.owner_id === currentUserId;
    const val = completed ? 1 : 0;

    if (isOwner) {
      await dbRun('UPDATE workout_sessions SET owner_completed = ? WHERE id = ?', [val, sessionId]);
    } else {
      await dbRun('UPDATE workout_sessions SET participant_completed = ? WHERE id = ?', [val, sessionId]);
    }

    const updatedSession = await dbGet('SELECT * FROM workout_sessions WHERE id = ?', [sessionId]);

    if (updatedSession.owner_completed === 1 && updatedSession.participant_completed === 1) {
      // 둘 다 완료 -> completed
      await dbRun('UPDATE workout_sessions SET status = "completed" WHERE id = ?', [sessionId]);

      // 인기도 상승 및 운동 횟수 상승
      await adjustPopularity(session.owner_id, 1);
      await adjustPopularity(session.participant_id, 1);
      await dbRun('UPDATE User SET workout_count = workout_count + 1 WHERE userId IN (?, ?)', [session.owner_id, session.participant_id]);

      // 알림 발행
      await createNotification(
        session.owner_id,
        '후기작성',
        '운동 완료 & 후기 작성',
        `'${session.postTitle}' 운동이 완료되었습니다. 파트너에게 후기를 남겨주세요!`
      );
      await createNotification(
        session.participant_id,
        '후기작성',
        '운동 완료 & 후기 작성',
        `'${session.postTitle}' 운동이 완료되었습니다. 파트너에게 후기를 남겨주세요!`
      );

      res.json({ success: true, status: 'completed', message: '운동 완료 확인이 양자 승인되어 완료 처리 및 인기도 1점이 상승했습니다.' });
    } else {
      // 한쪽만 완료한 상태 -> 상대에게 완료 확인 요청
      const targetId = isOwner ? session.participant_id : session.owner_id;
      if (val === 1) {
        await createNotification(
          targetId,
          '운동완료요청',
          '운동 완료 확인 요청',
          `${currentUserId}님이 운동 완료 확인을 요청했습니다. 응답해 주세요.`
        );
      }
      res.json({ success: true, status: 'pending', message: '상대방의 운동 완료 승인을 대기하는 중입니다.' });
    }
  } catch (err) {
    sendError(res, err)
  }
});

// 운동 약속 취소
app.post('/api/workout/sessions/:sessionId/cancel', authenticateJWT, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const currentUserId = req.user.userId;

    const session = await dbGet('SELECT ws.*, cr.owner_id, cr.participant_id FROM workout_sessions ws JOIN chat_rooms cr ON ws.room_id = cr.id WHERE ws.id = ?', [sessionId]);
    if (!session) return res.status(404).json({ error: '약속 일정을 찾을 수 없습니다.' });
    if (session.owner_id !== currentUserId && session.participant_id !== currentUserId) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    if (session.status !== 'scheduled') {
      return res.status(400).json({ error: '대기 중인 운동 일정만 취소할 수 있습니다.' });
    }

    await dbRun('UPDATE workout_sessions SET status = "cancelled" WHERE id = ?', [sessionId]);

    // 취소한 사용자 인기도 감점
    await adjustPopularity(currentUserId, -1);

    // 상대방에게 취소 알림
    const targetId = session.owner_id === currentUserId ? session.participant_id : session.owner_id;
    await createNotification(
      targetId,
      '노쇼신고결과',
      '운동 약속 취소 알림',
      `${currentUserId}님이 예정된 운동 약속을 취소하셨습니다. 취소자의 인기도가 1점 차감됩니다.`
    );

    res.json({ success: true, message: '운동 약속을 취소했습니다. 인기도 점수가 1점 감소했습니다.' });
  } catch (err) {
    sendError(res, err)
  }
});

// 내 운동 일정 목록 조회
app.get('/api/users/me/workouts', authenticateJWT, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const workouts = await dbAll(`
      SELECT 
        ws.*, 
        cr.owner_id, 
        cr.participant_id,
        p.title as postTitle,
        (CASE WHEN cr.owner_id = ? THEN cr.participant_id ELSE cr.owner_id END) as partnerId
      FROM workout_sessions ws
      JOIN chat_rooms cr ON ws.room_id = cr.id
      JOIN Post p ON cr.post_id = p.postId
      WHERE cr.owner_id = ? OR cr.participant_id = ?
      ORDER BY ws.appointment_date DESC, ws.appointment_time DESC
    `, [currentUserId, currentUserId, currentUserId]);

    res.json(workouts);
  } catch (err) {
    sendError(res, err)
  }
});

// ----------------- REVIEW SYSTEM API -----------------

// 후기 작성
app.post('/api/workout/sessions/:sessionId/review', authenticateJWT, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const currentUserId = req.user.userId;
    const { rating, content } = req.body;

    if (!rating || !content) {
      return res.status(400).json({ error: '평점(rating)과 후기 내용을 모두 기입해 주세요.' });
    }

    const session = await dbGet('SELECT ws.*, cr.owner_id, cr.participant_id FROM workout_sessions ws JOIN chat_rooms cr ON ws.room_id = cr.id WHERE ws.id = ?', [sessionId]);
    if (!session) return res.status(404).json({ error: '운동 약속 일정을 찾을 수 없습니다.' });

    if (session.status !== 'completed') {
      return res.status(400).json({ error: '운동 완료 상태인 경우에만 후기를 작성할 수 있습니다.' });
    }

    if (session.owner_id !== currentUserId && session.participant_id !== currentUserId) {
      return res.status(403).json({ error: '이 약속의 참여자만 후기를 남길 수 있습니다.' });
    }

    const targetUserId = session.owner_id === currentUserId ? session.participant_id : session.owner_id;

    // 중복 작성 제한
    const existing = await dbGet('SELECT id FROM reviews WHERE session_id = ? AND reviewer_id = ?', [sessionId, currentUserId]);
    if (existing) {
      return res.status(400).json({ error: '이 운동 일정에 대해 이미 후기를 작성하셨습니다.' });
    }

    // 리뷰 저장
    await dbRun(
      'INSERT INTO reviews (session_id, reviewer_id, target_user_id, rating, content) VALUES (?, ?, ?, ?, ?)',
      [sessionId, currentUserId, targetUserId, Number(rating), content]
    );

    // 상대방 평점에 따른 인기도 증감
    // 5점: +2, 4점: +1, 3점: 0, 2점: -1, 1점: -2
    let popChange = 0;
    if (rating === 5) popChange = 2;
    else if (rating === 4) popChange = 1;
    else if (rating === 3) popChange = 0;
    else if (rating === 2) popChange = -1;
    else if (rating === 1) popChange = -2;

    await adjustPopularity(targetUserId, popChange);
    await dbRun('UPDATE User SET received_reviews_count = received_reviews_count + 1 WHERE userId = ?', [targetUserId]);

    // 알림 발송
    await createNotification(
      targetUserId,
      '후기작성',
      '새 파트너 후기 등록',
      `파트너가 내게 별점 ${rating}점과 후기를 보냈습니다: "${content.substring(0, 15)}..."`
    );

    res.json({ success: true, message: '후기 작성이 성공적으로 완료되었습니다.' });
  } catch (err) {
    sendError(res, err)
  }
});

// 내가 받은 후기 모아보기
app.get('/api/users/me/reviews/received', authenticateJWT, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const list = await dbAll(`
      SELECT r.*, u.nickname as reviewerNickname, u.profile_image as reviewerAvatar, u.gymName as reviewerGym
      FROM reviews r
      JOIN User u ON r.reviewer_id = u.userId
      WHERE r.target_user_id = ?
      ORDER BY r.created_at DESC
    `, [currentUserId]);
    res.json(list);
  } catch (err) {
    sendError(res, err)
  }
});

// 내가 작성한 후기 모아보기
app.get('/api/users/me/reviews/written', authenticateJWT, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const list = await dbAll(`
      SELECT r.*, u.nickname as targetNickname, u.profile_image as targetAvatar, u.gymName as targetGym
      FROM reviews r
      JOIN User u ON r.target_user_id = u.userId
      WHERE r.reviewer_id = ?
      ORDER BY r.created_at DESC
    `, [currentUserId]);
    res.json(list);
  } catch (err) {
    sendError(res, err)
  }
});

// ----------------- NO-SHOW REPORT API -----------------

// 노쇼 신고
app.post('/api/workout/sessions/:sessionId/no-show', authenticateJWT, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const currentUserId = req.user.userId;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: '신고 사유를 기입해 주세요.' });
    }

    const session = await dbGet('SELECT ws.*, cr.owner_id, cr.participant_id FROM workout_sessions ws JOIN chat_rooms cr ON ws.room_id = cr.id WHERE ws.id = ?', [sessionId]);
    if (!session) return res.status(404).json({ error: '운동 약속 일정을 찾을 수 없습니다.' });

    if (session.owner_id !== currentUserId && session.participant_id !== currentUserId) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const targetUserId = session.owner_id === currentUserId ? session.participant_id : session.owner_id;

    // 중복 신고 체크
    const existing = await dbGet('SELECT id FROM no_show_reports WHERE session_id = ? AND reporter_id = ?', [sessionId, currentUserId]);
    if (existing) {
      return res.status(400).json({ error: '해당 약속에 대해 이미 노쇼 신고를 제출하셨습니다.' });
    }

    await dbRun(
      'INSERT INTO no_show_reports (session_id, reporter_id, target_user_id, reason, status) VALUES (?, ?, ?, ?, "pending")',
      [sessionId, currentUserId, targetUserId, reason]
    );

    res.json({ success: true, message: '노쇼 신고가 접수되었습니다. 관리자 승인 시 대상자 인기도가 감소합니다.' });
  } catch (err) {
    sendError(res, err)
  }
});

// 관리자 신고 승인 (인기도 -15점 적용 및 알림 생성)
app.post('/api/admin/no-show/:reportId/approve', authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const reportId = req.params.reportId;
    const report = await dbGet('SELECT * FROM no_show_reports WHERE id = ?', [reportId]);
    if (!report) {
      return res.status(404).json({ error: '신고 내역을 찾을 수 없습니다.' });
    }
    if (report.status === 'approved') {
      return res.status(400).json({ error: '이미 승인 완료된 신고 내역입니다.' });
    }

    await dbRun('UPDATE no_show_reports SET status = "approved" WHERE id = ?', [reportId]);

    // 피신고자 인기도 15점 대폭 차감
    await adjustPopularity(report.target_user_id, -15);

    // 알림 발송
    await createNotification(
      report.target_user_id,
      '노쇼신고결과',
      '노쇼 신고 처리 결과 알림',
      `운동 불참 노쇼 신고가 확인되어 관리자 승인하에 인기도 점수가 15점 감소했습니다.`
    );

    await createNotification(
      report.reporter_id,
      '노쇼신고결결과',
      '노쇼 신고 승인 완료',
      `접수하신 ${report.target_user_id}님에 대한 노쇼 신고가 승인 완료되었습니다.`
    );

    res.json({ success: true, message: '노쇼 신고가 승인 완료되었습니다. 대상자 인기도가 15점 차감되었습니다.' });
  } catch (err) {
    sendError(res, err)
  }
});

// 전체 노쇼 신고 목록 조회 (테스트/관리용)
app.get('/api/admin/no-show', authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const reports = await dbAll('SELECT * FROM no_show_reports ORDER BY created_at DESC');
    res.json(reports);
  } catch (err) {
    sendError(res, err)
  }
});

// ----------------- NOTIFICATION API -----------------

// 알림 목록 조회
app.get('/api/notifications', authenticateJWT, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const list = await dbAll('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [currentUserId]);
    res.json(Array.isArray(list) ? list : []);
  } catch (err) {
    sendError(res, err)
  }
});

// 알림 단건 읽음 처리
app.put('/api/notifications/:id/read', authenticateJWT, async (req, res) => {
  try {
    const id = req.params.id;
    const currentUserId = req.user.userId;
    await dbRun('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, currentUserId]);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err)
  }
});

// ----------------- COMPLETE & POINT ROUTES (레거시/보조 완료) -----------------

// 보조 완료 처리 및 포인트 정산
app.post('/api/posts/:id/complete', authenticateJWT, async (req, res) => {
  try {
    const postId = req.params.id;
    const currentUserId = req.user.userId;
    const { assistantId } = req.body;

    if (!assistantId) {
      return res.status(400).json({ error: '보조를 수행한 유저 아이디(assistantId)가 필요합니다.' });
    }

    const post = await dbGet('SELECT * FROM Post WHERE postId = ?', [postId]);
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    if (post.authorId !== currentUserId) {
      return res.status(403).json({ error: '보조 완료 처리는 게시글 작성자만 가능합니다.' });
    }

    const assistant = await dbGet('SELECT * FROM User WHERE userId = ?', [assistantId]);
    if (!assistant) {
      return res.status(404).json({ error: '선택한 보조자 유저를 찾을 수 없습니다.' });
    }

    await dbRun(
      'UPDATE User SET points = points + 100 WHERE userId = ?',
      [assistantId]
    );

    await dbRun(
      "UPDATE Post SET status = '보조완료', recruit_status = 'closed' WHERE postId = ?",
      [postId]
    );

    res.json({
      success: true,
      message: `보조 완료 처리 및 ${assistantId}님에게 100포인트 정산이 완료되었습니다.`,
      updatedAssistantPoints: assistant.points + 100
    });
  } catch (err) {
    sendError(res, err)
  }
});

// 게시글 삭제 API (작성자 본인 또는 관리자 권한 필요)
app.delete('/api/posts/:id', authenticateJWT, async (req, res) => {
  try {
    const postId = req.params.id;
    const currentUserId = req.user.userId;
    const userRole = req.user.role;

    const post = await dbGet('SELECT * FROM Post WHERE postId = ?', [postId]);
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    // 작성자 본인 혹은 관리자만 삭제 가능
    if (post.authorId !== currentUserId && userRole !== 'admin') {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }

    // 관련 데이터 삭제
    const rooms = await dbAll('SELECT id FROM chat_rooms WHERE post_id = ?', [postId]);
    for (const room of rooms) {
      await dbRun('DELETE FROM messages WHERE room_id = ?', [room.id]);
      await dbRun('DELETE FROM workout_sessions WHERE room_id = ?', [room.id]);
    }
    await dbRun('DELETE FROM chat_rooms WHERE post_id = ?', [postId]);
    await dbRun('DELETE FROM bookmarks WHERE post_id = ?', [postId]);
    await dbRun('DELETE FROM post_applications WHERE post_id = ?', [postId]);
    await dbRun('DELETE FROM Comment WHERE post_id = ?', [postId]);
    await dbRun('DELETE FROM Post WHERE postId = ?', [postId]);

    res.json({ success: true, message: '게시글이 성공적으로 삭제되었습니다.' });
  } catch (err) {
    sendError(res, err)
  }
});

// Initialize DB and start server
initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
  });

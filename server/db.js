const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const dbPath = path.join(__dirname, 'health_partner.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Helper to run queries with promises
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  // Create tables
  await dbRun(`
    CREATE TABLE IF NOT EXISTS User (
      userId TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      gymName TEXT NOT NULL,
      threeLiftWeight INTEGER NOT NULL,
      preferredWorkoutTime TEXT NOT NULL,
      points INTEGER DEFAULT 0,
      user_region TEXT DEFAULT NULL,
      user_gym TEXT DEFAULT NULL,
      user_lat REAL DEFAULT NULL,
      user_lng REAL DEFAULT NULL,
      popularity_score INTEGER DEFAULT 0,
      workout_count INTEGER DEFAULT 0,
      received_reviews_count INTEGER DEFAULT 0,
      nickname TEXT DEFAULT NULL,
      bench_press INTEGER DEFAULT 0,
      squat INTEGER DEFAULT 0,
      deadlift INTEGER DEFAULT 0,
      workout_career TEXT DEFAULT NULL,
      profile_image TEXT DEFAULT 'avatar1',
      role TEXT DEFAULT 'user'
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS Post (
      postId INTEGER PRIMARY KEY AUTOINCREMENT,
      authorId TEXT NOT NULL,
      gymName TEXT NOT NULL,
      workoutType TEXT NOT NULL,
      targetWeight INTEGER NOT NULL,
      requestedSets TEXT NOT NULL,
      promiseTime TEXT NOT NULL,
      detailedLocation TEXT NOT NULL,
      status TEXT CHECK(status IN ('대기중', '매칭완료', '보조완료')) DEFAULT '대기중',
      region TEXT NOT NULL DEFAULT '우동',
      title TEXT NOT NULL DEFAULT '제목 없음',
      content TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'partner',
      recruit_status TEXT NOT NULL DEFAULT 'recruiting',
      max_members INTEGER NOT NULL DEFAULT 2,
      current_members INTEGER NOT NULL DEFAULT 1,
      workout_time TEXT NOT NULL DEFAULT 'weekday_evening',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (authorId) REFERENCES User(userId)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS Comment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      parent_comment_id INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES Post(postId),
      FOREIGN KEY (user_id) REFERENCES User(userId),
      FOREIGN KEY (parent_comment_id) REFERENCES Comment(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS post_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      applicant_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES Post(postId),
      FOREIGN KEY (applicant_id) REFERENCES User(userId),
      FOREIGN KEY (owner_id) REFERENCES User(userId)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      post_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES User(userId),
      FOREIGN KEY (post_id) REFERENCES Post(postId)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      owner_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      owner_left INTEGER DEFAULT 0,
      participant_left INTEGER DEFAULT 0,
      FOREIGN KEY (post_id) REFERENCES Post(postId),
      FOREIGN KEY (owner_id) REFERENCES User(userId),
      FOREIGN KEY (participant_id) REFERENCES User(userId)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      sender_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_read INTEGER DEFAULT 0,
      FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
      FOREIGN KEY (sender_id) REFERENCES User(userId)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS workout_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      gym_id TEXT NOT NULL,
      gym_name TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      status TEXT CHECK(status IN ('scheduled', 'completed', 'cancelled')) DEFAULT 'scheduled',
      owner_completed INTEGER DEFAULT 0,
      participant_completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES chat_rooms(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      reviewer_id TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES workout_sessions(id),
      FOREIGN KEY (reviewer_id) REFERENCES User(userId),
      FOREIGN KEY (target_user_id) REFERENCES User(userId)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS no_show_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      reporter_id TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT CHECK(status IN ('pending', 'approved')) DEFAULT 'pending',
      FOREIGN KEY (session_id) REFERENCES workout_sessions(id),
      FOREIGN KEY (reporter_id) REFERENCES User(userId),
      FOREIGN KEY (target_user_id) REFERENCES User(userId)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES User(userId)
    )
  `);

  // Dynamic migration for existing DB
  try {
    const userColumns = await dbAll("PRAGMA table_info(User)");
    const hasRegion = userColumns.some(c => c.name === 'user_region');
    const hasGym = userColumns.some(c => c.name === 'user_gym');
    const hasLat = userColumns.some(c => c.name === 'user_lat');
    const hasLng = userColumns.some(c => c.name === 'user_lng');
    const hasPopularity = userColumns.some(c => c.name === 'popularity_score');
    const hasWorkoutCount = userColumns.some(c => c.name === 'workout_count');
    const hasReceivedReviews = userColumns.some(c => c.name === 'received_reviews_count');
    const hasNickname = userColumns.some(c => c.name === 'nickname');
    const hasBenchPress = userColumns.some(c => c.name === 'bench_press');
    const hasSquat = userColumns.some(c => c.name === 'squat');
    const hasDeadlift = userColumns.some(c => c.name === 'deadlift');
    const hasWorkoutCareer = userColumns.some(c => c.name === 'workout_career');
    const hasProfileImage = userColumns.some(c => c.name === 'profile_image');
    const hasRole = userColumns.some(c => c.name === 'role');

    if (!hasRegion) await dbRun("ALTER TABLE User ADD COLUMN user_region TEXT DEFAULT NULL");
    if (!hasGym) await dbRun("ALTER TABLE User ADD COLUMN user_gym TEXT DEFAULT NULL");
    if (!hasLat) await dbRun("ALTER TABLE User ADD COLUMN user_lat REAL DEFAULT NULL");
    if (!hasLng) await dbRun("ALTER TABLE User ADD COLUMN user_lng REAL DEFAULT NULL");
    if (!hasPopularity) await dbRun("ALTER TABLE User ADD COLUMN popularity_score INTEGER DEFAULT 0");
    if (!hasWorkoutCount) await dbRun("ALTER TABLE User ADD COLUMN workout_count INTEGER DEFAULT 0");
    if (!hasReceivedReviews) await dbRun("ALTER TABLE User ADD COLUMN received_reviews_count INTEGER DEFAULT 0");
    if (!hasNickname) await dbRun("ALTER TABLE User ADD COLUMN nickname TEXT DEFAULT NULL");
    if (!hasBenchPress) await dbRun("ALTER TABLE User ADD COLUMN bench_press INTEGER DEFAULT 0");
    if (!hasSquat) await dbRun("ALTER TABLE User ADD COLUMN squat INTEGER DEFAULT 0");
    if (!hasDeadlift) await dbRun("ALTER TABLE User ADD COLUMN deadlift INTEGER DEFAULT 0");
    if (!hasWorkoutCareer) await dbRun("ALTER TABLE User ADD COLUMN workout_career TEXT DEFAULT NULL");
    if (!hasProfileImage) await dbRun("ALTER TABLE User ADD COLUMN profile_image TEXT DEFAULT 'avatar1'");
    if (!hasRole) await dbRun("ALTER TABLE User ADD COLUMN role TEXT DEFAULT 'user'");

    console.log('User table schema migrated.');
  } catch (err) {
    console.error('Error migrating User table:', err.message);
  }

  try {
    const postColumns = await dbAll("PRAGMA table_info(Post)");
    const hasPostRegion = postColumns.some(c => c.name === 'region');
    if (!hasPostRegion) {
      await dbRun("ALTER TABLE Post ADD COLUMN region TEXT NOT NULL DEFAULT '우동'");
      console.log('Post table schema migrated.');
    }
  } catch (err) {
    console.error('Error migrating Post table:', err.message);
  }

  try {
    const chatRoomColumns = await dbAll("PRAGMA table_info(chat_rooms)");
    const hasOwnerLeft = chatRoomColumns.some(c => c.name === 'owner_left');
    const hasParticipantLeft = chatRoomColumns.some(c => c.name === 'participant_left');

    if (!hasOwnerLeft) await dbRun("ALTER TABLE chat_rooms ADD COLUMN owner_left INTEGER DEFAULT 0");
    if (!hasParticipantLeft) await dbRun("ALTER TABLE chat_rooms ADD COLUMN participant_left INTEGER DEFAULT 0");
    console.log('chat_rooms table schema migrated.');
  } catch (err) {
    console.error('Error migrating chat_rooms table:', err.message);
  }

  console.log('Tables initialized successfully.');

  // Seed dummy system user to bypass foreign key constraint
  try {
    await dbRun(
      'INSERT OR IGNORE INTO User (userId, password, gymName, threeLiftWeight, preferredWorkoutTime, points, nickname, profile_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['system', '', '시스템', 0, '00:00', 0, '알림봇', 'avatar1']
    );
  } catch (err) {
    console.error('Error seeding system user:', err.message);
  }

  // Seed initial data if tables are empty
  const userCount = await dbGet('SELECT COUNT(*) as count FROM User WHERE userId != "system"');
  if (userCount.count === 0) {
    console.log('Seeding initial user data...');
    const defaultPasswordHash = bcrypt.hashSync('password123', 10);
    
    // Default gym info for seed users
    const defaultGym = JSON.stringify({
      id: "gym_1",
      name: "마블 피트니스 우동점",
      address: "부산 해운대구 우동 123",
      x: 129.1633519,
      y: 35.1593306
    });

    const users = [
      { id: 'user_kim', password: defaultPasswordHash, gym: '마블 피트니스 우동점', weight: 350, time: '18:00', points: 150, region: '우동', gymInfo: defaultGym, lat: 35.1593306, lng: 129.1633519, popularity: 12, workouts: 5, reviews: 3, nickname: '김동률', bench: 100, squat: 120, deadlift: 130, career: '2년', avatar: 'avatar2' },
      { id: 'user_lee', password: defaultPasswordHash, gym: '마블 피트니스 우동점', weight: 480, time: '19:30', points: 50, region: '우동', gymInfo: defaultGym, lat: 35.1593306, lng: 129.1633519, popularity: 37, workouts: 12, reviews: 8, nickname: '이대호', bench: 130, squat: 170, deadlift: 180, career: '5년', avatar: 'avatar3' },
      { id: 'user_park', password: defaultPasswordHash, gym: '마블 피트니스 우동점', weight: 380, time: '18:30', points: 0, region: '우동', gymInfo: defaultGym, lat: 35.1593306, lng: 129.1633519, popularity: 80, workouts: 24, reviews: 15, nickname: '박병호', bench: 100, squat: 130, deadlift: 150, career: '3년', avatar: 'avatar4' },
      { id: 'user_choi', password: defaultPasswordHash, gym: '홍대 에이원 헬스장', weight: 220, time: '07:30', points: 100, region: '서교동', gymInfo: JSON.stringify({
        id: "gym_6",
        name: "홍대 에이원 헬스장",
        address: "서울 마포구 서교동 22",
        x: 126.9230,
        y: 37.5530
      }), lat: 37.5530, lng: 126.9230, popularity: 224, workouts: 45, reviews: 30, nickname: '최강창민', bench: 60, squat: 80, deadlift: 80, career: '1년', avatar: 'avatar5' },
      { id: 'user_jung', password: defaultPasswordHash, gym: '마블 피트니스 우동점', weight: 340, time: '17:30', points: 80, region: '우동', gymInfo: defaultGym, lat: 35.1593306, lng: 129.1633519, popularity: 410, workouts: 98, reviews: 76, nickname: '정우성', bench: 90, squat: 120, deadlift: 130, career: '4년', avatar: 'avatar1' }
    ];

    for (const u of users) {
      await dbRun(
        'INSERT INTO User (userId, password, gymName, threeLiftWeight, preferredWorkoutTime, points, user_region, user_gym, user_lat, user_lng, popularity_score, workout_count, received_reviews_count, nickname, bench_press, squat, deadlift, workout_career, profile_image, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [u.id, u.password, u.gym, u.weight, u.time, u.points, u.region, u.gymInfo, u.lat, u.lng, u.popularity, u.workouts, u.reviews, u.nickname, u.bench, u.squat, u.deadlift, u.career, u.avatar, u.role || 'user']
      );
    }
  } else {
    // Ensure existing seed users have certified regions and detailed profile details
    console.log('Ensuring seed users have certified regions and profiles...');
    const defaultGym = JSON.stringify({
      id: "gym_1",
      name: "마블 피트니스 우동점",
      address: "부산 해운대구 우동 123",
      x: 129.1633519,
      y: 35.1593306
    });

    // Check if we need to update nicknames/avatars for existing seed users
    try {
      const checkUser = await dbGet("SELECT nickname FROM User WHERE userId = 'user_park'");
      if (checkUser && !checkUser.nickname) {
        console.log('Migrating detailed profile data for existing seed users...');
        await dbRun("UPDATE User SET nickname = '김동률', bench_press = 100, squat = 120, deadlift = 130, workout_career = '2년', profile_image = 'avatar2' WHERE userId = 'user_kim'");
        await dbRun("UPDATE User SET nickname = '이대호', bench_press = 130, squat = 170, deadlift = 180, workout_career = '5년', profile_image = 'avatar3' WHERE userId = 'user_lee'");
        await dbRun("UPDATE User SET nickname = '박병호', bench_press = 100, squat = 130, deadlift = 150, workout_career = '3년', profile_image = 'avatar4' WHERE userId = 'user_park'");
        await dbRun("UPDATE User SET nickname = '최강창민', bench_press = 60, squat = 80, deadlift = 80, workout_career = '1년', profile_image = 'avatar5' WHERE userId = 'user_choi'");
        await dbRun("UPDATE User SET nickname = '정우성', bench_press = 90, squat = 120, deadlift = 130, workout_career = '4년', profile_image = 'avatar1' WHERE userId = 'user_jung'");
        await dbRun("UPDATE User SET nickname = userId WHERE nickname IS NULL AND userId != 'system'");
      }
    } catch (err) {
      console.error('Error updating existing seed profiles:', err.message);
    }
    
    await dbRun(`
      UPDATE User 
      SET user_region = '우동', 
          user_gym = ?, 
          user_lat = 35.1593306, 
          user_lng = 129.1633519 
      WHERE user_region IS NULL AND userId IN ('user_kim', 'user_lee', 'user_park', 'user_jung')
    `, [defaultGym]);

    await dbRun(`
      UPDATE User 
      SET user_region = '서교동', 
          user_gym = ?, 
          user_lat = 37.5530, 
          user_lng = 126.9230 
      WHERE user_region IS NULL AND userId = 'user_choi'
    `, [JSON.stringify({
      id: "gym_6",
      name: "홍대 에이원 헬스장",
      address: "서울 마포구 서교동 22",
      x: 126.9230,
      y: 37.5530
    })]);

    // Ensure admin user exists in DB
    try {
      const checkAdmin = await dbGet("SELECT userId FROM User WHERE userId = 'admin'");
      if (!checkAdmin) {
        console.log('Seeding admin user...');
        const defaultPasswordHash = bcrypt.hashSync('password123', 10);
        const defaultGym = JSON.stringify({
          id: "gym_1",
          name: "마블 피트니스 우동점",
          address: "부산 해운대구 우동 123",
          x: 129.1633519,
          y: 35.1593306
        });
        await dbRun(
          'INSERT INTO User (userId, password, gymName, threeLiftWeight, preferredWorkoutTime, points, user_region, user_gym, user_lat, user_lng, popularity_score, workout_count, received_reviews_count, nickname, bench_press, squat, deadlift, workout_career, profile_image, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ['admin', defaultPasswordHash, '마블 피트니스 우동점', 500, '18:00', 1000, '우동', defaultGym, 35.1593306, 129.1633519, 999, 100, 50, '관리자', 150, 170, 180, '10년', 'avatar1', 'admin']
        );
      }
    } catch (err) {
      console.error('Error seeding/checking admin user:', err.message);
    }
  }

  const postCount = await dbGet('SELECT COUNT(*) as count FROM Post');
  if (postCount.count === 0) {
    console.log('Seeding initial post data...');
    const posts = [
      {
        authorId: 'user_park',
        gymName: '마블 피트니스 우동점',
        workoutType: '스쿼트',
        targetWeight: 140,
        requestedSets: '5세트',
        promiseTime: '18:00',
        detailedLocation: '프리웨이트존 파워랙 2번',
        status: '대기중',
        region: '우동',
        title: '평일 저녁 하체 같이 하실 분!',
        content: '스쿼트 같이 5세트 달릴 헬창 구합니다. 보조 필수!',
        category: 'partner',
        recruit_status: 'recruiting',
        max_members: 2,
        current_members: 1,
        workout_time: 'weekday_evening'
      },
      {
        authorId: 'user_lee',
        gymName: '마블 피트니스 우동점',
        workoutType: '벤치프레스',
        targetWeight: 120,
        requestedSets: '4세트',
        promiseTime: '19:00',
        detailedLocation: '벤치프레스 랙 존',
        status: '대기중',
        region: '우동',
        title: '벤치 120kg 보조 구합니다.',
        content: '깔릴 위험이 있어서 깔려도 구해줄 파트너 찾습니다.',
        category: 'partner',
        recruit_status: 'recruiting',
        max_members: 2,
        current_members: 1,
        workout_time: 'weekday_evening'
      },
      {
        authorId: 'user_jung',
        gymName: '마블 피트니스 우동점',
        workoutType: '데드리프트',
        targetWeight: 160,
        requestedSets: '3세트',
        promiseTime: '17:30',
        detailedLocation: '데드리프트 플랫폼',
        status: '매칭완료',
        region: '우동',
        title: '땅데드 160 같이 칠 사람',
        content: '플랫폼 자리잡았으니 오시면 됩니다.',
        category: 'partner',
        recruit_status: 'closed',
        max_members: 2,
        current_members: 2,
        workout_time: 'weekday_evening'
      },
      {
        authorId: 'user_choi',
        gymName: '홍대 에이원 헬스장',
        workoutType: '스쿼트',
        targetWeight: 80,
        requestedSets: '5세트',
        promiseTime: '07:30',
        detailedLocation: '1번 파워랙',
        status: '대기중',
        region: '서교동',
        title: '아침 스쿼트 메이트 구해요',
        content: '직장인이라 아침 일찍 조지고 출근합니다.',
        category: 'partner',
        recruit_status: 'recruiting',
        max_members: 3,
        current_members: 1,
        workout_time: 'weekday_morning'
      }
    ];

    for (const p of posts) {
      await dbRun(
        `INSERT INTO Post (authorId, gymName, workoutType, targetWeight, requestedSets, promiseTime, detailedLocation, status, region, title, content, category, recruit_status, max_members, current_members, workout_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.authorId, p.gymName, p.workoutType, p.targetWeight, p.requestedSets, p.promiseTime, p.detailedLocation, p.status, p.region, p.title, p.content, p.category, p.recruit_status, p.max_members, p.current_members, p.workout_time]
      );
    }
  }

  const commentCount = await dbGet('SELECT COUNT(*) as count FROM Comment');
  if (commentCount.count === 0) {
    console.log('Seeding initial comment data...');
    const comments = [
      { post_id: 1, user_id: 'user_kim', content: '제가 마침 18시에 하체 하려고 했는데 보조해드릴게요!', parent_comment_id: null },
      { post_id: 1, user_id: 'user_lee', content: '자세 봐드릴 수 있습니다. 18:00에 뵙죠.', parent_comment_id: null },
      { post_id: 1, user_id: 'user_kim', content: '답변 감사합니다! 랙 2번에서 대기할게요.', parent_comment_id: 2 },
      { post_id: 2, user_id: 'user_kim', content: '벤치 120이면 보조 필수죠. 도와드릴 수 있습니다!', parent_comment_id: null }
    ];

    for (const c of comments) {
      await dbRun(
        'INSERT INTO Comment (post_id, user_id, content, parent_comment_id) VALUES (?, ?, ?, ?)',
        [c.post_id, c.user_id, c.content, c.parent_comment_id]
      );
    }
  }
}

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initDb
};

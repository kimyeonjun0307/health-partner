// JWT Auth API Verification Script
// This script calls the running server at http://localhost:3000

async function runTests() {
  console.log('Starting JWT Authentication API tests on http://localhost:3000 ...');
  
  const baseUrl = 'http://localhost:3000';
  let kimToken = '';
  let parkToken = '';

  // 1. 로그인 테스트 (user_kim / password123)
  console.log('\nTest 1: Login with initial user (user_kim / password123)');
  try {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user_kim', password: 'password123' })
    });
    
    const data = await loginRes.json();
    console.log('Login Response Status:', loginRes.status);
    if (loginRes.status !== 200 || !data.token) {
      throw new Error('Test 1 Failed: Should login successfully and return token.');
    }
    kimToken = data.token;
    console.log('Token successfully issued!');
    console.log('Test 1 Passed!');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  // 2. 인증 없는 API 접근 차단 검증
  console.log('\nTest 2: Access secure endpoint without JWT');
  try {
    const noTokenRes = await fetch(`${baseUrl}/api/posts`);
    const data = await noTokenRes.json();
    console.log('Response Status without token:', noTokenRes.status);
    console.log('Response body:', data);
    if (noTokenRes.status !== 401) {
      throw new Error('Test 2 Failed: Should block requests without token with 401.');
    }
    console.log('Test 2 Passed!');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  // 3. 잘못된 토큰 검증
  console.log('\nTest 3: Access secure endpoint with invalid JWT');
  try {
    const invalidTokenRes = await fetch(`${baseUrl}/api/posts`, {
      headers: { 'Authorization': 'Bearer invalid_token_here' }
    });
    const data = await invalidTokenRes.json();
    console.log('Response Status with invalid token:', invalidTokenRes.status);
    console.log('Response body:', data);
    if (invalidTokenRes.status !== 403) {
      throw new Error('Test 3 Failed: Should block invalid token with 403.');
    }
    console.log('Test 3 Passed!');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  // 4. 유효한 토큰으로 내 정보 및 게시글 조회 테스트
  console.log('\nTest 4: Get profile and posts with valid JWT (user_kim)');
  try {
    const profileRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${kimToken}` }
    });
    const profile = await profileRes.json();
    console.log('Profile Response Status:', profileRes.status);
    console.log('User gym:', profile.gymName);
    
    const postsRes = await fetch(`${baseUrl}/api/posts`, {
      headers: { 'Authorization': `Bearer ${kimToken}` }
    });
    const postsData = await postsRes.json();
    console.log('Posts Response Status:', postsRes.status);
    console.log(`Fetched posts count: ${postsData.posts.length}`);
    
    if (profileRes.status !== 200 || postsRes.status !== 200) {
      throw new Error('Test 4 Failed: Should fetch profile and posts successfully.');
    }
    console.log('Test 4 Passed!');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  // 5. 신규 회원가입 및 로그인 테스트
  console.log('\nTest 5: Register new user and login');
  try {
    const newUserId = `user_tester_${Date.now()}`;
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: newUserId,
        password: 'testpassword',
        gymName: '마블 피트니스',
        threeLiftWeight: 250,
        preferredWorkoutTime: '15:00'
      })
    });
    console.log('Register Response Status:', registerRes.status);
    
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: newUserId, password: 'testpassword' })
    });
    const loginData = await loginRes.json();
    console.log('New User Login Status:', loginRes.status);
    
    if (registerRes.status !== 201 || loginRes.status !== 200 || !loginData.token) {
      throw new Error('Test 5 Failed: New user registration or login failed.');
    }
    console.log('Test 5 Passed!');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  // 6. 댓글 작성 및 보조 완료 처리 통합 플로우 테스트
  console.log('\nTest 6: Post comments and complete matching (End-to-End)');
  try {
    // user_park로 로그인
    const loginPark = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user_park', password: 'password123' })
    });
    const parkData = await loginPark.json();
    parkToken = parkData.token;

    // user_kim 토큰으로 post 1번에 댓글 작성
    const commentRes = await fetch(`${baseUrl}/api/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kimToken}`
      },
      body: JSON.stringify({ postId: 1, content: 'E2E 테스트 지원 댓글!' })
    });
    console.log('Post Comment Status:', commentRes.status);

    // user_park (게시글 작성자)가 댓글 목록 확인 및 user_kim을 보조 완료 처리
    const detailRes = await fetch(`${baseUrl}/api/posts/1`, {
      headers: { 'Authorization': `Bearer ${parkToken}` }
    });
    const detailData = await detailRes.json();
    console.log('E2E Post details retrieved. Comments count:', detailData.comments.length);

    // user_kim 포인트 확인
    const userKimBefore = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${kimToken}` }
    });
    const kimBeforeData = await userKimBefore.json();
    console.log('User Kim Points Before:', kimBeforeData.points);

    // 완료 처리
    const completeRes = await fetch(`${baseUrl}/api/posts/1/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${parkToken}`
      },
      body: JSON.stringify({ assistantId: 'user_kim' })
    });
    console.log('Complete Matching Status:', completeRes.status);
    const completeData = await completeRes.json();
    console.log('Complete Response message:', completeData.message);

    // user_kim 포인트 확인 (100포인트 올랐는지 검증)
    const userKimAfter = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${kimToken}` }
    });
    const kimAfterData = await userKimAfter.json();
    console.log('User Kim Points After:', kimAfterData.points);

    if (kimAfterData.points !== kimBeforeData.points + 100) {
      throw new Error('Test 6 Failed: Assistant did not receive 100 points on completion.');
    }
    console.log('Test 6 Passed!');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  console.log('\n=======================================');
  console.log('🎉 ALL JWT AUTHENTICATION API TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('=======================================');
}

runTests();

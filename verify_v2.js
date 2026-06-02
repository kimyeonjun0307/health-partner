// Ver.2 Flow Verification Script
// This script validates GPS authentication, gym search, gym registration, and neighborhood filtering.

async function runV2Tests() {
  console.log('Starting Ver.2 Location-Based Authentication & Guard API tests...');
  const baseUrl = 'http://localhost:3000';
  let testerToken = '';
  const testUserId = `v2_tester_${Date.now()}`;

  // 1. 회원가입 및 로그인
  console.log('\n--- Step 1: Register and Login a fresh new user ---');
  try {
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testUserId,
        password: 'password123',
        gymName: '임시 헬스장',
        threeLiftWeight: 200,
        preferredWorkoutTime: '18:00'
      })
    });
    console.log('Registration Status:', registerRes.status);
    if (registerRes.status !== 201) throw new Error('Registration failed');

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: testUserId, password: 'password123' })
    });
    const loginData = await loginRes.json();
    console.log('Login Status:', loginRes.status);
    testerToken = loginData.token;
    if (!testerToken) throw new Error('Token is missing');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // 2. 미인증 상태에서 /api/posts 접근 시 403 Guard 확인
  console.log('\n--- Step 2: Access posts list BEFORE certification (Expected: 403 Guard) ---');
  try {
    const postsRes = await fetch(`${baseUrl}/api/posts`, {
      headers: { 'Authorization': `Bearer ${testerToken}` }
    });
    const data = await postsRes.json();
    console.log('Posts Access Status:', postsRes.status);
    console.log('Posts Access Error Message:', data.error);
    console.log('Posts Access UnauthorizedReason:', data.unauthorizedReason);

    if (postsRes.status !== 403 || data.unauthorizedReason !== 'LOCATION_REQUIRED') {
      throw new Error('Step 2 Failed: Should block access with 403 and LOCATION_REQUIRED');
    }
    console.log('Step 2 Passed: Access correctly blocked.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // 3. GPS 동네 인증
  console.log('\n--- Step 3: Perform GPS neighborhood authentication ---');
  try {
    // Busan Haeundae Udong coords: y=35.1593306, x=129.1633519
    const authRes = await fetch(`${baseUrl}/api/region/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testerToken}`
      },
      body: JSON.stringify({ lat: 35.1593306, lng: 129.1633519 })
    });
    const authData = await authRes.json();
    console.log('GPS Auth Status:', authRes.status);
    console.log('GPS Auth Message:', authData.message);
    console.log('Certified Region:', authData.user.user_region);

    if (authRes.status !== 200 || authData.user.user_region !== '우동') {
      throw new Error('Step 3 Failed: Neighborhood should be certified as "우동"');
    }
    console.log('Step 3 Passed!');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // 4. 동네 인증만 되고 헬스장 미등록 상태에서 글 조회 시 403 가드 검증
  console.log('\n--- Step 4: Access posts after region auth but before gym registration (Expected: 403 Guard) ---');
  try {
    const postsRes = await fetch(`${baseUrl}/api/posts`, {
      headers: { 'Authorization': `Bearer ${testerToken}` }
    });
    const data = await postsRes.json();
    console.log('Posts Access Status (only region certified):', postsRes.status);
    if (postsRes.status !== 403) {
      throw new Error('Step 4 Failed: Should still block access with 403 because gym is not registered');
    }
    console.log('Step 4 Passed: Gym registration is still required!');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // 5. 동네 기반 헬스장 검색
  console.log('\n--- Step 5: Search for local gyms in "우동" ---');
  try {
    const searchRes = await fetch(`${baseUrl}/api/gyms/search?query=마블`, {
      headers: { 'Authorization': `Bearer ${testerToken}` }
    });
    const results = await searchRes.json();
    console.log('Gym Search Status:', searchRes.status);
    console.log('Gym Search Results Count:', results.length);
    if (results.length > 0) {
      console.log('First result:', results[0].name, '(', results[0].address, ')');
    }

    if (searchRes.status !== 200 || results.length === 0) {
      throw new Error('Step 5 Failed: Should return at least one gym in "우동" matching "마블"');
    }
    console.log('Step 5 Passed!');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // 6. 헬스장 선택 등록
  console.log('\n--- Step 6: Register selected gym ---');
  try {
    const registerGymRes = await fetch(`${baseUrl}/api/users/gym`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testerToken}`
      },
      body: JSON.stringify({
        id: "gym_1",
        name: "마블 피트니스 우동점",
        address: "부산 해운대구 우동 123",
        x: "129.1633519",
        y: "35.1593306"
      })
    });
    const registerGymData = await registerGymRes.json();
    console.log('Register Gym Status:', registerGymRes.status);
    console.log('Register Gym Message:', registerGymData.message);
    console.log('Updated User Gym:', registerGymData.user.user_gym);

    if (registerGymRes.status !== 200 || !registerGymData.user.user_gym) {
      throw new Error('Step 6 Failed: Gym registration failed');
    }
    console.log('Step 6 Passed!');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // 7. 동네인증 및 헬스장 등록 완료 후 최종 커뮤니티 조회
  console.log('\n--- Step 7: Verify posts access after full certification ---');
  try {
    const postsRes = await fetch(`${baseUrl}/api/posts`, {
      headers: { 'Authorization': `Bearer ${testerToken}` }
    });
    const postsData = await postsRes.json();
    console.log('Posts Access Status (Fully certified):', postsRes.status);
    console.log('Total visible posts in Udong:', postsData.posts.length);

    if (postsRes.status !== 200) {
      throw new Error('Step 7 Failed: Access should be allowed');
    }
    console.log('Step 7 Passed!');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  console.log('\n=======================================');
  console.log('🎉 ALL VER.2 WORKFLOW TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('=======================================');
}

runV2Tests();

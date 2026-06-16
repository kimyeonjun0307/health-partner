// Verification Script for Post Deletion and Admin RBAC
const baseUrl = 'http://localhost:3000';

async function runTests() {
  console.log('Starting Deletion & RBAC Verification Tests...');

  let adminToken = '';
  let authorToken = '';
  let otherToken = '';
  let postId = null;

  // 1. Login Admin
  try {
    console.log('\n--- Step 1: Login Admin user ---');
    const adminRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'admin', password: 'password123' })
    });
    const adminData = await adminRes.json();
    adminToken = adminData.token;
    console.log('Admin login status:', adminRes.status, adminData.user.role);
    if (adminRes.status !== 200 || adminData.user.role !== 'admin') {
      throw new Error('Admin login failed or role is not admin');
    }
  } catch (err) {
    console.error('Admin Login Error:', err.message);
    process.exit(1);
  }

  // 2. Register / Login Author
  const authorId = `author_${Date.now()}`;
  try {
    console.log('\n--- Step 2: Register & Login Post Author ---');
    await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: authorId,
        password: 'password123',
        gymName: '마블 피트니스 우동점',
        threeLiftWeight: 300,
        preferredWorkoutTime: '18:00'
      })
    });
    
    // Perform GPS Auth for author
    const authorLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: authorId, password: 'password123' })
    });
    const authorData = await authorLogin.json();
    authorToken = authorData.token;

    // GPS Auth to bypass location guard
    await fetch(`${baseUrl}/api/region/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authorToken}`
      },
      body: JSON.stringify({ lat: 35.1593306, lng: 129.1633519 })
    });

    // Register Gym to bypass location guard
    await fetch(`${baseUrl}/api/users/gym`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authorToken}`
      },
      body: JSON.stringify({
        id: "gym_1",
        name: "마블 피트니스 우동점",
        address: "부산 해운대구 우동 123",
        x: "129.1633519",
        y: "35.1593306"
      })
    });

    console.log('Author registered and location certified successfully.');
  } catch (err) {
    console.error('Author Setup Error:', err.message);
    process.exit(1);
  }

  // 3. Register & Login Other User
  const otherId = `other_${Date.now()}`;
  try {
    console.log('\n--- Step 3: Register & Login Other User ---');
    await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: otherId,
        password: 'password123',
        gymName: '마블 피트니스 우동점',
        threeLiftWeight: 150,
        preferredWorkoutTime: '12:00'
      })
    });
    const otherLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: otherId, password: 'password123' })
    });
    const otherData = await otherLogin.json();
    otherToken = otherData.token;

    // GPS Auth and Gym Register
    await fetch(`${baseUrl}/api/region/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${otherToken}`
      },
      body: JSON.stringify({ lat: 35.1593306, lng: 129.1633519 })
    });
    await fetch(`${baseUrl}/api/users/gym`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${otherToken}`
      },
      body: JSON.stringify({
        id: "gym_1",
        name: "마블 피트니스 우동점",
        address: "부산 해운대구 우동 123",
        x: "129.1633519",
        y: "35.1593306"
      })
    });

    console.log('Other user registered and location certified successfully.');
  } catch (err) {
    console.error('Other User Setup Error:', err.message);
    process.exit(1);
  }

  // 4. Create a post by Author
  try {
    console.log('\n--- Step 4: Create a post as Author ---');
    const postRes = await fetch(`${baseUrl}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authorToken}`
      },
      body: JSON.stringify({
        title: '삭제 테스트 게시글',
        content: '곧 삭제될 게시글입니다.',
        category: 'partner',
        max_members: 2,
        workout_time: 'weekday_evening',
        workoutType: '스쿼트',
        targetWeight: '100',
        requestedSets: '5세트',
        promiseTime: '18:00',
        detailedLocation: '우동 마블피트니스'
      })
    });
    const postData = await postRes.json();
    postId = postData.postId;
    console.log('Post created successfully. Post ID:', postId);
  } catch (err) {
    console.error('Post Creation Error:', err.message);
    process.exit(1);
  }

  // 5. Try deleting post by OTHER user (Expected: 403 Forbidden)
  try {
    console.log('\n--- Step 5: Try deleting post by another user (Expected: 403) ---');
    const deleteRes = await fetch(`${baseUrl}/api/posts/${postId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${otherToken}` }
    });
    const deleteData = await deleteRes.json();
    console.log('Delete Status:', deleteRes.status);
    console.log('Error Message:', deleteData.error);
    if (deleteRes.status !== 403) {
      throw new Error('Should have returned 403 Forbidden');
    }
    console.log('Step 5 Passed: Other user is correctly blocked from deleting.');
  } catch (err) {
    console.error('Step 5 Failed:', err.message);
    process.exit(1);
  }

  // 6. Try deleting post by Author (Expected: 200 Success)
  try {
    console.log('\n--- Step 6: Try deleting post by the post author (Expected: 200) ---');
    const deleteRes = await fetch(`${baseUrl}/api/posts/${postId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authorToken}` }
    });
    const deleteData = await deleteRes.json();
    console.log('Delete Status:', deleteRes.status);
    console.log('Success Message:', deleteData.message);
    if (deleteRes.status !== 200) {
      throw new Error('Delete failed for author');
    }
    console.log('Step 6 Passed: Author successfully deleted their own post.');
  } catch (err) {
    console.error('Step 6 Failed:', err.message);
    process.exit(1);
  }

  // 7. Create another post and test deleting by Admin (Expected: 200 Success)
  let secondPostId = null;
  try {
    console.log('\n--- Step 7: Create a second post and delete it as Admin (Expected: 200) ---');
    const postRes = await fetch(`${baseUrl}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authorToken}`
      },
      body: JSON.stringify({
        title: '어드민 삭제 테스트 게시글',
        content: '어드민이 곧 삭제할 게시글입니다.',
        category: 'partner',
        max_members: 2,
        workout_time: 'weekday_evening',
        workoutType: '데드리프트',
        targetWeight: '120',
        requestedSets: '5세트',
        promiseTime: '20:00',
        detailedLocation: '우동 마블피트니스'
      })
    });
    const postData = await postRes.json();
    secondPostId = postData.postId;
    console.log('Second Post created. ID:', secondPostId);

    const deleteRes = await fetch(`${baseUrl}/api/posts/${secondPostId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const deleteData = await deleteRes.json();
    console.log('Admin Delete Status:', deleteRes.status);
    console.log('Admin Success Message:', deleteData.message);
    if (deleteRes.status !== 200) {
      throw new Error('Delete failed for Admin');
    }
    console.log('Step 7 Passed: Admin successfully deleted post.');
  } catch (err) {
    console.error('Step 7 Failed:', err.message);
    process.exit(1);
  }

  // 8. Test Admin Protected Routes (Expected: 403 Forbidden for non-admin)
  try {
    console.log('\n--- Step 8: Verify access to Admin protected endpoints ---');
    const nonAdminGetRes = await fetch(`${baseUrl}/api/admin/no-show`, {
      headers: { 'Authorization': `Bearer ${authorToken}` }
    });
    console.log('Non-Admin GET /api/admin/no-show status:', nonAdminGetRes.status);
    
    const adminGetRes = await fetch(`${baseUrl}/api/admin/no-show`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('Admin GET /api/admin/no-show status:', adminGetRes.status);

    if (nonAdminGetRes.status !== 403 || adminGetRes.status !== 200) {
      throw new Error('Step 8 Failed: RBAC middleware not working as expected.');
    }
    console.log('Step 8 Passed: Admin routes are successfully secured with authorizeAdmin.');
  } catch (err) {
    console.error('Step 8 Failed:', err.message);
    process.exit(1);
  }

  console.log('\n=======================================');
  console.log('🎉 ALL DELETION & RBAC TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('=======================================');
}

runTests();

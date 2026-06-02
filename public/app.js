// App State
let state = {
  currentUserId: 'user_kim',
  currentUserProfile: null,
  allUsers: [],
  posts: [],
  filters: {
    timeMatch: false,
    sortBy: 'latest'
  },
  selectedPostId: null
};

// DOM Elements
const userSwitcher = document.getElementById('user-switcher');
const headerUserName = document.getElementById('header-user-name');
const headerUserPoints = document.getElementById('header-user-points');
const profileUserId = document.getElementById('profile-user-id');
const profileGym = document.getElementById('profile-gym');
const profileWeight = document.getElementById('profile-weight');
const profileTime = document.getElementById('profile-time');
const boardGymName = document.getElementById('board-gym-name');
const postsContainer = document.getElementById('posts-container');

// Filters and Controls
const timeMatchToggle = document.getElementById('time-match-toggle');
const sortButtons = document.querySelectorAll('.sort-btn');
const newPostBtn = document.getElementById('new-post-btn');
const editProfileBtn = document.getElementById('edit-profile-btn');

// Modals
const profileModal = document.getElementById('profile-modal');
const postModal = document.getElementById('post-modal');
const detailModal = document.getElementById('detail-modal');

// Close buttons
const closeProfileModal = document.getElementById('close-profile-modal');
const cancelProfileBtn = document.getElementById('cancel-profile-btn');
const closePostModal = document.getElementById('close-post-modal');
const cancelPostBtn = document.getElementById('cancel-post-btn');
const closeDetailModal = document.getElementById('close-detail-modal');

// Forms
const profileForm = document.getElementById('profile-form');
const editGymInput = document.getElementById('edit-gym');
const editWeightInput = document.getElementById('edit-weight');
const editTimeInput = document.getElementById('edit-time');

const postForm = document.getElementById('post-form');
const commentForm = document.getElementById('comment-form');
const commentContent = document.getElementById('comment-content');

// Detail elements
const detailStatus = document.getElementById('detail-status');
const detailWorkoutTitle = document.getElementById('detail-workout-title');
const detailAuthor = document.getElementById('detail-author');
const detailAuthorWeight = document.getElementById('detail-author-weight');
const detailWeightSets = document.getElementById('detail-weight-sets');
const detailPromiseTime = document.getElementById('detail-promise-time');
const detailLocation = document.getElementById('detail-location');
const authorActionPanel = document.getElementById('author-action-panel');
const assistantSelect = document.getElementById('assistant-select');
const completeBtn = document.getElementById('complete-btn');
const commentsList = document.getElementById('comments-list');
const detailCommentCount = document.getElementById('detail-comment-count');

// Fetch Helpers
async function apiRequest(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-user-id': state.currentUserId,
    ...options.headers
  };
  
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

// ----------------- App Lifecycle -----------------

async function init() {
  try {
    setupEventListeners();
    await loadUsers();
    await loadDashboard();
  } catch (err) {
    console.error('Initialization error:', err);
    alert('앱을 불러오는 중 오류가 발생했습니다: ' + err.message);
  }
}

// Load users for the switcher
async function loadUsers() {
  state.allUsers = await apiRequest('/api/users');
  
  // Populate dropdown
  userSwitcher.innerHTML = '';
  state.allUsers.forEach(u => {
    const option = document.createElement('option');
    option.value = u.userId;
    option.textContent = `${u.userId === state.currentUserId ? '👤 ' : ''}${u.userId} (${u.gymName})`;
    option.selected = u.userId === state.currentUserId;
    userSwitcher.appendChild(option);
  });
}

// Load posts and current user profile
async function loadDashboard() {
  const queryParams = new URLSearchParams({
    timeMatch: state.filters.timeMatch,
    sortBy: state.filters.sortBy,
    currentUserId: state.currentUserId
  });

  const data = await apiRequest(`/api/posts?${queryParams.toString()}`);
  state.posts = data.posts;
  state.currentUserProfile = data.currentUser;

  // Render components
  renderHeaderAndProfile();
  renderPosts();
}

// Render Header & Sidebar User Profile
function renderHeaderAndProfile() {
  const user = state.currentUserProfile;
  if (!user) return;

  headerUserName.textContent = user.userId;
  headerUserPoints.textContent = user.points.toLocaleString();
  
  profileUserId.textContent = `@${user.userId}`;
  profileGym.textContent = user.gymName;
  profileWeight.textContent = `${user.threeLiftWeight}kg`;
  profileTime.textContent = user.preferredWorkoutTime;
  
  boardGymName.textContent = user.gymName;

  // Update switcher text to match updated gym info
  const selectedOption = userSwitcher.querySelector(`option[value="${user.userId}"]`);
  if (selectedOption) {
    selectedOption.textContent = `👤 ${user.userId} (${user.gymName})`;
  }
}

// Render Post list
function renderPosts() {
  postsContainer.innerHTML = '';

  if (state.posts.length === 0) {
    postsContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🏋️‍♂️</span>
        <p>현재 헬스장(${state.currentUserProfile?.gymName})에 등록된 파트너 매칭 글이 없습니다.</p>
        <p style="font-size: 0.8rem; color: var(--color-text-muted);">새 글을 작성하거나 필터를 해제해 보세요.</p>
      </div>
    `;
    return;
  }

  state.posts.forEach(post => {
    const isCurrentUserAuthor = post.authorId === state.currentUserId;
    const card = document.createElement('div');
    card.className = `post-card glass-panel ${post.status === '매칭완료' ? 'matching-done' : ''}`;
    
    // Convert time diff for display indicator
    const userPrefTimeMins = timeToMinutes(state.currentUserProfile?.preferredWorkoutTime);
    const postPromiseTimeMins = timeToMinutes(post.promiseTime);
    const timeDiff = Math.abs(postPromiseTimeMins - userPrefTimeMins);
    const matchesTime = timeDiff <= 60;

    card.innerHTML = `
      <div class="post-card-header">
        <div class="workout-tag">${post.workoutType}</div>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${matchesTime ? '<span class="status-badge" style="background: rgba(0, 229, 255, 0.1); color: var(--color-secondary); border-color: rgba(0, 229, 255, 0.2);">시간 매칭</span>' : ''}
          <span class="status-badge">${post.status}</span>
        </div>
      </div>
      <div class="post-card-title">${post.authorId}님의 ${post.workoutType} 보조 매칭 요청</div>
      <div class="post-meta-details">
        <div class="meta-field">
          <span class="meta-lbl">목표 무게</span>
          <span class="meta-val highlight-weight">${post.targetWeight}kg</span>
        </div>
        <div class="meta-field">
          <span class="meta-lbl">요청 세트</span>
          <span class="meta-val">${post.requestedSets}</span>
        </div>
        <div class="meta-field">
          <span class="meta-lbl">약속 시간</span>
          <span class="meta-val highlight-time">${post.promiseTime}</span>
        </div>
        <div class="meta-field">
          <span class="meta-lbl">헬스장 상세위치</span>
          <span class="meta-val" title="${post.detailedLocation}">${truncateText(post.detailedLocation, 12)}</span>
        </div>
      </div>
      <div class="post-card-footer">
        <div class="author-id-text">
          작성자: @${post.authorId}
          <span class="weight">3대 ${post.authorThreeLiftWeight}kg</span>
        </div>
        <div>
          <span class="comment-count-badge">💬 댓글 보러가기</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => openPostDetail(post.postId));
    postsContainer.appendChild(card);
  });
}

// Load & Open Post Details Modal
async function openPostDetail(postId) {
  try {
    state.selectedPostId = postId;
    const { post, comments } = await apiRequest(`/api/posts/${postId}`);
    
    // Bind Post Data
    detailStatus.textContent = post.status;
    detailStatus.className = 'status-badge';
    if (post.status === '매칭완료') {
      detailStatus.classList.add('matching-done');
    }
    
    detailWorkoutTitle.textContent = `${post.authorId}님의 ${post.workoutType} 보조 매칭`;
    detailAuthor.textContent = `@${post.authorId}`;
    detailAuthorWeight.textContent = `${post.authorThreeLiftWeight}kg (보유: ${post.authorPoints}P)`;
    detailWeightSets.textContent = `${post.targetWeight}kg / ${post.requestedSets}`;
    detailPromiseTime.textContent = post.promiseTime;
    detailLocation.textContent = post.detailedLocation;
    
    // Comments Count
    detailCommentCount.textContent = comments.length;

    // Render Comments
    commentsList.innerHTML = '';
    if (comments.length === 0) {
      commentsList.innerHTML = `
        <div style="text-align: center; color: var(--color-text-muted); font-size: 0.85rem; padding: 24px 0;">
          작성된 댓글이 없습니다. 첫 댓글을 남겨보세요!
        </div>
      `;
    } else {
      comments.forEach(c => {
        const item = document.createElement('div');
        item.className = 'comment-item';
        item.innerHTML = `
          <div class="comment-meta">
            <span class="comment-author">@${c.authorId} <span class="comment-author-spec">(3대 ${c.commenterThreeLiftWeight}kg / ${c.commenterGym})</span></span>
            <span>#${c.commentId}</span>
          </div>
          <div class="comment-body">${escapeHTML(c.content)}</div>
        `;
        commentsList.appendChild(item);
      });
    }

    // 4단계: 보조 완료 버튼 활성화 로직 (현재 로그인 유저가 해당 글의 작성자이며, 진행상태가 '보조완료'가 아닌 경우)
    const isCurrentUserAuthor = post.authorId === state.currentUserId;
    if (isCurrentUserAuthor && post.status !== '보조완료') {
      authorActionPanel.classList.remove('hidden');
      
      // Populate Assistant Selection Dropdown (Only show commenters who are not the author themselves)
      assistantSelect.innerHTML = '<option value="">보조 파트너 선택...</option>';
      const uniqueCommenterIds = [...new Set(comments.map(c => c.authorId).filter(id => id !== post.authorId))];
      
      if (uniqueCommenterIds.length === 0) {
        // No commenters
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = '댓글을 남긴 보조 후보자가 없습니다';
        assistantSelect.appendChild(opt);
        completeBtn.disabled = true;
      } else {
        uniqueCommenterIds.forEach(id => {
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = `@${id}`;
          assistantSelect.appendChild(opt);
        });
        completeBtn.disabled = false;
      }
    } else {
      authorActionPanel.classList.add('hidden');
    }

    // Scroll to bottom of comments
    setTimeout(() => {
      commentsList.scrollTop = commentsList.scrollHeight;
    }, 50);

    // Show modal
    detailModal.classList.remove('hidden');
  } catch (err) {
    console.error('Error fetching post detail:', err);
    alert('상세 정보를 불러올 수 없습니다: ' + err.message);
  }
}

// ----------------- Event Handlers & API Submissions -----------------

function setupEventListeners() {
  
  // User switcher change
  userSwitcher.addEventListener('change', async (e) => {
    state.currentUserId = e.target.value;
    
    // update select item icons
    Array.from(userSwitcher.options).forEach(opt => {
      opt.textContent = opt.textContent.replace('👤 ', '');
      if (opt.value === state.currentUserId) {
        opt.textContent = '👤 ' + opt.textContent;
      }
    });

    await loadDashboard();
    
    // If detail modal is open, reload details to update panels for new user permissions
    if (!detailModal.classList.contains('hidden') && state.selectedPostId) {
      openPostDetail(state.selectedPostId);
    }
  });

  // Filters toggling & sorting
  timeMatchToggle.addEventListener('change', async (e) => {
    state.filters.timeMatch = e.target.checked;
    await loadDashboard();
  });

  sortButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      sortButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filters.sortBy = btn.dataset.sort;
      await loadDashboard();
    });
  });

  // Edit profile Modal opening
  editProfileBtn.addEventListener('click', () => {
    if (!state.currentUserProfile) return;
    editGymInput.value = state.currentUserProfile.gymName;
    editWeightInput.value = state.currentUserProfile.threeLiftWeight;
    editTimeInput.value = state.currentUserProfile.preferredWorkoutTime;
    profileModal.classList.remove('hidden');
  });

  // Modal closers
  closeProfileModal.addEventListener('click', () => profileModal.classList.add('hidden'));
  cancelProfileBtn.addEventListener('click', () => profileModal.classList.add('hidden'));
  
  closePostModal.addEventListener('click', () => postModal.classList.add('hidden'));
  cancelPostBtn.addEventListener('click', () => postModal.classList.add('hidden'));
  
  closeDetailModal.addEventListener('click', () => {
    detailModal.classList.add('hidden');
    state.selectedPostId = null;
  });

  // Modal closing when clicking backdrop
  window.addEventListener('click', (e) => {
    if (e.target === profileModal) profileModal.classList.add('hidden');
    if (e.target === postModal) postModal.classList.add('hidden');
    if (e.target === detailModal) {
      detailModal.classList.add('hidden');
      state.selectedPostId = null;
    }
  });

  newPostBtn.addEventListener('click', () => {
    postForm.reset();
    
    // Preset time from user profile preferred time
    if (state.currentUserProfile) {
      document.getElementById('post-time').value = state.currentUserProfile.preferredWorkoutTime;
    }
    postModal.classList.remove('hidden');
  });

  // Edit profile submission
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const gymName = editGymInput.value.trim();
      const threeLiftWeight = editWeightInput.value;
      const preferredWorkoutTime = editTimeInput.value;

      await apiRequest(`/api/users/${state.currentUserId}`, {
        method: 'PUT',
        body: JSON.stringify({ gymName, threeLiftWeight, preferredWorkoutTime })
      });

      profileModal.classList.add('hidden');
      await loadUsers(); // Reload switcher labels
      await loadDashboard(); // Reload posts according to new gym/time
    } catch (err) {
      alert('프로필 저장 실패: ' + err.message);
    }
  });

  // Write new post submission
  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const body = {
        workoutType: document.getElementById('post-workout').value,
        targetWeight: document.getElementById('post-weight').value,
        requestedSets: document.getElementById('post-sets').value.trim(),
        promiseTime: document.getElementById('post-time').value,
        detailedLocation: document.getElementById('post-location').value.trim()
      };

      await apiRequest('/api/posts', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      postModal.classList.add('hidden');
      await loadDashboard();
    } catch (err) {
      alert('글 등록 실패: ' + err.message);
    }
  });

  // 3단계: 댓글 등록 함수 바인딩 및 제출
  commentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = commentContent.value.trim();
    if (!content || !state.selectedPostId) return;

    try {
      // API 전송 (postId, userId, content 전달)
      const res = await apiRequest('/api/comments', {
        method: 'POST',
        body: JSON.stringify({
          postId: state.selectedPostId,
          userId: state.currentUserId,
          content: content
        })
      });

      commentContent.value = '';

      // 저장 완료 후 해당 글 상세 페이지 새로고침(재조회)
      if (res.success) {
        await openPostDetail(state.selectedPostId);
        await loadDashboard(); // update comment indicators on cards
      }
    } catch (err) {
      alert('댓글 등록 실패: ' + err.message);
    }
  });

  // 4단계: 보조 완료 버튼 바인딩 및 제출
  completeBtn.addEventListener('click', async () => {
    const assistantId = assistantSelect.value;
    if (!assistantId) {
      alert('보조를 수행한 파트너 유저를 선택해 주세요.');
      return;
    }

    if (!confirm(`@${assistantId}님과의 보조 매칭을 완료하시겠습니까?\n완료 시 해당 유저에게 100포인트가 정산됩니다.`)) {
      return;
    }

    try {
      const res = await apiRequest(`/api/posts/${state.selectedPostId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ assistantId })
      });

      alert(res.message);
      detailModal.classList.add('hidden');
      state.selectedPostId = null;
      
      // Refresh list and users to reflect point balance changes and hide completed post
      await loadUsers();
      await loadDashboard();
    } catch (err) {
      alert('보조 완료 처리 실패: ' + err.message);
    }
  });
}

// ----------------- Utility Functions -----------------

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function truncateText(str, maxLength) {
  if (!str) return '';
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Start the App
init();

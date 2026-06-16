import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const categoryMap = {
  partner: '파트너 모집',
  diet: '식단',
  information: '정보',
  question: '질문',
  free: '자유'
};

const workoutTimeMap = {
  weekday_morning: '평일 아침',
  weekday_afternoon: '평일 낮',
  weekday_evening: '평일 저녁',
  weekend_morning: '주말 아침',
  weekend_afternoon: '주말 낮',
  weekend_evening: '주말 저녁'
};

const AVATAR_PRESETS = [
  { id: 'avatar1', emoji: '🏋️‍♂️', label: '파워리프터', color: 'linear-gradient(135deg, #f59e0b, #d97706)' },
  { id: 'avatar2', emoji: '🏃‍♂️', label: '러너', color: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
  { id: 'avatar3', emoji: '🧘‍♂️', label: '요기', color: 'linear-gradient(135deg, #10b981, #059669)' },
  { id: 'avatar4', emoji: '💪', label: '머슬러', color: 'linear-gradient(135deg, #ef4444, #dc2626)' },
  { id: 'avatar5', emoji: '🤸‍♂️', label: '체조원', color: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' },
  { id: 'avatar6', emoji: '🚴‍♂️', label: '사이클러', color: 'linear-gradient(135deg, #ec4899, #db2777)' }
];

const renderAvatar = (avatarId, size = '40px', fontSize = '20px') => {
  const preset = AVATAR_PRESETS.find(a => a.id === avatarId) || AVATAR_PRESETS[0];
  return (
    <div className="avatar-wrapper" style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: preset.color,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: fontSize,
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      flexShrink: 0
    }}>
      {preset.emoji}
    </div>
  );
};

function Dashboard({ token, user: initialUser, onLogout }) {
  const [currentUser, setCurrentUser] = useState(initialUser);
  const [posts, setPosts] = useState([]);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [postDetail, setPostDetail] = useState(null);
  
  // 필터 및 정렬 상태
  const [timeMatch, setTimeMatch] = useState(false);
  const [sortBy, setSortBy] = useState('latest'); // latest, highest, similar
  const [categoryFilter, setCategoryFilter] = useState('all');
  
  // 패널 상태: 'detail' (상세 및 댓글), 'create' (새 글 작성), null (선택 없음)
  const [rightPanelMode, setRightPanelMode] = useState(null);

  // 새 글 등록 폼 상태
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postCategory, setPostCategory] = useState('partner');
  const [postMaxMembers, setPostMaxMembers] = useState(2);
  const [postWorkoutTime, setPostWorkoutTime] = useState('weekday_evening');
  const [workoutType, setWorkoutType] = useState('스쿼트');
  const [targetWeight, setTargetWeight] = useState('');
  const [requestedSets, setRequestedSets] = useState('5세트');
  const [promiseTime, setPromiseTime] = useState('');
  const [detailedLocation, setDetailedLocation] = useState('');
  
  // 댓글 입력 상태
  const [commentContent, setCommentContent] = useState('');
  
  // 대댓글 및 수정 상태
  const [replyToId, setReplyToId] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');

  // 참가 신청 상태
  const [applyMessage, setApplyMessage] = useState('');
  const [applying, setApplying] = useState(false);

  // 마이페이지 서브 탭 데이터 상태
  const [mypageSubTab, setMypageSubTab] = useState('written'); // 'written' | 'applied' | 'bookmarked'
  const [myWrittenPosts, setMyWrittenPosts] = useState([]);
  const [myAppliedPosts, setMyAppliedPosts] = useState([]);
  const [myBookmarkedPosts, setMyBookmarkedPosts] = useState([]);
  
  // 보조 완료 처리 대상 보조자 ID 상태
  const [selectedAssistantId, setSelectedAssistantId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ver.2 탭 및 위치 인증, 헬스장 등록 상태
  const [activeTab, setActiveTab] = useState('community'); // 'community' | 'mypage' | 'chats'
  const [certifying, setCertifying] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [gymSearchQuery, setGymSearchQuery] = useState('');
  const [gymSearchResults, setGymSearchResults] = useState([]);
  const [gymSearching, setGymSearching] = useState(false);
  const [selectedGym, setSelectedGym] = useState(null);
  const [gymRegistering, setGymRegistering] = useState(false);

  // Real-time notifications and chat
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotiCount, setUnreadNotiCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');

  // Profile edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileNickname, setProfileNickname] = useState(currentUser.nickname || currentUser.userId || '');
  const [profileBench, setProfileBench] = useState(currentUser.bench_press || 0);
  const [profileSquat, setProfileSquat] = useState(currentUser.squat || 0);
  const [profileDeadlift, setProfileDeadlift] = useState(currentUser.deadlift || 0);
  const [profileCareer, setProfileCareer] = useState(currentUser.workout_career || '미입력');
  const [profileAvatar, setProfileAvatar] = useState(currentUser.profile_image || 'avatar1');
  const [savingProfile, setSavingProfile] = useState(false);

  // Other user profile modal state
  const [viewingProfileUser, setViewingProfileUser] = useState(null);
  const [viewingProfileUserId, setViewingProfileUserId] = useState(null);

  // Chat dropdown menu & Leave room states
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  // Profile dropdown and post deletion states
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showDeletePostModal, setShowDeletePostModal] = useState(false);
  const [postToDeleteId, setPostToDeleteId] = useState(null);
  const profileDropdownRef = useRef(null);

  // Sync profile editing fields when currentUser changes
  useEffect(() => {
    if (currentUser) {
      setProfileNickname(currentUser.nickname || currentUser.userId || '');
      setProfileBench(currentUser.bench_press || 0);
      setProfileSquat(currentUser.squat || 0);
      setProfileDeadlift(currentUser.deadlift || 0);
      setProfileCareer(currentUser.workout_career || '미입력');
      setProfileAvatar(currentUser.profile_image || 'avatar1');
    }
  }, [currentUser]);

  // View user profile details modal
  const handleViewUserProfile = async (userId) => {
    if (!userId || userId === 'system') return;
    if (userId === currentUser.userId) {
      setActiveTab('mypage');
      return;
    }
    try {
      const res = await axios.get(`/api/users/${userId}/profile`);
      setViewingProfileUser(res.data);
      setViewingProfileUserId(userId);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  // Update user profile details
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profileNickname.trim()) {
      alert('닉네임을 입력해 주세요.');
      return;
    }
    setSavingProfile(true);
    try {
      const response = await axios.put(`/api/users/${currentUser.userId}`, {
        nickname: profileNickname.trim(),
        bench_press: Number(profileBench),
        squat: Number(profileSquat),
        deadlift: Number(profileDeadlift),
        workout_career: profileCareer.trim(),
        profile_image: profileAvatar
      });
      const updatedUser = response.data;
      setCurrentUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setIsEditingProfile(false);
      refreshCurrentUser();
      alert('프로필이 성공적으로 수정되었습니다.');
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  // Leave active chat room
  const handleLeaveRoom = async (roomId) => {
    try {
      await axios.post(`/api/chats/rooms/${roomId}/leave`);
      setShowLeaveModal(false);
      setShowChatMenu(false);
      setActiveRoom(null);
      setMessages([]);
      fetchRooms();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  // Delete a post
  const handleDeletePost = async () => {
    if (!postToDeleteId) return;
    try {
      const res = await axios.delete(`/api/posts/${postToDeleteId}`);
      alert(res.data.message);
      setShowDeletePostModal(false);
      setPostToDeleteId(null);
      setRightPanelMode(null);
      setSelectedPostId(null);
      setPostDetail(null);
      fetchPosts(); // Refresh post list
    } catch (err) {
      alert(err.response?.data?.error || '게시글 삭제에 실패했습니다.');
    }
  };

  // Refresh current user profile data (popularity, review counts, etc.)
  const refreshCurrentUser = async () => {
    try {
      const res = await axios.get('/api/auth/me');
      setCurrentUser(res.data);
      localStorage.setItem('user', JSON.stringify(res.data));
    } catch (err) {
      console.error('Failed to refresh user profile:', err.message);
    }
  };

  // Workout scheduling & reviews
  const [workouts, setWorkouts] = useState([]);
  const [writtenReviews, setWrittenReviews] = useState([]);
  const [receivedReviews, setReceivedReviews] = useState([]);
  const [workoutDate, setWorkoutDate] = useState('');
  const [workoutTimeState, setWorkoutTimeState] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewContent, setReviewContent] = useState('');
  const [showNoShowForm, setShowNoShowForm] = useState(false);
  const [noShowReason, setNoShowReason] = useState('');

  // Admin panel
  const [adminMode, setAdminMode] = useState(false);
  const [noShowReports, setNoShowReports] = useState([]);

  const messagesEndRef = useRef(null);
  const chatMenuRef = useRef(null);

  // Close chat menu when clicking outside
  useEffect(() => {
    if (!showChatMenu) return;
    const handleClickOutside = (e) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target)) {
        setShowChatMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showChatMenu]);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    if (!showProfileDropdown) return;
    const handleClickOutside = (e) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileDropdown]);

  // GPS 기반 동네 인증 처리
  const handleCertifyLocation = () => {
    setCertifying(true);
    setLocationError('');
    
    if (!navigator.geolocation) {
      setLocationError('이 브라우저는 GPS 위치 정보를 지원하지 않습니다.');
      setCertifying(false);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await axios.post('/api/region/authenticate', {
            lat: latitude,
            lng: longitude
          });
          const updatedUser = response.data.user;
          setCurrentUser(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
          alert(response.data.message);
        } catch (err) {
          setLocationError(err.response?.data?.error || err.message);
        } finally {
          setCertifying(false);
        }
      },
      (err) => {
        console.error('Geolocation error:', err);
        let friendlyMsg = '위치 권한을 허용해 주시거나, 브라우저 설정을 변경해 주세요.';
        if (err.code === err.PERMISSION_DENIED) {
          friendlyMsg = '위치 정보 접근 권한이 거부되었습니다. 브라우저 설정(자물쇠 버튼 등)에서 위치 권한을 "허용"해 주시거나, 위치 서비스 기능을 켠 후 다시 시도해 주세요.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          friendlyMsg = '위치 정보를 가져올 수 없습니다. 기기의 GPS 센서 신호를 확인해 주세요.';
        } else if (err.code === err.TIMEOUT) {
          friendlyMsg = '위치 정보를 가져오는 데 시간이 초과되었습니다. 다시 시도해 주세요.';
        }
        setLocationError(friendlyMsg);
        setCertifying(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  // 헬스장 검색
  const handleGymSearch = async (e) => {
    e.preventDefault();
    if (!gymSearchQuery.trim()) return;
    
    setGymSearching(true);
    try {
      const response = await axios.get(`/api/gyms/search?query=${encodeURIComponent(gymSearchQuery)}`);
      setGymSearchResults(response.data);
      if (response.data.length > 0) {
        setSelectedGym(response.data[0]);
      } else {
        setSelectedGym(null);
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setGymSearching(false);
    }
  };

  // 헬스장 선택 등록
  const handleRegisterGym = async () => {
    if (!selectedGym) {
      alert('등록할 헬스장을 선택해 주세요.');
      return;
    }
    
    setGymRegistering(true);
    try {
      const response = await axios.post('/api/users/gym', {
        id: selectedGym.id,
        name: selectedGym.name || selectedGym.place_name,
        address: selectedGym.address || selectedGym.road_address_name,
        x: selectedGym.x,
        y: selectedGym.y
      });
      
      const updatedUser = response.data.user;
      setCurrentUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      alert(response.data.message);
      
      setGymSearchQuery('');
      setGymSearchResults([]);
      setSelectedGym(null);
      
      // 커뮤니티 리스트 새로고침
      fetchPosts();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setGymRegistering(false);
    }
  };

  // Socket.io initialization & listener setup
  useEffect(() => {
    if (!currentUser || !currentUser.userId) return;

    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const newSocket = io(socketUrl, {
      query: { userId: currentUser.userId }
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to socket server');
    });

    // Real-time notifications
    newSocket.on('notification', (noti) => {
      setNotifications(prev => [noti, ...prev]);
      setUnreadNotiCount(prev => prev + 1);
    });

    // Real-time message alerts
    newSocket.on('new_message_alert', (alertData) => {
      fetchRooms();
    });

    newSocket.on('partner_left', (data) => {
      setActiveRoom(prev => {
        if (prev && prev.id === data.room_id) {
          return { ...prev, partner_left_custom: 1 };
        }
        return prev;
      });
      fetchRooms();
    });

    return () => {
      newSocket.disconnect();
    };
  }, [currentUser?.userId]);

  // Handle active chat room messages and socket joins
  useEffect(() => {
    if (!socket || !activeRoom) return;

    socket.emit('join_room', activeRoom.id);
    socket.emit('read_messages', { room_id: activeRoom.id, user_id: currentUser.userId });

    const handleReceiveMessage = (msg) => {
      if (msg.room_id === activeRoom.id) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        socket.emit('read_messages', { room_id: activeRoom.id, user_id: currentUser.userId });
        fetchRooms();
      }
    };

    const handleMessagesRead = (data) => {
      if (data.room_id === activeRoom.id) {
        setMessages(prev => prev.map(m => {
          if (m.sender_id !== data.reader_id) {
            return { ...m, is_read: 1 };
          }
          return m;
        }));
      }
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('messages_read', handleMessagesRead);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('messages_read', handleMessagesRead);
    };
  }, [socket, activeRoom?.id]);

  // Scroll to bottom on new chat message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch functions for new API endpoints
  const fetchNotifications = async () => {
    try {
      const res = await axios.get('/api/notifications');
      setNotifications(res.data);
      const unreadCount = res.data.filter(n => n.is_read === 0).length;
      setUnreadNotiCount(unreadCount);
    } catch (err) {
      console.error('Failed to fetch notifications:', err.message);
    }
  };

  const handleMarkNotificationRead = async (notiId) => {
    try {
      await axios.put(`/api/notifications/${notiId}/read`);
      setNotifications(prev => prev.map(n => n.id === notiId ? { ...n, is_read: 1 } : n));
      setUnreadNotiCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err.message);
    }
  };

  const fetchRooms = async () => {
    try {
      const res = await axios.get('/api/chats/rooms');
      setRooms(res.data);
    } catch (err) {
      console.error('Failed to fetch rooms:', err.message);
    }
  };

  const handleRoomSelect = async (room) => {
    setActiveRoom(room);
    try {
      const res = await axios.get(`/api/chats/rooms/${room.id}/messages`);
      setMessages(res.data);
      fetchRooms(); // Refresh to clear unread counts
      fetchWorkouts();
      fetchWrittenReviews();
    } catch (err) {
      console.error('Failed to fetch messages:', err.message);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !socket || !activeRoom) return;

    const messageData = {
      room_id: activeRoom.id,
      sender_id: currentUser.userId,
      message: messageInput.trim()
    };

    socket.emit('send_message', messageData);
    setMessageInput('');
  };

  const fetchWorkouts = async () => {
    try {
      const res = await axios.get('/api/users/me/workouts');
      setWorkouts(res.data);
    } catch (err) {
      console.error('Failed to fetch workouts:', err.message);
    }
  };

  const handleCreateWorkout = async (e) => {
    e.preventDefault();
    if (!workoutDate || !workoutTimeState) {
      alert('날짜와 시간을 입력해주세요.');
      return;
    }
    try {
      const gymId = currentUser.user_gym?.id || 'gym_default_id';
      const gymName = currentUser.user_gym?.name || currentUser.gymName || '등록된 헬스장';
      
      await axios.post(`/api/chats/rooms/${activeRoom.id}/workout`, {
        gym_id: gymId,
        gym_name: gymName,
        appointment_date: workoutDate,
        appointment_time: workoutTimeState
      });
      alert('운동 약속이 등록되었습니다.');
      setWorkoutDate('');
      setWorkoutTimeState('');
      fetchWorkouts();
    } catch (err) {
      alert(err.response?.data?.error || '운동 약속 등록에 실패했습니다.');
    }
  };

  const handleToggleCompleteWorkout = async (session) => {
    const isOwner = session.owner_id === currentUser.userId;
    const myCompleted = isOwner ? session.owner_completed === 1 : session.participant_completed === 1;
    
    try {
      const res = await axios.post(`/api/workout/sessions/${session.id}/complete`, {
        completed: !myCompleted
      });
      alert(res.data.message);
      fetchWorkouts();
      fetchPosts();
    } catch (err) {
      alert(err.response?.data?.error || '완료 처리에 실패했습니다.');
    }
  };

  const handleCancelWorkout = async (sessionId) => {
    if (!confirm('예정된 약속을 취소하시겠습니까? 취소한 사람의 인기도가 1점 감소합니다.')) {
      return;
    }
    try {
      const res = await axios.post(`/api/workout/sessions/${sessionId}/cancel`);
      alert(res.data.message);
      fetchWorkouts();
      fetchPosts();
    } catch (err) {
      alert(err.response?.data?.error || '약속 취소에 실패했습니다.');
    }
  };

  const handleSubmitNoShow = async (e, sessionId) => {
    e.preventDefault();
    if (!noShowReason.trim()) {
      alert('신고 사유를 입력해주세요.');
      return;
    }
    try {
      await axios.post(`/api/workout/sessions/${sessionId}/no-show`, {
        reason: noShowReason.trim()
      });
      alert('노쇼 신고가 접수되었습니다.');
      setNoShowReason('');
      setShowNoShowForm(false);
      fetchWorkouts();
    } catch (err) {
      alert(err.response?.data?.error || '노쇼 신고에 실패했습니다.');
    }
  };

  const fetchWrittenReviews = async () => {
    try {
      const res = await axios.get('/api/users/me/reviews/written');
      setWrittenReviews(res.data);
    } catch (err) {
      console.error('Failed to fetch written reviews:', err.message);
    }
  };

  const fetchReceivedReviews = async () => {
    try {
      const res = await axios.get('/api/users/me/reviews/received');
      setReceivedReviews(res.data);
    } catch (err) {
      console.error('Failed to fetch received reviews:', err.message);
    }
  };

  const handleSubmitReview = async (e, sessionId) => {
    e.preventDefault();
    if (!reviewContent.trim()) {
      alert('후기 내용을 입력해주세요.');
      return;
    }
    try {
      const res = await axios.post(`/api/workout/sessions/${sessionId}/review`, {
        rating: reviewRating,
        content: reviewContent.trim()
      });
      alert(res.data.message);
      setReviewContent('');
      setReviewRating(5);
      fetchWorkouts();
      fetchWrittenReviews();
      fetchReceivedReviews();
      refreshCurrentUser();
      fetchPosts();
    } catch (err) {
      alert(err.response?.data?.error || '후기 작성에 실패했습니다.');
    }
  };

  const fetchNoShowReports = async () => {
    try {
      const res = await axios.get('/api/admin/no-show');
      setNoShowReports(res.data);
    } catch (err) {
      console.error('Failed to fetch no-show reports:', err.message);
    }
  };

  const handleApproveNoShow = async (reportId) => {
    if (!confirm('이 노쇼 신고를 승인하시겠습니까? 피신고자의 인기도가 15점 차감됩니다.')) return;
    try {
      const res = await axios.post(`/api/admin/no-show/${reportId}/approve`);
      alert(res.data.message);
      fetchNoShowReports();
      fetchPosts();
    } catch (err) {
      alert(err.response?.data?.error || '신고 승인 처리에 실패했습니다.');
    }
  };

  // Run on load
  useEffect(() => {
    if (currentUser?.userId) {
      fetchNotifications();
      fetchRooms();
      fetchWorkouts();
      fetchWrittenReviews();
    }
  }, [currentUser?.userId, activeTab]);

  // 1. 게시글 목록 로드 (필터 및 정렬 조건 변경 시 자동 재로드)
  const fetchPosts = async () => {
    try {
      setError('');
      const response = await axios.get('/api/posts', {
        params: {
          category: categoryFilter,
          timeMatch: timeMatch,
          sortBy: sortBy
        }
      });
      setPosts(response.data.posts);
      if (response.data.currentUser) {
        setCurrentUser(response.data.currentUser);
      }
    } catch (err) {
      setError(err.response?.data?.error || '게시글을 가져오는데 실패했습니다.');
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [timeMatch, sortBy, categoryFilter]);

  // 2. 게시글 상세 조회
  const fetchPostDetail = async (postId) => {
    try {
      const response = await axios.get(`/api/posts/${postId}`);
      setPostDetail(response.data);
      // 기본 보조자 선택을 댓글 단 유저 중 첫 번째 유저로 세팅
      if (response.data.comments && response.data.comments.length > 0) {
        setSelectedAssistantId(response.data.comments[0].user_id || '');
      } else {
        setSelectedAssistantId('');
      }
    } catch (err) {
      alert(err.response?.data?.error || '상세 정보를 가져오는데 실패했습니다.');
    }
  };

  const handlePostClick = (postId) => {
    setSelectedPostId(postId);
    setRightPanelMode('detail');
    fetchPostDetail(postId);
  };

  // 3. 새 게시글 등록
  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!postTitle || !postContent || !postCategory || !postMaxMembers || !postWorkoutTime ||
        !workoutType || !targetWeight || !requestedSets || !promiseTime || !detailedLocation) {
      alert('모든 필수 항목을 입력해주세요.');
      return;
    }

    try {
      const response = await axios.post('/api/posts', {
        title: postTitle,
        content: postContent,
        category: postCategory,
        max_members: Number(postMaxMembers),
        workout_time: postWorkoutTime,
        workoutType,
        targetWeight: Number(targetWeight),
        requestedSets,
        promiseTime,
        detailedLocation
      });

      alert('매칭 구인글이 등록되었습니다!');
      // 폼 초기화
      setPostTitle('');
      setPostContent('');
      setPostMaxMembers(2);
      setTargetWeight('');
      setPromiseTime('');
      setDetailedLocation('');
      setRightPanelMode(null);
      
      // 목록 갱신
      fetchPosts();
    } catch (err) {
      alert(err.response?.data?.error || '글 등록에 실패했습니다.');
    }
  };

  // 4. 댓글 및 대댓글 작성
  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!commentContent.trim()) return;

    try {
      await axios.post(`/api/posts/${selectedPostId}/comments`, {
        content: commentContent,
        parent_comment_id: null
      });
      setCommentContent('');
      fetchPostDetail(selectedPostId);
    } catch (err) {
      alert(err.response?.data?.error || '댓글 등록에 실패했습니다.');
    }
  };

  const handleReplySubmit = async (e, parentId) => {
    e.preventDefault();
    if (!replyContent.trim()) return;

    try {
      await axios.post(`/api/posts/${selectedPostId}/comments`, {
        content: replyContent,
        parent_comment_id: parentId
      });
      setReplyContent('');
      setReplyToId(null);
      fetchPostDetail(selectedPostId);
    } catch (err) {
      alert(err.response?.data?.error || '대댓글 등록에 실패했습니다.');
    }
  };

  const handleCommentUpdate = async (commentId) => {
    if (!editingCommentContent.trim()) return;
    try {
      await axios.put(`/api/comments/${commentId}`, {
        content: editingCommentContent
      });
      setEditingCommentId(null);
      setEditingCommentContent('');
      fetchPostDetail(selectedPostId);
    } catch (err) {
      alert(err.response?.data?.error || '댓글 수정에 실패했습니다.');
    }
  };

  const handleCommentDelete = async (commentId) => {
    if (!confirm('댓글을 정말 삭제하시겠습니까? (대댓글도 함께 삭제됩니다)')) return;
    try {
      await axios.delete(`/api/comments/${commentId}`);
      fetchPostDetail(selectedPostId);
    } catch (err) {
      alert(err.response?.data?.error || '댓글 삭제에 실패했습니다.');
    }
  };

  // 5. 보조 완료 및 포인트 지급 처리
  const handleCompleteMatching = async () => {
    if (!selectedAssistantId) {
      alert('보조를 수행한 유저를 선택해주세요.');
      return;
    }

    if (!confirm(`${selectedAssistantId}님에게 100포인트를 지급하고 보조를 완료하시겠습니까?`)) {
      return;
    }

    try {
      const response = await axios.post(`/api/posts/${selectedPostId}/complete`, {
        assistantId: selectedAssistantId
      });
      alert(response.data.message);
      setRightPanelMode(null);
      setSelectedPostId(null);
      setPostDetail(null);
      fetchPosts();
    } catch (err) {
      alert(err.response?.data?.error || '완료 처리에 실패했습니다.');
    }
  };

  // 6. 참가 신청 기능
  const handleApplyPost = async (e) => {
    e.preventDefault();
    if (!applyMessage.trim()) return;
    setApplying(true);
    try {
      const response = await axios.post(`/api/posts/${selectedPostId}/apply`, {
        message: applyMessage
      });
      alert(response.data.message);
      setApplyMessage('');
      fetchPostDetail(selectedPostId);
    } catch (err) {
      alert(err.response?.data?.error || '참가 신청에 실패했습니다.');
    } finally {
      setApplying(false);
    }
  };

  // 7. 참가 신청 승인/거절 처리
  const handleApplicationStatus = async (appId, status) => {
    try {
      const response = await axios.post(`/api/applications/${appId}/status`, {
        status: status
      });
      alert(response.data.message);
      fetchPostDetail(selectedPostId);
      fetchPosts();
    } catch (err) {
      alert(err.response?.data?.error || '처리에 실패했습니다.');
    }
  };

  // 8. 찜 토글
  const handleToggleBookmark = async (postItem) => {
    try {
      if (postItem.isBookmarked) {
        await axios.delete(`/api/posts/${postItem.postId}/bookmark`);
        alert('찜을 해제했습니다.');
      } else {
        await axios.post(`/api/posts/${postItem.postId}/bookmark`);
        alert('게시글을 찜했습니다.');
      }
      fetchPosts();
      if (selectedPostId === postItem.postId) {
        fetchPostDetail(selectedPostId);
      }
    } catch (err) {
      alert(err.response?.data?.error || '찜 처리에 실패했습니다.');
    }
  };

  // 9. 마이페이지 서브 데이터 조회
  const fetchMypageData = async () => {
    try {
      if (mypageSubTab === 'written') {
        const res = await axios.get('/api/users/me/posts');
        setMyWrittenPosts(res.data);
      } else if (mypageSubTab === 'applied') {
        const res = await axios.get('/api/users/me/applications');
        setMyAppliedPosts(res.data);
      } else if (mypageSubTab === 'bookmarked') {
        const res = await axios.get('/api/users/me/bookmarks');
        setMyBookmarkedPosts(res.data);
      } else if (mypageSubTab === 'received_reviews') {
        fetchReceivedReviews();
      } else if (mypageSubTab === 'written_reviews') {
        fetchWrittenReviews();
      }
    } catch (err) {
      console.error('마이페이지 데이터 조회 실패:', err.message);
    }
  };

  useEffect(() => {
    if (activeTab === 'mypage') {
      refreshCurrentUser();
      fetchReceivedReviews();
      fetchMypageData();
    }
  }, [activeTab, mypageSubTab]);

  return (
    <div className="app-container">
      {/* Header Area */}
      <header className="dashboard-header">
        <div className="header-container">
          <div className="logo-section">
            <span className="logo-text">FITNESS PARTNER</span>
            <div className="header-tabs">
              <button 
                className={`tab-btn ${activeTab === 'community' ? 'active' : ''}`}
                onClick={() => setActiveTab('community')}
              >
                💬 커뮤니티
              </button>
              <button 
                className={`tab-btn ${activeTab === 'chats' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('chats');
                  fetchRooms();
                }}
              >
                ✉️ 채팅 및 약속
              </button>
              <button 
                className={`tab-btn ${activeTab === 'mypage' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('mypage');
                  setLocationError('');
                }}
              >
                ⚙️ 마이페이지
              </button>
            </div>
          </div>

          <div className="user-profile-bar">
            {/* 알림 벨 버튼 및 드롭다운 */}
            <div className="notification-container">
              <button className="bell-btn" onClick={() => setShowNotifications(!showNotifications)}>
                🔔
                {unreadNotiCount > 0 && (
                  <span className="unread-badge">{unreadNotiCount}</span>
                )}
              </button>
              
              {showNotifications && (
                <div className="notification-dropdown">
                  <div className="notification-header">
                    <h4>알림 내역</h4>
                    <button 
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
                      onClick={() => setShowNotifications(false)}
                    >
                      닫기
                    </button>
                  </div>
                  <div className="notification-list">
                    {notifications.length === 0 ? (
                      <div className="no-notifications">새로운 알림이 없습니다.</div>
                    ) : (
                      notifications.map(noti => (
                        <div 
                          key={noti.id} 
                          className={`notification-item ${noti.is_read === 0 ? 'unread' : ''}`}
                          onClick={() => handleMarkNotificationRead(noti.id)}
                        >
                          <div className="notification-content">{noti.content}</div>
                          <div className="notification-time">{new Date(noti.created_at).toLocaleString()}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Dropdown Container */}
            <div className="profile-dropdown-container" ref={profileDropdownRef}>
              <div 
                className="profile-trigger" 
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              >
                {renderAvatar(currentUser.profile_image, '32px', '16px')}
                <span className="profile-trigger-nickname">{currentUser.nickname || currentUser.userId}</span>
                <span className={`profile-trigger-arrow ${showProfileDropdown ? 'open' : ''}`}>▾</span>
              </div>

              {showProfileDropdown && (
                <div className="profile-dropdown-menu">
                  <div className="profile-dropdown-header">
                    <div className="profile-dropdown-userinfo">
                      <span className="profile-dropdown-name">{currentUser.nickname || currentUser.userId}</span>
                      {currentUser.user_region && (
                        <span className="profile-dropdown-region">📍 {currentUser.user_region}</span>
                      )}
                    </div>
                  </div>
                  <div className="profile-dropdown-details">
                    <div className="profile-dropdown-item">
                      <span className="label">소속 헬스장</span>
                      <span className="val">{currentUser.gymName || '헬스장 미등록'}</span>
                    </div>
                    <div className="profile-dropdown-item">
                      <span className="label">3대 운동 기록</span>
                      <span className="val">🏋️ {currentUser.threeLiftWeight}kg</span>
                    </div>
                    <div className="profile-dropdown-subitem">
                      B:{currentUser.bench_press || 0} S:{currentUser.squat || 0} D:{currentUser.deadlift || 0}
                    </div>
                    <div className="profile-dropdown-item">
                      <span className="label">보유 포인트</span>
                      <span className="val">🔥 {currentUser.points} P</span>
                    </div>
                  </div>

                  {/* 관리자 모드 토글 (admin 전용) */}
                  {currentUser.role === 'admin' && (
                    <div className="profile-dropdown-admin">
                      <div 
                        className="toggle-container" 
                        onClick={() => {
                          setAdminMode(!adminMode);
                          if (!adminMode) {
                            fetchNoShowReports();
                          }
                        }}
                        style={{ border: adminMode ? '1px solid var(--danger)' : '1px solid rgba(255,255,255,0.05)', width: '100%', justifyContent: 'space-between', padding: '6px 10px', marginTop: '4px', marginBottom: '4px' }}
                      >
                        <span className="toggle-label" style={{ color: adminMode ? '#fca5a5' : 'var(--text-muted)', fontSize: '12px' }}>관리자 모드</span>
                        <div className={`toggle-switch ${adminMode ? 'active' : ''}`} style={{ background: adminMode ? 'var(--danger)' : '#475569' }}>
                          <div className="toggle-circle"></div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="profile-dropdown-footer">
                    <button className="logout-btn-dropdown" onClick={onLogout}>로그아웃</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Admin Panel */}
      {adminMode && (
        <div style={{ maxWidth: '1200px', margin: '20px auto 0 auto', padding: '0 24px', width: '100%' }}>
          <div className="admin-reports-panel">
            <h3 className="admin-panel-title">🚨 노쇼 신고 관리 (관리자 전용)</h3>
            {noShowReports.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>접수된 노쇼 신고가 없습니다.</p>
            ) : (
              <div className="admin-reports-list">
                {noShowReports.map(report => (
                  <div key={report.id} className="admin-report-card">
                    <div className="admin-report-details">
                      <div className="admin-report-users">
                        신고자: <span style={{ color: 'var(--primary)' }}>{report.reporter_id}</span> ➔ 피신고자: <span style={{ color: 'var(--danger)' }}>{report.target_user_id}</span>
                      </div>
                      <div className="admin-report-reason">사유: {report.reason}</div>
                      <div className="admin-report-meta">접수일시: {new Date(report.created_at).toLocaleString()} | 상태: {report.status}</div>
                    </div>
                    {report.status === 'pending' ? (
                      <button className="admin-btn-approve" onClick={() => handleApproveNoShow(report.id)}>신고 승인 (-15 P)</button>
                    ) : (
                      <span className="admin-btn-approved">처리 완료</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Contents Area */}
      {activeTab === 'community' ? (
        <>
          {/* 위치/헬스장 인증 가드 모달 */}
          {(!currentUser.user_region || !currentUser.user_gym) && (
            <div className="guard-overlay">
              <div className="guard-card">
                <div className="guard-icon">🔒</div>
                <h3 className="guard-title">동네 인증 및 헬스장 등록이 필요합니다</h3>
                <p className="guard-desc">
                  FITNESS PARTNER는 신뢰할 수 있는 이웃 매칭을 위해 
                  <strong> GPS 기반 동네 인증 및 소속 헬스장 등록</strong>을 완료한 회원님만 커뮤니티(글 조회, 구인 등록, 댓글 작성) 이용이 가능하도록 제한하고 있습니다. 마이페이지에서 먼저 완료해 주세요!
                </p>
                <button 
                  className="btn btn-primary"
                  onClick={() => setActiveTab('mypage')}
                >
                  마이페이지에서 인증하기
                </button>
              </div>
            </div>
          )}

          <main className={`dashboard-main community-container ${(!currentUser.user_region || !currentUser.user_gym) ? 'blurred' : ''}`}>
            {/* Left Side: Post List & Filter */}
            <section className="left-panel">
              <div className="section-title-bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2>파트너 매칭 찾기</h2>
                  <button 
                    className="btn btn-primary" 
                    style={{ padding: '8px 16px', width: 'auto', fontSize: '13px' }}
                    onClick={() => {
                      setRightPanelMode('create');
                      setSelectedPostId(null);
                      setPostDetail(null);
                    }}
                  >
                    + 구인 등록
                  </button>
                </div>

                {/* 카테고리 탭 */}
                <div className="category-tabs" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {[{ id: 'all', name: '전체' }, ...Object.entries(categoryMap).map(([k, v]) => ({ id: k, name: v }))].map(cat => (
                    <button
                      key={cat.id}
                      className={`tab-btn ${categoryFilter === cat.id ? 'active' : ''}`}
                      style={{ 
                        padding: '6px 12px', 
                        fontSize: '12px', 
                        borderRadius: '20px', 
                        border: '1px solid rgba(255,255,255,0.1)', 
                        background: categoryFilter === cat.id ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                        color: 'white',
                        cursor: 'pointer'
                      }}
                      onClick={() => setCategoryFilter(cat.id)}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                <div className="filter-bar" style={{ marginTop: '4px' }}>
                  {/* 시간 매칭 토글 */}
                  <div 
                    className="toggle-container"
                    onClick={() => setTimeMatch(!timeMatch)}
                  >
                    <div className={`toggle-switch ${timeMatch ? 'active' : ''}`}>
                      <div className="toggle-circle"></div>
                    </div>
                    <span className="toggle-label">시간 매칭 (1시간 이내)</span>
                  </div>

                  {/* 정렬 셀렉트 박스 */}
                  <select 
                    className="filter-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="latest">최신 등록 순</option>
                    <option value="highest">상대 삼대중량 높은 순</option>
                    <option value="similar">나와 삼대중량 비슷한 순</option>
                  </select>
                </div>
              </div>

              {error && <div className="form-error">{error}</div>}

              {/* 리스트 본문 */}
              <div className="post-list">
                {posts.length === 0 ? (
                  <div className="no-posts">
                    <p>우리 동네({currentUser.user_region || '미인증'}) 헬스장({currentUser.gymName || '미등록'})에 등록된 구인글이 없습니다.</p>
                    <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-dark)' }}>
                      오른쪽 상단의 '+ 구인 등록' 버튼으로 파트너를 직접 구해보세요!
                    </p>
                  </div>
                ) : (
                  posts.map((post) => (
                    <div 
                      key={post.postId} 
                      className={`post-card ${selectedPostId === post.postId ? 'selected' : ''}`}
                      onClick={() => handlePostClick(post.postId)}
                      style={{ position: 'relative' }}
                    >
                      {/* 찜하기 별 */}
                      <button
                        style={{
                          position: 'absolute',
                          top: '12px',
                          right: '60px',
                          background: 'none',
                          border: 'none',
                          color: post.isBookmarked ? '#f59e0b' : 'rgba(255,255,255,0.3)',
                          fontSize: '18px',
                          cursor: 'pointer',
                          zIndex: 10
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleBookmark(post);
                        }}
                      >
                        {post.isBookmarked ? '★' : '☆'}
                      </button>

                      <div className="post-card-header">
                        <div className="post-author-info" onClick={(e) => {
                          e.stopPropagation();
                          handleViewUserProfile(post.authorId);
                        }} style={{ cursor: 'pointer' }}>
                          {renderAvatar(post.authorAvatar, '32px', '14px')}
                          <div>
                            <span className="author-id">{post.authorNickname || post.authorId}</span>
                            <span className="author-weight-tag" style={{ marginLeft: '6px' }}>
                              삼대 {post.authorThreeLiftWeight}kg
                            </span>
                          </div>
                        </div>

                        <span className={`status-badge ${post.recruit_status === 'recruiting' ? 'waiting' : 'matched'}`}>
                          {post.recruit_status === 'recruiting' ? '모집중' : '모집마감'}
                        </span>
                      </div>

                      <div className="post-card-body" style={{ marginTop: '8px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'white', marginBottom: '6px' }}>
                          {post.title}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="workout-target">
                            {post.workoutType} @ {post.targetWeight}kg
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            인원: <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{post.current_members}</span> / {post.max_members}명
                          </div>
                        </div>
                        
                        <div className="post-details" style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: 'var(--primary)' }}>
                            🏷️ {categoryMap[post.category] || post.category}
                          </span>
                          <span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: 'var(--secondary)' }}>
                            ⏰ {workoutTimeMap[post.workout_time] || post.workout_time}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            {new Date(post.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Right Side: Detail / Edit / Action */}
            <section className="right-panel">
              {rightPanelMode === 'detail' && postDetail ? (
                <div className="detail-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '100%', overflowY: 'auto' }}>
                  <div className="card-title-with-btn">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', color: 'white' }}>
                        {categoryMap[postDetail.post.category] || postDetail.post.category}
                      </span>
                      <h3>{postDetail.post.title}</h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {(postDetail.post.authorId === currentUser.userId || currentUser.role === 'admin') && (
                        <button 
                          className="delete-post-btn"
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: '500',
                            transition: 'all 0.2s'
                          }}
                          onClick={() => {
                            setPostToDeleteId(postDetail.post.postId);
                            setShowDeletePostModal(true);
                          }}
                        >
                          삭제
                        </button>
                      )}
                      <button className="close-panel-btn" onClick={() => setRightPanelMode(null)}>✕</button>
                    </div>
                  </div>

                  {/* 작성자 정보 및 찜 버튼 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => handleViewUserProfile(postDetail.post.authorId)}>
                      {renderAvatar(postDetail.post.authorAvatar, '36px', '16px')}
                      <div>
                        <h4 style={{ fontSize: '15px', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {postDetail.post.authorNickname || postDetail.post.authorId}
                        </h4>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          삼대 {postDetail.post.authorThreeLiftWeight}kg | {postDetail.post.gymName}
                        </span>
                      </div>
                    </div>
                    {/* 찜 토글 버튼 */}
                    <button 
                      className={`btn ${postDetail.post.isBookmarked ? 'btn-primary' : ''}`}
                      style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => handleToggleBookmark(postDetail.post)}
                    >
                      {postDetail.post.isBookmarked ? '★ 찜함' : '☆ 찜하기'}
                    </button>
                  </div>

                  {/* 모집 및 상세 운동 정보 */}
                  <div className="detail-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'none', padding: 0 }}>
                    <div className="detail-label-value">
                      <span className="detail-label">모집 인원</span>
                      <span className="detail-value" style={{ color: 'var(--primary)' }}>
                        {postDetail.post.current_members} / {postDetail.post.max_members} 명
                      </span>
                    </div>
                    <div className="detail-label-value">
                      <span className="detail-label">모집 상태</span>
                      <span className="detail-value">
                        {postDetail.post.recruit_status === 'recruiting' ? '모집중 🟢' : '모집마감 🔴'}
                      </span>
                    </div>
                    <div className="detail-label-value">
                      <span className="detail-label">운동 시간</span>
                      <span className="detail-value">{workoutTimeMap[postDetail.post.workout_time] || postDetail.post.workout_time}</span>
                    </div>
                    <div className="detail-label-value">
                      <span className="detail-label">만남 장소</span>
                      <span className="detail-value">{postDetail.post.detailedLocation}</span>
                    </div>
                    <div className="detail-label-value" style={{ gridColumn: 'span 2' }}>
                      <span className="detail-label">운동 상세</span>
                      <span className="detail-value">{postDetail.post.workoutType} ({postDetail.post.targetWeight}kg, {postDetail.post.requestedSets})</span>
                    </div>
                  </div>

                  {/* 본문 내용 */}
                  <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', minHeight: '80px', color: '#e5e7eb', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                    {postDetail.post.content}
                  </div>

                  {/* 참가 신청 관련 영역 */}
                  {postDetail.post.authorId !== currentUser.userId ? (
                    // 1) 내가 작성한 글이 아닌 경우: 참가 신청 현황 또는 신청 폼
                    <div style={{ padding: '16px', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px' }}>
                      <h4 style={{ fontSize: '14px', color: 'white', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        🤝 파트너 참가 신청
                      </h4>
                      {postDetail.applications && postDetail.applications.length > 0 ? (
                        // 이미 신청 완료한 경우 상태 표시
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                          <span style={{ fontSize: '13px', color: '#9ca3af' }}>내 신청 상태:</span>
                          <span className={`status-value-badge ${
                            postDetail.applications[0].status === 'accepted' ? 'success' : 
                            postDetail.applications[0].status === 'rejected' ? 'danger' : 'warning'
                          }`} style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                            {postDetail.applications[0].status === 'accepted' ? '승인됨 🟢' : 
                             postDetail.applications[0].status === 'rejected' ? '거절됨 🔴' : '대기중 🟡'}
                          </span>
                        </div>
                      ) : postDetail.post.recruit_status === 'closed' ? (
                        <p style={{ fontSize: '13px', color: '#f87171' }}>모집이 마감되어 신청할 수 없습니다.</p>
                      ) : (
                        // 아직 신청하지 않았고 모집 중인 경우 신청 폼 출력
                        <form onSubmit={handleApplyPost} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                          <textarea
                            className="comment-input"
                            style={{ width: '100%', height: '60px', padding: '8px', fontSize: '13px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', resize: 'none' }}
                            placeholder="메시지를 적어 참가 신청해보세요! (예: 저도 평일 저녁에 운동합니다.)"
                            value={applyMessage}
                            onChange={(e) => setApplyMessage(e.target.value)}
                            required
                          />
                          <button type="submit" className="btn btn-primary" style={{ padding: '8px 0', fontSize: '13px' }} disabled={applying}>
                            {applying ? '신청 중...' : '참가 신청하기'}
                          </button>
                        </form>
                      )}
                    </div>
                  ) : (
                    // 2) 내가 작성한 글인 경우: 들어온 참가 신청 목록
                    <div style={{ padding: '16px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px' }}>
                      <h4 style={{ fontSize: '14px', color: 'white', marginBottom: '8px' }}>
                        📥 들어온 신청 내역 ({postDetail.applications ? postDetail.applications.length : 0})
                      </h4>
                      {!postDetail.applications || postDetail.applications.length === 0 ? (
                        <p style={{ fontSize: '12px', color: '#9ca3af' }}>아직 들어온 신청이 없습니다.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                          {postDetail.applications.map(app => (
                            <div key={app.id} style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                                <strong>{app.applicant_id}</strong> (삼대 {app.applicantThreeLiftWeight}kg)
                                <span className={`status-value-badge ${
                                  app.status === 'accepted' ? 'success' : 
                                  app.status === 'rejected' ? 'danger' : 'warning'
                                }`} style={{ fontSize: '10px' }}>
                                  {app.status === 'accepted' ? '승인됨' : app.status === 'rejected' ? '거절됨' : '대기중'}
                                </span>
                              </div>
                              <div style={{ fontSize: '13px', color: 'white', padding: '6px 0' }}>
                                "{app.message}"
                              </div>
                              {app.status === 'pending' && (
                                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                  <button 
                                    className="btn btn-primary" 
                                    style={{ padding: '4px 0', fontSize: '11px', flex: 1, width: 'auto' }}
                                    onClick={() => handleApplicationStatus(app.id, 'accepted')}
                                  >
                                    승인
                                  </button>
                                  <button 
                                    className="btn" 
                                    style={{ padding: '4px 0', fontSize: '11px', flex: 1, width: 'auto', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}
                                    onClick={() => handleApplicationStatus(app.id, 'rejected')}
                                  >
                                    거절
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 댓글/대댓글 피드 */}
                  <div className="comment-section" style={{ marginTop: '8px' }}>
                    <h4 className="comment-title">댓글 ({postDetail.comments.length})</h4>
                    
                    <div className="comment-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {postDetail.comments.length === 0 ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-dark)', padding: '10px 0' }}>
                          댓글이 없습니다. 첫 댓글을 남겨보세요!
                        </p>
                      ) : (
                        postDetail.comments.filter(c => !c.parent_comment_id).map((comment) => (
                          <div key={comment.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {/* 부모 댓글 */}
                            <div className="comment-item" style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '10px', background: 'rgba(255,255,255,0.02)' }}>
                              <div className="comment-author-bar" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: '600', color: 'white' }}>
                                  {comment.user_id} <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 'normal' }}>삼대 {comment.commenterThreeLiftWeight}kg</span>
                                </span>
                                <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                                  {new Date(comment.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              
                              {editingCommentId === comment.id ? (
                                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                  <input 
                                    type="text" 
                                    className="comment-input" 
                                    value={editingCommentContent}
                                    onChange={(e) => setEditingCommentContent(e.target.value)}
                                  />
                                  <button className="btn btn-primary" style={{ width: 'auto', padding: '4px 10px', fontSize: '11px' }} onClick={() => handleCommentUpdate(comment.id)}>저장</button>
                                  <button className="btn" style={{ width: 'auto', padding: '4px 10px', fontSize: '11px' }} onClick={() => setEditingCommentId(null)}>취소</button>
                                </div>
                              ) : (
                                <div className="comment-content" style={{ marginTop: '4px', fontSize: '13px', color: '#e5e7eb' }}>
                                  {comment.content}
                                </div>
                              )}
                              
                              <div style={{ display: 'flex', gap: '10px', marginTop: '6px', fontSize: '11px', color: '#9ca3af' }}>
                                <span style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => { setReplyToId(comment.id); setReplyContent(''); }}>답글 쓰기</span>
                                {comment.user_id === currentUser.userId && (
                                  <>
                                    <span style={{ cursor: 'pointer' }} onClick={() => { setEditingCommentId(comment.id); setEditingCommentContent(comment.content); }}>수정</span>
                                    <span style={{ cursor: 'pointer', color: '#f87171' }} onClick={() => handleCommentDelete(comment.id)}>삭제</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* 대댓글 입력창 */}
                            {replyToId === comment.id && (
                              <form onSubmit={(e) => handleReplySubmit(e, comment.id)} style={{ display: 'flex', gap: '6px', marginLeft: '24px' }}>
                                <input
                                  type="text"
                                  className="comment-input"
                                  placeholder="답글 내용을 입력하세요..."
                                  value={replyContent}
                                  onChange={(e) => setReplyContent(e.target.value)}
                                  required
                                />
                                <button type="submit" className="btn btn-primary comment-btn" style={{ padding: '6px 12px', fontSize: '11px' }}>등록</button>
                                <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => setReplyToId(null)}>✕</button>
                              </form>
                            )}

                            {/* 자식 대댓글 목록 */}
                            {postDetail.comments.filter(child => child.parent_comment_id === comment.id).map(childComment => (
                              <div key={childComment.id} className="comment-item" style={{ marginLeft: '24px', borderLeft: '2px dashed rgba(255,255,255,0.2)', paddingLeft: '10px', background: 'rgba(255,255,255,0.01)' }}>
                                <div className="comment-author-bar" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ fontWeight: '600', color: 'white' }}>
                                    ↳ {childComment.user_id} <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 'normal' }}>삼대 {childComment.commenterThreeLiftWeight}kg</span>
                                  </span>
                                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                                    {new Date(childComment.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                                
                                {editingCommentId === childComment.id ? (
                                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                    <input 
                                      type="text" 
                                      className="comment-input" 
                                      value={editingCommentContent}
                                      onChange={(e) => setEditingCommentContent(e.target.value)}
                                    />
                                    <button className="btn btn-primary" style={{ width: 'auto', padding: '4px 10px', fontSize: '11px' }} onClick={() => handleCommentUpdate(childComment.id)}>저장</button>
                                    <button className="btn" style={{ width: 'auto', padding: '4px 10px', fontSize: '11px' }} onClick={() => setEditingCommentId(null)}>취소</button>
                                  </div>
                                ) : (
                                  <div className="comment-content" style={{ marginTop: '4px', fontSize: '13px', color: '#e5e7eb' }}>
                                    {childComment.content}
                                  </div>
                                )}
                                
                                {childComment.user_id === currentUser.userId && (
                                  <div style={{ display: 'flex', gap: '10px', marginTop: '6px', fontSize: '11px', color: '#9ca3af' }}>
                                    <span style={{ cursor: 'pointer' }} onClick={() => { setEditingCommentId(childComment.id); setEditingCommentContent(childComment.content); }}>수정</span>
                                    <span style={{ cursor: 'pointer', color: '#f87171' }} onClick={() => handleCommentDelete(childComment.id)}>삭제</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ))
                      )}
                    </div>

                    {/* 부모 댓글 작성 폼 */}
                    {postDetail.post.recruit_status === 'recruiting' && (
                      <form onSubmit={handleCommentSubmit} className="comment-form" style={{ marginTop: '16px' }}>
                        <input
                          type="text"
                          className="comment-input"
                          placeholder="구인글에 댓글을 남겨보세요."
                          value={commentContent}
                          onChange={(e) => setCommentContent(e.target.value)}
                          required
                        />
                        <button type="submit" className="btn btn-primary comment-btn">등록</button>
                      </form>
                    )}
                  </div>
                </div>
              ) : rightPanelMode === 'create' ? (
                <div className="detail-panel" style={{ maxHeight: '100%', overflowY: 'auto' }}>
                  <div className="card-title-with-btn">
                    <h3>새 모집 등록</h3>
                    <button className="close-panel-btn" onClick={() => setRightPanelMode(null)}>✕</button>
                  </div>

                  <form onSubmit={handleCreatePost} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="postTitle">모집 제목</label>
                      <input
                        type="text"
                        id="postTitle"
                        className="form-input"
                        placeholder="예: 평일 저녁 운동 같이 하실 분 구합니다"
                        value={postTitle}
                        onChange={(e) => setPostTitle(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="postContent">상세 모집 본문</label>
                      <textarea
                        id="postContent"
                        className="form-input"
                        style={{ height: '100px', resize: 'none', padding: '8px' }}
                        placeholder="운동 경력, 목표, 원하는 파트너 성향 등을 적어주세요."
                        value={postContent}
                        onChange={(e) => setPostContent(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label" htmlFor="postCategory">카테고리</label>
                        <select 
                          id="postCategory" 
                          className="form-input"
                          value={postCategory}
                          onChange={(e) => setPostCategory(e.target.value)}
                        >
                          {Object.entries(categoryMap).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="postWorkoutTime">선호 운동시간대</label>
                        <select 
                          id="postWorkoutTime" 
                          className="form-input"
                          value={postWorkoutTime}
                          onChange={(e) => setPostWorkoutTime(e.target.value)}
                        >
                          {Object.entries(workoutTimeMap).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label" htmlFor="workoutType">운동 종목</label>
                        <select 
                          id="workoutType" 
                          className="form-input"
                          value={workoutType}
                          onChange={(e) => setWorkoutType(e.target.value)}
                        >
                          <option value="스쿼트">스쿼트 (Squat)</option>
                          <option value="벤치프레스">벤치프레스 (Bench Press)</option>
                          <option value="데드리프트">데드리프트 (Deadlift)</option>
                          <option value="밀리터리 프레스">밀리터리 프레스 (OHP)</option>
                          <option value="기타 상체">기타 상체 운동</option>
                          <option value="기타 하체">기타 하체 운동</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="postMaxMembers">최대 모집 인원</label>
                        <input
                          type="number"
                          id="postMaxMembers"
                          className="form-input"
                          value={postMaxMembers}
                          onChange={(e) => setPostMaxMembers(e.target.value)}
                          min="2"
                          max="10"
                          required
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label" htmlFor="targetWeight">목표 중량 (kg)</label>
                        <input
                          type="number"
                          id="targetWeight"
                          className="form-input"
                          placeholder="예: 100"
                          value={targetWeight}
                          onChange={(e) => setTargetWeight(e.target.value)}
                          min="0"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="requestedSets">희망 세트 수</label>
                        <input
                          type="text"
                          id="requestedSets"
                          className="form-input"
                          placeholder="예: 5세트"
                          value={requestedSets}
                          onChange={(e) => setRequestedSets(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="promiseTime">만날 약속 시간</label>
                      <input
                        type="time"
                        id="promiseTime"
                        className="form-input"
                        value={promiseTime}
                        onChange={(e) => setPromiseTime(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="detailedLocation">상세 만남 장소</label>
                      <input
                        type="text"
                        id="detailedLocation"
                        className="form-input"
                        placeholder="예: 파워랙 2번 옆, 데드리프트 플랫폼"
                        value={detailedLocation}
                        onChange={(e) => setDetailedLocation(e.target.value)}
                        required
                      />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ marginTop: '10px', padding: '10px 0' }}>
                      모집 구인글 등록
                    </button>
                  </form>
                </div>
              ) : (
                <div className="detail-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="detail-empty">
                    <div className="detail-empty-icon">🏋️‍♂️</div>
                    <h3>헬스 파트너 매칭</h3>
                    <p style={{ marginTop: '8px', fontSize: '13px' }}>
                      좌측 구인 목록에서 글을 클릭하여 상세한 약속 장소와 보조 희망 세트를 확인하고 지원해 보세요.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </main>
        </>
      ) : activeTab === 'chats' ? (
        <div className="chats-layout">
          {/* Left Panel: Chat Rooms List */}
          <div className="rooms-panel">
            <div className="rooms-panel-header">
              <h3>✉️ 채팅방 목록</h3>
            </div>
            <div className="rooms-list">
              {rooms.length === 0 ? (
                <div style={{ padding: '40px 20px', color: 'var(--text-dark)', textAlign: 'center' }}>
                  진행 중인 채팅방이 없습니다.<br />매칭 신청이 승인되면 자동으로 개설됩니다.
                </div>
              ) : (
                rooms.map(room => (
                  <div 
                    key={room.id} 
                    className={`room-card ${activeRoom?.id === room.id ? 'active' : ''}`}
                    onClick={() => handleRoomSelect(room)}
                  >
                    <div className="room-partner-info" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {renderAvatar(room.partnerAvatar, '28px', '12px')}
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <span className="room-partner-name" style={{ fontWeight: '600', color: 'white', fontSize: '13px' }}>
                          {room.partnerNickname || room.partnerId}
                        </span>
                        <span className="room-partner-popularity" style={{ fontSize: '11px', color: '#f59e0b' }}>
                          ⭐ {room.partnerPopularity}
                        </span>
                      </div>
                    </div>
                    <div className="room-last-message">
                      {room.lastMessage || '새 채팅방이 개설되었습니다.'}
                    </div>
                    <div className="room-meta-info">
                      <span>{room.gymName}</span>
                      {room.unreadCount > 0 && (
                        <span className="unread-badge" style={{ position: 'static', display: 'inline-flex' }}>
                          {room.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Panel: Chat Room Workspace */}
          <div className="chat-workspace">
            {activeRoom ? (
              <>
                {/* Chat Message Window */}
                <div className="chat-messages-area" style={{ position: 'relative' }}>
                  <div className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => handleViewUserProfile(activeRoom.partnerId)}>
                      {renderAvatar(activeRoom.partnerAvatar, '36px', '16px')}
                      <div>
                        <h3 style={{ fontSize: '15px', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {activeRoom.partnerNickname || activeRoom.partnerId}님과의 대화
                          <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: '600' }}>⭐ {activeRoom.partnerPopularity || 0}</span>
                        </h3>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{activeRoom.gymName} · 프로필 보기</span>
                      </div>
                    </div>
                    
                    {/* Menu dots (⋮) */}
                    <div style={{ position: 'relative' }} ref={chatMenuRef}>
                      <button 
                        onClick={() => setShowChatMenu(!showChatMenu)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer', padding: '6px' }}
                      >
                        ⋮
                      </button>
                      {showChatMenu && (
                        <div style={{
                          position: 'absolute',
                          right: 0,
                          top: '32px',
                          background: '#1e293b',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                          zIndex: 100,
                          width: '130px'
                        }}>
                          <button
                            onClick={() => {
                              setShowChatMenu(false);
                              setShowLeaveModal(true);
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 14px',
                              background: 'none',
                              border: 'none',
                              color: '#f87171',
                              textAlign: 'left',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}
                          >
                            🚪 채팅방 나가기
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="messages-list">
                    {messages.map(msg => {
                      const isMe = msg.sender_id === currentUser.userId;
                      const isSystem = msg.sender_id === 'system';
                      
                      if (isSystem) {
                        return (
                          <div key={msg.id} style={{ display: 'flex', justifyContent: 'center', margin: '12px 0', width: '100%' }}>
                            <div style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '6px 16px', borderRadius: '20px', fontSize: '12px', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.05)' }}>
                              {msg.message}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id} className={`message-row ${isMe ? 'sent' : 'received'}`}>
                          <div className="message-bubble-wrapper">
                            <div className="message-bubble">
                              {msg.message}
                            </div>
                            <div className="message-info">
                              {isMe && (
                                <span className="message-read-status">
                                  {msg.is_read === 1 ? '읽음' : '안읽음'}
                                </span>
                              )}
                              <span>
                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {(() => {
                    const isPartnerLeft = activeRoom && (
                      (activeRoom.owner_id === currentUser.userId ? activeRoom.participant_left === 1 : activeRoom.owner_left === 1) ||
                      activeRoom.partner_left_custom === 1
                    );
                    
                    if (isPartnerLeft) {
                      return (
                        <div style={{
                          background: 'rgba(239, 68, 68, 0.08)',
                          borderTop: '1px solid rgba(239, 68, 68, 0.2)',
                          padding: '16px',
                          textAlign: 'center',
                          color: '#fca5a5',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}>
                          ⚠️ 상대방이 채팅방을 나갔기 때문에 대화를 보낼 수 없습니다.
                        </div>
                      );
                    }
                    
                    return (
                      <form onSubmit={handleSendMessage} className="chat-input-bar">
                        <input 
                          type="text" 
                          className="chat-input"
                          placeholder="메시지를 입력하세요..."
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          required
                        />
                        <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '0 20px' }}>전송</button>
                      </form>
                    );
                  })()}
                </div>

                {/* Workout Scheduling Sidebar */}
                <div className="appointment-sidebar">
                  <h4 className="sidebar-title">🏋️‍♂️ 운동 약속 관리</h4>
                  
                  {/* Scheduled Workout Section */}
                  {(() => {
                    const scheduledSession = workouts.find(w => w.room_id === activeRoom.id && w.status === 'scheduled');
                    const reviewSession = workouts.find(w => w.room_id === activeRoom.id && w.status === 'completed' && !writtenReviews.some(r => r.session_id === w.id));

                    if (scheduledSession) {
                      const isOwner = scheduledSession.owner_id === currentUser.userId;
                      const myCompleted = isOwner ? scheduledSession.owner_completed === 1 : scheduledSession.participant_completed === 1;
                      const partnerCompleted = isOwner ? scheduledSession.participant_completed === 1 : scheduledSession.owner_completed === 1;

                      return (
                        <div className="appointment-card">
                          <div className="appointment-time-badge">
                            📅 {scheduledSession.appointment_date} {scheduledSession.appointment_time}
                          </div>
                          <div className="appointment-gym">
                            📍 {scheduledSession.gym_name}
                          </div>
                          <div className="appointment-status-row">
                            <div className="user-status-item">
                              <span>내 완료 확인:</span>
                              <span className={`status-check-badge ${myCompleted ? 'checked' : 'pending'}`}>
                                {myCompleted ? '완료 승인 🟢' : '대기 중 🟡'}
                              </span>
                            </div>
                            <div className="user-status-item">
                              <span>상대 완료 확인:</span>
                              <span className={`status-check-badge ${partnerCompleted ? 'checked' : 'pending'}`}>
                                {partnerCompleted ? '완료 승인 🟢' : '대기 중 🟡'}
                              </span>
                            </div>
                          </div>

                          <div className="appointment-actions">
                            <button 
                              className="appointment-btn appointment-btn-complete"
                              onClick={() => handleToggleCompleteWorkout(scheduledSession)}
                            >
                              {myCompleted ? '완료 확인 취소' : '운동 완료 확인'}
                            </button>
                            <button 
                              className="appointment-btn appointment-btn-cancel"
                              onClick={() => handleCancelWorkout(scheduledSession.id)}
                            >
                              약속 취소 (-1 P)
                            </button>
                            
                            {!showNoShowForm ? (
                              <button 
                                className="appointment-btn appointment-btn-noshow"
                                onClick={() => setShowNoShowForm(true)}
                              >
                                노쇼 신고
                              </button>
                            ) : (
                              <form onSubmit={(e) => handleSubmitNoShow(e, scheduledSession.id)} style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                                <input 
                                  type="text" 
                                  className="form-input"
                                  style={{ padding: '8px', fontSize: '12px' }}
                                  placeholder="신고 사유를 입력하세요"
                                  value={noShowReason}
                                  onChange={(e) => setNoShowReason(e.target.value)}
                                  required
                                />
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button type="submit" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '11px', flex: 1, width: 'auto' }}>제출</button>
                                  <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: '11px', flex: 1, width: 'auto' }} onClick={() => setShowNoShowForm(false)}>취소</button>
                                </div>
                              </form>
                            )}
                          </div>
                        </div>
                      );
                    } else if (reviewSession) {
                      return (
                        <div className="appointment-card completed">
                          <div className="appointment-time-badge">
                            🎉 운동 완료!
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                            파트너가 마음에 드셨나요?<br />후기를 작성하여 인기도 점수를 선물하세요!
                          </div>
                          
                          <form onSubmit={(e) => handleSubmitReview(e, reviewSession.id)} className="review-form-card">
                            <label className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>별점 선택</label>
                            <div className="star-rating">
                              {[1, 2, 3, 4, 5].map(num => (
                                <span 
                                  key={num} 
                                  className={`star ${reviewRating >= num ? 'active' : ''}`}
                                  onClick={() => setReviewRating(num)}
                                >
                                  ★
                                </span>
                              ))}
                            </div>
                            <textarea 
                              className="review-form-textarea"
                              placeholder="후기를 작성해주세요..."
                              value={reviewContent}
                              onChange={(e) => setReviewContent(e.target.value)}
                              required
                            />
                            <button type="submit" className="btn btn-primary" style={{ padding: '8px 0', fontSize: '12px' }}>후기 등록</button>
                          </form>
                        </div>
                      );
                    } else {
                      return (
                        <form onSubmit={handleCreateWorkout} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            파트너와 조율한 날짜와 시간을 입력하여 운동 약속을 등록하세요.
                          </p>
                          <div className="form-group" style={{ marginBottom: '8px' }}>
                            <label className="form-label" style={{ fontSize: '12px' }}>약속 날짜</label>
                            <input 
                              type="date" 
                              className="form-input" 
                              style={{ padding: '8px' }}
                              value={workoutDate}
                              onChange={(e) => setWorkoutDate(e.target.value)}
                              required
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: '8px' }}>
                            <label className="form-label" style={{ fontSize: '12px' }}>약속 시간</label>
                            <input 
                              type="time" 
                              className="form-input" 
                              style={{ padding: '8px' }}
                              value={workoutTimeState}
                              onChange={(e) => setWorkoutTimeState(e.target.value)}
                              required
                            />
                          </div>
                          <button type="submit" className="btn btn-primary" style={{ padding: '10px 0', fontSize: '13px' }}>
                            약속 생성
                          </button>
                        </form>
                      );
                    }
                  })()}
                </div>
              </>
            ) : (
              <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dark)', flexDirection: 'column' }}>
                <span style={{ fontSize: '48px', marginBottom: '16px' }}>✉️</span>
                <h3>채팅방을 선택해주세요</h3>
                <p style={{ marginTop: '8px', fontSize: '13px' }}>
                  좌측 채팅방 목록에서 대화 상대를 선택하여 대화를 나누고 운동 일정을 조율할 수 있습니다.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mypage-main">
          {/* Card 0: 내 프로필 */}
          <div className="mypage-card" style={{ gridColumn: 'span 2' }}>
            <div className="card-icon-header">
              <span style={{ fontSize: '24px' }}>👤</span>
              <h3>내 프로필</h3>
            </div>
            
            {!isEditingProfile ? (
              <div className="profile-view">
                <div className="profile-view-header">
                  {renderAvatar(currentUser.profile_image, '80px', '40px')}
                  <div className="profile-view-info">
                    <h3 className="profile-view-name">{currentUser.nickname || currentUser.userId}</h3>
                    <span className="profile-view-id">ID: {currentUser.userId}</span>
                  </div>
                  <button className="btn profile-edit-btn" onClick={() => setIsEditingProfile(true)}>
                    프로필 수정
                  </button>
                </div>

                <div className="profile-popularity-badge">
                  인기도 ⭐ <strong>{currentUser.popularity_score || 0}</strong>
                </div>

                <div className="profile-section">
                  <h4 className="profile-section-title">3대 기록</h4>
                  <div className="profile-lift-list">
                    <div className="profile-lift-item">
                      <span>벤치프레스</span>
                      <strong>{currentUser.bench_press || 0}kg</strong>
                    </div>
                    <div className="profile-lift-item">
                      <span>스쿼트</span>
                      <strong>{currentUser.squat || 0}kg</strong>
                    </div>
                    <div className="profile-lift-item">
                      <span>데드리프트</span>
                      <strong>{currentUser.deadlift || 0}kg</strong>
                    </div>
                  </div>
                  <div className="profile-lift-total">합계 {currentUser.threeLiftWeight || 0}kg</div>
                </div>

                <div className="profile-section">
                  <h4 className="profile-section-title">총 운동 경력</h4>
                  <p className="profile-career-value">{currentUser.workout_career || '미입력'}</p>
                </div>

                <div className="profile-section">
                  <h4 className="profile-section-title">받은 후기 {currentUser.received_reviews_count || 0}개</h4>
                  <div className="profile-reviews-preview">
                    {receivedReviews.length === 0 ? (
                      <p className="profile-reviews-empty">아직 작성된 후기가 없습니다.</p>
                    ) : (
                      receivedReviews.map(rev => (
                        <div key={rev.id} className="profile-review-quote">
                          <p>"{rev.content}"</p>
                          <span className="profile-review-meta">
                            — {rev.reviewerNickname || rev.reviewer_id}
                            {' · '}{'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  {/* Avatar Selector */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label className="form-label">프로필 아바타 선택</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', background: 'rgba(15,23,42,0.4)', padding: '10px', borderRadius: '10px' }}>
                      {AVATAR_PRESETS.map(p => (
                        <div 
                          key={p.id} 
                          onClick={() => setProfileAvatar(p.id)}
                          style={{
                            cursor: 'pointer',
                            padding: '4px',
                            border: profileAvatar === p.id ? '2px solid var(--primary)' : '2px solid transparent',
                            borderRadius: '50%',
                            transition: 'all 0.2s',
                            display: 'inline-flex'
                          }}
                        >
                          {renderAvatar(p.id, '36px', '18px')}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Nickname & Career */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-group" style={{ textAlign: 'left' }}>
                      <label className="form-label" htmlFor="profileNickname">닉네임</label>
                      <input 
                        type="text" 
                        id="profileNickname" 
                        className="form-input" 
                        value={profileNickname} 
                        onChange={(e) => setProfileNickname(e.target.value)} 
                        required
                      />
                    </div>
                    <div className="form-group" style={{ textAlign: 'left' }}>
                      <label className="form-label" htmlFor="profileCareer">총 운동 경력 (예: 2년, 6개월)</label>
                      <input 
                        type="text" 
                        id="profileCareer" 
                        className="form-input" 
                        value={profileCareer} 
                        onChange={(e) => setProfileCareer(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* 3대 운동 기록 */}
                <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'left' }}>
                  <label className="form-label" style={{ marginBottom: '8px' }}>3대 운동 기록 (kg)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '11px' }}>벤치프레스</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={profileBench} 
                        onChange={(e) => setProfileBench(e.target.value)} 
                        min="0"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '11px' }}>스쿼트</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={profileSquat} 
                        onChange={(e) => setProfileSquat(e.target.value)} 
                        min="0"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '11px' }}>데드리프트</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={profileDeadlift} 
                        onChange={(e) => setProfileDeadlift(e.target.value)} 
                        min="0"
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--primary)', fontWeight: 'bold', textAlign: 'right' }}>
                    합계: {Number(profileBench) + Number(profileSquat) + Number(profileDeadlift)}kg
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn" style={{ width: 'auto', padding: '10px 20px' }} onClick={() => setIsEditingProfile(false)}>
                    취소
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={savingProfile}>
                    {savingProfile ? '저장 중...' : '저장 완료'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Card 1: GPS Neighborhood Certification */}
          <div className="mypage-card">
            <div className="card-icon-header">
              <span style={{ fontSize: '24px' }}>📍</span>
              <h3>동네 GPS 인증</h3>
            </div>
            
            <p style={{ fontSize: '14px', marginBottom: '20px', color: 'var(--text-muted)' }}>
              현재 계신 위치의 GPS를 기반으로 거주동(행정동)을 인증합니다. 
              최초 1회 인증이 완료되어야 헬스장 등록이 가능합니다.
            </p>

            <div className="status-indicator-box">
              <div className="status-line">
                <span>동네 인증 상태</span>
                {currentUser.user_region ? (
                  <span className="status-value-badge success">
                    인증 완료 🟢
                  </span>
                ) : (
                  <span className="status-value-badge danger">
                    미인증 🔴
                  </span>
                )}
              </div>
              {currentUser.user_region && (
                <div style={{ marginTop: '12px', fontSize: '14px', color: 'white', fontWeight: '500' }}>
                  인증된 동네: {currentUser.user_region}
                </div>
              )}
            </div>

            {locationError && (
              <div className="alert-banner">
                ⚠️ {locationError}
              </div>
            )}

            <button 
              className="btn btn-primary"
              onClick={handleCertifyLocation}
              disabled={certifying}
            >
              {certifying ? (
                <>
                  <span className="gps-loading-spinner"></span>
                  GPS 위치 수신 중...
                </>
              ) : (
                '현재 위치로 동네 인증하기'
              )}
            </button>
          </div>

          {/* Card 2: Gym Registration */}
          <div className="mypage-card">
            <div className="card-icon-header">
              <span style={{ fontSize: '24px' }}>🏋️‍♂️</span>
              <h3>소속 헬스장 등록</h3>
            </div>

            {!currentUser.user_region ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dark)' }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '12px' }}>🔒</span>
                동네 GPS 인증을 완료하시면<br />헬스장을 검색하여 등록하실 수 있습니다.
              </div>
            ) : (
              <>
                <p style={{ fontSize: '14px', marginBottom: '20px', color: 'var(--text-muted)' }}>
                  인증된 동네 <strong>[{currentUser.user_region}]</strong> 및 반경 2.0km 내에 위치한 헬스장을 검색하여 내 헬스장으로 지정합니다.
                </p>

                <div className="status-indicator-box">
                  <div className="status-line">
                    <span>헬스장 등록 상태</span>
                    {currentUser.user_gym ? (
                      <span className="status-value-badge success">
                        등록 완료 🟢
                      </span>
                    ) : (
                      <span className="status-value-badge danger">
                        미등록 🔴
                      </span>
                    )}
                  </div>
                  {currentUser.user_gym && (
                    <div style={{ marginTop: '12px', fontSize: '14px', color: 'white' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>{currentUser.user_gym.name || currentUser.user_gym.place_name || currentUser.gymName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>주소: {currentUser.user_gym.address || currentUser.user_gym.road_address_name}</div>
                    </div>
                  )}
                </div>

                <form onSubmit={handleGymSearch} className="search-section">
                  <input 
                    type="text" 
                    className="search-input"
                    placeholder="헬스장 이름 입력 (예: 마블)"
                    value={gymSearchQuery}
                    onChange={(e) => setGymSearchQuery(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={gymSearching}>
                    {gymSearching ? '검색 중...' : '검색'}
                  </button>
                </form>

                {gymSearchResults.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>검색 결과 ({gymSearchResults.length})</h4>
                    <div className="gym-results-list">
                      {gymSearchResults.map(gym => (
                        <div 
                          key={gym.id}
                          className={`gym-result-card ${selectedGym?.id === gym.id ? 'selected' : ''}`}
                          onClick={() => setSelectedGym(gym)}
                        >
                          <div className="gym-result-name">{gym.name || gym.place_name}</div>
                          <div className="gym-result-address">{gym.address || gym.road_address_name}</div>
                        </div>
                      ))}
                    </div>

                    <button 
                      className="btn btn-primary"
                      onClick={handleRegisterGym}
                      disabled={gymRegistering || !selectedGym}
                    >
                      {gymRegistering ? '등록 처리 중...' : `[${selectedGym?.name || selectedGym?.place_name}] 소속 헬스장으로 등록`}
                    </button>
                  </div>
                )}

                {gymSearchResults.length === 0 && gymSearchQuery && !gymSearching && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                    검색 결과가 없습니다. 동네 이름이 올바른지 확인해 보세요.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Card 3: My Activities */}
          <div className="mypage-card" style={{ gridColumn: 'span 2' }}>
            <div className="card-icon-header">
              <span style={{ fontSize: '24px' }}>📋</span>
              <h3>내 활동 내역</h3>
            </div>
            
            {/* 서브 탭 */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', marginBottom: '16px' }}>
              <button 
                className={`tab-btn ${mypageSubTab === 'written' ? 'active' : ''}`}
                style={{
                  padding: '6px 16px',
                  fontSize: '13px',
                  borderRadius: '4px',
                  background: mypageSubTab === 'written' ? 'var(--primary)' : 'transparent',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer'
                }}
                onClick={() => setMypageSubTab('written')}
              >
                내가 작성한 글
              </button>
              <button 
                className={`tab-btn ${mypageSubTab === 'applied' ? 'active' : ''}`}
                style={{
                  padding: '6px 16px',
                  fontSize: '13px',
                  borderRadius: '4px',
                  background: mypageSubTab === 'applied' ? 'var(--primary)' : 'transparent',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer'
                }}
                onClick={() => setMypageSubTab('applied')}
              >
                내가 신청한 글
              </button>
              <button 
                className={`tab-btn ${mypageSubTab === 'bookmarked' ? 'active' : ''}`}
                style={{
                  padding: '6px 16px',
                  fontSize: '13px',
                  borderRadius: '4px',
                  background: mypageSubTab === 'bookmarked' ? 'var(--primary)' : 'transparent',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer'
                }}
                onClick={() => setMypageSubTab('bookmarked')}
              >
                찜한 게시글
              </button>
              <button 
                className={`tab-btn ${mypageSubTab === 'received_reviews' ? 'active' : ''}`}
                style={{
                  padding: '6px 16px',
                  fontSize: '13px',
                  borderRadius: '4px',
                  background: mypageSubTab === 'received_reviews' ? 'var(--primary)' : 'transparent',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer'
                }}
                onClick={() => setMypageSubTab('received_reviews')}
              >
                내가 받은 후기
              </button>
              <button 
                className={`tab-btn ${mypageSubTab === 'written_reviews' ? 'active' : ''}`}
                style={{
                  padding: '6px 16px',
                  fontSize: '13px',
                  borderRadius: '4px',
                  background: mypageSubTab === 'written_reviews' ? 'var(--primary)' : 'transparent',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer'
                }}
                onClick={() => setMypageSubTab('written_reviews')}
              >
                내가 작성한 후기
              </button>
            </div>

            {/* 서브 탭 내용 */}
            <div>
              {mypageSubTab === 'written' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {myWrittenPosts.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#9ca3af' }}>내가 작성한 글이 없습니다.</p>
                  ) : (
                    myWrittenPosts.map(post => (
                      <div 
                        key={post.postId} 
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}
                      >
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'white' }}>{post.title}</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                            {workoutTimeMap[post.workout_time]} | {post.current_members}/{post.max_members}명 | {new Date(post.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: post.recruit_status === 'recruiting' ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.1)', color: post.recruit_status === 'recruiting' ? 'var(--primary)' : '#9ca3af' }}>
                          {post.recruit_status === 'recruiting' ? '모집중' : '모집마감'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {mypageSubTab === 'applied' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {myAppliedPosts.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#9ca3af' }}>내가 신청한 글이 없습니다.</p>
                  ) : (
                    myAppliedPosts.map(app => (
                      <div 
                        key={app.id} 
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}
                      >
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'white' }}>{app.postTitle}</div>
                          <div style={{ fontSize: '12px', color: '#e5e7eb', marginTop: '4px' }}>내가 쓴 메시지: "{app.message}"</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                            소속헬스장: {app.gymName} | 운동시간대: {workoutTimeMap[app.postWorkoutTime]}
                          </div>
                        </div>
                        <span className={`status-value-badge ${
                          app.status === 'accepted' ? 'success' : 
                          app.status === 'rejected' ? 'danger' : 'warning'
                        }`} style={{ fontSize: '11px' }}>
                          {app.status === 'accepted' ? '승인됨' : app.status === 'rejected' ? '거절됨' : '대기중'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {mypageSubTab === 'bookmarked' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {myBookmarkedPosts.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#9ca3af' }}>찜한 게시글이 없습니다.</p>
                  ) : (
                    myBookmarkedPosts.map(post => (
                      <div 
                        key={post.postId} 
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}
                      >
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'white' }}>{post.title}</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                            작성자: {post.authorId} | {workoutTimeMap[post.workout_time]} | {post.current_members}/{post.max_members}명
                          </div>
                        </div>
                        <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: post.recruit_status === 'recruiting' ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.1)', color: post.recruit_status === 'recruiting' ? 'var(--primary)' : '#9ca3af' }}>
                          {post.recruit_status === 'recruiting' ? '모집중' : '모집마감'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {mypageSubTab === 'received_reviews' && (
                <div className="review-list">
                  {receivedReviews.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#9ca3af' }}>아직 작성된 후기가 없습니다.</p>
                  ) : (
                    receivedReviews.map(rev => (
                      <div key={rev.id} className="review-item">
                        <div className="review-item-header">
                          <span className="review-item-author">👤 {rev.reviewerNickname || rev.reviewer_id} ({rev.reviewerGym || '헬스장 미등록'})</span>
                          <span className="review-item-stars">
                            {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                          </span>
                        </div>
                        <div className="review-item-comment">"{rev.content}"</div>
                        <div className="review-item-date">{new Date(rev.created_at).toLocaleDateString()}</div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {mypageSubTab === 'written_reviews' && (
                <div className="review-list">
                  {writtenReviews.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#9ca3af' }}>작성한 후기가 없습니다.</p>
                  ) : (
                    writtenReviews.map(rev => (
                      <div key={rev.id} className="review-item">
                        <div className="review-item-header">
                          <span className="review-item-author">👤 {rev.targetNickname || rev.target_user_id} ({rev.targetGym || '헬스장 미등록'})에게 보냄</span>
                          <span className="review-item-stars">
                            {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                          </span>
                        </div>
                        <div className="review-item-comment">"{rev.content}"</div>
                        <div className="review-item-date">{new Date(rev.created_at).toLocaleDateString()}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1. 채팅방 나가기 확인 모달 */}
      {showLeaveModal && (
        <div className="guard-overlay" style={{ zIndex: 200 }} onClick={() => setShowLeaveModal(false)}>
          <div className="guard-card" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="guard-icon">🚪</div>
            <h3 className="guard-title">채팅방 나가기</h3>
            <p className="guard-desc">
              정말 채팅방을 나가시겠습니까?
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setShowLeaveModal(false)}>
                취소
              </button>
              <button className="btn" style={{ flex: 1, background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.4)' }} onClick={() => handleLeaveRoom(activeRoom.id)}>
                나가기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. 다른 사용자 프로필 모달 */}
      {viewingProfileUserId && viewingProfileUser && (
        <div className="guard-overlay" style={{ zIndex: 190 }} onClick={() => setViewingProfileUserId(null)}>
          <div className="guard-card" style={{ maxWidth: '500px', textAlign: 'left', padding: '30px', cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'white' }}>상세 프로필</h3>
              <button 
                style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '20px', cursor: 'pointer' }}
                onClick={() => setViewingProfileUserId(null)}
              >
                ✕
              </button>
            </div>
            
            <div className="profile-view-header" style={{ marginBottom: '16px' }}>
              {renderAvatar(viewingProfileUser.user.profile_image, '64px', '32px')}
              <div className="profile-view-info">
                <h4 className="profile-view-name" style={{ fontSize: '16px' }}>
                  {viewingProfileUser.user.nickname || viewingProfileUser.user.userId}
                </h4>
                <span className="profile-view-id">소속: {viewingProfileUser.user.gymName || '헬스장 미등록'}</span>
              </div>
            </div>

            <div className="profile-popularity-badge" style={{ marginBottom: '16px' }}>
              인기도 ⭐ <strong>{viewingProfileUser.user.popularity_score || 0}</strong>
            </div>

            <div className="profile-section" style={{ marginBottom: '16px' }}>
              <h4 className="profile-section-title">3대 기록</h4>
              <div className="profile-lift-list">
                <div className="profile-lift-item">
                  <span>벤치프레스</span>
                  <strong>{viewingProfileUser.user.bench_press || 0}kg</strong>
                </div>
                <div className="profile-lift-item">
                  <span>스쿼트</span>
                  <strong>{viewingProfileUser.user.squat || 0}kg</strong>
                </div>
                <div className="profile-lift-item">
                  <span>데드리프트</span>
                  <strong>{viewingProfileUser.user.deadlift || 0}kg</strong>
                </div>
              </div>
              <div className="profile-lift-total">합계 {viewingProfileUser.user.threeLiftWeight || 0}kg</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div className="profile-section" style={{ marginBottom: 0 }}>
                <h4 className="profile-section-title">운동 경력</h4>
                <p className="profile-career-value">{viewingProfileUser.user.workout_career || '미입력'}</p>
              </div>
              <div className="profile-section" style={{ marginBottom: 0 }}>
                <h4 className="profile-section-title">운동 완료</h4>
                <p className="profile-career-value">{viewingProfileUser.user.workout_count || 0}회</p>
              </div>
            </div>

            <div className="profile-section">
              <h4 className="profile-section-title">받은 후기 ({viewingProfileUser.reviews.length})</h4>
              <div className="profile-reviews-preview" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {viewingProfileUser.reviews.length === 0 ? (
                  <p className="profile-reviews-empty">아직 작성된 후기가 없습니다.</p>
                ) : (
                  viewingProfileUser.reviews.map(rev => (
                    <div key={rev.id} className="profile-review-quote">
                      <p>"{rev.content}"</p>
                      <span className="profile-review-meta">
                        — {rev.reviewerNickname || rev.reviewer_id}
                        {' · '}{'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. 게시글 삭제 확인 모달 */}
      {showDeletePostModal && (
        <div className="guard-overlay" style={{ zIndex: 200 }} onClick={() => { setShowDeletePostModal(false); setPostToDeleteId(null); }}>
          <div className="guard-card" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="guard-icon" style={{ color: '#ef4444' }}>⚠️</div>
            <h3 className="guard-title" style={{ color: '#fca5a5' }}>게시글 삭제</h3>
            <p className="guard-desc">
              정말 이 게시글을 삭제하시겠습니까?<br />
              삭제된 게시글은 다시 복구할 수 없습니다.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => { setShowDeletePostModal(false); setPostToDeleteId(null); }}>
                취소
              </button>
              <button className="btn" style={{ flex: 1, background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.4)' }} onClick={handleDeletePost}>
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;

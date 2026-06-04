import React, { useState } from 'react';

function RegisterForm({ onRegisterSuccess, onSwitchToLogin }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [gymName, setGymName] = useState('마블 피트니스');
  const [threeLiftWeight, setThreeLiftWeight] = useState(300);
  const [preferredWorkoutTime, setPreferredWorkoutTime] = useState('18:00');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userId || !password || !gymName || !threeLiftWeight || !preferredWorkoutTime) {
      setError('모든 항목을 입력해주세요.');
      return;
    }

    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const response = await fetch('https://health-partner-production.up.railway.app/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          password,
          gymName,
          threeLiftWeight: Number(threeLiftWeight),
          preferredWorkoutTime,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '회원가입에 실패했습니다.');
      }

      setSuccessMsg('회원가입이 성공적으로 완료되었습니다! 로그인해 주세요.');
      setTimeout(() => {
        onRegisterSuccess(); // 가입 성공 후 로그인 화면으로 전환
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h1 className="auth-logo">JOIN PARTNER</h1>
        <p className="auth-subtitle">파트너를 구하기 위한 정보를 입력해주세요.</p>
      </div>

      <form onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}
        {successMsg && <div className="form-success">{successMsg}</div>}

        <div className="form-group">
          <label className="form-label" htmlFor="regUserId">아이디</label>
          <input
            type="text"
            id="regUserId"
            className="form-input"
            placeholder="사용할 아이디"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="regPassword">비밀번호</label>
          <input
            type="password"
            id="regPassword"
            className="form-input"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="regGym">헬스장 이름</label>
          <input
            type="text"
            id="regGym"
            className="form-input"
            placeholder="예: 마블 피트니스, 에이원 헬스장"
            value={gymName}
            onChange={(e) => setGymName(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="regWeight">삼대 중량 (kg)</label>
            <input
              type="number"
              id="regWeight"
              className="form-input"
              value={threeLiftWeight}
              onChange={(e) => setThreeLiftWeight(e.target.value)}
              disabled={loading}
              min="0"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="regTime">선호 시간 (HH:MM)</label>
            <input
              type="time"
              id="regTime"
              className="form-input"
              value={preferredWorkoutTime}
              onChange={(e) => setPreferredWorkoutTime(e.target.value)}
              disabled={loading}
              required
            />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? '가입 중...' : '회원가입'}
        </button>
      </form>

      <p className="auth-switch-text">
        이미 계정이 있으신가요?
        <span className="auth-link" onClick={onSwitchToLogin}>
          로그인하러 가기
        </span>
      </p>
    </div>
  );
}

export default RegisterForm;

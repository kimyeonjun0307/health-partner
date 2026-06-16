import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import LoginForm from './components/LoginForm';
import RegisterForm from './components/RegisterForm';
import Dashboard from './components/Dashboard';

// Axios 전역 기본 URL 설정
const DEFAULT_API_URL = import.meta.env.VITE_API_URL || 'https://health-partner-production.up.railway.app';
axios.defaults.baseURL = DEFAULT_API_URL;

function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  // 초기 렌더링 시 LocalStorage에서 인증 정보 로드 및 Axios 헤더 주입
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setInitializing(false);
  }, []);

  const handleLoginSuccess = (newToken, newUser) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  if (initializing) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: '#ffffff',
        fontSize: '20px',
        fontWeight: 'bold'
      }}>
        FITNESS PARTNER 로딩 중...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={
            token ? <Navigate to="/dashboard" replace /> : (
              <div className="auth-wrapper">
                <LoginForm
                  onLoginSuccess={handleLoginSuccess}
                  onSwitchToRegister={() => window.location.href = '/register'}
                />
              </div>
            )
          } 
        />
        <Route 
          path="/register" 
          element={
            token ? <Navigate to="/dashboard" replace /> : (
              <div className="auth-wrapper">
                <RegisterForm
                  onRegisterSuccess={() => window.location.href = '/login'}
                  onSwitchToLogin={() => window.location.href = '/login'}
                />
              </div>
            )
          } 
        />
        <Route 
          path="/dashboard" 
          element={
            token ? (
              <Dashboard
                token={token}
                user={user}
                onLogout={handleLogout}
              />
            ) : <Navigate to="/login" replace />
          } 
        />
        <Route 
          path="*" 
          element={<Navigate to={token ? "/dashboard" : "/login"} replace />} 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

import { useState, useEffect } from 'react';
import { Toaster } from '@/app/components/ui/sonner';
import { Sidebar } from '@/app/components/Sidebar';
import { Dashboard } from '@/app/components/pages/Dashboard';
import { Deployment } from '@/app/components/pages/Deployment';
import { Services } from '@/app/components/pages/Services';
import { Logs } from '@/app/components/pages/Logs';
import { Login } from '@/app/components/pages/Login';
import { Settings } from '@/app/components/pages/Settings';
import api from '@/lib/api';
import { toast } from "sonner";

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    !!localStorage.getItem('isLoggedIn')
  );
  const [authLoading, setAuthLoading] = useState(true);
  const [isBackendAvailable, setIsBackendAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    // 检查后端服务是否可用并验证认证
    const checkBackend = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5秒超时
        
        const response = await fetch('http://localhost:8000/', {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!isMounted) return;
        
        if (response.ok) {
          setIsBackendAvailable(true);
          // 后端可用后检查认证
          try {
            await api.get('/profile');
            if (isMounted) {
              setIsAuthenticated(true);
              localStorage.setItem('isLoggedIn', 'true');
            }
          } catch (error) {
            if (isMounted) {
              setIsAuthenticated(false);
              localStorage.removeItem('isLoggedIn');
            }
          } finally {
            if (isMounted) {
              setAuthLoading(false);
            }
          }
        } else {
          if (isMounted) {
            setIsBackendAvailable(false);
            setAuthLoading(false);
          }
        }
      } catch (error: any) {
        // 后端不可用（超时、网络错误等）- 静默处理，直接显示登录页面
        if (isMounted) {
          setIsBackendAvailable(false);
          setAuthLoading(false);
        }
      }
    };

    // 立即检查
    checkBackend();
    
    // 如果2秒后还没检测到，设置超时状态（直接显示登录页面）
    const timeout = setTimeout(() => {
      if (isMounted && isBackendAvailable === null) {
        setIsBackendAvailable(false);
        setAuthLoading(false);
      }
    }, 2000);

    const handleLogoutEvent = () => {
      setIsAuthenticated(false);
      localStorage.removeItem('isLoggedIn');
    };
    window.addEventListener('auth-logout', handleLogoutEvent);
    
    return () => {
      isMounted = false;
      clearTimeout(timeout);
      window.removeEventListener('auth-logout', handleLogoutEvent);
    };
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
    localStorage.setItem('isLoggedIn', 'true');
  };

  const handleLogout = async () => {
    try {
        await api.get('/logout');
    } catch (e) {
        console.error(e);
    }
    setIsAuthenticated(false);
    localStorage.removeItem('isLoggedIn');
    toast.success("已退出登录");
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard />;
      case 'deployment':
        return <Deployment />;
      case 'services':
        return <Services />;
      case 'logs':
        return <Logs />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  // 如果还在检查后端状态，显示加载中
  if (isBackendAvailable === null || authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-slate-600">正在加载...</p>
        </div>
      </div>
    );
  }

  // 如果未认证，直接显示登录页面（无论后端是否可用）
  if (!isAuthenticated) {
    return (
        <>
            <Login onLogin={handleLogin} />
            <Toaster position="top-right" richColors />
        </>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar activePage={activePage} onNavigate={setActivePage} onLogout={handleLogout} />
      
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-8">
          {renderPage()}
        </div>
      </main>

      <Toaster position="top-right" richColors />
    </div>
  );
}

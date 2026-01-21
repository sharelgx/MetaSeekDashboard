import { useState, useEffect } from 'react';
import { Toaster } from '@/app/components/ui/sonner';
import { Sidebar } from '@/app/components/Sidebar';
import { Dashboard } from '@/app/components/pages/Dashboard';
import { Deployment } from '@/app/components/pages/Deployment';
import { Services } from '@/app/components/pages/Services';
import { Backups } from '@/app/components/pages/Backups';
import { Logs } from '@/app/components/pages/Logs';
import { Login } from '@/app/components/pages/Login';
import api from '@/lib/api';
import { toast } from "sonner";

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    !!localStorage.getItem('isLoggedIn')
  );
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await api.get('/profile');
        setIsAuthenticated(true);
        localStorage.setItem('isLoggedIn', 'true');
      } catch (error) {
        setIsAuthenticated(false);
        localStorage.removeItem('isLoggedIn');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();

    const handleLogoutEvent = () => {
      setIsAuthenticated(false);
      localStorage.removeItem('isLoggedIn');
    };
    window.addEventListener('auth-logout', handleLogoutEvent);
    return () => window.removeEventListener('auth-logout', handleLogoutEvent);
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
      case 'backups':
        return <Backups />;
      case 'logs':
        return <Logs />;
      default:
        return <Dashboard />;
    }
  };

  if (authLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

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

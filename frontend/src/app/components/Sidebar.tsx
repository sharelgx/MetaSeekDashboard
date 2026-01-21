import { LayoutDashboard, Rocket, Server, FileText, LogOut, Settings } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';

type NavigationItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navigationItems: NavigationItem[] = [
  { id: 'dashboard', label: '概览', icon: LayoutDashboard },
  { id: 'deployment', label: '发布部署', icon: Rocket },
  { id: 'services', label: '服务管理', icon: Server },
  { id: 'logs', label: '日志监控', icon: FileText },
  { id: 'settings', label: '设置', icon: Settings },
];

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  onLogout?: () => void;
}

export function Sidebar({ activePage, onNavigate, onLogout }: SidebarProps) {
  return (
    <div className="w-64 h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-semibold">MetaSeekOJ Ops</h1>
        <p className="text-xs text-slate-400 mt-1">运维管理仪表盘</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700 space-y-4">
        {/* Logout Button */}
        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>退出登录</span>
          </button>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { CheckCircle2, AlertCircle, Server, Database, RefreshCw } from 'lucide-react';

interface ServiceStatus {
  postgresql: 'checking' | 'running' | 'error';
  backend: 'checking' | 'running' | 'error';
  frontend: 'running';
}

// 动态获取API基础URL（支持localhost和127.0.0.1）
const getApiBaseUrl = () => {
  const hostname = window.location.hostname;
  return `http://${hostname}:8000`;
};

export function Startup() {
  const [status, setStatus] = useState<ServiceStatus>({
    postgresql: 'checking',
    backend: 'checking',
    frontend: 'running',
  });
  const [logs, setLogs] = useState<string[]>([]);
  const isMountedRef = useRef(true);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 带超时的fetch封装
  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 2000): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };

  // 检查单个服务的状态
  const checkBackend = useCallback(async (): Promise<boolean> => {
    const baseUrl = getApiBaseUrl();
    try {
      const response = await fetchWithTimeout(`${baseUrl}/`, {
        method: 'GET',
        cache: 'no-cache',
        mode: 'cors',
      }, 2000);
      return response.ok;
    } catch (e: any) {
      return false;
    }
  }, []);

  const checkPostgres = useCallback(async (): Promise<boolean> => {
    const baseUrl = getApiBaseUrl();
    try {
      const response = await fetchWithTimeout(`${baseUrl}/api/health/postgresql`, {
        method: 'GET',
        cache: 'no-cache',
        mode: 'cors',
      }, 2000);
      if (response.ok) {
        const data = await response.json();
        return data.status === 'running';
      }
      return false;
    } catch (e: any) {
      return false;
    }
  }, []);

  // 检查所有服务状态
  const checkAllServices = useCallback(async () => {
    const backendOk = await checkBackend();
    const postgresOk = backendOk ? await checkPostgres() : false;

    const newStatus: ServiceStatus = {
      backend: backendOk ? 'running' : 'error',
      postgresql: postgresOk ? 'running' : 'error',
      frontend: 'running',
    };

    if (isMountedRef.current) {
      setStatus(newStatus);
    }

    return newStatus;
  }, [checkBackend, checkPostgres]);

  // 页面加载时立即检查，如果服务已运行则跳转
  useEffect(() => {
    isMountedRef.current = true;
    let checkCount = 0;

    const doCheck = async () => {
      if (!isMountedRef.current) return;

      checkCount++;
      const result = await checkAllServices();
      
      // 服务都运行中，跳转
      if (result.backend === 'running' && result.postgresql === 'running') {
        addLog('✅ 检测到所有服务已运行');
        addLog('🔄 正在跳转到登录页面...');
        
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
        
        setTimeout(() => {
          if (isMountedRef.current) {
            window.location.reload();
          }
        }, 800);
        return;
      }

      // 如果检查了60次（约120秒）还没成功，停止自动检查
      if (checkCount >= 60) {
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
      }
    };

    // 立即执行一次
    doCheck();

    // 每2秒检查一次
    checkIntervalRef.current = setInterval(doCheck, 2000);

    return () => {
      isMountedRef.current = false;
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [checkAllServices]);

  const addLog = (message: string) => {
    if (isMountedRef.current) {
      setLogs(prev => {
        // 避免重复日志
        if (prev.length > 0 && prev[prev.length - 1] === message) {
          return prev;
        }
        return [...prev, message];
      });
    }
  };

  // 手动刷新状态
  const handleRefresh = async () => {
    addLog('🔄 手动刷新服务状态...');
    const result = await checkAllServices();
    
    if (result.backend === 'running' && result.postgresql === 'running') {
      addLog('✅ 所有服务已运行，正在跳转...');
      setTimeout(() => window.location.reload(), 800);
    } else {
      const notRunning = [];
      if (result.backend !== 'running') notRunning.push('后端服务');
      if (result.postgresql !== 'running') notRunning.push('PostgreSQL');
      addLog(`⚠️ 未运行的服务: ${notRunning.join(', ')}`);
    }
  };

  const getStatusIcon = (s: 'checking' | 'running' | 'error') => {
    switch (s) {
      case 'running':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <CheckCircle2 className="w-5 h-5 text-blue-600 animate-pulse" />;
    }
  };

  const getStatusText = (s: 'checking' | 'running' | 'error') => {
    switch (s) {
      case 'running':
        return <span className="text-sm text-green-600">运行中</span>;
      case 'error':
        return <span className="text-sm text-red-600">未运行</span>;
      default:
        return <span className="text-sm text-blue-600">检查中...</span>;
    }
  };

  const allServicesRunning = status.backend === 'running' && status.postgresql === 'running';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
            <Server className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-3xl">MetaSeekOJ 运维仪表盘</CardTitle>
          <CardDescription className="text-lg mt-2">
            服务状态监控
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 服务状态 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">服务状态</h3>
              <Button variant="ghost" size="sm" onClick={handleRefresh}>
                <RefreshCw className="w-4 h-4 mr-1" />
                刷新
              </Button>
            </div>
            <div className="space-y-2">
              {/* PostgreSQL */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-slate-600" />
                  <span className="font-medium">PostgreSQL 数据库</span>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(status.postgresql)}
                  {getStatusText(status.postgresql)}
                </div>
              </div>

              {/* 后端服务 */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Server className="w-5 h-5 text-slate-600" />
                  <span className="font-medium">后端服务 (FastAPI)</span>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(status.backend)}
                  {getStatusText(status.backend)}
                </div>
              </div>

              {/* 前端服务 */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Server className="w-5 h-5 text-slate-600" />
                  <span className="font-medium">前端服务 (Vite)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-green-600">运行中</span>
                </div>
              </div>
            </div>
          </div>

          {/* 日志 */}
          {logs.length > 0 && (
            <div className="bg-slate-900 rounded-lg p-4 max-h-48 overflow-y-auto">
              <div className="space-y-1 font-mono text-sm">
                {logs.map((log, index) => (
                  <div key={index} className="text-slate-300">{log}</div>
                ))}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          {allServicesRunning ? (
            <Button
              onClick={() => window.location.reload()}
              className="w-full"
              size="lg"
            >
              <CheckCircle2 className="w-5 h-5 mr-2" />
              服务已就绪，点击进入
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-800 mb-2">⚠️ 服务未启动</h4>
                <p className="text-sm text-yellow-700 mb-3">
                  请在终端执行以下命令启动项目：
                </p>
                <code className="block bg-yellow-100 px-3 py-2 rounded text-yellow-900 font-mono text-sm">
                  bash start.sh
                </code>
              </div>
              <p className="text-xs text-center text-slate-400">
                页面会自动检测服务状态并跳转（每2秒检查一次）
              </p>
            </div>
          )}

          {/* 说明信息 */}
          <div className="text-center text-sm text-slate-500 border-t pt-4">
            <p className="mb-2">项目启动说明：</p>
            <ol className="text-left space-y-1 text-xs text-slate-400 list-decimal list-inside">
              <li>在项目根目录执行 <code className="bg-slate-100 px-1 rounded">bash start.sh</code></li>
              <li>等待服务启动完成（约15-30秒）</li>
              <li>页面会自动检测并跳转到登录页面</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

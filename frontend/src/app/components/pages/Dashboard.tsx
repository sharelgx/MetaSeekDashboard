import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { StatusBadge, ServiceStatus } from '@/app/components/StatusBadge';
import { Server, Wifi, Clock, RefreshCw } from 'lucide-react';
import { fetchStatus, fetchConfig, ServiceHealth } from '@/app/components/ui/api';
import { Button } from '@/app/components/ui/button';
import { toast } from 'sonner';

export function Dashboard() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<string>('从未');

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch Config
      const conf = await fetchConfig();
      setConfig(conf);

      // Fetch Status
      const statusRes = await fetchStatus();
      if (statusRes.success) {
        const output = statusRes.stdout || '';
        const newServices: ServiceHealth[] = [];

        // Parse Backend
        const backendStatus: ServiceStatus = output.includes('python3 manage.py runserver') ? 'running' : 'stopped';
        newServices.push({ name: 'Django Backend', description: 'API 服务', status: backendStatus, lastCheck: '刚刚' });

        // Parse Nginx
        const nginxStatus: ServiceStatus = output.includes('Active: active (running)') ? 'running' : 'stopped';
        newServices.push({ name: 'Nginx', description: 'Web 服务器', status: nginxStatus, lastCheck: '刚刚' });

        // Parse API Smoke
        const apiStatus: ServiceStatus = output.includes('http://127.0.0.1:8086/api/website/ -> 200') ? 'running' : 'error';
        newServices.push({ name: 'API Health', description: '接口连通性', status: apiStatus, lastCheck: '刚刚' });

        // Parse Classroom
        const classroomStatus: ServiceStatus = output.includes('host=metaseek.cc -> 200') ? 'running' : (output.includes('host=metaseek.cc -> 000') ? 'stopped' : 'warning');
        newServices.push({ name: 'Scratch Editor', description: '课堂编辑器', status: classroomStatus, lastCheck: '刚刚' });

        setServices(newServices);
        setLastCheck(new Date().toLocaleTimeString());
        toast.success('系统状态已更新');
      } else {
        toast.error('获取状态失败: ' + statusRes.error);
      }
    } catch (error) {
      toast.error('网络请求失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">概览</h1>
          <p className="text-slate-600 mt-1">系统运行状态总览</p>
        </div>
        <Button onClick={loadData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          刷新状态
        </Button>
      </div>

      {/* Server Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            服务器信息
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-slate-600 mb-1">IP 地址</p>
              <p className="font-mono text-sm font-medium">{config?.host || 'Loading...'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">用户</p>
              <p className="font-mono text-sm font-medium">{config?.user || 'Loading...'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">项目路径</p>
              <p className="font-mono text-sm font-medium">{config?.project_path || 'Loading...'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">SSH 连接状态</p>
              <div className="flex items-center gap-2 mt-1">
                <Wifi className={`w-4 h-4 ${config?.host ? 'text-green-600' : 'text-slate-400'}`} />
                <span className={`text-sm font-medium ${config?.host ? 'text-green-600' : 'text-slate-500'}`}>
                  {config?.host ? '已连接' : '检查中...'}
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">当前环境</p>
              <p className="text-sm font-medium">{config?.name || 'Default'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">最后检查</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Clock className="w-4 h-4 text-slate-500" />
                <span className="text-sm">{lastCheck}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Service Health Grid */}
      <Card>
        <CardHeader>
          <CardTitle>关键服务健康度</CardTitle>
          <CardDescription>实时监控各项服务运行状态</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => (
              <div
                key={service.name}
                className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-slate-900">{service.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{service.description}</p>
                  </div>
                  <StatusBadge status={service.status} />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  <span>检查: {service.lastCheck}</span>
                </div>
              </div>
            ))}
            {services.length === 0 && !loading && (
                <div className="col-span-3 text-center text-slate-500 py-4">
                    暂无数据，请点击刷新
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


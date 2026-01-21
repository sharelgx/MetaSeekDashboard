import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { StatusBadge, ServiceStatus } from '@/app/components/StatusBadge';
import { toast } from 'sonner';
import { RotateCw, Square, Activity, Wrench, Loader2 } from 'lucide-react';
import { restartService, fixScratch, fetchStatus } from '@/app/components/ui/api';

interface Service {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  group: 'core' | 'judge' | 'auxiliary';
}

interface QuickFix {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const initialServices: Service[] = [
  { id: 'backend', name: 'Django Backend', description: 'API 服务', status: 'running', group: 'core' },
  { id: 'nginx', name: 'Nginx', description: 'Web 服务器', status: 'running', group: 'core' },
  { id: 'judge', name: 'Judge Server', description: '判题服务', status: 'running', group: 'judge' },
  { id: 'heartbeat', name: 'Heartbeat Monitor', description: '心跳监控', status: 'running', group: 'judge' },
  { id: 'scratch', name: 'Scratch Runner', description: 'Scratch 编辑器', status: 'running', group: 'auxiliary' },
];

const quickFixes: QuickFix[] = [
  { id: 'fix-scratch', name: '修复 Scratch 编辑器', description: '当编辑器无法访问时使用', icon: Wrench },
  { id: 'fix-judge', name: '修复判题服务', description: '重置判题队列并重启服务', icon: Wrench },
  { id: 'clear-cache', name: '清除缓存', description: '清除 Redis 缓存', icon: Wrench },
];

export function Services() {
  const [services, setServices] = useState<Service[]>(initialServices);
  const [loadingService, setLoadingService] = useState<string | null>(null);

  const handleRestart = async (serviceId: string) => {
    setLoadingService(serviceId);
    toast.info(`正在重启 ${services.find(s => s.id === serviceId)?.name}...`);
    
    try {
        const res = await restartService(serviceId);
        if (res.restarted || res.success) {
            toast.success(`${services.find(s => s.id === serviceId)?.name} 重启成功`);
        } else {
            toast.error(`重启失败: ${res.error || '未知错误'}`);
        }
    } catch (e) {
        toast.error(`重启请求失败: ${e}`);
    } finally {
        setLoadingService(null);
    }
  };

  const handleStop = async (serviceId: string) => {
    toast.warning("停止服务功能暂未开放");
  };

  const handleCheckStatus = async (serviceId: string) => {
    toast.info("正在获取最新状态...");
    const res = await fetchStatus();
    if (res.success) {
        toast.success("状态已更新 (请查看仪表盘详情)");
        // In a real app we would parse specific service status here
    } else {
        toast.error("获取状态失败");
    }
  };

  const handleQuickFix = async (fixId: string) => {
    const fix = quickFixes.find(f => f.id === fixId);
    toast.info(`正在执行: ${fix?.name}...`);
    
    if (fixId === 'fix-scratch') {
        try {
            const res = await fixScratch();
            if (res.success) {
                toast.success("修复脚本执行成功");
            } else {
                toast.error(`修复失败: ${res.error}`);
            }
        } catch (e) {
            toast.error(`请求失败: ${e}`);
        }
    } else {
        toast.info("该修复功能尚未实现后端对接");
    }
  };

  const groupedServices = {
    core: services.filter(s => s.group === 'core'),
    judge: services.filter(s => s.group === 'judge'),
    auxiliary: services.filter(s => s.group === 'auxiliary'),
  };

  const ServiceRow = ({ service }: { service: Service }) => (
    <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-slate-900">{service.name}</h3>
          <StatusBadge status={service.status} />
        </div>
        <p className="text-sm text-slate-500 mt-1">{service.description}</p>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCheckStatus(service.id)}
          disabled={loadingService === service.id}
        >
          <Activity className="w-4 h-4 mr-1.5" />
          状态
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleRestart(service.id)}
          disabled={loadingService === service.id}
        >
          {loadingService === service.id ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <RotateCw className="w-4 h-4 mr-1.5" />
          )}
          重启
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleStop(service.id)}
          disabled={loadingService === service.id || service.status === 'stopped'}
        >
          <Square className="w-4 h-4 mr-1.5" />
          停止
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">服务管理</h1>
        <p className="text-slate-600 mt-1">远程服务启停控制与状态监控</p>
      </div>

      {/* Core Services */}
      <Card>
        <CardHeader>
          <CardTitle>核心服务</CardTitle>
          <CardDescription>Backend、Nginx 等主要服务</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {groupedServices.core.map(service => (
            <ServiceRow key={service.id} service={service} />
          ))}
        </CardContent>
      </Card>

      {/* Judge Services */}
      <Card>
        <CardHeader>
          <CardTitle>判题服务</CardTitle>
          <CardDescription>Judge、Heartbeat 监控服务</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {groupedServices.judge.map(service => (
            <ServiceRow key={service.id} service={service} />
          ))}
        </CardContent>
      </Card>

      {/* Auxiliary Services */}
      <Card>
        <CardHeader>
          <CardTitle>辅助服务</CardTitle>
          <CardDescription>Scratch Runner 等额外服务</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {groupedServices.auxiliary.map(service => (
            <ServiceRow key={service.id} service={service} />
          ))}
        </CardContent>
      </Card>

      {/* Quick Fixes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            快捷修复
          </CardTitle>
          <CardDescription>常用的服务修复脚本</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickFixes.map(fix => {
              const Icon = fix.icon;
              return (
                <div
                  key={fix.id}
                  className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-slate-900">{fix.name}</h3>
                      <p className="text-xs text-slate-500 mt-1">{fix.description}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleQuickFix(fix.id)}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    执行修复
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

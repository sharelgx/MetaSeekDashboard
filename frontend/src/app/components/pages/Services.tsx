import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { StatusBadge, ServiceStatus } from '@/app/components/StatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/app/components/ui/alert-dialog';
import { toast } from 'sonner';
import { RotateCw, Square, Activity, Loader2, Play, Database, Package, Server, RefreshCw, Network, AlertTriangle } from 'lucide-react';
import { fetchServers, switchServer, serviceOperation } from '@/app/components/ui/api';

// 根据启动脚本写死的服务列表
interface ServiceItem {
  id: string;
  name: string;
  description: string;
  type: 'dependency' | 'service';
  port?: number;
  checkCommand: string;
  startCommand: string;
  stopCommand: string;
  healthCheckUrl?: string; // 健康检查URL
  status: ServiceStatus;
  loading?: boolean;
}

interface ServerConfig {
  server_id: string;
  name: string;
  host: string;
  user: string;
  project_path: string;
  start_script?: string;
}

// 系统依赖（从start_dev.sh提取）
// 注意：监控项目现在使用SQLite数据库，不再需要管理PostgreSQL
// PostgreSQL仅用于MetaSeekOJ项目，不在监控范围内
const dependencies: Omit<ServiceItem, 'status' | 'loading'>[] = [
  // PostgreSQL已移除 - 监控项目使用SQLite，完全独立于MetaSeekOJ的PostgreSQL
];

// 应用服务（从start_dev.sh提取）
const services: Omit<ServiceItem, 'status' | 'loading'>[] = [
  {
    id: 'backend',
    name: 'Django Backend',
    description: 'Django 后端服务 (API)',
    type: 'service',
    port: 8086,
    checkCommand: 'ps aux | grep -E "python.*manage.py runserver.*8086" | grep -v grep | grep -v "python3 main.py" || echo "NOT_RUNNING"',
    startCommand: 'cd OnlineJudge && nohup python manage.py runserver 0.0.0.0:8086 >> /tmp/django.log 2>&1 &',
    stopCommand: 'pkill -f "python.*manage.py runserver.*8086"',
    healthCheckUrl: 'http://localhost:8086/api/admin/info/',
  },
  {
    id: 'dramatiq',
    name: 'Dramatiq Worker',
    description: '判题任务队列服务',
    type: 'service',
    checkCommand: 'ps aux | grep -E "start_dramatiq_worker\\.py|manage\\.py rundramatiq|dramatiq.*judge\\.tasks" | grep -v grep || echo "NOT_RUNNING"',
    startCommand: 'cd OnlineJudge && nohup python start_dramatiq_worker.py >> /tmp/dramatiq.log 2>&1 &',
    stopCommand: 'pkill -f "start_dramatiq_worker\\.py|manage\\.py rundramatiq|dramatiq.*judge\\.tasks"',
  },
  {
    id: 'heartbeat',
    name: 'Heartbeat Monitor',
    description: '判题机心跳监控服务',
    type: 'service',
    checkCommand: 'ps aux | grep -E "heartbeat_metaseek_judge\\.py" | grep -v grep || echo "NOT_RUNNING"',
    startCommand: 'cd OnlineJudge && TOKEN=$(python -c "import os,django;os.environ.setdefault(\'DJANGO_SETTINGS_MODULE\',\'oj.settings\');django.setup();from options.options import SysOptions;print(SysOptions.judge_server_token)") && nohup python heartbeat_metaseek_judge.py >> /tmp/heartbeat.log 2>&1 &',
    stopCommand: 'pkill -f "heartbeat_metaseek_judge\\.py"',
  },
  {
    id: 'vue_frontend',
    name: 'Vue Frontend',
    description: 'Vue.js 前端服务',
    type: 'service',
    port: 8081,
    checkCommand: 'ps aux | grep -E "vue|webpack.*8081" | grep -v grep || echo "NOT_RUNNING"',
    startCommand: 'cd OnlineJudgeFE-Vue && VUE_PORT=8081 nohup npm run dev >> /tmp/vue.log 2>&1 &',
    stopCommand: 'pkill -f "vue|webpack.*8081"',
    healthCheckUrl: 'http://localhost:8081',
  },
  {
    id: 'react_classroom',
    name: 'React Classroom',
    description: 'React 主站前端 (8080端口)',
    type: 'service',
    port: 8080,
    checkCommand: 'ps aux | grep -E "vite.*8080|npm run dev.*--port 8080" | grep -v grep || echo "NOT_RUNNING"',
    startCommand: 'cd OnlineJudgeFE-React && nohup npm run dev -- --host 0.0.0.0 --port 8080 >> /tmp/react_classroom.log 2>&1 &',
    stopCommand: 'pkill -f "vite.*8080|npm run dev.*--port 8080"',
    healthCheckUrl: 'http://localhost:8080',
  },
  {
    id: 'scratch_editor',
    name: 'Scratch Editor',
    description: 'Scratch 编辑器内核',
    type: 'service',
    port: 8601,
    checkCommand: 'ps aux | grep -E "scratch.*8601|webpack.*8601" | grep -v grep || echo "NOT_RUNNING"',
    startCommand: 'cd scratch-editor && PORT=8601 nohup ./start-editor.sh >> /tmp/scratch_editor.log 2>&1 &',
    stopCommand: 'pkill -f "scratch.*8601|webpack.*8601"',
    healthCheckUrl: 'http://localhost:8601',
  },
  {
    id: 'scratch_runner',
    name: 'Scratch Runner',
    description: 'Scratch 运行服务',
    type: 'service',
    port: 3002,
    checkCommand: 'if lsof -i:3002 >/dev/null 2>&1; then echo "RUNNING"; elif [ -n "$(ps aux | grep -E \"node.*server\\.js.*3002|scratch-runner.*3002|PORT=3002\" | grep -v grep | grep -v cursor | head -1)" ]; then echo "RUNNING"; else echo "NOT_RUNNING"; fi',
    startCommand: 'cd scratch-runner && PORT=3002 nohup node server.js >> logs/scratch-runner.log 2>&1 &',
    stopCommand: 'pkill -f "scratch-runner|node.*server\\.js.*3002"',
    healthCheckUrl: 'http://localhost:3002/health',
  },
  {
    id: 'judge_server',
    name: 'Judge Server',
    description: '判题服务器 (Docker)',
    type: 'service',
    port: 12360,
    checkCommand: 'docker ps | grep -E "judge|metaseek-judge" || echo "NOT_RUNNING"',
    startCommand: 'docker start metaseek-judge-dev || docker run -d --name metaseek-judge-dev ...',
    stopCommand: 'docker stop metaseek-judge-dev',
    healthCheckUrl: 'http://localhost:12360/ping',
  },
];

export function Services() {
  const [servers, setServers] = useState<Record<string, ServerConfig>>({});
  const [currentServerId, setCurrentServerId] = useState<string | null>(null);
  const [serviceList, setServiceList] = useState<ServiceItem[]>([]);
  const [dependencyList, setDependencyList] = useState<ServiceItem[]>([]);
  const [loadingOperations, setLoadingOperations] = useState<Record<string, string>>({});
  const [loadingServers, setLoadingServers] = useState(false);
  const [testingConnectivity, setTestingConnectivity] = useState<Record<string, boolean>>({});
  const [confirmDialog, setConfirmDialog] = useState<{open: boolean, serviceId: string, operation: 'start' | 'stop' | 'restart' | null}>({
    open: false,
    serviceId: '',
    operation: null
  });

  // 加载服务器列表
  useEffect(() => {
    loadServers();
  }, []);

  // 初始化服务列表（当服务器切换时）
  useEffect(() => {
    if (currentServerId) {
      initServices();
    }
  }, [currentServerId]);

  const loadServers = async () => {
    try {
      const response = await fetchServers();
      if (response && response.servers) {
        setServers(response.servers);
        
        // 如果有服务器且未选择，选择第一个
        const serverIds = Object.keys(response.servers);
        if (serverIds.length > 0 && !currentServerId) {
          setCurrentServerId(serverIds[0]);
          await handleSwitchServer(serverIds[0]);
        }
      }
    } catch (error) {
      console.error('加载服务器列表失败:', error);
      toast.error('加载服务器列表失败');
    }
  };

  const initServices = () => {
    const servicesWithStatus: ServiceItem[] = services.map(s => ({
      ...s,
      status: 'warning' as ServiceStatus,
      loading: false,
    }));
    
    const depsWithStatus: ServiceItem[] = dependencies.map(d => ({
      ...d,
      status: 'warning' as ServiceStatus,
      loading: false,
    }));
    
    setServiceList(servicesWithStatus);
    setDependencyList(depsWithStatus);
    
    // 自动检查所有服务状态
    checkAllServicesStatus([...servicesWithStatus, ...depsWithStatus]);
  };

  // 切换服务器
  const handleSwitchServer = async (serverId: string) => {
    if (serverId === currentServerId) return;

    setLoadingServers(true);
    try {
      await switchServer(serverId);
      setCurrentServerId(serverId);
      toast.success(`已切换到服务器: ${servers[serverId]?.name || serverId}`);
      initServices();
    } catch (error: any) {
      toast.error(`切换服务器失败: ${error.message}`);
    } finally {
      setLoadingServers(false);
    }
  };

  // 检查所有服务状态
  const checkAllServicesStatus = async (items: ServiceItem[]) => {
    for (const item of items) {
      await checkServiceStatus(item.id);
    }
  };

  // 检查单个服务状态
  const checkServiceStatus = async (serviceId: string) => {
    if (!currentServerId) return;
    
    const item = [...serviceList, ...dependencyList].find(s => s.id === serviceId);
    if (!item) return;

    setLoadingOperations(prev => ({ ...prev, [`${serviceId}-status`]: 'checking' }));

    try {
      // 使用SSH执行检查命令
      const result = await serviceOperation(
        currentServerId,
        item.name,
        'status'
      );
      
      const status: ServiceStatus = result.status === 'running' ? 'running' : 
                                   result.status === 'stopped' ? 'stopped' : 'error';
      updateServiceStatus(serviceId, status);
    } catch (error) {
      console.error('检查服务状态失败:', error);
      updateServiceStatus(serviceId, 'error');
    } finally {
      setLoadingOperations(prev => {
        const newState = { ...prev };
        delete newState[`${serviceId}-status`];
        return newState;
      });
    }
  };

  // 测试服务连通性
  const testServiceConnectivity = async (serviceId: string) => {
    if (!currentServerId) {
      toast.error('请先选择服务器');
      return;
    }

    const item = [...serviceList, ...dependencyList].find(s => s.id === serviceId);
    if (!item) {
      toast.error('服务不存在');
      return;
    }

    setTestingConnectivity(prev => ({ ...prev, [serviceId]: true }));

    try {
      const response = await fetch('/api/services/test-connectivity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: currentServerId,
          service_id: serviceId,
          port: item.port,
          health_check_url: item.healthCheckUrl,
          check_command: item.checkCommand,
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        const details = [];
        if (result.port_check) details.push(`端口检查: ${result.port_check}`);
        if (result.process_check) details.push(`进程检查: ${result.process_check}`);
        if (result.http_check) details.push(`HTTP检查: ${result.http_check}`);
        
        toast.success(`${item.name} 连通性测试成功`, {
          description: details.join(', '),
          duration: 5000,
        });
      } else {
        toast.error(`${item.name} 连通性测试失败: ${result.error || '未知错误'}`, {
          description: result.details || '',
          duration: 5000,
        });
      }
    } catch (error: any) {
      toast.error(`连通性测试失败: ${error.message}`);
    } finally {
      setTestingConnectivity(prev => {
        const newState = { ...prev };
        delete newState[serviceId];
        return newState;
      });
    }
  };

  // 更新服务状态
  const updateServiceStatus = (serviceId: string, status: ServiceStatus) => {
    setServiceList(prev => prev.map(s => s.id === serviceId ? { ...s, status } : s));
    setDependencyList(prev => prev.map(d => d.id === serviceId ? { ...d, status } : d));
  };

  // 检查是否需要确认对话框（对于共享服务如PostgreSQL）
  const needsConfirmation = (serviceId: string, operation: 'start' | 'stop' | 'restart'): boolean => {
    // PostgreSQL是共享服务，停止/重启会影响所有使用该数据库的项目
    if (serviceId === 'postgresql' && (operation === 'stop' || operation === 'restart')) {
      return true;
    }
    return false;
  };

  // 服务操作
  const handleServiceOperation = async (serviceId: string, operation: 'start' | 'stop' | 'restart' | 'status') => {
    if (!currentServerId) {
      toast.error('请先选择服务器');
      return;
    }

    const item = [...serviceList, ...dependencyList].find(s => s.id === serviceId);
    if (!item) {
      toast.error('服务不存在');
      return;
    }

    if (operation === 'status') {
      await checkServiceStatus(serviceId);
      return;
    }

    // 对于需要确认的操作，显示确认对话框
    if (needsConfirmation(serviceId, operation)) {
      setConfirmDialog({
        open: true,
        serviceId,
        operation
      });
      return;
    }

    // 直接执行操作
    await executeServiceOperation(serviceId, operation);
  };

  // 执行服务操作
  const executeServiceOperation = async (serviceId: string, operation: 'start' | 'stop' | 'restart') => {
    if (!currentServerId) return;

    const item = [...serviceList, ...dependencyList].find(s => s.id === serviceId);
    if (!item) return;

    const operationKey = `${serviceId}-${operation}`;
    setLoadingOperations(prev => ({ ...prev, [operationKey]: operation }));

    try {
      // 使用SSH执行操作
      const result = await serviceOperation(
        currentServerId,
        item.name,
        operation
      );
      
      if (result.success) {
        const operationNames = {
          start: '启动',
          stop: '停止',
          restart: '重启',
          status: '检查状态',
        };
        
        toast.success(`${item.name} ${operationNames[operation]}成功`);
        
        // 操作后等待一下再检查状态
        setTimeout(() => {
          checkServiceStatus(serviceId);
        }, 2000);
      } else {
        toast.error(`${item.name} ${operation}失败: ${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      toast.error(`操作失败: ${error.message}`);
    } finally {
      setLoadingOperations(prev => {
        const newState = { ...prev };
        delete newState[operationKey];
        return newState;
      });
    }
  };

  const ServiceRow = ({ service }: { service: ServiceItem }) => {
    const isLoading = Object.keys(loadingOperations).some(key => 
      key.startsWith(`${service.id}-`)
    );
    const isTesting = testingConnectivity[service.id] || false;

    return (
      <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-slate-900">{service.name}</h3>
            <StatusBadge status={service.status} />
            {service.type === 'dependency' && (
              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">依赖</span>
            )}
            {service.port && (
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                端口: {service.port}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">{service.description}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleServiceOperation(service.id, 'status')}
            disabled={isLoading}
          >
            {isLoading && loadingOperations[`${service.id}-status`] ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Activity className="w-4 h-4 mr-1.5" />
            )}
            健康检查
          </Button>

          {service.port && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => testServiceConnectivity(service.id)}
              disabled={isTesting}
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Network className="w-4 h-4 mr-1.5" />
              )}
              连通性测试
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleServiceOperation(service.id, 'start')}
            disabled={isLoading || service.status === 'running'}
          >
            {isLoading && loadingOperations[`${service.id}-start`] ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-1.5" />
            )}
            启动
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleServiceOperation(service.id, 'restart')}
            disabled={isLoading}
          >
            {isLoading && loadingOperations[`${service.id}-restart`] ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <RotateCw className="w-4 h-4 mr-1.5" />
            )}
            重启
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleServiceOperation(service.id, 'stop')}
            disabled={isLoading || service.status === 'stopped'}
          >
            {isLoading && loadingOperations[`${service.id}-stop`] ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Square className="w-4 h-4 mr-1.5" />
            )}
            停止
          </Button>
        </div>
      </div>
    );
  };

  const currentServer = currentServerId ? servers[currentServerId] : null;
  const hasServers = Object.keys(servers).length > 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">服务管理</h1>
        <p className="text-slate-600 mt-1">远程服务启停控制与状态监控</p>
      </div>

      {/* 服务器选择 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            服务器选择
          </CardTitle>
          <CardDescription>选择要管理的服务器</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasServers ? (
            <div className="text-center py-8 text-slate-500">
              <Server className="w-12 h-12 mx-auto mb-4 text-slate-400" />
              <p>暂无服务器配置</p>
              <p className="text-sm mt-2">请前往设置页面添加服务器配置</p>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Select
                value={currentServerId || ''}
                onValueChange={handleSwitchServer}
                disabled={loadingServers}
              >
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="选择服务器" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(servers).map(server => (
                    <SelectItem key={server.server_id} value={server.server_id}>
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4" />
                        <span>{server.name} ({server.host})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button
                variant="outline"
                onClick={() => checkAllServicesStatus([...serviceList, ...dependencyList])}
                disabled={loadingServers || !currentServerId}
              >
                {loadingServers ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    切换中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    刷新所有状态
                  </>
                )}
              </Button>
              
              {currentServer && (
                <div className="text-sm text-slate-600">
                  <p className="font-medium">服务器: {currentServer.name}</p>
                  <p className="text-xs text-slate-400">
                    项目路径: {currentServer.project_path}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 服务列表 - 只在有服务器且已选择时显示 */}
      {hasServers && currentServerId && (
        <>
          {/* 系统依赖 */}
          {dependencyList.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  系统依赖
                </CardTitle>
                <CardDescription>PostgreSQL 等系统依赖服务</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dependencyList.map(dep => (
                  <ServiceRow key={dep.id} service={dep} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* 应用服务 */}
          {serviceList.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  应用服务
                </CardTitle>
                <CardDescription>Backend、Frontend、Judge 等应用服务</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {serviceList.map(service => (
                  <ServiceRow key={service.id} service={service} />
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

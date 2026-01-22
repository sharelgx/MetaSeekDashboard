import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { StatusBadge, ServiceStatus } from '@/app/components/StatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { toast } from 'sonner';
import { RotateCw, Square, Activity, Loader2, Play, Database, Package, Server, RefreshCw } from 'lucide-react';
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

// 系统依赖（从启动脚本提取）
const dependencies: Omit<ServiceItem, 'status' | 'loading'>[] = [
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    description: '数据库服务',
    type: 'dependency',
    port: 5432,
    checkCommand: 'pg_isready -h localhost -p 5432',
    startCommand: 'sudo service postgresql start || sudo -u postgres /usr/lib/postgresql/12/bin/pg_ctl -D /var/lib/postgresql/12/main start',
    stopCommand: 'sudo service postgresql stop',
  },
];

// 应用服务（从启动脚本提取）
const services: Omit<ServiceItem, 'status' | 'loading'>[] = [
  {
    id: 'backend',
    name: 'Backend',
    description: 'FastAPI 后端服务',
    type: 'service',
    port: 8000,
    checkCommand: 'ps aux | grep -E "python3.*main.py" | grep -v grep || echo "NOT_RUNNING"',
    startCommand: 'cd backend && nohup python3 main.py > /tmp/opsdashboard_backend.log 2>&1 &',
    stopCommand: 'pkill -f "python3.*main.py"',
  },
  {
    id: 'frontend',
    name: 'Frontend',
    description: 'Vite 前端服务',
    type: 'service',
    port: 5173,
    checkCommand: 'ps aux | grep -E "vite|npm.*dev" | grep -v grep || echo "NOT_RUNNING"',
    startCommand: 'cd frontend && nohup npm run dev > /tmp/opsdashboard_frontend.log 2>&1 &',
    stopCommand: 'pkill -f "vite|npm.*dev"',
  },
];

export function Services() {
  const [servers, setServers] = useState<Record<string, ServerConfig>>({});
  const [currentServerId, setCurrentServerId] = useState<string | null>(null);
  const [serviceList, setServiceList] = useState<ServiceItem[]>([]);
  const [dependencyList, setDependencyList] = useState<ServiceItem[]>([]);
  const [loadingOperations, setLoadingOperations] = useState<Record<string, string>>({});
  const [loadingServers, setLoadingServers] = useState(false);

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

  // 更新服务状态
  const updateServiceStatus = (serviceId: string, status: ServiceStatus) => {
    setServiceList(prev => prev.map(s => s.id === serviceId ? { ...s, status } : s));
    setDependencyList(prev => prev.map(d => d.id === serviceId ? { ...d, status } : d));
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
                <CardDescription>Backend、Frontend 等应用服务</CardDescription>
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

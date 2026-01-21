import { useEffect, useState, useRef } from 'react';
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { StatusBadge, ServiceStatus } from '@/app/components/StatusBadge';
import { Server, Clock, RefreshCw, RotateCw, ChevronDown, ChevronUp, Loader2, Terminal } from 'lucide-react';
import { fetchStatus, fetchConfig, fetchServers, ServiceHealth, restartProject, getRestartLog, switchServer } from '@/app/components/ui/api';
import { Button } from '@/app/components/ui/button';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/app/components/ui/collapsible';

interface ServerConfig {
  server_id: string;
  name: string;
  host: string;
  user: string;
  port?: number;
  project_path: string;
  auth_type?: string;
  start_script?: string;
}

interface ServerStatus {
  server: ServerConfig;
  services: ServiceHealth[];
  config: any;
  lastCheck: string;
  loading: boolean;
}

export function Dashboard() {
  const [servers, setServers] = useState<Record<string, ServerConfig>>({});
  const [serverStatuses, setServerStatuses] = useState<Record<string, ServerStatus>>({});
  const [loading, setLoading] = useState(false);
  const [restartingServers, setRestartingServers] = useState<Set<string>>(new Set());
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [logContents, setLogContents] = useState<Record<string, string>>({});
  const [logPolling, setLogPolling] = useState<Record<string, NodeJS.Timeout>>({});
  const logPollingRefs = useRef<Record<string, NodeJS.Timeout>>({});
  const logScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 加载服务器列表
  const loadServers = async () => {
    try {
      const response = await fetchServers();
      if (response && response.servers) {
        // 确保每个服务器配置都有server_id字段
        const serversWithId: Record<string, ServerConfig> = {};
        Object.keys(response.servers).forEach(serverId => {
          const server = response.servers[serverId];
          serversWithId[serverId] = {
            ...server,
            server_id: server.server_id || serverId,
          };
        });
        setServers(serversWithId);
        
        // 为每个服务器初始化状态
        const initialStatuses: Record<string, ServerStatus> = {};
        Object.keys(serversWithId).forEach(serverId => {
          if (!serverStatuses[serverId]) {
            initialStatuses[serverId] = {
              server: serversWithId[serverId],
              services: [],
              config: null,
              lastCheck: '从未',
              loading: false,
            };
          }
        });
        setServerStatuses(prev => ({ ...prev, ...initialStatuses }));
      }
    } catch (error) {
      console.error('加载服务器列表失败:', error);
      toast.error('加载服务器列表失败');
    }
  };

  // 加载单个服务器的状态
  const loadServerStatus = async (serverId: string) => {
    const server = servers[serverId];
    if (!server) return;

    setServerStatuses(prev => ({
      ...prev,
      [serverId]: {
        ...prev[serverId],
        loading: true,
      },
    }));

    try {
      // 切换服务器以获取该服务器的状态
      try {
        await switchServer(serverId);
      } catch (error) {
        console.warn('切换服务器失败，继续获取状态:', error);
      }
      
      // 获取配置和状态
      const configRes = await fetchConfig();
      const statusRes = await fetchStatus(serverId);

      if (statusRes.success) {
        const output = statusRes.stdout || '';
        const newServices: ServiceHealth[] = [];

        // Parse Backend - 查找 [RUNNING] 标记或包含 runserver 的进程信息
        const backendStatus: ServiceStatus = (output.includes('[RUNNING]') && output.includes('Django Backend')) || 
                                             output.includes('python3 manage.py runserver') ? 'running' : 'stopped';
        newServices.push({ name: 'Django Backend', description: 'API 服务', status: backendStatus, lastCheck: '刚刚' });

        // Parse Nginx - 查找 [RUNNING] 标记或包含 Active: active (running)
        const nginxStatus: ServiceStatus = (output.includes('[RUNNING]') && output.includes('Nginx')) || 
                                          output.includes('Active: active (running)') ? 'running' : 'stopped';
        newServices.push({ name: 'Nginx', description: 'Web 服务器', status: nginxStatus, lastCheck: '刚刚' });

        // Parse API Health - 查找 [OK] 标记或包含 -> 200 的状态码
        const apiStatus: ServiceStatus = (output.includes('[OK]') && output.includes('API Health')) || 
                                        (output.includes('/api/website/ -> 200') || output.includes('-> 200 [OK]')) ? 'running' : 'error';
        newServices.push({ name: 'API Health', description: '接口连通性', status: apiStatus, lastCheck: '刚刚' });

        // Parse Scratch Editor - 查找状态标记
        let classroomStatus: ServiceStatus = 'warning';
        if (output.includes('host=metaseek.cc -> 200') || (output.includes('[OK]') && output.includes('Scratch Editor'))) {
          classroomStatus = 'running';
        } else if (output.includes('host=metaseek.cc -> 000') || (output.includes('[STOPPED]') && output.includes('Scratch Editor'))) {
          classroomStatus = 'stopped';
        }
        newServices.push({ name: 'Scratch Editor', description: '课堂编辑器', status: classroomStatus, lastCheck: '刚刚' });

        setServerStatuses(prev => ({
          ...prev,
          [serverId]: {
            ...prev[serverId],
            services: newServices,
            config: configRes,
            lastCheck: new Date().toLocaleTimeString(),
            loading: false,
          },
        }));
      } else {
        setServerStatuses(prev => ({
          ...prev,
          [serverId]: {
            ...prev[serverId],
            loading: false,
          },
        }));
        toast.error(`获取 ${server.name} 状态失败: ${statusRes.error}`);
      }
    } catch (error) {
      setServerStatuses(prev => ({
        ...prev,
        [serverId]: {
          ...prev[serverId],
          loading: false,
        },
      }));
      toast.error(`获取 ${server.name} 状态失败`);
      console.error(error);
    }
  };

  // 加载所有服务器状态
  const loadAllStatuses = async () => {
    setLoading(true);
    try {
      // 先加载服务器列表
      const response = await fetchServers();
      if (response && response.servers) {
        setServers(response.servers);
        // 为每个服务器初始化状态
        const initialStatuses: Record<string, ServerStatus> = {};
        Object.keys(response.servers).forEach(serverId => {
          if (!serverStatuses[serverId]) {
            initialStatuses[serverId] = {
              server: response.servers[serverId],
              services: [],
              config: null,
              lastCheck: '从未',
              loading: false,
            };
          }
        });
        setServerStatuses(prev => ({ ...prev, ...initialStatuses }));
        
        // 加载每个服务器的状态
        const serverIds = Object.keys(response.servers);
        for (const serverId of serverIds) {
          await loadServerStatus(serverId);
        }
        toast.success('系统状态已更新');
      } else {
        toast.error('未找到服务器配置');
      }
    } catch (error) {
      toast.error('刷新状态失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // 重启项目
  const handleRestartProject = async (serverId: string) => {
    const server = servers[serverId];
    if (!server) {
      toast.error(`服务器 ${serverId} 不存在`);
      console.error('服务器列表:', Object.keys(servers));
      return;
    }

    console.log('重启项目 - 服务器ID:', serverId, '服务器配置:', { 
      name: server.name, 
      start_script: server.start_script,
      server_id: server.server_id 
    });

    setRestartingServers(prev => new Set(prev).add(serverId));
    toast.info(`正在重启项目: ${server.name}...`);

    try {
      // 使用server.server_id而不是serverId，确保ID正确
      const actualServerId = server.server_id || serverId;
      const response = await restartProject(actualServerId, server.start_script);
      
      // 检查响应状态
      if (!response || typeof response !== 'object') {
        throw new Error('服务器响应格式错误');
      }
      
      if (response.success) {
        toast.success(`项目重启命令已执行: ${server.name}`);
        // 展开日志显示
        setExpandedLogs(prev => new Set(prev).add(serverId));
        // 开始轮询日志
        startLogPolling(serverId);
      } else {
        const errorMsg = response.message || response.error || response.detail || '未知错误';
        toast.error(`项目重启失败: ${errorMsg}`);
      }
    } catch (error: any) {
      console.error('Restart project error:', error);
      let errorMsg = '重启失败';
      
      if (error.message) {
        errorMsg = error.message;
      } else if (error.response) {
        errorMsg = error.response.data?.detail || error.response.data?.message || `HTTP ${error.response.status}`;
      } else if (typeof error === 'string') {
        errorMsg = error;
      }
      
      // 如果是 404 错误，提示检查后端服务或服务器ID
      if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
        errorMsg = `后端服务未运行或服务器 "${serverId}" 不存在。请检查：1) 后端服务是否在 http://localhost:8000 运行；2) 服务器ID是否正确`;
      }
      
      toast.error(`项目重启失败: ${errorMsg}`, {
        duration: 5000,
      });
    } finally {
      setRestartingServers(prev => {
        const newSet = new Set(prev);
        newSet.delete(serverId);
        return newSet;
      });
    }
  };

  // 开始轮询日志
  const startLogPolling = (serverId: string) => {
    // 清除之前的轮询
    if (logPollingRefs.current[serverId]) {
      clearInterval(logPollingRefs.current[serverId]);
    }

    // 立即获取一次日志
    fetchLogContent(serverId);

    // 每1秒轮询一次，以获得更好的实时性
    const interval = setInterval(() => {
      fetchLogContent(serverId);
    }, 1000);

    logPollingRefs.current[serverId] = interval;
  };

  // 停止轮询日志
  const stopLogPolling = (serverId: string) => {
    if (logPollingRefs.current[serverId]) {
      clearInterval(logPollingRefs.current[serverId]);
      delete logPollingRefs.current[serverId];
    }
  };

  // 获取日志内容
  const fetchLogContent = async (serverId: string) => {
    try {
      const response = await getRestartLog(serverId, 500); // 增加行数以显示更多内容
      if (response.success) {
        setLogContents(prev => {
          const newContent = response.log_content || '';
          // 如果内容有变化，更新状态并滚动到底部
          if (prev[serverId] !== newContent) {
            // 使用 setTimeout 确保 DOM 更新后再滚动
            setTimeout(() => {
              const scrollContainer = logScrollRefs.current[serverId];
              if (scrollContainer) {
                // 查找最近的 ScrollArea viewport
                const scrollArea = scrollContainer.closest('[data-slot="scroll-area"]');
                if (scrollArea) {
                  const viewport = scrollArea.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
                  if (viewport) {
                    viewport.scrollTop = viewport.scrollHeight;
                  }
                }
              }
            }, 50);
            return {
              ...prev,
              [serverId]: newContent,
            };
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('获取日志失败:', error);
    }
  };

  // 切换日志显示
  const toggleLogDisplay = (serverId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(serverId)) {
        newSet.delete(serverId);
        stopLogPolling(serverId);
      } else {
        newSet.add(serverId);
        // 展开时立即开始轮询，以便实时查看启动脚本执行过程
        startLogPolling(serverId);
        // 延迟一下再滚动，确保 DOM 已渲染
        setTimeout(() => {
          const scrollContainer = logScrollRefs.current[serverId];
          if (scrollContainer) {
            const scrollArea = scrollContainer.closest('[data-slot="scroll-area"]');
            if (scrollArea) {
              const viewport = scrollArea.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
              if (viewport) {
                viewport.scrollTop = viewport.scrollHeight;
              }
            }
          }
        }, 200);
      }
      return newSet;
    });
  };

  useEffect(() => {
    loadServers();
  }, []);

  // 清理轮询
  useEffect(() => {
    return () => {
      Object.values(logPollingRefs.current).forEach(interval => clearInterval(interval));
    };
  }, []);

  // 构建服务器列表，确保每个服务器都有server_id字段
  const serverList = Object.keys(servers).map(id => {
    const server = servers[id];
    // 确保server_id字段存在
    return {
      ...server,
      server_id: server.server_id || id,
    };
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">概览</h1>
          <p className="text-slate-600 mt-1">系统运行状态总览</p>
        </div>
        <Button onClick={loadAllStatuses} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          刷新状态
        </Button>
      </div>

      {/* 服务器列表 */}
      {serverList.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            <Server className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <p>暂无服务器配置</p>
            <p className="text-sm mt-2">请前往设置页面添加服务器</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {serverList.map((server) => {
            const status = serverStatuses[server.server_id];
            const isRestarting = restartingServers.has(server.server_id);
            const isLogExpanded = expandedLogs.has(server.server_id);
            const logContent = logContents[server.server_id] || '';

            return (
              <Card key={server.server_id} className="overflow-hidden">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Server className="w-5 h-5 text-slate-600" />
                      <div>
                        <CardTitle>{server.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {server.host} • {server.user}@{server.host}:{server.port || 22}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadServerStatus(server.server_id)}
                        disabled={status?.loading || loading}
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${status?.loading ? 'animate-spin' : ''}`} />
                        刷新
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleRestartProject(server.server_id)}
                        disabled={isRestarting}
                      >
                        {isRestarting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            重启中...
                          </>
                        ) : (
                          <>
                            <RotateCw className="w-4 h-4 mr-2" />
                            重启项目
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 服务器信息 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">IP 地址</p>
                      <p className="font-mono text-sm font-medium">{server.host}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600 mb-1">项目路径</p>
                      <p className="font-mono text-sm font-medium">{server.project_path}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600 mb-1">最后检查</p>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-slate-500" />
                        <span className="text-sm">{status?.lastCheck || '从未'}</span>
                      </div>
                    </div>
                  </div>

                  {/* 服务健康度 */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">关键服务健康度</h3>
                    {status?.loading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        <span className="ml-2 text-slate-600">加载中...</span>
                      </div>
                    ) : status?.services && status.services.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {status.services.map((service) => (
                          <div
                            key={service.name}
                            className="border border-slate-200 rounded-lg p-3 hover:shadow-md transition-shadow"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h4 className="font-medium text-slate-900 text-sm">{service.name}</h4>
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
                      </div>
                    ) : (
                      <div className="text-center text-slate-500 py-4 text-sm">
                        暂无服务数据，请点击刷新
                      </div>
                    )}
                  </div>

                  {/* 启动脚本执行日志 */}
                  <Collapsible open={isLogExpanded} onOpenChange={() => toggleLogDisplay(server.server_id)}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between">
                        <div className="flex items-center gap-2">
                          <Terminal className="w-4 h-4" />
                          <span>启动脚本执行日志</span>
                          {isLogExpanded && logContent && (
                            <div className="flex items-center gap-1 ml-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                              <span className="text-xs text-slate-500">实时更新中</span>
                            </div>
                          )}
                        </div>
                        {isLogExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Card className="mt-2">
                        <CardContent className="p-4">
                          <ScrollArea className="h-64 w-full">
                            <div
                              ref={(el) => {
                                logScrollRefs.current[server.server_id] = el;
                              }}
                            >
                              <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words">
                                {logContent || '暂无日志内容，点击"重启项目"按钮后日志将显示在这里...'}
                              </pre>
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

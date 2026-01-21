import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Separator } from '@/app/components/ui/separator';
import { toast } from 'sonner';
import { 
  Settings as SettingsIcon, 
  Server, 
  Plus, 
  Trash2, 
  TestTube, 
  Save,
  Key,
  Lock,
  CheckCircle2,
  XCircle,
  Loader2,
  Network,
  FolderOpen,
  Shield,
  Info,
  RotateCw,
  FileText
} from 'lucide-react';
import api from '@/lib/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';

interface ServerConfig {
  server_id: string;
  name: string;
  host: string;
  user: string;
  port?: number;
  password?: string;
  private_key_path?: string;
  private_key_content?: string;
  project_path: string;
  auth_type?: string;
  start_script?: string; // 启动脚本路径
}

export function Settings() {
  const [servers, setServers] = useState<Record<string, ServerConfig>>({});
  const [currentServer, setCurrentServer] = useState<ServerConfig | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; output?: string } | null>(null);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const [restartingServerId, setRestartingServerId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('list');
  const [browseDialogOpen, setBrowseDialogOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState<string>('/');
  const [browseItems, setBrowseItems] = useState<Array<{name: string; type: string; path: string}>>([]);
  const [isLoadingBrowse, setIsLoadingBrowse] = useState(false);
  const [browseType, setBrowseType] = useState<'project' | 'script'>('project');

  // 表单状态
  const [formData, setFormData] = useState<ServerConfig>({
    server_id: '',
    name: '',
    host: '',
    user: '',
    port: 22,
    password: '',
    private_key_path: '',
    private_key_content: '',
    project_path: '',
    auth_type: 'password',
    start_script: '',
  });

  // 加载服务器列表
  const loadServers = async () => {
    try {
      const response = await api.get('/servers');
      if (response.data && response.data.servers) {
        setServers(response.data.servers);
      }
    } catch (error: any) {
      console.error('加载服务器列表失败:', error);
      toast.error('加载服务器列表失败');
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  // 重置表单
  const resetForm = () => {
    setFormData({
      server_id: '',
      name: '',
      host: '',
      user: '',
      port: 22,
      password: '',
      private_key_path: '',
      private_key_content: '',
      project_path: '',
      auth_type: 'password',
      start_script: '',
    });
    setCurrentServer(null);
    setIsEditing(false);
    setTestResult(null);
    // 注意：不在这里切换 tab，让调用者决定
  };

  // 编辑服务器
  const handleEdit = (serverId: string) => {
    const server = servers[serverId];
    if (server) {
      setFormData({
        server_id: server.server_id,
        name: server.name,
        host: server.host,
        user: server.user,
        port: server.port || 22,
        password: server.password || '',
        private_key_path: server.private_key_path || '',
        private_key_content: server.private_key_content || '',
        project_path: server.project_path,
        auth_type: server.auth_type || (server.password ? 'password' : 'key'),
        start_script: server.start_script || '',
      });
      setCurrentServer(server);
      setIsEditing(true);
      setTestResult(null);
      setActiveTab('add'); // 切换到编辑标签页
    }
  };

  // 从服务器列表测试连接
  const handleTestConnectionFromList = async (server: ServerConfig) => {
    if (!server.host || !server.user || !server.project_path) {
      toast.error('服务器配置不完整');
      return;
    }

    setTestingServerId(server.server_id);

    try {
      // 构建测试数据
      const testData: any = {
        server_id: server.server_id,
        name: server.name,
        host: server.host.trim(),
        user: server.user.trim(),
        port: server.port || 22,
        project_path: server.project_path.trim(),
        auth_type: server.auth_type || 'password',
      };

      if (server.auth_type === 'password') {
        if (!server.password) {
          toast.error('服务器配置中缺少密码，请先编辑配置');
          setTestingServerId(null);
          return;
        }
        testData.password = server.password;
      } else {
        if (server.private_key_content && server.private_key_content.trim()) {
          testData.private_key_content = server.private_key_content.trim();
        }
        if (server.private_key_path && server.private_key_path.trim()) {
          testData.private_key_path = server.private_key_path.trim();
        }
        if (!testData.private_key_content && !testData.private_key_path) {
          toast.error('服务器配置中缺少密钥信息，请先编辑配置');
          setTestingServerId(null);
          return;
        }
      }

      const response = await api.post('/servers/test-connection', testData);
      if (response.data.success) {
        toast.success(`连接测试成功: ${server.name}`);
      } else {
        toast.error(`连接测试失败: ${response.data.message || '未知错误'}`);
      }
    } catch (error: any) {
      console.error('Test connection error:', error);
      let errorMsg = '连接测试失败';
      
      if (error.response) {
        if (error.response.status === 405) {
          errorMsg = '请求方法不允许，请检查API路由配置';
        } else if (error.response.status === 422) {
          const details = error.response.data?.detail;
          if (Array.isArray(details)) {
            errorMsg = details.map((d: any) => `${d.loc?.join('.')}: ${d.msg}`).join(', ');
          } else {
            errorMsg = error.response.data?.message || error.response.data?.detail || errorMsg;
          }
        } else {
          errorMsg = error.response.data?.message || error.response.data?.detail || error.message;
        }
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      toast.error(`连接测试失败: ${errorMsg}`);
    } finally {
      setTestingServerId(null);
    }
  };

  // 测试连接（表单中）
  const handleTestConnection = async () => {
    if (!formData.host || !formData.user || !formData.project_path) {
      toast.error('请填写必填字段');
      return;
    }

    if (formData.auth_type === 'password' && !formData.password) {
      toast.error('请填写密码');
      return;
    }

    if (formData.auth_type === 'key' && !formData.private_key_path && !formData.private_key_content) {
      toast.error('请提供私钥路径或私钥内容');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // 构建测试数据，与保存时格式一致
      const testData: any = {
        server_id: formData.server_id || 'test',
        name: formData.name || 'Test',
        host: formData.host.trim(),
        user: formData.user.trim(),
        port: formData.port || 22,
        project_path: formData.project_path.trim(),
        auth_type: formData.auth_type || 'password',
      };

      if (formData.auth_type === 'password') {
        testData.password = formData.password || '';
      } else {
        if (formData.private_key_content && formData.private_key_content.trim()) {
          testData.private_key_content = formData.private_key_content.trim();
        }
        if (formData.private_key_path && formData.private_key_path.trim()) {
          testData.private_key_path = formData.private_key_path.trim();
        }
      }

      console.log('Testing connection with:', { ...testData, password: testData.password ? '***' : undefined, private_key_content: testData.private_key_content ? '***' : undefined });
      
      const response = await api.post('/servers/test-connection', testData);
      if (response.data.success) {
        setTestResult({
          success: true,
          message: response.data.message,
          output: response.data.output,
        });
        toast.success('连接测试成功！');
      } else {
        setTestResult({
          success: false,
          message: response.data.message || '连接失败',
          output: response.data.error,
        });
        toast.error('连接测试失败: ' + response.data.message);
      }
    } catch (error: any) {
      console.error('Test connection error:', error);
      let errorMsg = '连接测试失败';
      
      if (error.response) {
        if (error.response.status === 405) {
          errorMsg = '请求方法不允许，请检查API路由配置';
        } else if (error.response.status === 422) {
          const details = error.response.data?.detail;
          if (Array.isArray(details)) {
            errorMsg = details.map((d: any) => `${d.loc?.join('.')}: ${d.msg}`).join(', ');
          } else {
            errorMsg = error.response.data?.message || error.response.data?.detail || errorMsg;
          }
        } else {
          errorMsg = error.response.data?.message || error.response.data?.detail || error.message;
        }
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      setTestResult({
        success: false,
        message: errorMsg,
        output: error.response?.data?.error,
      });
      toast.error('连接测试失败: ' + errorMsg);
    } finally {
      setIsTesting(false);
    }
  };

  // 读取文件内容
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setFormData({ ...formData, private_key_content: text, private_key_path: file.name });
      toast.success('私钥文件已加载');
    } catch (error: any) {
      toast.error('读取文件失败: ' + error.message);
    }
  };

  // 浏览项目路径
  const handleBrowseProjectPath = async () => {
    if (!formData.host || !formData.user) {
      toast.error('请先填写服务器地址和用户名');
      return;
    }
    setBrowseType('project');
    setBrowsePath(formData.project_path || '/home');
    setBrowseDialogOpen(true);
    await loadBrowsePath(formData.project_path || '/home');
  };

  // 浏览启动脚本路径
  const handleBrowseScriptPath = async () => {
    if (!formData.host || !formData.user) {
      toast.error('请先填写服务器地址和用户名');
      return;
    }
    setBrowseType('script');
    const scriptPath = formData.start_script || formData.project_path || '/home';
    const dirPath = scriptPath.includes('/') ? scriptPath.substring(0, scriptPath.lastIndexOf('/')) : scriptPath;
    setBrowsePath(dirPath || '/home');
    setBrowseDialogOpen(true);
    await loadBrowsePath(dirPath || '/home');
  };

  // 加载路径内容
  const loadBrowsePath = async (path: string) => {
    setIsLoadingBrowse(true);
    try {
      const testData: any = {
        server_id: formData.server_id || 'browse',
        name: formData.name || 'Browse',
        host: formData.host.trim(),
        user: formData.user.trim(),
        port: formData.port || 22,
        project_path: formData.project_path || '/',
        auth_type: formData.auth_type || 'password',
      };

      if (formData.auth_type === 'password') {
        if (!formData.password) {
          toast.error('请先填写密码才能浏览远程目录');
          setIsLoadingBrowse(false);
          return;
        }
        testData.password = formData.password;
      } else {
        if (formData.private_key_content && formData.private_key_content.trim()) {
          testData.private_key_content = formData.private_key_content.trim();
        }
        if (formData.private_key_path && formData.private_key_path.trim()) {
          testData.private_key_path = formData.private_key_path.trim();
        }
      }

      const response = await api.post('/servers/browse-path', {
        ...testData,
        path: path
      });

      if (response.data.success) {
        setBrowseItems(response.data.items || []);
        setBrowsePath(response.data.path);
      } else {
        toast.error('浏览目录失败: ' + response.data.message);
        setBrowseItems([]);
      }
    } catch (error: any) {
      console.error('Browse path error:', error);
      toast.error('浏览目录失败: ' + (error.response?.data?.detail || error.message));
      setBrowseItems([]);
    } finally {
      setIsLoadingBrowse(false);
    }
  };

  // 选择路径
  const handleSelectPath = (path: string, isDirectory: boolean) => {
    if (browseType === 'project') {
      if (isDirectory) {
        setFormData({ ...formData, project_path: path });
        setBrowseDialogOpen(false);
      } else {
        toast.error('项目路径必须是目录');
      }
    } else {
      setFormData({ ...formData, start_script: path });
      setBrowseDialogOpen(false);
    }
  };

  // 进入目录
  const handleEnterDirectory = (path: string) => {
    loadBrowsePath(path);
  };

  // 设置路径
  const handleSetPath = (path: string) => {
    if (browsingPath?.type === 'project') {
      setFormData({ ...formData, project_path: path });
    } else if (browsingPath?.type === 'script') {
      setFormData({ ...formData, start_script: path });
    }
    setBrowsingPath(null);
  };

  // 保存服务器配置
  const handleSave = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!formData.server_id || !formData.name || !formData.host || !formData.user || !formData.project_path) {
      toast.error('请填写所有必填字段');
      return;
    }

    if (formData.auth_type === 'password' && !formData.password) {
      toast.error('请填写密码');
      return;
    }

    if (formData.auth_type === 'key' && !formData.private_key_path && !formData.private_key_content) {
      toast.error('请提供私钥路径或私钥内容');
      return;
    }

    setIsSaving(true);

    try {
      // 验证必填字段
      if (!formData.server_id?.trim()) {
        throw new Error('服务器ID不能为空');
      }
      if (!formData.name?.trim()) {
        throw new Error('服务器名称不能为空');
      }
      if (!formData.host?.trim()) {
        throw new Error('IP地址不能为空');
      }
      if (!formData.user?.trim()) {
        throw new Error('用户名不能为空');
      }
      if (!formData.project_path?.trim()) {
        throw new Error('项目路径不能为空');
      }

      // 检查 server_id 是否已存在（仅在新建时检查）
      if (!isEditing && servers[formData.server_id.trim()]) {
        throw new Error(`服务器ID "${formData.server_id.trim()}" 已存在，请使用不同的ID或编辑现有配置`);
      }

      // 清理数据：根据认证类型只保留相关字段
      const configToSave: any = {
        server_id: formData.server_id.trim(),
        name: formData.name.trim(),
        host: formData.host.trim(),
        user: formData.user.trim(),
        port: formData.port || 22,
        project_path: formData.project_path.trim(),
        auth_type: formData.auth_type || 'password',
      };

      // 保存启动脚本路径（即使为空字符串也要保存，以便清空时能正确保存）
      if (formData.start_script !== undefined) {
        configToSave.start_script = formData.start_script.trim() || null;
      }

      if (formData.auth_type === 'password') {
        if (!formData.password || !formData.password.trim()) {
          throw new Error('密码不能为空');
        }
        configToSave.password = formData.password.trim();
        // 不包含密钥字段
        delete configToSave.private_key_path;
        delete configToSave.private_key_content;
      } else {
        // 密钥认证：优先使用文件内容，其次使用路径
        if (formData.private_key_content && formData.private_key_content.trim()) {
          configToSave.private_key_content = formData.private_key_content.trim();
          if (formData.private_key_path && formData.private_key_path.trim()) {
            configToSave.private_key_path = formData.private_key_path.trim();
          }
        } else if (formData.private_key_path && formData.private_key_path.trim()) {
          configToSave.private_key_path = formData.private_key_path.trim();
        } else {
          throw new Error('请提供私钥文件、路径或内容');
        }
        // 不包含密码字段
        delete configToSave.password;
      }

      console.log('Saving config:', { 
        ...configToSave, 
        password: configToSave.password ? '***' : undefined, 
        private_key_content: configToSave.private_key_content ? '***' : undefined 
      });
      
      const response = await api.post('/servers', configToSave);
      console.log('Save response:', response.data);
      
      toast.success('服务器配置已保存');
      resetForm();
      setActiveTab('list'); // 保存后切换回列表页
      loadServers();
    } catch (error: any) {
      console.error('Save error:', error);
      let errorMsg = '保存失败';
      
      if (error.response) {
        // 处理422验证错误
        if (error.response.status === 422) {
          const details = error.response.data?.detail;
          console.error('Validation error details:', details);
          
          if (Array.isArray(details)) {
            errorMsg = details.map((d: any) => {
              const field = d.loc?.slice(1).join('.') || '未知字段';
              return `${field}: ${d.msg}`;
            }).join('; ');
          } else if (typeof details === 'string') {
            errorMsg = details;
          } else if (details && typeof details === 'object') {
            if (details.msg) {
              errorMsg = details.msg;
            } else {
              errorMsg = JSON.stringify(details);
            }
          }
        } else {
          errorMsg = error.response.data?.detail || error.response.data?.message || error.message;
        }
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      toast.error('保存失败: ' + errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  // 删除服务器
  const handleDelete = async (serverId: string) => {
    try {
      await api.delete(`/servers/${serverId}`);
      toast.success('服务器配置已删除');
      loadServers();
      if (currentServer?.server_id === serverId) {
        resetForm();
        setActiveTab('list'); // 如果删除的是当前编辑的服务器，切换回列表页
      }
    } catch (error: any) {
      toast.error('删除失败: ' + (error.response?.data?.detail || error.message));
    } finally {
      setDeleteDialogOpen(false);
      setServerToDelete(null);
    }
  };

  // 切换服务器
  const handleSwitchServer = async (serverId: string) => {
    try {
      await api.post(`/servers/switch/${serverId}`);
      toast.success('已切换到服务器: ' + servers[serverId]?.name);
      loadServers();
    } catch (error: any) {
      toast.error('切换失败: ' + (error.response?.data?.detail || error.message));
    }
  };

  // 重启项目
  const handleRestartProject = async (serverId: string) => {
    const server = servers[serverId];
    if (!server) {
      toast.error('服务器不存在');
      return;
    }

    setRestartingServerId(serverId);
    toast.info(`正在重启项目: ${server.name}...`);

    try {
      const response = await api.post(`/servers/${serverId}/restart-project`, {});
      if (response.data.success) {
        toast.success(`项目重启成功: ${server.name}`);
      } else {
        toast.error(`项目重启失败: ${response.data.message || response.data.error}`);
      }
    } catch (error: any) {
      console.error('Restart project error:', error);
      const errorMsg = error.response?.data?.detail || error.response?.data?.message || error.message || '重启失败';
      toast.error(`项目重启失败: ${errorMsg}`);
    } finally {
      setRestartingServerId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-semibold text-slate-900 flex items-center gap-2">
          <SettingsIcon className="w-8 h-8" />
          服务器设置
        </h1>
        <p className="text-slate-600 mt-1">管理服务器连接配置</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">服务器列表</TabsTrigger>
          <TabsTrigger value="add">{isEditing ? '编辑服务器' : '添加服务器'}</TabsTrigger>
        </TabsList>

        {/* 服务器列表 */}
        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle>已配置的服务器</CardTitle>
              <CardDescription>管理您的服务器连接配置</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(servers).length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Server className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                  <p>暂无服务器配置</p>
                  <p className="text-sm mt-2">点击"添加服务器"开始配置</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.keys(servers)
                    .sort() // 按 server_id 排序，确保显示顺序稳定
                    .map((serverId) => servers[serverId])
                    .map((server) => (
                    <div
                      key={server.server_id}
                      className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-slate-900">{server.name}</h3>
                            <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded">
                              {server.auth_type === 'key' ? (
                                <span className="flex items-center gap-1">
                                  <Key className="w-3 h-3" /> 密钥认证
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <Lock className="w-3 h-3" /> 密码认证
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
                            <div>
                              <span className="font-medium">IP地址:</span> {server.host}
                            </div>
                            <div>
                              <span className="font-medium">用户名:</span> {server.user}
                            </div>
                            <div>
                              <span className="font-medium">端口:</span> {server.port || 22}
                            </div>
                            <div>
                              <span className="font-medium">项目路径:</span> {server.project_path}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestConnectionFromList(server)}
                            disabled={testingServerId === server.server_id}
                          >
                            {testingServerId === server.server_id ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                测试中
                              </>
                            ) : (
                              <>
                                <TestTube className="w-4 h-4 mr-1" />
                                测试连接
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestartProject(server.server_id)}
                            disabled={restartingServerId === server.server_id}
                          >
                            {restartingServerId === server.server_id ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                重启中
                              </>
                            ) : (
                              <>
                                <RotateCw className="w-4 h-4 mr-1" />
                                重启项目
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSwitchServer(server.server_id)}
                          >
                            切换
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(server.server_id)}
                          >
                            编辑
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setServerToDelete(server.server_id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 添加/编辑服务器 */}
        <TabsContent value="add">
          <div className="grid gap-6">
            {/* 主卡片容器 */}
            <Card className="shadow-lg border-slate-200">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Server className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">{isEditing ? '编辑服务器配置' : '添加新服务器'}</CardTitle>
                    <CardDescription className="mt-1">
                      {isEditing ? '修改服务器连接信息' : '配置新的服务器连接'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-6 space-y-6">
                <form onSubmit={handleSave}>
                  {/* 基本信息卡片 */}
                  <Card className="bg-slate-50/50 border-slate-200 shadow-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-blue-100 rounded-md">
                        <Network className="w-4 h-4 text-blue-600" />
                      </div>
                      <CardTitle className="text-base font-semibold">基本信息</CardTitle>
                    </div>
                    <CardDescription className="text-xs mt-1">配置服务器的基本连接信息</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-0">
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="server_id" className="text-sm font-medium flex items-center gap-1.5">
                          服务器ID
                          <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="server_id"
                          placeholder="tencent_prod"
                          value={formData.server_id}
                          onChange={(e) => setFormData({ ...formData, server_id: e.target.value })}
                          disabled={isEditing}
                          className="bg-white"
                        />
                        <div className="flex items-start gap-1.5 text-xs text-slate-500">
                          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>唯一标识符，不能修改</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-sm font-medium flex items-center gap-1.5">
                          服务器名称
                          <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="name"
                          placeholder="腾讯云生产环境"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="bg-white"
                        />
                      </div>
                    </div>

                    <Separator className="my-1" />

                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="host" className="text-sm font-medium flex items-center gap-1.5">
                          IP地址
                          <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="host"
                          placeholder="192.168.1.100"
                          value={formData.host}
                          onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                          className="bg-white font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="user" className="text-sm font-medium flex items-center gap-1.5">
                            用户名
                            <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="user"
                            placeholder="ubuntu"
                            value={formData.user}
                            onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                            className="bg-white"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="port" className="text-sm font-medium">端口</Label>
                          <Input
                            id="port"
                            type="number"
                            placeholder="22"
                            value={formData.port}
                            onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                            className="bg-white"
                          />
                        </div>
                      </div>
                    </div>

                    <Separator className="my-1" />

                    <div className="space-y-2">
                      <Label htmlFor="project_path" className="text-sm font-medium flex items-center gap-1.5">
                        <FolderOpen className="w-4 h-4" />
                        项目路径
                        <span className="text-red-500">*</span>
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="project_path"
                          placeholder="/home/ubuntu/MetaSeekOJ"
                          value={formData.project_path}
                          onChange={(e) => setFormData({ ...formData, project_path: e.target.value })}
                          className="bg-white font-mono flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleBrowseProjectPath}
                          disabled={!formData.host || !formData.user}
                          title="浏览远程目录"
                        >
                          <FolderOpen className="w-4 h-4 mr-1" />
                          浏览
                        </Button>
                      </div>
                    </div>

                    <Separator className="my-1" />

                    <div className="space-y-2">
                      <Label htmlFor="start_script" className="text-sm font-medium flex items-center gap-1.5">
                        <RotateCw className="w-4 h-4" />
                        启动脚本路径
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="start_script"
                          placeholder="/home/sharelgx/MetaSeekOJdev/start_dev.sh"
                          value={formData.start_script}
                          onChange={(e) => setFormData({ ...formData, start_script: e.target.value })}
                          className="bg-white font-mono text-sm flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleBrowseScriptPath}
                          disabled={!formData.host || !formData.user}
                          title="浏览远程文件"
                        >
                          <FolderOpen className="w-4 h-4 mr-1" />
                          浏览
                        </Button>
                      </div>
                      <div className="flex items-start gap-1.5 text-xs text-slate-500">
                        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>可选，用于重启项目时执行。留空则使用默认路径</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 认证方式卡片 */}
                <Card className="bg-slate-50/50 border-slate-200 shadow-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-purple-100 rounded-md">
                        <Shield className="w-4 h-4 text-purple-600" />
                      </div>
                      <CardTitle className="text-base font-semibold">认证方式</CardTitle>
                    </div>
                    <CardDescription className="text-xs mt-1">选择SSH连接认证方式</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-0">
                    <RadioGroup
                      value={formData.auth_type}
                      onValueChange={(value) => {
                        setFormData({ ...formData, auth_type: value as 'password' | 'key' });
                        setTestResult(null);
                      }}
                      className="space-y-3"
                    >
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors">
                        <RadioGroupItem value="password" id="auth-password" />
                        <Label htmlFor="auth-password" className="cursor-pointer flex-1 ml-2">
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-slate-600" />
                            <span className="font-medium">密码认证</span>
                          </div>
                        </Label>
                      </div>
                      
                      <div className="flex items-center space-x-3 p-3 rounded-lg border-2 border-blue-200 bg-blue-50/50">
                        <RadioGroupItem value="key" id="auth-key" />
                        <Label htmlFor="auth-key" className="cursor-pointer flex-1 ml-2">
                          <div className="flex items-center gap-2">
                            <Key className="w-4 h-4 text-blue-600" />
                            <div>
                              <span className="font-medium">SSH密钥认证</span>
                              <span className="ml-2 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">推荐</span>
                            </div>
                          </div>
                        </Label>
                      </div>
                    </RadioGroup>

                    {/* 密码认证表单 */}
                    {formData.auth_type === 'password' && (
                      <div className="mt-4 p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                        <div className="space-y-3">
                          <Label htmlFor="password" className="text-sm font-medium flex items-center gap-1.5">
                            SSH密码
                            <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            placeholder="输入SSH登录密码"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="bg-white"
                          />
                        </div>
                      </div>
                    )}

                    {/* 密钥认证表单 */}
                    {formData.auth_type === 'key' && (
                      <div className="mt-4 p-4 bg-white rounded-lg border border-slate-200 shadow-sm space-y-4">
                        <div className="space-y-3">
                          <Label htmlFor="private_key_file" className="text-sm font-medium">
                            选择私钥文件
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="private_key_file"
                              type="file"
                              accept=".pem,.key,text/plain"
                              onChange={handleFileSelect}
                              className="bg-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                            />
                          </div>
                          <div className="flex items-start gap-1.5 text-xs text-slate-500">
                            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>选择本地私钥文件（.pem, .key 或文本文件）</span>
                          </div>
                        </div>
                        
                        <Separator />
                        
                        <div className="space-y-3">
                          <Label htmlFor="private_key_path" className="text-sm font-medium">
                            或输入私钥文件路径
                          </Label>
                          <Input
                            id="private_key_path"
                            placeholder="/home/user/.ssh/id_rsa"
                            value={formData.private_key_path}
                            onChange={(e) => setFormData({ ...formData, private_key_path: e.target.value })}
                            className="bg-white font-mono text-sm"
                          />
                          <div className="flex items-start gap-1.5 text-xs text-slate-500">
                            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>本地私钥文件的完整路径</span>
                          </div>
                        </div>
                        
                        <Separator />
                        
                        <div className="space-y-3">
                          <Label htmlFor="private_key_content" className="text-sm font-medium">
                            或直接粘贴私钥内容
                          </Label>
                          <Textarea
                            id="private_key_content"
                            placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                            rows={6}
                            className="font-mono text-xs bg-white"
                            value={formData.private_key_content}
                            onChange={(e) => setFormData({ ...formData, private_key_content: e.target.value })}
                          />
                          <div className="flex items-start gap-1.5 text-xs text-slate-500">
                            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>以上三种方式任选其一即可</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 连接测试结果 */}
                {testResult && (
                  <Card className={`border-2 ${
                    testResult.success 
                      ? 'bg-green-50/50 border-green-300 shadow-sm' 
                      : 'bg-red-50/50 border-red-300 shadow-sm'
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {testResult.success ? (
                          <div className="p-1.5 bg-green-100 rounded-lg">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          </div>
                        ) : (
                          <div className="p-1.5 bg-red-100 rounded-lg">
                            <XCircle className="w-5 h-5 text-red-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm mb-1 ${
                            testResult.success ? 'text-green-900' : 'text-red-900'
                          }`}>
                            {testResult.message}
                          </p>
                          {testResult.output && (
                            <div className="mt-2 p-3 bg-white/80 rounded border border-slate-200">
                              <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words max-h-32 overflow-auto">
                                {testResult.output}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                  {/* 操作按钮区域 */}
                  <div className="pt-4 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Info className="w-4 h-4" />
                        <span>建议先测试连接，确认无误后再保存配置</span>
                      </div>
                      <div className="flex gap-3">
                        <Button
                          type="button"
                          onClick={handleTestConnection}
                          disabled={isTesting || isSaving}
                          variant="outline"
                          size="lg"
                          className="shadow-sm"
                        >
                          {isTesting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              测试中...
                            </>
                          ) : (
                            <>
                              <TestTube className="w-4 h-4 mr-2" />
                              测试连接
                            </>
                          )}
                        </Button>
                        
                        <Button
                          type="submit"
                          disabled={isTesting || isSaving}
                          size="lg"
                          className="shadow-md"
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              保存中...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              保存配置
                            </>
                          )}
                        </Button>

                        {isEditing && (
                          <Button
                            type="button"
                            onClick={() => {
                              resetForm();
                              setActiveTab('list'); // 取消后切换回列表页
                            }}
                            disabled={isTesting || isSaving}
                            variant="outline"
                            size="lg"
                          >
                            取消
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除服务器配置 "{servers[serverToDelete || '']?.name}" 吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => serverToDelete && handleDelete(serverToDelete)}
              className="bg-red-600 hover:bg-red-700"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 路径浏览对话框 */}
      <Dialog open={browseDialogOpen} onOpenChange={setBrowseDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {browseType === 'project' ? '选择项目路径' : '选择启动脚本路径'}
            </DialogTitle>
            <DialogDescription>
              当前路径: <span className="font-mono text-sm">{browsePath}</span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* 路径导航 */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleEnterDirectory('/')}
                disabled={isLoadingBrowse}
              >
                根目录
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const parentPath = browsePath.substring(0, browsePath.lastIndexOf('/')) || '/';
                  handleEnterDirectory(parentPath);
                }}
                disabled={isLoadingBrowse || browsePath === '/'}
              >
                上级目录
              </Button>
              <Input
                value={browsePath}
                onChange={(e) => setBrowsePath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    loadBrowsePath(browsePath);
                  }
                }}
                className="flex-1 font-mono text-sm"
                placeholder="输入路径并按回车"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => loadBrowsePath(browsePath)}
                disabled={isLoadingBrowse}
              >
                <FolderOpen className="w-4 h-4 mr-1" />
                打开
              </Button>
            </div>

            {/* 文件列表 */}
            <div className="border rounded-lg max-h-[400px] overflow-auto">
              {isLoadingBrowse ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  <span className="ml-2 text-slate-600">加载中...</span>
                </div>
              ) : browseItems.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-slate-500">
                  目录为空
                </div>
              ) : (
                <div className="divide-y">
                  {browseItems.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 hover:bg-slate-50 cursor-pointer"
                      onClick={() => {
                        if (item.type === 'directory') {
                          handleEnterDirectory(item.path);
                        } else {
                          handleSelectPath(item.path, false);
                        }
                      }}
                      onDoubleClick={() => handleSelectPath(item.path, item.type === 'directory')}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {item.type === 'directory' ? (
                          <FolderOpen className="w-5 h-5 text-blue-500" />
                        ) : (
                          <FileText className="w-5 h-5 text-slate-400" />
                        )}
                        <span className="font-mono text-sm">{item.name}</span>
                        {item.type === 'directory' && (
                          <span className="text-xs text-slate-400">/</span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectPath(item.path, item.type === 'directory');
                        }}
                      >
                        选择
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBrowseDialogOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

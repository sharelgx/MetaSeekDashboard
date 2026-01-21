import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Switch } from '@/app/components/ui/switch';
import { Input } from '@/app/components/ui/input';
import { Progress } from '@/app/components/ui/progress';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { toast } from 'sonner';
import { Play, Upload, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { buildFrontend, syncCode } from '@/app/components/ui/api';

export function Deployment() {
  const [buildType, setBuildType] = useState('vue-admin');
  const [memoryLimit, setMemoryLimit] = useState('8');
  const [incrementalBuild, setIncrementalBuild] = useState(true);
  const [syncScope, setSyncScope] = useState('all');
  const [autoBackup, setAutoBackup] = useState(true);
  const [filePath, setFilePath] = useState('');
  
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [buildLogs, setBuildLogs] = useState<string>('');
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);

  const handleBuild = async () => {
    setIsBuilding(true);
    setBuildStatus('idle');
    setBuildLogs('');
    
    toast.info('开始构建，请稍候...');
    
    try {
        const type = buildType === 'react-client' ? 'react' : 'vue';
        const memMB = parseInt(memoryLimit) * 1024;
        
        const res = await buildFrontend(type, memMB, incrementalBuild);
        
        if (res.success) {
            setBuildStatus('success');
            toast.success('构建成功！');
            setBuildLogs(res.stdout);
        } else {
            setBuildStatus('error');
            toast.error('构建失败: ' + res.error);
            setBuildLogs(res.stderr + '\n' + res.stdout);
        }
    } catch (e) {
        setBuildStatus('error');
        toast.error('请求失败: ' + e);
    } finally {
        setIsBuilding(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncLogs(['正在启动同步...']);
    
    try {
        const res = await syncCode(syncScope);
        if (res.success) {
            toast.success('代码同步完成！');
            // Split stdout into lines for log display
            const lines = (res.stdout || '').split('\n').filter(Boolean);
            setSyncLogs(lines);
        } else {
            toast.error('同步失败: ' + res.error);
            setSyncLogs([res.stderr || 'Unknown error']);
        }
    } catch (e) {
        toast.error('请求失败: ' + e);
    } finally {
        setIsSyncing(false);
    }
  };

  const handleSyncFile = async () => {
    toast.warning("单文件同步功能暂未开放");
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">发布部署</h1>
        <p className="text-slate-600 mt-1">构建代码并同步到远程服务器</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Local Build Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              本地构建
            </CardTitle>
            <CardDescription>配置并执行前端代码构建</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="build-type">前端类型</Label>
              <Select value={buildType} onValueChange={setBuildType}>
                <SelectTrigger id="build-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vue-admin">Vue Admin</SelectItem>
                  <SelectItem value="react-client">React Client</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="memory">内存限制 (GB)</Label>
              <Input
                id="memory"
                type="number"
                value={memoryLimit}
                onChange={(e) => setMemoryLimit(e.target.value)}
                min="1"
                max="16"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="incremental">增量构建</Label>
              <Switch
                id="incremental"
                checked={incrementalBuild}
                onCheckedChange={setIncrementalBuild}
              />
            </div>

            <Button
              onClick={handleBuild}
              disabled={isBuilding}
              className="w-full"
            >
              {isBuilding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  构建中...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  开始构建
                </>
              )}
            </Button>

            {/* Build Result */}
            {(isBuilding || buildStatus !== 'idle') && (
              <div className="space-y-2 pt-2 border-t">
                {buildStatus === 'success' && (
                  <div className="flex items-center gap-2 text-sm text-green-600 mt-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>构建成功</span>
                  </div>
                )}
                
                {buildStatus === 'error' && (
                  <div className="flex items-center gap-2 text-sm text-red-600 mt-2">
                    <AlertCircle className="w-4 h-4" />
                    <span>构建失败，请查看日志</span>
                  </div>
                )}

                {/* Build Logs */}
                {buildLogs && (
                    <ScrollArea className="h-32 w-full rounded-md bg-slate-950 p-2 mt-2">
                        <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
                            {buildLogs}
                        </pre>
                    </ScrollArea>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Code Sync Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              代码同步
            </CardTitle>
            <CardDescription>将代码上传到远程服务器</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sync-scope">同步范围</Label>
              <Select value={syncScope} onValueChange={setSyncScope}>
                <SelectTrigger id="sync-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部 (All)</SelectItem>
                  <SelectItem value="backend">仅后端 (Backend)</SelectItem>
                  <SelectItem value="frontend">仅前端 (Frontend)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="auto-backup">同步前自动备份</Label>
              <Switch
                id="auto-backup"
                checked={autoBackup}
                onCheckedChange={setAutoBackup}
              />
            </div>

            <Button
              onClick={handleSync}
              disabled={isSyncing}
              className="w-full"
              variant="default"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  同步中...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  同步到服务器
                </>
              )}
            </Button>

            {/* Single File Sync */}
            <div className="border-t pt-4 space-y-2">
              <Label htmlFor="file-path">同步单个文件</Label>
              <div className="flex gap-2">
                <Input
                  id="file-path"
                  placeholder="/path/to/file.py"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  className="font-mono text-sm"
                />
                <Button
                  onClick={handleSyncFile}
                  disabled={isSyncing}
                  variant="outline"
                  size="icon"
                >
                  <FileText className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Logs */}
      {syncLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">同步日志</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48 w-full rounded-md bg-slate-950 p-4">
              <div className="font-mono text-xs text-green-400 space-y-1">
                {syncLogs.map((log, index) => (
                  <div key={index}>{log}</div>
                ))}
                {isSyncing && (
                  <div className="flex items-center gap-2 text-yellow-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>正在同步...</span>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

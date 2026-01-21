import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Switch } from '@/app/components/ui/switch';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { toast } from 'sonner';
import { FileText, RefreshCw, Download, Trash2, Loader2 } from 'lucide-react';
import { fetchLogs } from '@/app/components/ui/api';

interface LogEntry {
  timestamp: string;
  level?: string;
  message: string;
  raw?: string;
}

const logSources = [
  { value: 'backend-error', label: 'Backend Error Log', path: '/tmp/oj_error.log' },
  { value: 'nginx-access', label: 'Nginx Access Log', path: '/var/log/nginx/access.log' },
  { value: 'nginx-error', label: 'Nginx Error Log', path: '/var/log/nginx/error.log' },
  { value: 'judge', label: 'Scratch Editor Log', path: '/tmp/scratch_editor.log' },
  { value: 'scratch', label: 'Scratch Runner Log', path: '/home/ubuntu/MetaSeekOJ/logs/scratch-runner.log' },
];

export function Logs() {
  const [selectedSource, setSelectedSource] = useState<string>('backend-error');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    handleRefresh(true);
  }, [selectedSource]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        handleRefresh(true);
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh, selectedSource]);

  const handleSourceChange = (value: string) => {
    setSelectedSource(value);
    setLogs([]);
  };

  const parseLogLine = (line: string): LogEntry => {
    let level = 'INFO';
    if (line.toLowerCase().includes('error')) level = 'ERROR';
    else if (line.toLowerCase().includes('warn')) level = 'WARNING';
    
    const timeMatch = line.match(/\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/) || line.match(/\d{2}\/\w+\/\d{4}:\d{2}:\d{2}:\d{2}/);
    const timestamp = timeMatch ? timeMatch[0] : '';
    
    return {
        timestamp,
        level,
        message: line,
        raw: line
    };
  };

  const handleRefresh = async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
      toast.info('正在刷新日志...');
    }
    
    try {
        const sourceConfig = logSources.find(s => s.value === selectedSource);
        if (!sourceConfig) return;

        const cmd = `tail -n 100 ${sourceConfig.path}`;
        const res = await fetchLogs(cmd);

        if (res.success) {
            const lines = (res.stdout || '').split('\n').filter(Boolean).reverse();
            const parsedLogs = lines.map(parseLogLine);
            setLogs(parsedLogs);
            if (!silent) toast.success('日志已刷新');
        } else {
            if (!silent) toast.error('刷新失败: ' + res.error);
        }
    } catch (e) {
        if (!silent) toast.error('请求失败');
    } finally {
        if (!silent) setIsRefreshing(false);
    }
  };

  const handleClear = () => {
    setLogs([]);
    toast.success('本地显示已清除');
  };

  const handleDownload = () => {
    const logText = logs.map(log => log.raw).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedSource}-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('日志已下载');
  };

  const getLevelColor = (level?: string) => {
    switch (level?.toUpperCase()) {
      case 'ERROR': return 'text-red-500';
      case 'WARNING': return 'text-yellow-500';
      case 'INFO': return 'text-blue-500';
      case 'LOG': return 'text-green-500';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">日志监控</h1>
        <p className="text-slate-600 mt-1">实时查看服务器日志，排查问题</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            日志查看器
          </CardTitle>
          <CardDescription>选择日志源并配置刷新选项</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px] space-y-2">
              <Label htmlFor="log-source">日志源</Label>
              <Select value={selectedSource} onValueChange={handleSourceChange}>
                <SelectTrigger id="log-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {logSources.map(source => (
                    <SelectItem key={source.value} value={source.value}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pb-2">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
              <Label htmlFor="auto-refresh" className="cursor-pointer">
                自动刷新 (5s)
              </Label>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleRefresh()} disabled={isRefreshing}>
                {isRefreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                刷新
              </Button>
              <Button variant="outline" onClick={handleClear}><Trash2 className="w-4 h-4 mr-2" />清除</Button>
              <Button variant="outline" onClick={handleDownload}><Download className="w-4 h-4 mr-2" />下载</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">日志内容</CardTitle>
            <span className="text-sm text-slate-500">{logs.length} 条记录 (显示最近 100 行)</span>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] w-full rounded-md bg-slate-950 p-4">
            {logs.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-slate-500 text-sm">暂无日志数据</p>
              </div>
            ) : (
              <div className="font-mono text-xs space-y-1">
                {logs.map((log, index) => (
                  <div key={index} className="flex gap-3 hover:bg-slate-900 px-2 py-1 rounded">
                    <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                    {log.level && (
                      <span className={`font-semibold shrink-0 w-16 ${getLevelColor(log.level)}`}>
                        [{log.level}]
                      </span>
                    )}
                    <span className="text-slate-300 break-all">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-semibold text-red-600">{logs.filter(l => l.level === 'ERROR').length}</div>
            <p className="text-sm text-slate-600 mt-1">错误 (Errors)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-semibold text-yellow-600">{logs.filter(l => l.level === 'WARNING').length}</div>
            <p className="text-sm text-slate-600 mt-1">警告 (Warnings)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-semibold text-blue-600">{logs.filter(l => l.level === 'INFO').length}</div>
            <p className="text-sm text-slate-600 mt-1">信息 (Info)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-semibold text-slate-600">{logs.length}</div>
            <p className="text-sm text-slate-600 mt-1">总计 (Total)</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

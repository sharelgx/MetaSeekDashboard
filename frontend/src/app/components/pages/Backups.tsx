import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
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
import { toast } from 'sonner';
import { Database, RotateCcw, Trash2, Plus, Loader2, AlertTriangle } from 'lucide-react';

interface Backup {
  id: string;
  filename: string;
  createdAt: string;
  size: string;
  note?: string;
}

const initialBackups: Backup[] = [
  { id: '1', filename: 'backup-20260120-153022.tar.gz', createdAt: '2026-01-20 15:30:22', size: '256 MB', note: '部署前备份' },
  { id: '2', filename: 'backup-20260119-092145.tar.gz', createdAt: '2026-01-19 09:21:45', size: '254 MB' },
  { id: '3', filename: 'backup-20260118-141033.tar.gz', createdAt: '2026-01-18 14:10:33', size: '251 MB', note: '稳定版本' },
  { id: '4', filename: 'backup-20260117-163511.tar.gz', createdAt: '2026-01-17 16:35:11', size: '248 MB' },
  { id: '5', filename: 'backup-20260116-104829.tar.gz', createdAt: '2026-01-16 10:48:29', size: '245 MB' },
  { id: '6', filename: 'backup-20260115-083401.tar.gz', createdAt: '2026-01-15 08:34:01', size: '243 MB', note: '周一备份' },
];

export function Backups() {
  const [backups, setBackups] = useState<Backup[]>(initialBackups);
  const [isCreating, setIsCreating] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleCreateBackup = async () => {
    setIsCreating(true);
    toast.info('正在创建备份...');
    
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    const newBackup: Backup = {
      id: Date.now().toString(),
      filename: `backup-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}.tar.gz`,
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
      size: '257 MB',
      note: '手动创建',
    };
    
    setBackups(prev => [newBackup, ...prev]);
    setIsCreating(false);
    toast.success('备份创建成功！');
  };

  const handleRestoreClick = (backup: Backup) => {
    setSelectedBackup(backup);
    setRestoreDialogOpen(true);
  };

  const handleRestoreConfirm = async () => {
    if (!selectedBackup) return;
    
    setIsRestoring(true);
    toast.info(`正在恢复备份: ${selectedBackup.filename}...`);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    setIsRestoring(false);
    setRestoreDialogOpen(false);
    toast.success('备份恢复成功！服务已重启。');
    setSelectedBackup(null);
  };

  const handleDelete = async (backupId: string) => {
    const backup = backups.find(b => b.id === backupId);
    toast.info(`正在删除备份: ${backup?.filename}...`);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setBackups(prev => prev.filter(b => b.id !== backupId));
    toast.success('备份已删除');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">版本快照</h1>
          <p className="text-slate-600 mt-1">管理服务器代码备份与恢复</p>
        </div>
        <Button onClick={handleCreateBackup} disabled={isCreating}>
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              创建中...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              手动备份
            </>
          )}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 rounded-lg">
                <Database className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-semibold">{backups.length}</div>
                <p className="text-sm text-slate-600">总备份数</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-50 rounded-lg">
                <RotateCcw className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-semibold">3</div>
                <p className="text-sm text-slate-600">本周备份</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-50 rounded-lg">
                <Database className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-semibold">1.5 GB</div>
                <p className="text-sm text-slate-600">总占用空间</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Backups Table */}
      <Card>
        <CardHeader>
          <CardTitle>备份列表</CardTitle>
          <CardDescription>按创建时间倒序排列</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>备份文件名</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>文件大小</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.id}>
                  <TableCell className="font-mono text-sm">{backup.filename}</TableCell>
                  <TableCell className="text-sm">{backup.createdAt}</TableCell>
                  <TableCell className="text-sm">{backup.size}</TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {backup.note || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestoreClick(backup)}
                        className="text-orange-600 hover:text-orange-700 border-orange-200 hover:bg-orange-50"
                      >
                        <RotateCcw className="w-4 h-4 mr-1.5" />
                        恢复
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(backup.id)}
                        className="text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 mr-1.5" />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              确认恢复备份
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                您即将恢复以下备份，此操作将：
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>覆盖当前服务器上的所有代码文件</li>
                <li>自动重启相关服务</li>
                <li>可能导致短暂的服务中断（约 1-2 分钟）</li>
              </ul>
              {selectedBackup && (
                <div className="bg-slate-100 rounded-lg p-3 mt-3">
                  <p className="text-sm font-medium text-slate-900">备份信息：</p>
                  <p className="text-sm text-slate-600 font-mono mt-1">{selectedBackup.filename}</p>
                  <p className="text-xs text-slate-500 mt-1">创建时间: {selectedBackup.createdAt}</p>
                </div>
              )}
              <p className="text-red-600 font-medium mt-3">
                ⚠️ 此操作不可撤销，确定要继续吗？
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreConfirm}
              disabled={isRestoring}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  恢复中...
                </>
              ) : (
                '确认恢复'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

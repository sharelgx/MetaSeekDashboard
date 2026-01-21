import { Circle } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';

export type ServiceStatus = 'running' | 'stopped' | 'error' | 'warning' | 'unknown';

interface StatusBadgeProps {
  status: ServiceStatus;
  showIcon?: boolean;
}

const statusConfig: Record<ServiceStatus, { label: string; color: string; iconColor: string }> = {
  running: { label: 'Running', color: 'bg-green-100 text-green-800 border-green-200', iconColor: 'fill-green-500 text-green-500' },
  stopped: { label: 'Stopped', color: 'bg-gray-100 text-gray-800 border-gray-200', iconColor: 'fill-gray-500 text-gray-500' },
  error: { label: 'Error', color: 'bg-red-100 text-red-800 border-red-200', iconColor: 'fill-red-500 text-red-500' },
  warning: { label: 'Warning', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', iconColor: 'fill-yellow-500 text-yellow-500' },
  unknown: { label: 'Unknown', color: 'bg-gray-100 text-gray-600 border-gray-200', iconColor: 'fill-gray-400 text-gray-400' },
};

export function StatusBadge({ status, showIcon = true }: StatusBadgeProps) {
  // 确保 status 是有效的，否则使用 'unknown' 作为默认值
  const validStatus: ServiceStatus = status && statusConfig[status] ? status : 'unknown';
  const config = statusConfig[validStatus];
  
  if (!config) {
    // 如果仍然没有配置，使用 unknown 的配置
    const fallbackConfig = statusConfig['unknown'];
    return (
      <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border', fallbackConfig.color)}>
        {showIcon && <Circle className={cn('w-2 h-2', fallbackConfig.iconColor)} />}
        <span>{fallbackConfig.label}</span>
      </div>
    );
  }
  
  return (
    <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border', config.color)}>
      {showIcon && <Circle className={cn('w-2 h-2', config.iconColor)} />}
      <span>{config.label}</span>
    </div>
  );
}

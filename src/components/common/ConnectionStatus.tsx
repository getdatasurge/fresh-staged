import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useRealtimeStatus } from '@/providers/RealtimeProvider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function ConnectionStatus() {
  const { isConnected, isConnecting, connectionError } = useRealtimeStatus();

  const getStatusConfig = () => {
    if (isConnecting) {
      return {
        icon: Loader2,
        color: 'text-yellow-500',
        tooltip: 'Connecting to real-time updates...',
        animate: true,
      };
    }
    if (isConnected) {
      return {
        icon: Wifi,
        color: 'text-green-500',
        tooltip: 'Real-time updates active',
        animate: false,
      };
    }
    return {
      icon: WifiOff,
      color: 'text-red-500',
      tooltip: connectionError || 'Real-time updates disconnected',
      animate: false,
    };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center">
            <Icon
              className={cn(
                'w-4 h-4',
                config.color,
                config.animate && 'animate-spin'
              )}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

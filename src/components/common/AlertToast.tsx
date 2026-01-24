import { AlertTriangle, CheckCircle } from 'lucide-react';

interface AlertToastProps {
  type: 'triggered' | 'resolved';
  message: string;
  severity?: 'warning' | 'critical';
  unitId?: string;
}

export function AlertToast({ type, message, severity, unitId }: AlertToastProps) {
  const isTriggered = type === 'triggered';
  const Icon = isTriggered ? AlertTriangle : CheckCircle;
  const iconColor = isTriggered
    ? severity === 'critical' ? 'text-red-500' : 'text-yellow-500'
    : 'text-green-500';

  return (
    <div className="flex items-start gap-3">
      <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
      <div>
        <p className="font-medium">
          {isTriggered ? 'Alert Triggered' : 'Alert Resolved'}
        </p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

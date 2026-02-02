import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffectiveIdentity } from '@/hooks/useEffectiveIdentity';
import { useDoorEvents } from '@/hooks/useReadings';
import { format, formatDistanceToNow } from 'date-fns';
import { Clock, DoorClosed, DoorOpen } from 'lucide-react';
import { useMemo } from 'react';
import { WidgetEmptyState } from '../components/WidgetEmptyState';
import {
  createEmptyState,
  createHealthyState,
  createLoadingState,
  createMismatchState,
  createNotConfiguredState,
} from '../hooks/useWidgetState';
import type { WidgetProps } from '../types';
import type { WidgetStateInfo } from '../types/widgetState';

interface DoorEvent {
  id?: string;
  state: string;
  occurredAt: string;
}

export function DoorActivityWidget({ entityId, sensor, loraSensors }: WidgetProps) {
  const { effectiveOrgId } = useEffectiveIdentity();
  const { data: eventsData, isLoading, error } = useDoorEvents(effectiveOrgId, entityId, 20);

  // Find the door sensor specifically - don't just use primary sensor
  const doorSensor =
    sensor?.sensor_type === 'door' ? sensor : loraSensors?.find((s) => s.sensor_type === 'door');
  const primarySensor = doorSensor || sensor || loraSensors?.[0];
  const isDoorSensor = !!doorSensor;

  // Determine widget state
  const widgetState = useMemo<WidgetStateInfo>(() => {
    if (isLoading) {
      return createLoadingState();
    }

    if (!entityId) {
      return createNotConfiguredState(
        'No unit selected.',
        'Select a unit to view door activity.',
        'Select Unit',
        '/units',
      );
    }

    if (!primarySensor) {
      return createNotConfiguredState(
        'No sensor assigned to this unit.',
        'Assign a door sensor to track open/close events.',
        'Assign Sensor',
        '/settings/devices',
      );
    }

    // Check for sensor type mismatch
    if (!isDoorSensor) {
      return createMismatchState('door', primarySensor.sensor_type || 'unknown');
    }

    if (error) {
      return {
        status: 'error',
        message: 'Failed to load door events',
        rootCause: error instanceof Error ? error.message : 'Unknown error',
        action: {
          label: 'Retry',
          onClick: () => window.location.reload(),
        },
      };
    }

    if (!eventsData || eventsData.length === 0) {
      return createEmptyState(
        'No door events recorded yet.',
        'Door activity will appear here once the sensor reports open/close events.',
      );
    }

    const lastDate = eventsData[0]?.occurredAt ? new Date(eventsData[0].occurredAt) : undefined;
    return createHealthyState(lastDate);
  }, [isLoading, entityId, primarySensor, isDoorSensor, error, eventsData]);

  // Show empty state for non-healthy conditions
  if (widgetState.status !== 'healthy') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 p-4 pb-2">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <DoorOpen className="w-4 h-4" />
            Door Activity
          </h3>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center p-4">
          <WidgetEmptyState state={widgetState} compact />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 p-4 pb-2">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <DoorOpen className="w-4 h-4" />
          Door Activity
        </h3>
      </div>
      <div className="flex-1 min-w-0 overflow-hidden px-4 pb-4">
        <ScrollArea className="h-full">
          <div className="space-y-2">
            {eventsData!.map((event: DoorEvent, index) => (
              <div
                key={event.id || index}
                className="flex items-center gap-3 p-2 rounded-lg border border-border"
              >
                {event.state === 'open' ? (
                  <DoorOpen className="h-5 w-5 text-warning" />
                ) : (
                  <DoorClosed className="h-5 w-5 text-safe" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize">{event.state}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(event.occurredAt), 'MMM d, h:mm a')}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(event.occurredAt), {
                    addSuffix: true,
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socket, SensorReading } from '@/lib/socket';
import { useRealtimeStatus } from '@/providers/RealtimeProvider';
import { qk } from '@/lib/queryKeys';

interface BatchData {
  unitId: string;
  readings: SensorReading[];
  count: number;
}

export function useRealtimeSensorData(organizationId: string | undefined) {
  const { isConnected } = useRealtimeStatus();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isConnected || !organizationId) return;

    function handleReadingsBatch(data: BatchData) {
      // Update latest reading for unit in cache
      queryClient.setQueryData(
        ['unit-latest-reading', data.unitId],
        data.readings[data.readings.length - 1]
      );

      // Update unit status cache if exists
      queryClient.setQueryData(
        qk.unit(data.unitId).status(),
        (old: any) => {
          if (!old) return old;
          const latest = data.readings[data.readings.length - 1];
          return {
            ...old,
            lastTemperature: latest.temperature,
            lastReadingAt: latest.recordedAt,
          };
        }
      );

      // Append to readings history if that query exists
      queryClient.setQueryData(
        ['sensor-readings', data.unitId],
        (old: SensorReading[] | undefined) => {
          if (!old) return data.readings;
          // Append new readings, keep last 100
          return [...old, ...data.readings].slice(-100);
        }
      );

      // Also update unit readings query with time range
      queryClient.setQueryData(
        qk.unit(data.unitId).readings(),
        (old: SensorReading[] | undefined) => {
          if (!old) return data.readings;
          // Append new readings, keep last 100
          return [...old, ...data.readings].slice(-100);
        }
      );
    }

    socket.on('sensor:readings:batch', handleReadingsBatch);

    return () => {
      socket.off('sensor:readings:batch', handleReadingsBatch);
    };
  }, [isConnected, organizationId, queryClient]);
}

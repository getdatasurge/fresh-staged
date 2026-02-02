import { useState, useEffect } from 'react';

export interface BatteryDataPoint {
  battery_level: number;
  recorded_at: string;
}

export interface BatteryForecast {
  currentLevel: number | null;
  trend: 'stable' | 'declining' | 'unknown';
  estimatedMonthsRemaining: number | null;
  dataPoints: BatteryDataPoint[];
  hasEnoughData: boolean;
  dailyDecayRate: number | null;
}

const MIN_DATA_POINTS = 5;
const REPLACEMENT_THRESHOLD = 10; // Replace at 10% battery

/**
 * Hook to compute battery lifecycle forecast for a device
 * Uses linear regression on historical battery readings
 */
export function useBatteryForecast(deviceId: string | null): {
  forecast: BatteryForecast;
  loading: boolean;
  error: string | null;
} {
  const [forecast, setForecast] = useState<BatteryForecast>({
    currentLevel: null,
    trend: 'unknown',
    estimatedMonthsRemaining: null,
    dataPoints: [],
    hasEnoughData: false,
    dailyDecayRate: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceId) {
      setForecast({
        currentLevel: null,
        trend: 'unknown',
        estimatedMonthsRemaining: null,
        dataPoints: [],
        hasEnoughData: false,
        dailyDecayRate: null,
      });
      setLoading(false);
      return;
    }

    loadBatteryData();
  }, [deviceId]);

  const loadBatteryData = async () => {
    setForecast({
      currentLevel: null,
      trend: 'unknown',
      estimatedMonthsRemaining: null,
      dataPoints: [],
      hasEnoughData: false,
      dailyDecayRate: null,
    });
    setLoading(false);
    setError('Battery forecast unavailable during Supabase removal.');
  };

  return { forecast, loading, error };
}

export function formatBatteryEstimate(forecast: BatteryForecast): string {
  if (!forecast.hasEnoughData) {
    return 'Estimating...';
  }

  if (forecast.trend === 'stable') {
    return 'Stable';
  }

  if (forecast.estimatedMonthsRemaining === null) {
    return 'Not enough data';
  }

  if (forecast.estimatedMonthsRemaining === 0) {
    return 'Replace soon';
  }

  if (forecast.estimatedMonthsRemaining === 1) {
    return '~1 month';
  }

  if (forecast.estimatedMonthsRemaining > 12) {
    return '12+ months';
  }

  return `~${forecast.estimatedMonthsRemaining} months`;
}

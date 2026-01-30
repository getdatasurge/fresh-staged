import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateMetricsForReadings,
  getHourStart,
  getHourEnd,
  getDayStart,
  getDayEnd,
  processMetricsForReadings,
  ingestReadings,
  queryMetrics,
  upsertHourlyMetrics,
  type CalculatedMetrics,
  type ThresholdContext,
} from '../../src/services/reading-ingestion.service.js';
import type { SingleReading } from '../../src/schemas/readings.js';

// Mock dependencies
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
          orderBy: vi.fn(() => Promise.resolve([])),
        })),
        orderBy: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
}));

vi.mock('../../src/services/readings.service.js', () => ({
  ingestBulkReadings: vi.fn(),
}));

vi.mock('../../src/services/alert-evaluator.service.js', () => ({
  resolveEffectiveThresholds: vi.fn(),
  evaluateUnitAfterReading: vi.fn(),
}));

import * as readingsService from '../../src/services/readings.service.js';
import * as alertEvaluator from '../../src/services/alert-evaluator.service.js';

const mockIngestBulkReadings = vi.mocked(readingsService.ingestBulkReadings);
const mockResolveThresholds = vi.mocked(alertEvaluator.resolveEffectiveThresholds);
const mockEvaluateUnit = vi.mocked(alertEvaluator.evaluateUnitAfterReading);

// Test data
const TEST_UNIT_ID = '6ee7bf36-9c9f-4a00-99ec-6e0730558f67';
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';

function createReading(overrides: Partial<SingleReading> = {}): SingleReading {
  return {
    unitId: TEST_UNIT_ID,
    temperature: 35.5,
    humidity: 50.0,
    battery: 85,
    signalStrength: -75,
    recordedAt: new Date().toISOString(),
    source: 'api',
    ...overrides,
  };
}

describe('Reading Ingestion Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Time Period Helpers', () => {
    describe('getHourStart', () => {
      it('should return start of hour for a given date', () => {
        const date = new Date('2024-01-15T14:35:42.123Z');
        const result = getHourStart(date);

        expect(result.getMinutes()).toBe(0);
        expect(result.getSeconds()).toBe(0);
        expect(result.getMilliseconds()).toBe(0);
        expect(result.getHours()).toBe(date.getHours());
      });

      it('should handle midnight correctly', () => {
        // Use local timezone to avoid timezone conversion issues
        const date = new Date();
        date.setHours(0, 15, 0, 0);
        const result = getHourStart(date);

        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
      });

      it('should handle end of day correctly', () => {
        // Use local timezone to avoid timezone conversion issues
        const date = new Date();
        date.setHours(23, 59, 59, 999);
        const result = getHourStart(date);

        expect(result.getHours()).toBe(23);
        expect(result.getMinutes()).toBe(0);
      });
    });

    describe('getHourEnd', () => {
      it('should return end of hour for a given date', () => {
        const date = new Date('2024-01-15T14:35:42.123Z');
        const result = getHourEnd(date);

        expect(result.getMinutes()).toBe(59);
        expect(result.getSeconds()).toBe(59);
        expect(result.getMilliseconds()).toBe(999);
        expect(result.getHours()).toBe(date.getHours());
      });
    });

    describe('getDayStart', () => {
      it('should return start of day for a given date', () => {
        const date = new Date('2024-01-15T14:35:42.123Z');
        const result = getDayStart(date);

        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
        expect(result.getSeconds()).toBe(0);
        expect(result.getMilliseconds()).toBe(0);
      });
    });

    describe('getDayEnd', () => {
      it('should return end of day for a given date', () => {
        const date = new Date('2024-01-15T14:35:42.123Z');
        const result = getDayEnd(date);

        expect(result.getHours()).toBe(23);
        expect(result.getMinutes()).toBe(59);
        expect(result.getSeconds()).toBe(59);
        expect(result.getMilliseconds()).toBe(999);
      });
    });
  });

  describe('calculateMetricsForReadings', () => {
    it('should return zero metrics for empty readings array', () => {
      const result = calculateMetricsForReadings([]);

      expect(result).toEqual({
        tempMin: 0,
        tempMax: 0,
        tempAvg: 0,
        tempSum: 0,
        humidityMin: null,
        humidityMax: null,
        humidityAvg: null,
        readingCount: 0,
        anomalyCount: 0,
      });
    });

    it('should calculate correct temperature metrics for single reading', () => {
      const readings = [createReading({ temperature: 35.5 })];
      const result = calculateMetricsForReadings(readings);

      expect(result.tempMin).toBe(35.5);
      expect(result.tempMax).toBe(35.5);
      expect(result.tempAvg).toBe(35.5);
      expect(result.tempSum).toBe(35.5);
      expect(result.readingCount).toBe(1);
    });

    it('should calculate correct temperature metrics for multiple readings', () => {
      const readings = [
        createReading({ temperature: 30.0 }),
        createReading({ temperature: 35.5 }),
        createReading({ temperature: 40.0 }),
      ];
      const result = calculateMetricsForReadings(readings);

      expect(result.tempMin).toBe(30.0);
      expect(result.tempMax).toBe(40.0);
      expect(result.tempAvg).toBeCloseTo(35.166666, 4);
      expect(result.tempSum).toBeCloseTo(105.5, 4);
      expect(result.readingCount).toBe(3);
    });

    it('should calculate correct humidity metrics when present', () => {
      const readings = [
        createReading({ humidity: 40.0 }),
        createReading({ humidity: 50.0 }),
        createReading({ humidity: 60.0 }),
      ];
      const result = calculateMetricsForReadings(readings);

      expect(result.humidityMin).toBe(40.0);
      expect(result.humidityMax).toBe(60.0);
      expect(result.humidityAvg).toBe(50.0);
    });

    it('should handle missing humidity values', () => {
      const readings = [
        createReading({ humidity: undefined }),
        createReading({ humidity: 50.0 }),
        createReading({ humidity: undefined }),
      ];
      const result = calculateMetricsForReadings(readings);

      expect(result.humidityMin).toBe(50.0);
      expect(result.humidityMax).toBe(50.0);
      expect(result.humidityAvg).toBe(50.0);
    });

    it('should return null humidity metrics when all readings lack humidity', () => {
      const readings = [
        createReading({ humidity: undefined }),
        createReading({ humidity: undefined }),
      ];
      const result = calculateMetricsForReadings(readings);

      expect(result.humidityMin).toBeNull();
      expect(result.humidityMax).toBeNull();
      expect(result.humidityAvg).toBeNull();
    });

    describe('Anomaly Detection', () => {
      it('should detect no anomalies when all readings are within thresholds', () => {
        const readings = [
          createReading({ temperature: 32.0 }),
          createReading({ temperature: 35.5 }),
          createReading({ temperature: 38.0 }),
        ];
        const thresholds: ThresholdContext = {
          tempMin: 300, // 30.0°
          tempMax: 400, // 40.0°
        };

        const result = calculateMetricsForReadings(readings, thresholds);

        expect(result.anomalyCount).toBe(0);
      });

      it('should detect anomalies for readings above threshold', () => {
        const readings = [
          createReading({ temperature: 35.0 }),
          createReading({ temperature: 42.0 }), // Above 40.0
          createReading({ temperature: 45.0 }), // Above 40.0
        ];
        const thresholds: ThresholdContext = {
          tempMin: 300, // 30.0°
          tempMax: 400, // 40.0°
        };

        const result = calculateMetricsForReadings(readings, thresholds);

        expect(result.anomalyCount).toBe(2);
      });

      it('should detect anomalies for readings below threshold', () => {
        const readings = [
          createReading({ temperature: 25.0 }), // Below 30.0
          createReading({ temperature: 28.0 }), // Below 30.0
          createReading({ temperature: 35.0 }),
        ];
        const thresholds: ThresholdContext = {
          tempMin: 300, // 30.0°
          tempMax: 400, // 40.0°
        };

        const result = calculateMetricsForReadings(readings, thresholds);

        expect(result.anomalyCount).toBe(2);
      });

      it('should detect anomalies for both above and below thresholds', () => {
        const readings = [
          createReading({ temperature: 25.0 }), // Below 30.0
          createReading({ temperature: 35.0 }), // OK
          createReading({ temperature: 45.0 }), // Above 40.0
        ];
        const thresholds: ThresholdContext = {
          tempMin: 300,
          tempMax: 400,
        };

        const result = calculateMetricsForReadings(readings, thresholds);

        expect(result.anomalyCount).toBe(2);
      });

      it('should not detect anomalies when thresholds are not provided', () => {
        const readings = [
          createReading({ temperature: 100.0 }), // Would be anomaly if thresholds provided
        ];

        const result = calculateMetricsForReadings(readings);

        expect(result.anomalyCount).toBe(0);
      });

      it('should handle edge case at exact threshold boundary', () => {
        const readings = [
          createReading({ temperature: 30.0 }), // Exactly at min (30.0 * 10 = 300)
          createReading({ temperature: 40.0 }), // Exactly at max (40.0 * 10 = 400)
        ];
        const thresholds: ThresholdContext = {
          tempMin: 300,
          tempMax: 400,
        };

        const result = calculateMetricsForReadings(readings, thresholds);

        expect(result.anomalyCount).toBe(0);
      });
    });
  });

  describe('ingestReadings', () => {
    const mockStreamService = {
      addReading: vi.fn(),
    };

    const mockSocketService = {
      emitToOrg: vi.fn(),
    };

    beforeEach(() => {
      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 1,
        readingIds: ['reading-id-1'],
        alertsTriggered: 0,
      });

      mockResolveThresholds.mockResolvedValue({
        tempMin: 300,
        tempMax: 400,
        hysteresis: 5,
        confirmTimeSeconds: 600,
      });

      mockEvaluateUnit.mockResolvedValue({
        stateChange: null,
        alertCreated: null,
        alertResolved: null,
      });
    });

    it('should return empty result for empty readings array', async () => {
      const result = await ingestReadings([], TEST_ORG_ID);

      expect(result).toEqual({
        insertedCount: 0,
        readingIds: [],
        alertsTriggered: 0,
        metricsUpdated: 0,
        anomaliesDetected: 0,
      });

      expect(mockIngestBulkReadings).not.toHaveBeenCalled();
    });

    it('should call ingestBulkReadings with correct parameters', async () => {
      const readings = [createReading()];

      await ingestReadings(readings, TEST_ORG_ID);

      expect(mockIngestBulkReadings).toHaveBeenCalledWith(readings, TEST_ORG_ID);
    });

    it('should add readings to stream service when provided', async () => {
      const readings = [createReading()];
      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 1,
        readingIds: ['reading-id-1'],
        alertsTriggered: 0,
      });

      await ingestReadings(
        readings,
        TEST_ORG_ID,
        mockStreamService as any,
        mockSocketService as any,
      );

      expect(mockStreamService.addReading).toHaveBeenCalledTimes(1);
      expect(mockStreamService.addReading).toHaveBeenCalledWith(
        TEST_ORG_ID,
        expect.objectContaining({
          id: 'reading-id-1',
          unitId: TEST_UNIT_ID,
        }),
      );
    });

    it('should evaluate alerts for each unique unit', async () => {
      const readings = [
        createReading({ unitId: 'unit-1', temperature: 35.0 }),
        createReading({ unitId: 'unit-1', temperature: 36.0 }),
        createReading({ unitId: 'unit-2', temperature: 37.0 }),
      ];
      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 3,
        readingIds: ['id-1', 'id-2', 'id-3'],
        alertsTriggered: 0,
      });

      await ingestReadings(readings, TEST_ORG_ID, undefined, mockSocketService as any);

      // Should be called twice - once per unique unit
      expect(mockEvaluateUnit).toHaveBeenCalledTimes(2);
    });

    it('should use latest reading per unit for alert evaluation', async () => {
      const oldDate = new Date('2024-01-15T10:00:00.000Z');
      const newDate = new Date('2024-01-15T11:00:00.000Z');

      const readings = [
        createReading({
          unitId: TEST_UNIT_ID,
          temperature: 30.0,
          recordedAt: oldDate.toISOString(),
        }),
        createReading({
          unitId: TEST_UNIT_ID,
          temperature: 40.0,
          recordedAt: newDate.toISOString(),
        }),
      ];
      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 2,
        readingIds: ['id-1', 'id-2'],
        alertsTriggered: 0,
      });

      await ingestReadings(readings, TEST_ORG_ID, undefined, mockSocketService as any);

      // Should use temperature 40.0 * 10 = 400 (the latest reading)
      expect(mockEvaluateUnit).toHaveBeenCalledWith(
        TEST_UNIT_ID,
        400, // 40.0 * 10
        expect.any(Date),
        mockSocketService,
      );
    });

    it('should count alerts triggered', async () => {
      const readings = [createReading()];
      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 1,
        readingIds: ['id-1'],
        alertsTriggered: 0,
      });
      mockEvaluateUnit.mockResolvedValue({
        stateChange: { from: 'ok', to: 'excursion', reason: 'test' },
        alertCreated: { id: 'alert-1' } as any,
        alertResolved: null,
      });

      const result = await ingestReadings(
        readings,
        TEST_ORG_ID,
        undefined,
        mockSocketService as any,
      );

      expect(result.alertsTriggered).toBe(1);
    });

    it('should count anomalies detected', async () => {
      const readings = [createReading({ temperature: 50.0 })]; // Above 40.0 threshold
      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 1,
        readingIds: ['id-1'],
        alertsTriggered: 0,
      });
      mockResolveThresholds.mockResolvedValue({
        tempMin: 300,
        tempMax: 400,
        hysteresis: 5,
        confirmTimeSeconds: 600,
      });

      const result = await ingestReadings(
        readings,
        TEST_ORG_ID,
        undefined,
        mockSocketService as any,
      );

      expect(result.anomaliesDetected).toBe(1);
    });

    it('should emit metrics:updated event when metrics are calculated', async () => {
      const readings = [createReading()];
      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 1,
        readingIds: ['id-1'],
        alertsTriggered: 0,
      });

      await ingestReadings(readings, TEST_ORG_ID, undefined, mockSocketService as any);

      expect(mockSocketService.emitToOrg).toHaveBeenCalledWith(
        TEST_ORG_ID,
        'metrics:updated',
        expect.objectContaining({
          unitsAffected: [TEST_UNIT_ID],
        }),
      );
    });

    it('should continue processing when threshold resolution fails', async () => {
      const readings = [createReading()];
      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 1,
        readingIds: ['id-1'],
        alertsTriggered: 0,
      });
      mockResolveThresholds.mockRejectedValue(new Error('No thresholds configured'));

      const result = await ingestReadings(readings, TEST_ORG_ID);

      expect(result.insertedCount).toBe(1);
      expect(result.anomaliesDetected).toBe(0); // Cannot detect without thresholds
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative temperatures', () => {
      const readings = [
        createReading({ temperature: -10.0 }),
        createReading({ temperature: -5.0 }),
        createReading({ temperature: 0.0 }),
      ];

      const result = calculateMetricsForReadings(readings);

      expect(result.tempMin).toBe(-10.0);
      expect(result.tempMax).toBe(0.0);
      expect(result.tempAvg).toBe(-5.0);
    });

    it('should handle very large temperature values', () => {
      const readings = [
        createReading({ temperature: 999.99 }),
        createReading({ temperature: 1000.0 }),
      ];

      const result = calculateMetricsForReadings(readings);

      expect(result.tempMin).toBe(999.99);
      expect(result.tempMax).toBe(1000.0);
    });

    it('should handle decimal precision correctly', () => {
      const readings = [
        createReading({ temperature: 35.123 }),
        createReading({ temperature: 35.456 }),
        createReading({ temperature: 35.789 }),
      ];

      const result = calculateMetricsForReadings(readings);

      expect(result.tempMin).toBe(35.123);
      expect(result.tempMax).toBe(35.789);
      expect(result.tempSum).toBeCloseTo(106.368, 3);
    });

    it('should handle single reading with null humidity', () => {
      const readings = [createReading({ humidity: undefined })];

      const result = calculateMetricsForReadings(readings);

      expect(result.humidityMin).toBeNull();
      expect(result.humidityMax).toBeNull();
      expect(result.humidityAvg).toBeNull();
    });

    it('should handle mixed readings with some null humidity', () => {
      const readings = [
        createReading({ temperature: 30.0, humidity: 50.0 }),
        createReading({ temperature: 35.0, humidity: undefined }),
        createReading({ temperature: 40.0, humidity: 60.0 }),
      ];

      const result = calculateMetricsForReadings(readings);

      expect(result.tempAvg).toBeCloseTo(35.0, 4);
      expect(result.humidityMin).toBe(50.0);
      expect(result.humidityMax).toBe(60.0);
      expect(result.humidityAvg).toBe(55.0); // Average of 50 and 60
    });
  });

  describe('Real-time Dashboard Updates', () => {
    it('should format streaming reading correctly', async () => {
      const mockStreamService = {
        addReading: vi.fn(),
      };

      const reading = createReading({
        temperature: 35.5,
        humidity: 50.0,
        battery: 85,
        signalStrength: -75,
        deviceId: 'device-123',
      });

      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 1,
        readingIds: ['reading-id-1'],
        alertsTriggered: 0,
      });

      await ingestReadings([reading], TEST_ORG_ID, mockStreamService as any);

      expect(mockStreamService.addReading).toHaveBeenCalledWith(
        TEST_ORG_ID,
        expect.objectContaining({
          id: 'reading-id-1',
          unitId: TEST_UNIT_ID,
          deviceId: 'device-123',
          temperature: 35.5,
          humidity: 50.0,
          battery: 85,
          signalStrength: -75,
          source: 'api',
          recordedAt: expect.any(Date),
        }),
      );
    });

    it('should handle null deviceId correctly', async () => {
      const mockStreamService = {
        addReading: vi.fn(),
      };

      const reading = createReading({
        deviceId: undefined,
      });

      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 1,
        readingIds: ['reading-id-1'],
        alertsTriggered: 0,
      });

      await ingestReadings([reading], TEST_ORG_ID, mockStreamService as any);

      expect(mockStreamService.addReading).toHaveBeenCalledWith(
        TEST_ORG_ID,
        expect.objectContaining({
          deviceId: null,
        }),
      );
    });
  });
});

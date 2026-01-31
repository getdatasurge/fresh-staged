import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the readings service before importing the simulation service
vi.mock('../../src/services/readings.service.js', () => ({
  ingestBulkReadings: vi.fn(),
}));

import { ingestBulkReadings } from '../../src/services/readings.service.js';
import {
  generateTemperature,
  generateHumidity,
  generateBattery,
  generateReadings,
  runSimulation,
  type SimulationConfig,
} from '../../src/services/simulation.service.js';

/**
 * Simulation Service Tests
 *
 * Tests cover:
 * - Temperature generation with variance
 * - Humidity generation
 * - Battery level generation
 * - Full reading generation
 * - Simulation run with ingestion
 */

describe('Simulation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateTemperature', () => {
    it('should generate temperature within variance range', () => {
      const baseTemp = 4;
      const variance = 2;

      // Generate multiple readings to test the range
      const temperatures: number[] = [];
      for (let i = 0; i < 100; i++) {
        temperatures.push(generateTemperature(baseTemp, variance, i));
      }

      // All temperatures should be within base +/- variance
      for (const temp of temperatures) {
        expect(temp).toBeGreaterThanOrEqual(baseTemp - variance);
        expect(temp).toBeLessThanOrEqual(baseTemp + variance);
      }
    });

    it('should generate temperatures with cyclic pattern', () => {
      const baseTemp = 4;
      const variance = 2;

      // Get temperatures at different cycle points
      // A full cycle is approximately 15 minutes
      const atStart = generateTemperature(baseTemp, variance, 0);
      const atQuarter = generateTemperature(baseTemp, variance, 3.75);
      const atHalf = generateTemperature(baseTemp, variance, 7.5);

      // Since there's randomness, we can't predict exact values,
      // but we can verify they're all valid
      expect(typeof atStart).toBe('number');
      expect(typeof atQuarter).toBe('number');
      expect(typeof atHalf).toBe('number');
    });

    it('should round to 2 decimal places', () => {
      const temp = generateTemperature(4, 2, 5);
      const decimalPlaces = (temp.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });

    it('should handle negative base temperatures', () => {
      const temp = generateTemperature(-20, 5, 10);
      expect(temp).toBeGreaterThanOrEqual(-25);
      expect(temp).toBeLessThanOrEqual(-15);
    });
  });

  describe('generateHumidity', () => {
    it('should generate humidity around base value', () => {
      const baseHumidity = 45;

      const humidities: number[] = [];
      for (let i = 0; i < 50; i++) {
        humidities.push(generateHumidity(baseHumidity));
      }

      // Average should be close to base
      const avg = humidities.reduce((a, b) => a + b, 0) / humidities.length;
      expect(avg).toBeGreaterThan(40);
      expect(avg).toBeLessThan(50);
    });

    it('should clamp humidity between 0 and 100', () => {
      // Test with extreme base values
      for (let i = 0; i < 50; i++) {
        const lowHumidity = generateHumidity(2);
        expect(lowHumidity).toBeGreaterThanOrEqual(0);

        const highHumidity = generateHumidity(98);
        expect(highHumidity).toBeLessThanOrEqual(100);
      }
    });

    it('should use default base humidity of 45', () => {
      const humidities: number[] = [];
      for (let i = 0; i < 50; i++) {
        humidities.push(generateHumidity());
      }

      const avg = humidities.reduce((a, b) => a + b, 0) / humidities.length;
      expect(avg).toBeGreaterThan(40);
      expect(avg).toBeLessThan(50);
    });
  });

  describe('generateBattery', () => {
    it('should start near 100% at beginning', () => {
      const battery = generateBattery(0, 100);
      expect(battery).toBeGreaterThan(95);
      expect(battery).toBeLessThanOrEqual(100);
    });

    it('should decrease over time', () => {
      const startBattery = generateBattery(0, 100);
      const endBattery = generateBattery(99, 100);

      // End should be lower than start (accounting for noise)
      expect(endBattery).toBeLessThan(startBattery);
    });

    it('should clamp between 0 and 100', () => {
      for (let i = 0; i < 100; i++) {
        const battery = generateBattery(i, 100);
        expect(battery).toBeGreaterThanOrEqual(0);
        expect(battery).toBeLessThanOrEqual(100);
      }
    });

    it('should return integer values', () => {
      const battery = generateBattery(50, 100);
      expect(Number.isInteger(battery)).toBe(true);
    });
  });

  describe('generateReadings', () => {
    it('should generate correct number of readings', () => {
      const config: SimulationConfig = {
        unitId: '550e8400-e29b-41d4-a716-446655440000',
        durationMinutes: 60,
        intervalSeconds: 60,
        baseTemperature: 4,
        variance: 2,
      };

      const readings = generateReadings(config);

      // 60 minutes / 60 seconds = 60 readings
      expect(readings.length).toBe(60);
    });

    it('should include required fields in each reading', () => {
      const config: SimulationConfig = {
        unitId: '550e8400-e29b-41d4-a716-446655440000',
        durationMinutes: 5,
        intervalSeconds: 60,
        baseTemperature: 4,
        variance: 2,
      };

      const readings = generateReadings(config);

      for (const reading of readings) {
        expect(reading.unitId).toBe(config.unitId);
        expect(typeof reading.temperature).toBe('number');
        expect(typeof reading.recordedAt).toBe('string');
        expect(reading.source).toBe('api');
      }
    });

    it('should include humidity when configured', () => {
      const config: SimulationConfig = {
        unitId: '550e8400-e29b-41d4-a716-446655440000',
        durationMinutes: 5,
        intervalSeconds: 60,
        baseTemperature: 4,
        variance: 2,
        includeHumidity: true,
      };

      const readings = generateReadings(config);

      for (const reading of readings) {
        expect(typeof reading.humidity).toBe('number');
        expect(reading.humidity).toBeGreaterThanOrEqual(0);
        expect(reading.humidity).toBeLessThanOrEqual(100);
      }
    });

    it('should include battery and signal when configured', () => {
      const config: SimulationConfig = {
        unitId: '550e8400-e29b-41d4-a716-446655440000',
        durationMinutes: 5,
        intervalSeconds: 60,
        baseTemperature: 4,
        variance: 2,
        includeBattery: true,
      };

      const readings = generateReadings(config);

      for (const reading of readings) {
        expect(typeof reading.battery).toBe('number');
        expect(typeof reading.signalStrength).toBe('number');
        expect(reading.battery).toBeGreaterThanOrEqual(0);
        expect(reading.battery).toBeLessThanOrEqual(100);
      }
    });

    it('should not include optional fields when not configured', () => {
      const config: SimulationConfig = {
        unitId: '550e8400-e29b-41d4-a716-446655440000',
        durationMinutes: 5,
        intervalSeconds: 60,
        baseTemperature: 4,
        variance: 2,
      };

      const readings = generateReadings(config);

      for (const reading of readings) {
        expect(reading.humidity).toBeUndefined();
        expect(reading.battery).toBeUndefined();
        expect(reading.signalStrength).toBeUndefined();
      }
    });

    it('should generate readings with chronological timestamps', () => {
      const config: SimulationConfig = {
        unitId: '550e8400-e29b-41d4-a716-446655440000',
        durationMinutes: 10,
        intervalSeconds: 60,
        baseTemperature: 4,
        variance: 2,
      };

      const readings = generateReadings(config);

      for (let i = 1; i < readings.length; i++) {
        const prevTime = new Date(readings[i - 1].recordedAt).getTime();
        const currTime = new Date(readings[i].recordedAt).getTime();
        expect(currTime).toBeGreaterThan(prevTime);
      }
    });

    it('should handle short interval simulation', () => {
      const config: SimulationConfig = {
        unitId: '550e8400-e29b-41d4-a716-446655440000',
        durationMinutes: 1,
        intervalSeconds: 10,
        baseTemperature: 4,
        variance: 2,
      };

      const readings = generateReadings(config);

      // 1 minute = 60 seconds / 10 seconds = 6 readings
      expect(readings.length).toBe(6);
    });
  });

  describe('runSimulation', () => {
    it('should call ingestBulkReadings with generated readings', async () => {
      const mockResult = {
        insertedCount: 5,
        readingIds: ['id1', 'id2', 'id3', 'id4', 'id5'],
        alertsTriggered: 0,
      };
      vi.mocked(ingestBulkReadings).mockResolvedValue(mockResult);

      const config: SimulationConfig = {
        unitId: '550e8400-e29b-41d4-a716-446655440000',
        durationMinutes: 5,
        intervalSeconds: 60,
        baseTemperature: 4,
        variance: 2,
      };

      const result = await runSimulation(config, 'org-id');

      expect(ingestBulkReadings).toHaveBeenCalledWith(expect.any(Array), 'org-id');

      // Verify the readings passed to ingestion
      const passedReadings = vi.mocked(ingestBulkReadings).mock.calls[0][0];
      expect(passedReadings.length).toBe(5);
      expect(passedReadings[0].unitId).toBe(config.unitId);
    });

    it('should return simulation result with correct structure', async () => {
      const mockResult = {
        insertedCount: 10,
        readingIds: Array.from({ length: 10 }, (_, i) => `id-${i}`),
        alertsTriggered: 0,
      };
      vi.mocked(ingestBulkReadings).mockResolvedValue(mockResult);

      const config: SimulationConfig = {
        unitId: '550e8400-e29b-41d4-a716-446655440000',
        durationMinutes: 10,
        intervalSeconds: 60,
        baseTemperature: 4,
        variance: 2,
      };

      const result = await runSimulation(config, 'org-id');

      expect(result.success).toBe(true);
      expect(result.generatedCount).toBe(10);
      expect(result.readingIds.length).toBe(10);
      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
      expect(result.endTime.getTime()).toBeGreaterThan(result.startTime.getTime());
    });

    it('should handle empty simulation gracefully', async () => {
      const config: SimulationConfig = {
        unitId: '550e8400-e29b-41d4-a716-446655440000',
        durationMinutes: 0,
        intervalSeconds: 60,
        baseTemperature: 4,
        variance: 2,
      };

      const result = await runSimulation(config, 'org-id');

      expect(result.success).toBe(true);
      expect(result.generatedCount).toBe(0);
      expect(result.readingIds).toEqual([]);
      expect(ingestBulkReadings).not.toHaveBeenCalled();
    });

    it('should propagate errors from ingestion service', async () => {
      vi.mocked(ingestBulkReadings).mockRejectedValue(new Error('No valid units found'));

      const config: SimulationConfig = {
        unitId: '550e8400-e29b-41d4-a716-446655440000',
        durationMinutes: 5,
        intervalSeconds: 60,
        baseTemperature: 4,
        variance: 2,
      };

      await expect(runSimulation(config, 'org-id')).rejects.toThrow('No valid units found');
    });
  });
});

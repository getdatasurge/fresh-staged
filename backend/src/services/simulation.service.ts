/**
 * Sensor Simulation Service
 *
 * Generates simulated sensor readings for testing and development.
 * Creates realistic temperature patterns with configurable variance.
 */

import * as readingsService from './readings.service.js';

/**
 * Configuration for simulated readings
 */
export interface SimulationConfig {
  unitId: string;
  durationMinutes: number;
  intervalSeconds: number;
  baseTemperature: number;
  variance: number;
  includeHumidity?: boolean;
  includeBattery?: boolean;
}

/**
 * Result of a simulation run
 */
export interface SimulationResult {
  success: boolean;
  generatedCount: number;
  readingIds: string[];
  startTime: Date;
  endTime: Date;
}

/**
 * Generate a realistic temperature value with natural fluctuation
 *
 * Uses a sine wave pattern combined with random noise to simulate
 * temperature changes over time (e.g., refrigeration compressor cycles).
 *
 * @param baseTemp Base temperature in Celsius
 * @param variance Maximum deviation from base temperature
 * @param timeOffset Minutes from start (for cyclic patterns)
 * @returns Simulated temperature value
 */
export function generateTemperature(
  baseTemp: number,
  variance: number,
  timeOffset: number
): number {
  // Compressor cycle: approximately 15-minute period
  const cycleRadians = (timeOffset / 15) * Math.PI * 2;
  const cyclicComponent = Math.sin(cycleRadians) * (variance * 0.6);

  // Random noise component
  const noise = (Math.random() - 0.5) * (variance * 0.4);

  // Combine components
  const temperature = baseTemp + cyclicComponent + noise;

  // Round to 2 decimal places
  return Math.round(temperature * 100) / 100;
}

/**
 * Generate a realistic humidity value
 *
 * @param baseHumidity Base humidity percentage (default 45%)
 * @returns Simulated humidity percentage (0-100)
 */
export function generateHumidity(baseHumidity: number = 45): number {
  const noise = (Math.random() - 0.5) * 10;
  const humidity = Math.max(0, Math.min(100, baseHumidity + noise));
  return Math.round(humidity * 10) / 10;
}

/**
 * Generate a realistic battery level
 *
 * Slowly decreasing over time with occasional recharge simulation.
 *
 * @param readingIndex Index of current reading
 * @param totalReadings Total number of readings in simulation
 * @returns Battery percentage (0-100)
 */
export function generateBattery(
  readingIndex: number,
  totalReadings: number
): number {
  // Start at 100%, decrease linearly over the simulation
  const baseLevel = 100 - (readingIndex / totalReadings) * 20;
  const noise = (Math.random() - 0.5) * 2;
  return Math.max(0, Math.min(100, Math.round(baseLevel + noise)));
}

/**
 * Generate an array of simulated sensor readings
 *
 * @param config Simulation configuration
 * @returns Array of single reading objects ready for ingestion
 */
export function generateReadings(config: SimulationConfig): Array<{
  unitId: string;
  temperature: number;
  humidity?: number;
  battery?: number;
  signalStrength?: number;
  recordedAt: string;
  source: 'api';
}> {
  const readings: Array<{
    unitId: string;
    temperature: number;
    humidity?: number;
    battery?: number;
    signalStrength?: number;
    recordedAt: string;
    source: 'api';
  }> = [];

  const totalReadings = Math.ceil(
    (config.durationMinutes * 60) / config.intervalSeconds
  );

  const endTime = new Date();
  const startTime = new Date(
    endTime.getTime() - config.durationMinutes * 60 * 1000
  );

  for (let i = 0; i < totalReadings; i++) {
    const readingTime = new Date(
      startTime.getTime() + i * config.intervalSeconds * 1000
    );
    const timeOffsetMinutes = i * (config.intervalSeconds / 60);

    const reading: {
      unitId: string;
      temperature: number;
      humidity?: number;
      battery?: number;
      signalStrength?: number;
      recordedAt: string;
      source: 'api';
    } = {
      unitId: config.unitId,
      temperature: generateTemperature(
        config.baseTemperature,
        config.variance,
        timeOffsetMinutes
      ),
      recordedAt: readingTime.toISOString(),
      source: 'api',
    };

    if (config.includeHumidity) {
      reading.humidity = generateHumidity();
    }

    if (config.includeBattery) {
      reading.battery = generateBattery(i, totalReadings);
      reading.signalStrength = Math.floor(Math.random() * 30) - 100 + 70; // -30 to -100 dBm range, centered around -65
    }

    readings.push(reading);
  }

  return readings;
}

/**
 * Run a simulation: generate readings and ingest them
 *
 * @param config Simulation configuration
 * @param organizationId Organization ID for the readings
 * @returns Simulation result with counts and IDs
 */
export async function runSimulation(
  config: SimulationConfig,
  organizationId: string
): Promise<SimulationResult> {
  const endTime = new Date();
  const startTime = new Date(
    endTime.getTime() - config.durationMinutes * 60 * 1000
  );

  // Generate the readings
  const readings = generateReadings(config);

  if (readings.length === 0) {
    return {
      success: true,
      generatedCount: 0,
      readingIds: [],
      startTime,
      endTime,
    };
  }

  // Ingest the readings using the existing service
  const result = await readingsService.ingestBulkReadings(
    readings,
    organizationId
  );

  return {
    success: true,
    generatedCount: result.insertedCount,
    readingIds: result.readingIds,
    startTime,
    endTime,
  };
}

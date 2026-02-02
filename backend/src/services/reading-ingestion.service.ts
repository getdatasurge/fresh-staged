/**
 * Reading Ingestion Service - Orchestrates sensor reading processing pipeline
 *
 * Handles the complete ingestion flow:
 * 1. Batch reading insertion with validation
 * 2. Derived metrics calculation (min, max, average per period)
 * 3. Anomaly detection against thresholds
 * 4. Real-time dashboard updates via Socket.IO
 *
 * This service coordinates between:
 * - readings.service.ts (batch insertion)
 * - reading-metrics.service.ts (metrics calculation)
 * - alert-evaluator.service.ts (anomaly detection)
 * - sensor-stream.service.ts (real-time streaming)
 */

import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  readingMetrics,
  type InsertReadingMetric,
  type MetricGranularity,
} from '../db/schema/index.js';
import { QueueNames, JobNames, type MeterReportJobData } from '../jobs/index.js';
import type { SingleReading } from '../schemas/readings.js';
import { logger } from '../utils/logger.js';
import * as alertEvaluator from './alert-evaluator.service.js';
import { getQueueService } from './queue.service.js';
import * as readingsService from './readings.service.js';
import type { SensorStreamService } from './sensor-stream.service.js';
import type { SocketService } from './socket.service.js';

const log = logger.child({ service: 'reading-ingestion' });

/**
 * Result of complete reading ingestion pipeline
 */
export interface IngestionResult {
  insertedCount: number;
  readingIds: string[];
  alertsTriggered: number;
  metricsUpdated: number;
  anomaliesDetected: number;
}

/**
 * Calculated metrics for a batch of readings
 */
export interface CalculatedMetrics {
  tempMin: number;
  tempMax: number;
  tempAvg: number;
  tempSum: number;
  humidityMin: number | null;
  humidityMax: number | null;
  humidityAvg: number | null;
  readingCount: number;
  anomalyCount: number;
}

/**
 * Threshold context for anomaly detection
 */
export interface ThresholdContext {
  tempMin: number;
  tempMax: number;
}

/**
 * Calculate the start of the hour for a given date
 */
export function getHourStart(date: Date): Date {
  const result = new Date(date);
  result.setMinutes(0, 0, 0);
  return result;
}

/**
 * Calculate the end of the hour for a given date
 */
export function getHourEnd(date: Date): Date {
  const result = new Date(date);
  result.setMinutes(59, 59, 999);
  return result;
}

/**
 * Calculate the start of the day for a given date
 */
export function getDayStart(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Calculate the end of the day for a given date
 */
export function getDayEnd(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Calculate derived metrics from a batch of readings for a specific unit
 *
 * @param readings - Array of readings for a single unit
 * @param thresholds - Optional thresholds for anomaly detection
 * @returns Calculated metrics including min, max, avg, and anomaly count
 */
export function calculateMetricsForReadings(
  readings: SingleReading[],
  thresholds?: ThresholdContext,
): CalculatedMetrics {
  if (readings.length === 0) {
    return {
      tempMin: 0,
      tempMax: 0,
      tempAvg: 0,
      tempSum: 0,
      humidityMin: null,
      humidityMax: null,
      humidityAvg: null,
      readingCount: 0,
      anomalyCount: 0,
    };
  }

  let tempMin = readings[0].temperature;
  let tempMax = readings[0].temperature;
  let tempSum = 0;

  let humidityMin: number | null = null;
  let humidityMax: number | null = null;
  let humiditySum = 0;
  let humidityCount = 0;

  let anomalyCount = 0;

  for (const reading of readings) {
    // Temperature stats
    if (reading.temperature < tempMin) {
      tempMin = reading.temperature;
    }
    if (reading.temperature > tempMax) {
      tempMax = reading.temperature;
    }
    tempSum += reading.temperature;

    // Humidity stats (optional field)
    if (reading.humidity !== undefined && reading.humidity !== null) {
      if (humidityMin === null || reading.humidity < humidityMin) {
        humidityMin = reading.humidity;
      }
      if (humidityMax === null || reading.humidity > humidityMax) {
        humidityMax = reading.humidity;
      }
      humiditySum += reading.humidity;
      humidityCount++;
    }

    // Anomaly detection against thresholds
    // Temperature is in raw units (e.g., 35.5), thresholds are in integer format (e.g., 355)
    if (thresholds) {
      const tempInt = Math.round(reading.temperature * 10);
      if (tempInt < thresholds.tempMin || tempInt > thresholds.tempMax) {
        anomalyCount++;
      }
    }
  }

  return {
    tempMin,
    tempMax,
    tempAvg: tempSum / readings.length,
    tempSum,
    humidityMin,
    humidityMax,
    humidityAvg: humidityCount > 0 ? humiditySum / humidityCount : null,
    readingCount: readings.length,
    anomalyCount,
  };
}

/**
 * Update or create hourly metrics for a unit
 *
 * Uses upsert pattern to incrementally update metrics as readings arrive.
 * Merges new readings with existing period data.
 *
 * @param unitId - Unit UUID
 * @param periodStart - Start of the hour
 * @param periodEnd - End of the hour
 * @param newMetrics - Metrics from new readings
 */
export async function upsertHourlyMetrics(
  unitId: string,
  periodStart: Date,
  periodEnd: Date,
  newMetrics: CalculatedMetrics,
): Promise<void> {
  const granularity: MetricGranularity = 'hourly';

  // Single-query upsert using ON CONFLICT on the unique (unitId, periodStart, granularity) constraint
  await db
    .insert(readingMetrics)
    .values({
      unitId,
      periodStart,
      periodEnd,
      granularity,
      tempMin: newMetrics.tempMin.toString(),
      tempMax: newMetrics.tempMax.toString(),
      tempAvg: newMetrics.tempAvg.toString(),
      tempSum: newMetrics.tempSum.toString(),
      humidityMin: newMetrics.humidityMin?.toString() ?? null,
      humidityMax: newMetrics.humidityMax?.toString() ?? null,
      humidityAvg: newMetrics.humidityAvg?.toString() ?? null,
      readingCount: newMetrics.readingCount,
      anomalyCount: newMetrics.anomalyCount,
    } satisfies InsertReadingMetric)
    .onConflictDoUpdate({
      target: [readingMetrics.unitId, readingMetrics.periodStart, readingMetrics.granularity],
      set: {
        tempMin: sql`LEAST(${readingMetrics.tempMin}::numeric, EXCLUDED.temp_min::numeric)::text`,
        tempMax: sql`GREATEST(${readingMetrics.tempMax}::numeric, EXCLUDED.temp_max::numeric)::text`,
        tempSum: sql`(${readingMetrics.tempSum}::numeric + EXCLUDED.temp_sum::numeric)::text`,
        tempAvg: sql`((${readingMetrics.tempSum}::numeric + EXCLUDED.temp_sum::numeric) / (${readingMetrics.readingCount} + EXCLUDED.reading_count))::text`,
        humidityMin: sql`CASE WHEN EXCLUDED.humidity_min IS NOT NULL THEN LEAST(${readingMetrics.humidityMin}::numeric, EXCLUDED.humidity_min::numeric)::text ELSE ${readingMetrics.humidityMin} END`,
        humidityMax: sql`CASE WHEN EXCLUDED.humidity_max IS NOT NULL THEN GREATEST(${readingMetrics.humidityMax}::numeric, EXCLUDED.humidity_max::numeric)::text ELSE ${readingMetrics.humidityMax} END`,
        humidityAvg: sql`COALESCE(EXCLUDED.humidity_avg, ${readingMetrics.humidityAvg})`,
        readingCount: sql`${readingMetrics.readingCount} + EXCLUDED.reading_count`,
        anomalyCount: sql`${readingMetrics.anomalyCount} + EXCLUDED.anomaly_count`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Process metrics for a batch of readings
 *
 * Groups readings by unit and hour, calculates metrics, and stores them.
 *
 * @param readings - Readings to process
 * @returns Number of metrics records updated
 */
export async function processMetricsForReadings(readings: SingleReading[]): Promise<number> {
  if (readings.length === 0) {
    return 0;
  }

  // Group readings by unit and hour
  const groupedByUnitAndHour = new Map<string, SingleReading[]>();

  for (const reading of readings) {
    const hourStart = getHourStart(new Date(reading.recordedAt));
    const key = `${reading.unitId}:${hourStart.toISOString()}`;

    if (!groupedByUnitAndHour.has(key)) {
      groupedByUnitAndHour.set(key, []);
    }
    groupedByUnitAndHour.get(key)!.push(reading);
  }

  // Process each group
  let metricsUpdated = 0;

  for (const [key, unitReadings] of groupedByUnitAndHour) {
    const [unitId] = key.split(':');
    const hourStart = getHourStart(new Date(unitReadings[0].recordedAt));
    const hourEnd = getHourEnd(new Date(unitReadings[0].recordedAt));

    // Try to get thresholds for anomaly detection
    let thresholds: ThresholdContext | undefined;
    try {
      const effectiveThresholds = await alertEvaluator.resolveEffectiveThresholds(unitId);
      thresholds = {
        tempMin: effectiveThresholds.tempMin,
        tempMax: effectiveThresholds.tempMax,
      };
    } catch {
      // No thresholds configured - skip anomaly detection
    }

    const metrics = calculateMetricsForReadings(unitReadings, thresholds);
    await upsertHourlyMetrics(unitId, hourStart, hourEnd, metrics);
    metricsUpdated++;
  }

  return metricsUpdated;
}

/**
 * Complete reading ingestion pipeline
 *
 * Orchestrates:
 * 1. Batch reading insertion
 * 2. Real-time streaming to dashboards
 * 3. Metrics calculation
 * 4. Alert evaluation
 *
 * @param readings - Readings to ingest
 * @param organizationId - Organization context
 * @param streamService - Optional sensor stream service for real-time updates
 * @param socketService - Optional socket service for alert notifications
 * @returns Complete ingestion result
 */
export async function ingestReadings(
  readings: SingleReading[],
  organizationId: string,
  streamService?: SensorStreamService,
  socketService?: SocketService,
): Promise<IngestionResult> {
  if (readings.length === 0) {
    return {
      insertedCount: 0,
      readingIds: [],
      alertsTriggered: 0,
      metricsUpdated: 0,
      anomaliesDetected: 0,
    };
  }

  // Step 1: Batch insert readings
  const insertResult = await readingsService.ingestBulkReadings(readings, organizationId);

  // Step 1.5: Queue meter event for reading volume (async, fire-and-forget)
  try {
    const queueService = getQueueService();
    if (queueService?.isEnabled()) {
      const meterJobData: MeterReportJobData = {
        organizationId,
        eventName: 'temperature_readings',
        value: insertResult.insertedCount,
      };

      queueService
        .addJob(QueueNames.METER_REPORTING, JobNames.METER_REPORT, meterJobData)
        .catch((err) => {
          // Log but don't fail ingestion if queue is unavailable
          log.warn({ err }, 'Failed to queue meter event');
        });
    }
  } catch {
    // Queue service not available - skip metering silently
    log.warn('Queue service unavailable for metering');
  }

  // Step 2: Stream readings to real-time dashboards
  if (streamService) {
    for (let i = 0; i < readings.length && i < insertResult.readingIds.length; i++) {
      const reading = readings[i];
      const readingId = insertResult.readingIds[i];

      streamService.addReading(organizationId, {
        id: readingId,
        unitId: reading.unitId,
        deviceId: reading.deviceId || null,
        temperature: reading.temperature,
        humidity: reading.humidity ?? null,
        battery: reading.battery ?? null,
        signalStrength: reading.signalStrength ?? null,
        recordedAt: new Date(reading.recordedAt),
        source: reading.source,
      });
    }
  }

  // Step 3: Calculate and store metrics
  const metricsUpdated = await processMetricsForReadings(readings);

  // Step 4: Evaluate alerts for each unique unit
  const uniqueUnitIds = [...new Set(readings.map((r) => r.unitId))];
  let alertsTriggered = 0;
  let anomaliesDetected = 0;

  for (const unitId of uniqueUnitIds) {
    // Find latest reading for this unit
    const unitReadings = readings.filter((r) => r.unitId === unitId);
    const latestReading = unitReadings.reduce((latest, current) => {
      return new Date(current.recordedAt) > new Date(latest.recordedAt) ? current : latest;
    });

    // Convert temperature to integer (multiply by 10 for precision)
    const tempInt = Math.round(latestReading.temperature * 10);

    try {
      // Check for anomalies (readings outside thresholds)
      const thresholds = await alertEvaluator.resolveEffectiveThresholds(unitId);
      if (tempInt < thresholds.tempMin || tempInt > thresholds.tempMax) {
        anomaliesDetected++;
      }

      // Evaluate alert state machine with real-time notifications
      const evaluation = await alertEvaluator.evaluateUnitAfterReading(
        unitId,
        tempInt,
        new Date(latestReading.recordedAt),
        socketService,
      );

      if (evaluation.alertCreated || evaluation.alertResolved) {
        alertsTriggered++;
      }
    } catch {
      // Log error but don't fail entire ingestion
      // This happens when no thresholds are configured
    }
  }

  // Emit metrics update event for real-time dashboards
  if (socketService && metricsUpdated > 0) {
    // Emit to each affected unit's org
    socketService.emitToOrg(organizationId, 'metrics:updated', {
      timestamp: new Date().toISOString(),
      unitsAffected: uniqueUnitIds,
      metricsUpdated,
    });
  }

  return {
    insertedCount: insertResult.insertedCount,
    readingIds: insertResult.readingIds,
    alertsTriggered,
    metricsUpdated,
    anomaliesDetected,
  };
}

/**
 * Query metrics for a unit within a time range
 *
 * @param unitId - Unit UUID
 * @param start - Start of time range
 * @param end - End of time range
 * @param granularity - Metric granularity to query
 * @returns Array of metrics records
 */
export async function queryMetrics(
  unitId: string,
  start: Date,
  end: Date,
  granularity: MetricGranularity = 'hourly',
): Promise<
  {
    periodStart: Date;
    periodEnd: Date;
    tempMin: number;
    tempMax: number;
    tempAvg: number;
    humidityMin: number | null;
    humidityMax: number | null;
    humidityAvg: number | null;
    readingCount: number;
    anomalyCount: number;
  }[]
> {
  const results = await db
    .select()
    .from(readingMetrics)
    .where(
      and(
        eq(readingMetrics.unitId, unitId),
        eq(readingMetrics.granularity, granularity),
        gte(readingMetrics.periodStart, start),
        lte(readingMetrics.periodEnd, end),
      ),
    )
    .orderBy(readingMetrics.periodStart);

  return results.map((r) => ({
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    tempMin: parseFloat(r.tempMin),
    tempMax: parseFloat(r.tempMax),
    tempAvg: parseFloat(r.tempAvg),
    humidityMin: r.humidityMin ? parseFloat(r.humidityMin) : null,
    humidityMax: r.humidityMax ? parseFloat(r.humidityMax) : null,
    humidityAvg: r.humidityAvg ? parseFloat(r.humidityAvg) : null,
    readingCount: r.readingCount,
    anomalyCount: r.anomalyCount,
  }));
}

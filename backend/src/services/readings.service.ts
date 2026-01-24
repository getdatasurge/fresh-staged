import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  sensorReadings,
  units,
  areas,
  sites,
  type InsertSensorReading,
  type SensorReading,
} from '../db/schema/index.js';
import type {
  SingleReading,
  ReadingQuery,
  ReadingResponse,
} from '../schemas/readings.js';

// PostgreSQL parameter limit safety margin
const BATCH_SIZE = 500;

/**
 * Result of bulk reading ingestion
 */
export interface BulkIngestResult {
  insertedCount: number;
  readingIds: string[];
  alertsTriggered: number;
}

/**
 * Get the latest reading per unit from a collection of readings
 * Helper function for alert evaluation in routes
 *
 * @param readings - Array of readings to process
 * @returns Map of unitId to latest reading for that unit
 */
export function getLatestReadingPerUnit(
  readings: SingleReading[]
): Map<string, SingleReading> {
  const latestByUnit = new Map<string, SingleReading>();

  for (const reading of readings) {
    const existing = latestByUnit.get(reading.unitId);
    if (
      !existing ||
      new Date(reading.recordedAt) > new Date(existing.recordedAt)
    ) {
      latestByUnit.set(reading.unitId, reading);
    }
  }

  return latestByUnit;
}

/**
 * Validate that units exist and belong to organization via hierarchy
 * Returns array of valid unitIds (silent filtering for invalid ones)
 */
export async function validateUnitsInOrg(
  unitIds: string[],
  organizationId: string
): Promise<string[]> {
  if (unitIds.length === 0) {
    return [];
  }

  // Join through hierarchy: unit -> area -> site -> org
  const validUnits = await db
    .select({ id: units.id })
    .from(units)
    .innerJoin(areas, eq(units.areaId, areas.id))
    .innerJoin(sites, eq(areas.siteId, sites.id))
    .where(
      and(
        inArray(units.id, unitIds),
        eq(sites.organizationId, organizationId),
        eq(units.isActive, true),
        eq(areas.isActive, true),
        eq(sites.isActive, true)
      )
    );

  return validUnits.map((u) => u.id);
}

/**
 * Ingest bulk sensor readings with batching and unit updates
 * Inserts readings atomically and updates unit lastReadingAt/lastTemperature
 *
 * @param readings Array of readings to insert
 * @param organizationId Organization ID for validation
 * @returns Insertion result with count and IDs
 */
export async function ingestBulkReadings(
  readings: SingleReading[],
  organizationId: string
): Promise<BulkIngestResult> {
  if (readings.length === 0) {
    return { insertedCount: 0, readingIds: [], alertsTriggered: 0 };
  }

  // Validate all units belong to organization
  const unitIds = [...new Set(readings.map((r) => r.unitId))];
  const validUnitIds = await validateUnitsInOrg(unitIds, organizationId);

  if (validUnitIds.length === 0) {
    throw new Error('No valid units found in organization');
  }

  // Filter readings to only include valid units
  const validReadings = readings.filter((r) =>
    validUnitIds.includes(r.unitId)
  );

  if (validReadings.length === 0) {
    throw new Error('All readings reference invalid units');
  }

  return db.transaction(async (tx) => {
    const allReadingIds: string[] = [];

    // Insert readings in batches
    for (let i = 0; i < validReadings.length; i += BATCH_SIZE) {
      const batch = validReadings.slice(i, i + BATCH_SIZE);

      // Convert to DB insert format
      const insertData: InsertSensorReading[] = batch.map((r) => ({
        unitId: r.unitId,
        deviceId: r.deviceId,
        temperature: r.temperature.toString(), // Convert to string for numeric type
        humidity: r.humidity?.toString(),
        battery: r.battery,
        signalStrength: r.signalStrength,
        recordedAt: new Date(r.recordedAt),
        source: r.source,
        rawPayload: r.rawPayload,
      }));

      const inserted = await tx
        .insert(sensorReadings)
        .values(insertData)
        .returning({ id: sensorReadings.id });

      allReadingIds.push(...inserted.map((r) => r.id));
    }

    // Update lastReadingAt and lastTemperature for each affected unit
    // Group readings by unit to get the latest reading per unit
    const unitReadings = new Map<string, SingleReading>();
    for (const reading of validReadings) {
      const existing = unitReadings.get(reading.unitId);
      if (
        !existing ||
        new Date(reading.recordedAt) > new Date(existing.recordedAt)
      ) {
        unitReadings.set(reading.unitId, reading);
      }
    }

    // Update each unit with its latest reading
    for (const [unitId, latestReading] of unitReadings) {
      // Convert temperature to integer (multiply by 100 for precision)
      // e.g., 35.5°C -> 3550
      const tempInt = Math.round(latestReading.temperature * 100);

      await tx
        .update(units)
        .set({
          lastReadingAt: new Date(latestReading.recordedAt),
          lastTemperature: tempInt,
          updatedAt: new Date(),
        })
        .where(eq(units.id, unitId));
    }

    return {
      insertedCount: allReadingIds.length,
      readingIds: allReadingIds,
      alertsTriggered: 0, // Alert triggering added in 04-02
    };
  });
}

/**
 * Query sensor readings with filters and pagination
 * Validates unit hierarchy access before returning results
 *
 * @param params Query parameters with optional filters
 * @returns Array of matching readings
 */
export async function queryReadings(
  params: ReadingQuery & { organizationId: string }
): Promise<ReadingResponse[]> {
  const { unitId, start, end, limit, offset, organizationId } = params;

  // If unitId provided, verify it belongs to organization
  if (unitId) {
    const validUnitIds = await validateUnitsInOrg([unitId], organizationId);
    if (validUnitIds.length === 0) {
      throw new Error('Unit not found or access denied');
    }
  }

  // Build query conditions
  const conditions: ReturnType<typeof eq>[] = [];

  if (unitId) {
    conditions.push(eq(sensorReadings.unitId, unitId));
  }

  if (start) {
    conditions.push(gte(sensorReadings.recordedAt, new Date(start)));
  }

  if (end) {
    conditions.push(lte(sensorReadings.recordedAt, new Date(end)));
  }

  // Query readings
  const results = await db
    .select()
    .from(sensorReadings)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sensorReadings.recordedAt)
    .limit(limit)
    .offset(offset);

  // Convert DB format to response format
  return results.map((r) => ({
    id: r.id,
    unitId: r.unitId,
    deviceId: r.deviceId,
    temperature: parseFloat(r.temperature),
    humidity: r.humidity ? parseFloat(r.humidity) : null,
    battery: r.battery,
    signalStrength: r.signalStrength,
    rawPayload: r.rawPayload,
    recordedAt: r.recordedAt,
    receivedAt: r.receivedAt,
    source: r.source,
  }));
}

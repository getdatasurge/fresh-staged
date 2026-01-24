#!/usr/bin/env tsx

/**
 * Synthetic Test Data Generator
 *
 * Generates production-scale sensor reading data for migration timing validation.
 * Creates 100K synthetic sensor readings with realistic distribution patterns.
 *
 * Usage:
 *   npx tsx scripts/test/generate-test-data.ts          # Interactive mode
 *   npx tsx scripts/test/generate-test-data.ts --yes    # Skip confirmation
 *
 * Environment variables:
 *   TARGET_RECORDS   Number of records to generate (default: 100000)
 *   BATCH_SIZE       Records per batch (default: 5000)
 */

import { faker } from '@faker-js/faker';
import { db } from '../../backend/src/db/client.js';
import { sensorReadings } from '../../backend/src/db/schema/telemetry.js';
import { units } from '../../backend/src/db/schema/hierarchy.js';
import { sql } from 'drizzle-orm';
import * as readline from 'node:readline';

// Configuration
const TARGET_RECORDS = parseInt(process.env.TARGET_RECORDS || '100000', 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '5000', 10);
const NUM_DEVICES = 30; // Simulating 20-50 sensors
const TIME_RANGE_DAYS = 30; // 30 days of historical data

// Device ID format: sensor-001 through sensor-030
const DEVICE_IDS = Array.from({ length: NUM_DEVICES }, (_, i) =>
  `sensor-${String(i + 1).padStart(3, '0')}`
);

/**
 * Generate a realistic temperature reading
 * Food safety range: -20°C to 40°C
 * Include some excursions (5-10% above threshold)
 */
function generateTemperature(): string {
  const isExcursion = Math.random() < 0.075; // 7.5% excursions

  if (isExcursion) {
    // Temperature excursion (above safe threshold)
    return faker.number.float({ min: 5.0, max: 12.0, fractionDigits: 2 }).toFixed(2);
  } else {
    // Normal range
    return faker.number.float({ min: -20.0, max: 4.0, fractionDigits: 2 }).toFixed(2);
  }
}

/**
 * Generate a realistic humidity reading
 * Range: 0-100%
 */
function generateHumidity(): string {
  return faker.number.float({ min: 30.0, max: 95.0, fractionDigits: 1 }).toFixed(1);
}

/**
 * Generate a random timestamp within the past N days
 */
function generateTimestamp(daysAgo: number): Date {
  const now = new Date();
  const pastDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return faker.date.between({ from: pastDate, to: now });
}

/**
 * Ask user for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Check if test data already exists
 */
async function checkExistingData(): Promise<number> {
  const result = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*) as count FROM ${sensorReadings}`
  );
  return parseInt(result.rows[0]?.count || '0', 10);
}

/**
 * Get a random valid unit ID from the database
 */
async function getRandomUnitId(): Promise<string | null> {
  const result = await db.execute<{ id: string }>(
    sql`SELECT id FROM ${units} ORDER BY RANDOM() LIMIT 1`
  );
  return result.rows[0]?.id || null;
}

/**
 * Main execution
 */
async function main() {
  const skipConfirmation = process.argv.includes('--yes');

  console.log('Synthetic Test Data Generator');
  console.log('=============================\n');
  console.log(`Target records: ${TARGET_RECORDS.toLocaleString()}`);
  console.log(`Batch size: ${BATCH_SIZE.toLocaleString()}`);
  console.log(`Devices: ${NUM_DEVICES}`);
  console.log(`Time range: ${TIME_RANGE_DAYS} days\n`);

  // Check existing data
  const existingCount = await checkExistingData();
  console.log(`Existing sensor_readings: ${existingCount.toLocaleString()}`);

  if (existingCount > 0 && !skipConfirmation) {
    const shouldContinue = await confirm(
      '\nData already exists in sensor_readings table. Continue anyway?'
    );
    if (!shouldContinue) {
      console.log('Cancelled.');
      process.exit(0);
    }
  }

  // Get a valid unit ID (we'll use one unit for all test data)
  console.log('\nChecking for valid unit...');
  const unitId = await getRandomUnitId();

  if (!unitId) {
    console.error('ERROR: No units found in database. Please seed your database first.');
    console.error('Hint: Ensure organizations, sites, areas, and units exist.');
    process.exit(1);
  }

  console.log(`Using unit ID: ${unitId}`);

  // Safety confirmation
  if (!skipConfirmation) {
    const shouldProceed = await confirm(
      `\nThis will insert ${TARGET_RECORDS.toLocaleString()} records. Continue?`
    );
    if (!shouldProceed) {
      console.log('Cancelled.');
      process.exit(0);
    }
  }

  const numBatches = Math.ceil(TARGET_RECORDS / BATCH_SIZE);
  const startTime = Date.now();

  console.log('\nGenerating data...\n');

  for (let batchNum = 0; batchNum < numBatches; batchNum++) {
    const batchStart = Date.now();
    const recordsInBatch = Math.min(BATCH_SIZE, TARGET_RECORDS - batchNum * BATCH_SIZE);

    // Generate batch of records
    const records = [];
    for (let i = 0; i < recordsInBatch; i++) {
      const deviceId = faker.helpers.arrayElement(DEVICE_IDS);
      const recordedAt = generateTimestamp(TIME_RANGE_DAYS);

      records.push({
        unitId,
        deviceId: null, // We don't have device records, so keep null
        temperature: generateTemperature(),
        humidity: generateHumidity(),
        battery: faker.number.int({ min: 60, max: 100 }),
        signalStrength: faker.number.int({ min: -90, max: -40 }),
        rawPayload: JSON.stringify({
          device_id: deviceId,
          temp: parseFloat(records[records.length]?.temperature || '0'),
          hum: parseFloat(records[records.length]?.humidity || '0'),
        }),
        recordedAt,
        source: 'synthetic-test',
      });
    }

    // Insert batch in transaction
    await db.transaction(async (tx) => {
      await tx.insert(sensorReadings).values(records);
    });

    const batchDuration = Date.now() - batchStart;
    const totalInserted = (batchNum + 1) * BATCH_SIZE;
    const progress = Math.min(100, ((totalInserted / TARGET_RECORDS) * 100));

    console.log(
      `Batch ${batchNum + 1}/${numBatches} inserted ` +
      `(${totalInserted.toLocaleString()} records, ` +
      `${progress.toFixed(1)}%, ` +
      `${batchDuration}ms)`
    );
  }

  const totalDuration = Date.now() - startTime;
  const finalCount = await checkExistingData();

  console.log('\n✓ Generation complete!');
  console.log(`Total time: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`Final row count: ${finalCount.toLocaleString()}`);
  console.log(`Records per second: ${Math.round(TARGET_RECORDS / (totalDuration / 1000))}`);

  process.exit(0);
}

// Run main
main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

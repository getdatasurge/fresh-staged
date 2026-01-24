/**
 * Meter Reporting Processor
 *
 * Processes meter reporting jobs for Stripe Billing Meters:
 * - 'active_sensors': Reports current sensor count (last aggregation)
 * - 'temperature_readings': Reports reading volume (sum aggregation)
 *
 * Jobs are queued by:
 * - reading-ingestion.service.ts (temperature readings)
 * - scheduled sensor count job (active sensors)
 */

import type { Job, Processor } from 'bullmq';
import type { MeterReportJobData } from '../../jobs/index.js';
import { getStripeMeterService } from '../../services/stripe-meter.service.js';

/**
 * Process a meter reporting job
 *
 * @param job - BullMQ job containing MeterReportJobData
 * @throws Error if meter reporting fails (triggers BullMQ retry)
 */
export async function processMeterReport(
  job: Job<MeterReportJobData>
): Promise<void> {
  const { organizationId, eventName, value, timestamp } = job.data;

  console.log(
    `[MeterProcessor] Processing ${eventName} job for org ${organizationId}, value: ${value}`
  );

  const meterService = getStripeMeterService();
  let result: { success: boolean; error?: string };

  switch (eventName) {
    case 'active_sensors':
      if (timestamp) {
        result = await meterService.reportActiveSensorsWithTimestamp(
          organizationId,
          value,
          timestamp
        );
      } else {
        result = await meterService.reportActiveSensors(organizationId, value);
      }
      break;

    case 'temperature_readings':
      result = await meterService.reportReadingVolume(organizationId, value);
      break;

    default:
      throw new Error(`Unknown meter event name: ${eventName}`);
  }

  if (!result.success) {
    // Throw to trigger BullMQ retry
    throw new Error(`Meter reporting failed: ${result.error}`);
  }

  console.log(
    `[MeterProcessor] Successfully reported ${eventName} for org ${organizationId}`
  );
}

/**
 * Create the meter reporting processor function
 *
 * Factory pattern for worker registration.
 *
 * @returns BullMQ Processor for meter reporting jobs
 */
export function createMeterReportingProcessor(): Processor<MeterReportJobData> {
  return processMeterReport;
}

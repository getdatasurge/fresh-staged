/**
 * Sensor Stream Service - Buffered real-time sensor data streaming
 *
 * Buffers incoming sensor readings and broadcasts them in batches to prevent
 * UI thrashing. Readings are batched per unit and flushed every second to
 * organization-scoped rooms.
 *
 * Features:
 * - Server-side buffering of sensor readings
 * - Batched broadcasts every 1 second (configurable)
 * - Per-unit latest reading cache for new client connections
 * - Organization-scoped room isolation
 * - Graceful shutdown with interval cleanup
 *
 * Usage:
 * ```typescript
 * const streamService = new SensorStreamService(socketService);
 *
 * // Add reading from ingestion route
 * streamService.addReading(organizationId, reading);
 *
 * // Get latest for new client connection
 * const latest = streamService.getLatestReading(unitId);
 *
 * // Cleanup on shutdown
 * streamService.stop();
 * ```
 */

import type { SocketService } from './socket.service.js';

/**
 * Sensor reading data structure for real-time streaming
 */
export interface SensorReading {
  id: string;
  unitId: string;
  deviceId: string | null;
  temperature: number;
  humidity: number | null;
  battery: number | null;
  signalStrength: number | null;
  recordedAt: Date;
  source: string;
}

/**
 * Internal buffer key structure: org:unit for reading grouping
 */
type BufferKey = string;

/**
 * SensorStreamService class for buffered real-time sensor data streaming
 *
 * Manages server-side buffering of sensor readings and broadcasts them in
 * batches to connected clients. Prevents UI performance issues by throttling
 * emissions to 1 per second per unit.
 */
export class SensorStreamService {
  private socketService: SocketService;

  // Buffer: Map<"${orgId}:${unitId}", SensorReading[]>
  private buffer: Map<BufferKey, SensorReading[]> = new Map();

  // Latest reading cache: Map<unitId, SensorReading>
  private latestByUnit: Map<string, SensorReading> = new Map();

  // Flush interval in milliseconds (1 second default)
  private flushInterval = 1000;

  // Interval timer reference for cleanup
  private intervalId: NodeJS.Timeout | null = null;

  constructor(socketService: SocketService) {
    this.socketService = socketService;

    // Start flush interval
    this.intervalId = setInterval(() => this.flush(), this.flushInterval);

    console.log('[SensorStreamService] Initialized with flush interval:', this.flushInterval, 'ms');
  }

  /**
   * Add sensor reading to buffer for batched broadcasting
   *
   * Readings are buffered per organization and unit, then flushed periodically
   * to organization rooms via Socket.io.
   *
   * @param organizationId - Organization UUID for room isolation
   * @param reading - Sensor reading to buffer
   */
  addReading(organizationId: string, reading: SensorReading): void {
    const bufferKey: BufferKey = `${organizationId}:${reading.unitId}`;

    // Initialize buffer array if first reading for this key
    if (!this.buffer.has(bufferKey)) {
      this.buffer.set(bufferKey, []);
    }

    // Add reading to buffer
    this.buffer.get(bufferKey)!.push(reading);

    // Update latest reading cache (for new client queries)
    const existingLatest = this.latestByUnit.get(reading.unitId);
    if (
      !existingLatest ||
      reading.recordedAt > existingLatest.recordedAt
    ) {
      this.latestByUnit.set(reading.unitId, reading);
    }
  }

  /**
   * Flush buffered readings to connected clients via Socket.io
   *
   * Called on interval (every flushInterval ms). Emits batched readings to
   * organization rooms and unit-specific rooms for subscribers.
   *
   * After emission, clears buffer for memory efficiency.
   */
  private flush(): void {
    if (this.buffer.size === 0) {
      // No readings to flush
      return;
    }

    let totalReadings = 0;
    const uniqueUnits = new Set<string>();

    // Process each buffered key (org:unit)
    for (const [bufferKey, readings] of this.buffer.entries()) {
      if (readings.length === 0) {
        continue;
      }

      // Parse organizationId and unitId from buffer key
      const [organizationId, unitId] = bufferKey.split(':');

      totalReadings += readings.length;
      uniqueUnits.add(unitId);

      // Prepare batch payload
      const batchPayload = {
        unitId,
        readings: readings.map(r => ({
          id: r.id,
          temperature: r.temperature,
          humidity: r.humidity,
          battery: r.battery,
          signalStrength: r.signalStrength,
          timestamp: r.recordedAt.toISOString(),
        })),
        count: readings.length,
      };

      // Broadcast to organization room (all clients in org)
      this.socketService.emitToOrg(
        organizationId,
        'sensor:readings:batch',
        batchPayload
      );

      // Also broadcast to unit-specific room (for clients subscribed to this unit)
      this.socketService.emitToUnit(
        organizationId,
        unitId,
        'sensor:readings:batch',
        batchPayload
      );

      // Clear buffer for this key
      this.buffer.set(bufferKey, []);
    }

    // Log flush statistics
    console.log(
      `[SensorStreamService] Flushed ${totalReadings} reading(s) for ${uniqueUnits.size} unit(s)`
    );

    // Clean up empty buffers to prevent memory leak
    for (const [key, readings] of this.buffer.entries()) {
      if (readings.length === 0) {
        this.buffer.delete(key);
      }
    }
  }

  /**
   * Get latest cached reading for a unit
   *
   * Used when new clients connect to provide immediate feedback without
   * waiting for next reading.
   *
   * @param unitId - Unit UUID to query
   * @returns Latest sensor reading or undefined if none cached
   */
  getLatestReading(unitId: string): SensorReading | undefined {
    return this.latestByUnit.get(unitId);
  }

  /**
   * Stop the flush interval and cleanup resources
   *
   * Called during graceful shutdown to prevent memory leaks.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[SensorStreamService] Stopped flush interval');
    }
  }

  /**
   * Get current buffer statistics (for monitoring/debugging)
   *
   * @returns Buffer stats object
   */
  getStats(): {
    bufferedReadings: number;
    cachedUnits: number;
    bufferKeys: number;
  } {
    let bufferedReadings = 0;
    for (const readings of this.buffer.values()) {
      bufferedReadings += readings.length;
    }

    return {
      bufferedReadings,
      cachedUnits: this.latestByUnit.size,
      bufferKeys: this.buffer.size,
    };
  }
}

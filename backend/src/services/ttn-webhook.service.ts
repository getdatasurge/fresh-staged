import { timingSafeEqual, createHmac } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { devices, loraSensors } from '../db/schema/devices.js';
import { units, areas, sites } from '../db/schema/hierarchy.js';
import { ttnConnections } from '../db/schema/tenancy.js';
import type {
  TTNUplinkWebhook,
  TTNUplinkMessage,
  DecodedSensorPayload,
} from '../schemas/ttn-webhooks.js';
import type { SingleReading } from '../schemas/readings.js';

/**
 * Result of extracting sensor data from TTN payload
 */
export interface ExtractedSensorData {
  temperature: number;
  humidity?: number;
  battery?: number;
  signalStrength?: number;
  rawPayload?: string;
}

/**
 * Device lookup result with unit and organization context
 */
export interface DeviceLookupResult {
  deviceId: string;
  unitId: string;
  organizationId: string;
  deviceEui: string;
}

/**
 * Webhook signature verification result
 */
export interface SignatureVerificationResult {
  valid: boolean;
  organizationId?: string;
  connectionId?: string;
  error?: string;
}

/**
 * Verify TTN webhook signature using HMAC-SHA256
 *
 * TTN signs webhooks using HMAC-SHA256 with the configured signing key.
 * The signature is sent in the X-Downlink-Apikey header (legacy) or
 * a custom header configured in the webhook settings.
 *
 * @param signature - The signature from the request header
 * @param payload - The raw request body
 * @param secret - The webhook secret to verify against
 * @returns Whether the signature is valid
 */
export function verifyHmacSignature(
  signature: string,
  payload: string | Buffer,
  secret: string,
): boolean {
  try {
    const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');

    // Use constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) {
      return false;
    }

    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Verify webhook request by checking API key against stored secrets
 *
 * This uses the same API key authentication as the readings endpoint,
 * checking the provided key against active TTN connections.
 *
 * @param apiKey - The API key from the request header
 * @returns Verification result with organization context if valid
 */
export async function verifyWebhookApiKey(apiKey: string): Promise<SignatureVerificationResult> {
  if (!apiKey) {
    return { valid: false, error: 'Missing API key' };
  }

  // Query all active TTN connections
  const connections = await db
    .select({
      id: ttnConnections.id,
      organizationId: ttnConnections.organizationId,
      webhookSecret: ttnConnections.webhookSecret,
    })
    .from(ttnConnections)
    .where(eq(ttnConnections.isActive, true));

  // Find matching connection using constant-time comparison
  const matchingConnection = connections.find((conn) => {
    if (conn.webhookSecret.length !== apiKey.length) {
      return false;
    }
    const bufA = Buffer.from(conn.webhookSecret, 'utf8');
    const bufB = Buffer.from(apiKey, 'utf8');
    return timingSafeEqual(bufA, bufB);
  });

  if (!matchingConnection) {
    return { valid: false, error: 'Invalid API key' };
  }

  // Update last used timestamp
  await db
    .update(ttnConnections)
    .set({
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ttnConnections.id, matchingConnection.id));

  return {
    valid: true,
    organizationId: matchingConnection.organizationId,
    connectionId: matchingConnection.id,
  };
}

/**
 * Normalize device EUI for consistent comparison
 *
 * TTN sends EUIs in uppercase without separators (e.g., "AC1F09FFFE01454E")
 * We store them the same way but need to normalize for comparison.
 *
 * @param eui - The device EUI to normalize
 * @returns Normalized EUI (uppercase, no separators)
 */
export function normalizeDeviceEui(eui: string): string {
  return eui.toUpperCase().replace(/[:-]/g, '');
}

/**
 * Look up device by EUI and get associated unit and organization
 *
 * Follows the relationship: loraSensor -> device -> unit -> area -> site -> organization
 *
 * @param devEui - The device EUI from TTN
 * @returns Device lookup result or null if not found
 */
export async function lookupDeviceByEui(devEui: string): Promise<DeviceLookupResult | null> {
  const normalizedEui = normalizeDeviceEui(devEui);

  // Look up device through LoRa sensor table
  const [result] = await db
    .select({
      deviceId: devices.id,
      deviceEui: devices.deviceEui,
      unitId: units.id,
      organizationId: sites.organizationId,
    })
    .from(loraSensors)
    .innerJoin(devices, eq(loraSensors.deviceId, devices.id))
    .innerJoin(units, eq(devices.unitId, units.id))
    .innerJoin(areas, eq(units.areaId, areas.id))
    .innerJoin(sites, eq(areas.siteId, sites.id))
    .where(
      and(
        eq(loraSensors.devEui, normalizedEui),
        eq(devices.isActive, true),
        eq(units.isActive, true),
        eq(areas.isActive, true),
        eq(sites.isActive, true),
      ),
    )
    .limit(1);

  if (!result || !result.unitId) {
    // Try looking up by device.deviceEui directly (for devices without LoRa sensor record)
    const [deviceResult] = await db
      .select({
        deviceId: devices.id,
        deviceEui: devices.deviceEui,
        unitId: units.id,
        organizationId: sites.organizationId,
      })
      .from(devices)
      .innerJoin(units, eq(devices.unitId, units.id))
      .innerJoin(areas, eq(units.areaId, areas.id))
      .innerJoin(sites, eq(areas.siteId, sites.id))
      .where(
        and(
          eq(devices.deviceEui, normalizedEui),
          eq(devices.isActive, true),
          eq(units.isActive, true),
          eq(areas.isActive, true),
          eq(sites.isActive, true),
        ),
      )
      .limit(1);

    if (!deviceResult || !deviceResult.unitId) {
      return null;
    }

    return {
      deviceId: deviceResult.deviceId,
      unitId: deviceResult.unitId,
      organizationId: deviceResult.organizationId,
      deviceEui: deviceResult.deviceEui,
    };
  }

  return {
    deviceId: result.deviceId,
    unitId: result.unitId,
    organizationId: result.organizationId,
    deviceEui: result.deviceEui,
  };
}

/**
 * Extract the best signal strength from gateway metadata
 *
 * If multiple gateways received the message, use the strongest signal.
 *
 * @param rxMetadata - Array of gateway receiver metadata
 * @returns Best RSSI value or undefined
 */
export function extractBestSignalStrength(
  rxMetadata?: Array<{ rssi?: number; channel_rssi?: number }>,
): number | undefined {
  if (!rxMetadata || rxMetadata.length === 0) {
    return undefined;
  }

  const rssiValues = rxMetadata
    .map((m) => m.channel_rssi ?? m.rssi)
    .filter((rssi): rssi is number => rssi !== undefined);

  if (rssiValues.length === 0) {
    return undefined;
  }

  // Return the strongest signal (highest RSSI, which is least negative)
  return Math.max(...rssiValues);
}

/**
 * Extract temperature from decoded payload
 *
 * Supports multiple field names used by different sensor manufacturers.
 * Returns temperature in Celsius.
 *
 * @param decoded - The decoded payload from TTN
 * @returns Temperature in Celsius or undefined
 */
export function extractTemperature(decoded: DecodedSensorPayload): number | undefined {
  // Try common temperature field names
  if (typeof decoded.temperature === 'number') {
    return decoded.temperature;
  }
  if (typeof decoded.temp === 'number') {
    return decoded.temp;
  }
  if (typeof decoded.temperature_c === 'number') {
    return decoded.temperature_c;
  }
  // Convert Fahrenheit if that's what we have
  if (typeof decoded.temperature_f === 'number') {
    return (decoded.temperature_f - 32) * (5 / 9);
  }

  return undefined;
}

/**
 * Extract humidity from decoded payload
 *
 * @param decoded - The decoded payload from TTN
 * @returns Relative humidity percentage or undefined
 */
export function extractHumidity(decoded: DecodedSensorPayload): number | undefined {
  if (typeof decoded.humidity === 'number') {
    return decoded.humidity;
  }
  if (typeof decoded.relative_humidity === 'number') {
    return decoded.relative_humidity;
  }
  if (typeof decoded.rh === 'number') {
    return decoded.rh;
  }

  return undefined;
}

/**
 * Extract battery level from decoded payload
 *
 * Converts voltage to percentage if needed (assumes 3.0V = 0%, 4.2V = 100% for LiPo).
 *
 * @param decoded - The decoded payload from TTN
 * @returns Battery percentage (0-100) or undefined
 */
export function extractBattery(decoded: DecodedSensorPayload): number | undefined {
  // Direct percentage
  if (typeof decoded.battery === 'number') {
    // If it's already a percentage (0-100)
    if (decoded.battery >= 0 && decoded.battery <= 100) {
      return Math.round(decoded.battery);
    }
  }
  if (typeof decoded.battery_level === 'number') {
    return Math.round(decoded.battery_level);
  }
  if (typeof decoded.batt === 'number' && decoded.batt >= 0 && decoded.batt <= 100) {
    return Math.round(decoded.batt);
  }

  // Convert voltage to percentage (LiPo battery: 3.0V = 0%, 4.2V = 100%)
  if (typeof decoded.battery_voltage === 'number') {
    const voltage = decoded.battery_voltage;
    // Handle millivolts vs volts
    const v = voltage > 10 ? voltage / 1000 : voltage;
    const percentage = ((v - 3.0) / (4.2 - 3.0)) * 100;
    return Math.round(Math.max(0, Math.min(100, percentage)));
  }

  return undefined;
}

/**
 * Extract sensor data from TTN uplink message
 *
 * Processes the decoded_payload (from TTN payload formatter) or raw frm_payload.
 * Extracts temperature, humidity, battery, and signal strength.
 *
 * @param uplinkMessage - The uplink message from TTN webhook
 * @returns Extracted sensor data
 * @throws Error if temperature cannot be extracted
 */
export function extractSensorData(uplinkMessage: TTNUplinkMessage): ExtractedSensorData {
  const decoded = uplinkMessage.decoded_payload as DecodedSensorPayload | undefined;

  if (!decoded) {
    throw new Error(
      'No decoded_payload in uplink message. Ensure a payload formatter is configured in TTN.',
    );
  }

  const temperature = extractTemperature(decoded);

  if (temperature === undefined) {
    throw new Error(
      'Could not extract temperature from decoded_payload. ' +
        'Expected field: temperature, temp, temperature_c, or temperature_f',
    );
  }

  return {
    temperature,
    humidity: extractHumidity(decoded),
    battery: extractBattery(decoded),
    signalStrength: extractBestSignalStrength(uplinkMessage.rx_metadata),
    rawPayload: uplinkMessage.frm_payload,
  };
}

/**
 * Update device metadata after receiving an uplink
 *
 * Updates lastSeenAt, battery, and signal strength on the device record.
 *
 * @param deviceId - The device ID to update
 * @param data - Extracted sensor data with battery and signal
 */
export async function updateDeviceMetadata(
  deviceId: string,
  data: ExtractedSensorData,
): Promise<void> {
  await db
    .update(devices)
    .set({
      lastSeenAt: new Date(),
      battery: data.battery,
      signalStrength: data.signalStrength,
      updatedAt: new Date(),
    })
    .where(eq(devices.id, deviceId));
}

/**
 * Convert TTN uplink to SingleReading format for ingestion
 *
 * @param webhook - The TTN webhook payload
 * @param deviceLookup - Device lookup result with unit context
 * @param sensorData - Extracted sensor data
 * @returns SingleReading ready for ingestion
 */
export function convertToReading(
  webhook: TTNUplinkWebhook,
  deviceLookup: DeviceLookupResult,
  sensorData: ExtractedSensorData,
): SingleReading {
  // Use the uplink_message.received_at timestamp as recordedAt
  // This is when TTN received the message from the gateway
  const recordedAt = webhook.uplink_message.received_at;

  return {
    unitId: deviceLookup.unitId,
    deviceId: deviceLookup.deviceId,
    temperature: sensorData.temperature,
    humidity: sensorData.humidity,
    battery: sensorData.battery,
    signalStrength: sensorData.signalStrength,
    recordedAt,
    source: 'ttn',
    rawPayload: sensorData.rawPayload,
  };
}

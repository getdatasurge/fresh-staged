/**
 * TTN Device Management Service
 *
 * Handles TTN device CRUD operations with local database synchronization.
 * Manages the relationship between local devices/loraSensors and TTN.
 */

import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { devices, loraSensors, type Device } from '../db/schema/devices.js';
import { sites } from '../db/schema/hierarchy.js';
import { ttnConnections, type TtnConnection } from '../db/schema/tenancy.js';
import type {
  BootstrapTTNDeviceRequest,
  ProvisionTTNDeviceRequest,
  UpdateTTNDeviceRequest,
} from '../schemas/ttn-devices.js';
import { logger } from '../utils/logger.js';
import { createTTNClient, TTNApiError, type TTNConfig, type TTNDevice } from './ttn.service.js';

const log = logger.child({ service: 'ttn-device' });

// Combined device response for API
export interface TTNDeviceWithLora {
  id: string;
  deviceId: string;
  devEui: string;
  joinEui: string | null;
  name: string | null;
  description: string | null;
  unitId: string | null;
  status: 'active' | 'inactive' | 'pairing' | 'error';
  lastSeenAt: Date | null;
  ttnSynced: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Bootstrap response includes credentials for device configuration
export interface BootstrapDeviceResponse {
  id: string;
  deviceId: string;
  devEui: string;
  joinEui: string;
  appKey: string;
  name: string;
  description: string | null;
  unitId: string | null;
  siteId: string | null;
  status: 'active' | 'inactive' | 'pairing' | 'error';
  ttnSynced: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate a cryptographically secure random hex string
 */
function generateHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex').toUpperCase();
}

/**
 * Generate a TTN-compatible device ID from a name
 * Device IDs must be lowercase alphanumeric with hyphens, 3-36 chars
 */
function generateDeviceId(name: string): string {
  // Convert to lowercase, replace spaces and underscores with hyphens
  let deviceId = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Ensure minimum length of 3
  if (deviceId.length < 3) {
    deviceId = deviceId + '-' + generateHex(2).toLowerCase();
  }

  // Truncate to max 36 chars
  if (deviceId.length > 36) {
    deviceId = deviceId.substring(0, 36);
  }

  // Ensure it doesn't end with a hyphen after truncation
  deviceId = deviceId.replace(/-$/, '');

  // Add random suffix to ensure uniqueness
  const suffix = '-' + generateHex(3).toLowerCase();
  if (deviceId.length + suffix.length <= 36) {
    deviceId = deviceId + suffix;
  } else {
    deviceId = deviceId.substring(0, 36 - suffix.length) + suffix;
    deviceId = deviceId.replace(/--+/g, '-');
  }

  return deviceId;
}

/**
 * Get TTN connection for an organization
 */
export async function getTTNConnection(organizationId: string): Promise<TtnConnection | null> {
  const [connection] = await db
    .select()
    .from(ttnConnections)
    .where(
      and(eq(ttnConnections.organizationId, organizationId), eq(ttnConnections.isActive, true)),
    )
    .limit(1);

  return connection ?? null;
}

/**
 * Get TTN client configuration for an organization
 */
async function getTTNConfigForOrg(organizationId: string): Promise<TTNConfig | null> {
  const connection = await getTTNConnection(organizationId);
  if (!connection || !connection.applicationId) {
    return null;
  }

  const apiUrl = process.env.TTN_API_URL;
  if (!apiUrl) {
    return null;
  }

  return {
    apiUrl,
    applicationId: connection.applicationId,
    apiKey: connection.webhookSecret, // Using webhook secret as API key
  };
}

/**
 * List all TTN devices for an organization
 */
export async function listTTNDevices(organizationId: string): Promise<TTNDeviceWithLora[]> {
  // Get all devices that have LoRa sensor configuration
  const results = await db
    .select({
      device: devices,
      loraSensor: loraSensors,
    })
    .from(devices)
    .innerJoin(loraSensors, eq(devices.id, loraSensors.deviceId))
    .where(eq(devices.isActive, true));

  // We need to filter by organization through the TTN connection's network server ID
  const connection = await getTTNConnection(organizationId);
  if (!connection) {
    return [];
  }

  // Filter devices that belong to this organization's TTN application
  const orgDevices = results.filter(
    (r) => r.loraSensor.networkServerId === connection.applicationId,
  );

  return orgDevices.map((r) => ({
    id: r.device.id,
    deviceId: r.loraSensor.devEui
      .toLowerCase()
      .replace(/(.{2})/g, '$1-')
      .slice(0, -1), // Format as TTN device ID
    devEui: r.loraSensor.devEui,
    joinEui: r.loraSensor.joinEui,
    name: r.device.name,
    description: null, // Description stored in device name for now
    unitId: r.device.unitId,
    status: r.device.status,
    lastSeenAt: r.device.lastSeenAt,
    ttnSynced: true, // Assume synced since we store after successful TTN operation
    createdAt: r.device.createdAt,
    updatedAt: r.device.updatedAt,
  }));
}

/**
 * Get a specific TTN device by ID
 */
export async function getTTNDevice(
  deviceId: string,
  organizationId: string,
): Promise<TTNDeviceWithLora | null> {
  const connection = await getTTNConnection(organizationId);
  if (!connection || !connection.applicationId) {
    return null;
  }

  // Try to find by device.id (UUID) first
  let result = await db
    .select({
      device: devices,
      loraSensor: loraSensors,
    })
    .from(devices)
    .innerJoin(loraSensors, eq(devices.id, loraSensors.deviceId))
    .where(
      and(
        eq(devices.id, deviceId),
        eq(devices.isActive, true),
        eq(loraSensors.networkServerId, connection.applicationId),
      ),
    )
    .limit(1);

  // If not found by UUID, try by devEui
  if (result.length === 0) {
    result = await db
      .select({
        device: devices,
        loraSensor: loraSensors,
      })
      .from(devices)
      .innerJoin(loraSensors, eq(devices.id, loraSensors.deviceId))
      .where(
        and(
          eq(loraSensors.devEui, deviceId.toUpperCase()),
          eq(devices.isActive, true),
          eq(loraSensors.networkServerId, connection.applicationId),
        ),
      )
      .limit(1);
  }

  if (result.length === 0) {
    return null;
  }

  const r = result[0];
  return {
    id: r.device.id,
    deviceId: r.loraSensor.devEui
      .toLowerCase()
      .replace(/(.{2})/g, '$1-')
      .slice(0, -1),
    devEui: r.loraSensor.devEui,
    joinEui: r.loraSensor.joinEui,
    name: r.device.name,
    description: null,
    unitId: r.device.unitId,
    status: r.device.status,
    lastSeenAt: r.device.lastSeenAt,
    ttnSynced: true,
    createdAt: r.device.createdAt,
    updatedAt: r.device.updatedAt,
  };
}

/**
 * Get device linked to a specific unit
 */
export async function getByUnit(
  unitId: string,
  organizationId: string,
): Promise<TTNDeviceWithLora | null> {
  const connection = await getTTNConnection(organizationId);
  if (!connection || !connection.applicationId) {
    return null;
  }

  const result = await db
    .select({
      device: devices,
      loraSensor: loraSensors,
    })
    .from(devices)
    .innerJoin(loraSensors, eq(devices.id, loraSensors.deviceId))
    .where(
      and(
        eq(devices.unitId, unitId),
        eq(devices.isActive, true),
        eq(loraSensors.networkServerId, connection.applicationId),
      ),
    )
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const r = result[0];
  return {
    id: r.device.id,
    deviceId: r.loraSensor.devEui
      .toLowerCase()
      .replace(/(.{2})/g, '$1-')
      .slice(0, -1),
    devEui: r.loraSensor.devEui,
    joinEui: r.loraSensor.joinEui,
    name: r.device.name,
    description: null,
    unitId: r.device.unitId,
    status: r.device.status,
    lastSeenAt: r.device.lastSeenAt,
    ttnSynced: true,
    createdAt: r.device.createdAt,
    updatedAt: r.device.updatedAt,
  };
}

/**
 * Provision a new device in TTN and local database
 */
export async function provisionTTNDevice(
  organizationId: string,
  data: ProvisionTTNDeviceRequest,
): Promise<TTNDeviceWithLora> {
  const ttnConfig = await getTTNConfigForOrg(organizationId);
  if (!ttnConfig) {
    throw new TTNConfigError('TTN connection not configured for organization');
  }

  const client = createTTNClient(ttnConfig);

  // Provision in TTN first
  let _ttnDevice: TTNDevice;
  try {
    _ttnDevice = await client.provisionDevice({
      deviceId: data.deviceId,
      devEui: data.devEui,
      joinEui: data.joinEui,
      appKey: data.appKey,
      name: data.name,
      description: data.description,
      frequencyPlanId: data.frequencyPlanId,
      lorawanVersion: data.lorawanVersion,
      lorawanPhyVersion: data.lorawanPhyVersion,
    });
  } catch (error) {
    if (error instanceof TTNApiError) {
      throw new TTNProvisioningError(`Failed to provision device in TTN: ${error.message}`);
    }
    throw error;
  }

  // Create local device record
  const [device] = await db
    .insert(devices)
    .values({
      deviceEui: data.devEui.toUpperCase(),
      name: data.name || data.deviceId,
      deviceType: 'lora',
      status: 'inactive', // Will become active on first uplink
      unitId: data.unitId || null,
    })
    .returning();

  // Create LoRa sensor configuration
  await db.insert(loraSensors).values({
    deviceId: device.id,
    devEui: data.devEui.toUpperCase(),
    appEui: data.joinEui.toUpperCase(),
    joinEui: data.joinEui.toUpperCase(),
    appKey: data.appKey.toUpperCase(), // Store encrypted in production
    networkServerId: ttnConfig.applicationId,
    activationType: 'OTAA',
  });

  return {
    id: device.id,
    deviceId: data.deviceId,
    devEui: data.devEui.toUpperCase(),
    joinEui: data.joinEui.toUpperCase(),
    name: device.name,
    description: data.description || null,
    unitId: device.unitId,
    status: device.status,
    lastSeenAt: device.lastSeenAt,
    ttnSynced: true,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  };
}

/**
 * Update a TTN device
 */
export async function updateTTNDevice(
  deviceId: string,
  organizationId: string,
  data: UpdateTTNDeviceRequest,
): Promise<TTNDeviceWithLora | null> {
  const connection = await getTTNConnection(organizationId);
  if (!connection || !connection.applicationId) {
    return null;
  }

  // Find the device
  const [existingDevice] = await db
    .select({
      device: devices,
      loraSensor: loraSensors,
    })
    .from(devices)
    .innerJoin(loraSensors, eq(devices.id, loraSensors.deviceId))
    .where(
      and(
        eq(devices.id, deviceId),
        eq(devices.isActive, true),
        eq(loraSensors.networkServerId, connection.applicationId),
      ),
    )
    .limit(1);

  if (!existingDevice) {
    return null;
  }

  // Update TTN if name or description changed
  if (data.name !== undefined) {
    const ttnConfig = await getTTNConfigForOrg(organizationId);
    if (ttnConfig) {
      const client = createTTNClient(ttnConfig);
      const ttnDeviceId = existingDevice.loraSensor.devEui
        .toLowerCase()
        .replace(/(.{2})/g, '$1-')
        .slice(0, -1);
      try {
        await client.updateDevice(ttnDeviceId, {
          name: data.name,
        });
      } catch (error) {
        // Log but don't fail - local update can still proceed
        log.error({ err: error }, 'Failed to update device in TTN');
      }
    }
  }

  // Update local device
  const updateData: Partial<Device> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) {
    updateData.name = data.name;
  }
  if (data.status !== undefined) {
    updateData.status = data.status;
  }
  if (data.unitId !== undefined) {
    updateData.unitId = data.unitId;
  }

  const [updatedDevice] = await db
    .update(devices)
    .set(updateData)
    .where(eq(devices.id, deviceId))
    .returning();

  return {
    id: updatedDevice.id,
    deviceId: existingDevice.loraSensor.devEui
      .toLowerCase()
      .replace(/(.{2})/g, '$1-')
      .slice(0, -1),
    devEui: existingDevice.loraSensor.devEui,
    joinEui: existingDevice.loraSensor.joinEui,
    name: updatedDevice.name,
    description: null,
    unitId: updatedDevice.unitId,
    status: updatedDevice.status,
    lastSeenAt: updatedDevice.lastSeenAt,
    ttnSynced: true,
    createdAt: updatedDevice.createdAt,
    updatedAt: updatedDevice.updatedAt,
  };
}

/**
 * Deprovision (delete) a device from TTN and local database
 */
export async function deprovisionTTNDevice(
  deviceId: string,
  organizationId: string,
): Promise<boolean> {
  const connection = await getTTNConnection(organizationId);
  if (!connection || !connection.applicationId) {
    return false;
  }

  // Find the device
  const [existingDevice] = await db
    .select({
      device: devices,
      loraSensor: loraSensors,
    })
    .from(devices)
    .innerJoin(loraSensors, eq(devices.id, loraSensors.deviceId))
    .where(
      and(
        eq(devices.id, deviceId),
        eq(devices.isActive, true),
        eq(loraSensors.networkServerId, connection.applicationId),
      ),
    )
    .limit(1);

  if (!existingDevice) {
    return false;
  }

  // Delete from TTN
  const ttnConfig = await getTTNConfigForOrg(organizationId);
  if (ttnConfig) {
    const client = createTTNClient(ttnConfig);
    const ttnDeviceId = existingDevice.loraSensor.devEui
      .toLowerCase()
      .replace(/(.{2})/g, '$1-')
      .slice(0, -1);
    try {
      await client.deprovisionDevice(ttnDeviceId);
    } catch (error) {
      if (!(error instanceof TTNApiError && error.statusCode === 404)) {
        log.error({ err: error }, 'Failed to deprovision device from TTN');
        // Continue with local deletion anyway
      }
    }
  }

  // Soft delete local device (cascade will handle loraSensor)
  await db
    .update(devices)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(devices.id, deviceId));

  return true;
}

/**
 * Restore a soft-deleted device (sets isActive = true)
 */
export async function restoreTTNDevice(
  deviceId: string,
  organizationId: string,
): Promise<TTNDeviceWithLora | null> {
  const connection = await getTTNConnection(organizationId);
  if (!connection || !connection.applicationId) {
    return null;
  }

  // Find the device
  const [existingDevice] = await db
    .select({
      device: devices,
      loraSensor: loraSensors,
    })
    .from(devices)
    .innerJoin(loraSensors, eq(devices.id, loraSensors.deviceId))
    .where(
      and(
        eq(devices.id, deviceId),
        eq(devices.isActive, false),
        eq(loraSensors.networkServerId, connection.applicationId),
      ),
    )
    .limit(1);

  if (!existingDevice) {
    return null;
  }

  // Restore device
  const [updatedDevice] = await db
    .update(devices)
    .set({
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(devices.id, deviceId))
    .returning();

  return {
    id: updatedDevice.id,
    deviceId: existingDevice.loraSensor.devEui
      .toLowerCase()
      .replace(/(.{2})/g, '$1-')
      .slice(0, -1),
    devEui: existingDevice.loraSensor.devEui,
    joinEui: existingDevice.loraSensor.joinEui,
    name: updatedDevice.name,
    description: null,
    unitId: updatedDevice.unitId,
    status: updatedDevice.status,
    lastSeenAt: updatedDevice.lastSeenAt,
    ttnSynced: true,
    createdAt: updatedDevice.createdAt,
    updatedAt: updatedDevice.updatedAt,
  };
}

/**
 * Permanently delete a device
 */
export async function permanentlyDeleteTTNDevice(
  deviceId: string,
  organizationId: string,
): Promise<boolean> {
  const connection = await getTTNConnection(organizationId);
  if (!connection || !connection.applicationId) {
    return false;
  }

  // Find the device
  const [existingDevice] = await db
    .select({
      device: devices,
      loraSensor: loraSensors,
    })
    .from(devices)
    .innerJoin(loraSensors, eq(devices.id, loraSensors.deviceId))
    .where(and(eq(devices.id, deviceId), eq(loraSensors.networkServerId, connection.applicationId)))
    .limit(1);

  if (!existingDevice) {
    return false;
  }

  // Delete from TTN
  const ttnConfig = await getTTNConfigForOrg(organizationId);
  if (ttnConfig) {
    const client = createTTNClient(ttnConfig);
    const ttnDeviceId = existingDevice.loraSensor.devEui
      .toLowerCase()
      .replace(/(.{2})/g, '$1-')
      .slice(0, -1);
    try {
      await client.deprovisionDevice(ttnDeviceId);
    } catch (error) {
      if (!(error instanceof TTNApiError && error.statusCode === 404)) {
        log.error({ err: error }, 'Failed to deprovision device from TTN');
        // Continue with local deletion anyway
      }
    }
  }

  // Permanently delete local device (cascade will handle loraSensor)
  await db.delete(devices).where(eq(devices.id, deviceId));

  return true;
}

/**
 * Bootstrap a new device with auto-generated credentials
 *
 * This function:
 * 1. Generates DevEUI, JoinEUI, and AppKey
 * 2. Creates the device in TTN
 * 3. Stores the device in the local database
 * 4. Returns all credentials for device configuration
 */
export async function bootstrapTTNDevice(
  organizationId: string,
  data: BootstrapTTNDeviceRequest,
): Promise<BootstrapDeviceResponse> {
  const ttnConfig = await getTTNConfigForOrg(organizationId);
  if (!ttnConfig) {
    throw new TTNConfigError('TTN connection not configured for organization');
  }

  // Validate site belongs to organization if provided
  let validatedSiteId: string | null = null;
  if (data.siteId) {
    const [site] = await db
      .select()
      .from(sites)
      .where(
        and(
          eq(sites.id, data.siteId),
          eq(sites.organizationId, organizationId),
          eq(sites.isActive, true),
        ),
      )
      .limit(1);

    if (!site) {
      throw new TTNProvisioningError('Site not found or does not belong to organization');
    }
    validatedSiteId = site.id;
  }

  // Generate credentials
  const devEui = generateHex(8); // 16 hex chars (8 bytes)
  const joinEui = generateHex(8); // 16 hex chars (8 bytes)
  const appKey = generateHex(16); // 32 hex chars (16 bytes)

  // Generate or use provided device ID
  const deviceId = data.deviceId || generateDeviceId(data.name);

  const client = createTTNClient(ttnConfig);

  // Provision in TTN first
  try {
    await client.provisionDevice({
      deviceId,
      devEui,
      joinEui,
      appKey,
      name: data.name,
      description: data.description,
      frequencyPlanId: data.frequencyPlanId,
      lorawanVersion: data.lorawanVersion,
      lorawanPhyVersion: data.lorawanPhyVersion,
    });
  } catch (error) {
    if (error instanceof TTNApiError) {
      throw new TTNProvisioningError(`Failed to provision device in TTN: ${error.message}`);
    }
    throw error;
  }

  // Create local device record
  const [device] = await db
    .insert(devices)
    .values({
      deviceEui: devEui,
      name: data.name,
      deviceType: 'lora',
      status: 'inactive', // Will become active on first uplink
      unitId: data.unitId || null,
    })
    .returning();

  // Create LoRa sensor configuration
  await db.insert(loraSensors).values({
    deviceId: device.id,
    devEui,
    appEui: joinEui,
    joinEui,
    appKey, // Store encrypted in production
    networkServerId: ttnConfig.applicationId,
    activationType: 'OTAA',
  });

  return {
    id: device.id,
    deviceId,
    devEui,
    joinEui,
    appKey,
    name: device.name!,
    description: data.description || null,
    unitId: device.unitId,
    siteId: validatedSiteId,
    status: device.status,
    ttnSynced: true,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  };
}

/**
 * Custom error for TTN configuration issues
 */
export class TTNConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TTNConfigError';
  }
}

/**
 * Custom error for TTN provisioning failures
 */
export class TTNProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TTNProvisioningError';
  }
}

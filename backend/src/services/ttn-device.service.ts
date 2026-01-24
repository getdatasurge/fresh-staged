/**
 * TTN Device Management Service
 *
 * Handles TTN device CRUD operations with local database synchronization.
 * Manages the relationship between local devices/loraSensors and TTN.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  devices,
  loraSensors,
  type Device,
  type LoraSensor,
} from '../db/schema/devices.js';
import { ttnConnections, type TtnConnection } from '../db/schema/tenancy.js';
import {
  createTTNClient,
  TTNApiError,
  type TTNDevice,
  type TTNConfig,
} from './ttn.service.js';
import type { ProvisionTTNDeviceRequest, UpdateTTNDeviceRequest } from '../schemas/ttn-devices.js';

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

/**
 * Get TTN connection for an organization
 */
export async function getTTNConnection(organizationId: string): Promise<TtnConnection | null> {
  const [connection] = await db
    .select()
    .from(ttnConnections)
    .where(
      and(
        eq(ttnConnections.organizationId, organizationId),
        eq(ttnConnections.isActive, true)
      )
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
    (r) => r.loraSensor.networkServerId === connection.applicationId
  );

  return orgDevices.map((r) => ({
    id: r.device.id,
    deviceId: r.loraSensor.devEui.toLowerCase().replace(/(.{2})/g, '$1-').slice(0, -1), // Format as TTN device ID
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
  organizationId: string
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
        eq(loraSensors.networkServerId, connection.applicationId)
      )
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
          eq(loraSensors.networkServerId, connection.applicationId)
        )
      )
      .limit(1);
  }

  if (result.length === 0) {
    return null;
  }

  const r = result[0];
  return {
    id: r.device.id,
    deviceId: r.loraSensor.devEui.toLowerCase().replace(/(.{2})/g, '$1-').slice(0, -1),
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
  data: ProvisionTTNDeviceRequest
): Promise<TTNDeviceWithLora> {
  const ttnConfig = await getTTNConfigForOrg(organizationId);
  if (!ttnConfig) {
    throw new TTNConfigError('TTN connection not configured for organization');
  }

  const client = createTTNClient(ttnConfig);

  // Provision in TTN first
  let ttnDevice: TTNDevice;
  try {
    ttnDevice = await client.provisionDevice({
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
  data: UpdateTTNDeviceRequest
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
        eq(loraSensors.networkServerId, connection.applicationId)
      )
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
        console.error('Failed to update device in TTN:', error);
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
    deviceId: existingDevice.loraSensor.devEui.toLowerCase().replace(/(.{2})/g, '$1-').slice(0, -1),
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
  organizationId: string
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
        eq(loraSensors.networkServerId, connection.applicationId)
      )
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
        console.error('Failed to deprovision device from TTN:', error);
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

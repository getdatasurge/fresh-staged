import { z } from 'zod';

// --- TTN v3 Uplink Message Webhook Schemas ---

// Gateway IDs in rx_metadata
export const TTNGatewayIdsSchema = z.object({
  gateway_id: z.string(),
  eui: z.string().optional(),
});

// Receiver metadata from gateways
export const TTNRxMetadataSchema = z.object({
  gateway_ids: TTNGatewayIdsSchema,
  time: z.string().optional(),
  timestamp: z.number().optional(),
  rssi: z.number().optional(),
  channel_rssi: z.number().optional(),
  snr: z.number().optional(),
  channel_index: z.number().optional(),
  uplink_token: z.string().optional(),
});

// LoRa data rate settings
export const TTNLoRaSettingsSchema = z.object({
  bandwidth: z.number().optional(),
  spreading_factor: z.number().optional(),
  coding_rate: z.string().optional(),
});

// Data rate settings
export const TTNDataRateSchema = z.object({
  lora: TTNLoRaSettingsSchema.optional(),
});

// Radio settings
export const TTNSettingsSchema = z.object({
  data_rate: TTNDataRateSchema.optional(),
  frequency: z.string().optional(),
  timestamp: z.number().optional(),
  time: z.string().optional(),
});

// Uplink message content
export const TTNUplinkMessageSchema = z.object({
  f_port: z.number(),
  f_cnt: z.number().optional(),
  frm_payload: z.string().optional(), // Base64-encoded raw payload
  decoded_payload: z.record(z.string(), z.unknown()).optional(), // Decoded payload from payload formatter
  rx_metadata: z.array(TTNRxMetadataSchema).optional(),
  settings: TTNSettingsSchema.optional(),
  received_at: z.string(), // ISO 8601 timestamp
  consumed_airtime: z.string().optional(),
  network_ids: z.object({
    net_id: z.string().optional(),
    tenant_id: z.string().optional(),
    cluster_id: z.string().optional(),
  }).optional(),
});

// Application IDs
export const TTNApplicationIdsSchema = z.object({
  application_id: z.string(),
});

// End device identifiers
export const TTNEndDeviceIdsSchema = z.object({
  device_id: z.string(),
  application_ids: TTNApplicationIdsSchema,
  dev_eui: z.string().optional(),
  join_eui: z.string().optional(),
  dev_addr: z.string().optional(),
});

// Full TTN uplink webhook payload
export const TTNUplinkWebhookSchema = z.object({
  end_device_ids: TTNEndDeviceIdsSchema,
  correlation_ids: z.array(z.string()).optional(),
  received_at: z.string(), // ISO 8601 timestamp
  uplink_message: TTNUplinkMessageSchema,
  simulated: z.boolean().optional(),
});

// --- Decoded Payload Schemas ---

// Standard temperature sensor decoded payload
// Supports common formats from different sensor manufacturers
export const DecodedSensorPayloadSchema = z.object({
  // Temperature - can be named various ways
  temperature: z.number().optional(),
  temp: z.number().optional(),
  temperature_c: z.number().optional(),
  temperature_f: z.number().optional(),

  // Humidity - can be named various ways
  humidity: z.number().optional(),
  relative_humidity: z.number().optional(),
  rh: z.number().optional(),

  // Battery - can be percentage or voltage
  battery: z.number().optional(),
  battery_level: z.number().optional(),
  battery_voltage: z.number().optional(),
  batt: z.number().optional(),

  // Signal/SNR from device if reported
  signal: z.number().optional(),
  rssi: z.number().optional(),
  snr: z.number().optional(),
}).passthrough(); // Allow additional fields

// --- Response Schemas ---

export const TTNWebhookResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  readingId: z.string().uuid().optional(),
  alertsTriggered: z.number().int().optional(),
});

// --- Type Exports ---

export type TTNGatewayIds = z.infer<typeof TTNGatewayIdsSchema>;
export type TTNRxMetadata = z.infer<typeof TTNRxMetadataSchema>;
export type TTNUplinkMessage = z.infer<typeof TTNUplinkMessageSchema>;
export type TTNEndDeviceIds = z.infer<typeof TTNEndDeviceIdsSchema>;
export type TTNUplinkWebhook = z.infer<typeof TTNUplinkWebhookSchema>;
export type DecodedSensorPayload = z.infer<typeof DecodedSensorPayloadSchema>;
export type TTNWebhookResponse = z.infer<typeof TTNWebhookResponseSchema>;

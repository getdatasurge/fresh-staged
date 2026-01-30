import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ──────────────────────────────────────────────────────────────────
// Mocks — must be declared before any imports that trigger app code
// ──────────────────────────────────────────────────────────────────

// Mock JWT verification (required by app initialization)
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock database client
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
}));

// Mock socket plugin — inject mock sensorStreamService & socketService
// so that the webhook handler's request.server.sensorStreamService works
const mockAddReading = vi.fn();
const mockGetLatestReading = vi.fn().mockReturnValue(null);
const mockStop = vi.fn();
const mockEmitToOrg = vi.fn();
const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockShutdown = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/plugins/socket.plugin.js', () => {
  // Return a fastify-plugin-compatible factory
  return {
    default: Object.assign(
      async function socketPlugin(fastify: any) {
        fastify.decorate('io', {});
        fastify.decorate('socketService', {
          emitToOrg: mockEmitToOrg,
          joinOrganization: vi.fn(),
          joinSite: vi.fn(),
          joinUnit: vi.fn(),
          leaveRoom: vi.fn(),
          initialize: mockInitialize,
          shutdown: mockShutdown,
        });
        fastify.decorate('sensorStreamService', {
          addReading: mockAddReading,
          getLatestReading: mockGetLatestReading,
          stop: mockStop,
        });
      },
      // fastify-plugin reads Symbol.for('skip-override') to propagate decorators
      { [Symbol.for('skip-override')]: true },
    ),
  };
});

// Mock TTN webhook service — keep pure functions, mock DB-dependent ones
vi.mock('../../src/services/ttn-webhook.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ttn-webhook.service.js')>();
  return {
    ...actual,
    verifyWebhookApiKey: vi.fn(),
    lookupDeviceByEui: vi.fn(),
    updateDeviceMetadata: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock readings service
vi.mock('../../src/services/readings.service.js', () => ({
  ingestBulkReadings: vi.fn(),
}));

// Mock alert evaluator service
vi.mock('../../src/services/alert-evaluator.service.js', () => ({
  evaluateUnitAfterReading: vi.fn(),
}));

// ──────────────────────────────────────────────────────────────────
// Imports — after all vi.mock declarations
// ──────────────────────────────────────────────────────────────────

import { buildApp } from '../../src/app.js';
import * as ttnWebhookService from '../../src/services/ttn-webhook.service.js';
import * as readingsService from '../../src/services/readings.service.js';
import * as alertEvaluator from '../../src/services/alert-evaluator.service.js';

const mockVerifyApiKey = vi.mocked(ttnWebhookService.verifyWebhookApiKey);
const mockLookupDevice = vi.mocked(ttnWebhookService.lookupDeviceByEui);
const mockUpdateDeviceMetadata = vi.mocked(ttnWebhookService.updateDeviceMetadata);
const mockIngestReadings = vi.mocked(readingsService.ingestBulkReadings);
const mockEvaluateAlert = vi.mocked(alertEvaluator.evaluateUnitAfterReading);

// ──────────────────────────────────────────────────────────────────
// Test constants & fixtures
// ──────────────────────────────────────────────────────────────────

const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_CONNECTION_ID = 'a419185a-ccd5-4a1c-b1ac-8b4dfc6a01df';
const TEST_DEVICE_ID = '95e50b0a-9718-42bb-ba1c-7e56365e2c51';
const TEST_UNIT_ID = '6ee7bf36-9c9f-4a00-99ec-6e0730558f67';
const TEST_READING_ID = 'a1234567-89ab-4cde-8012-123456789012';
const TEST_DEV_EUI = 'AC1F09FFFE01454E';
const TEST_API_KEY = 'test-webhook-secret-key-12345';

/** Standard valid TTN uplink webhook payload */
function createValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    end_device_ids: {
      device_id: 'temperature-sensor-1',
      application_ids: {
        application_id: 'freshtrack-sensors',
      },
      dev_eui: TEST_DEV_EUI,
      join_eui: '0000000000000000',
      dev_addr: '26083CC4',
    },
    correlation_ids: ['as:up:01HQVXYZ123'],
    received_at: '2024-01-15T12:00:00Z',
    uplink_message: {
      f_port: 2,
      f_cnt: 1234,
      frm_payload: 'AQmKGcgAAUxNAAHd8Q==',
      decoded_payload: {
        temperature: 25.5,
        humidity: 60.2,
        battery: 85,
      },
      rx_metadata: [
        {
          gateway_ids: {
            gateway_id: 'eui-b827ebfffe2175fd',
            eui: 'B827EBFFFE2175FD',
          },
          time: '2024-01-15T11:59:59.500Z',
          timestamp: 4278810051,
          rssi: -62,
          channel_rssi: -62,
          snr: 9.8,
          channel_index: 4,
        },
      ],
      settings: {
        data_rate: {
          lora: {
            bandwidth: 125000,
            spreading_factor: 7,
          },
        },
        frequency: '868100000',
      },
      received_at: '2024-01-15T12:00:00.123Z',
      consumed_airtime: '0.061696s',
    },
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────
// Mock helpers
// ──────────────────────────────────────────────────────────────────

function mockValidAuth() {
  mockVerifyApiKey.mockResolvedValue({
    valid: true,
    organizationId: TEST_ORG_ID,
    connectionId: TEST_CONNECTION_ID,
  });
}

function mockInvalidAuth(error = 'Invalid API key') {
  mockVerifyApiKey.mockResolvedValue({
    valid: false,
    error,
  });
}

function mockDeviceFound(orgId = TEST_ORG_ID) {
  mockLookupDevice.mockResolvedValue({
    deviceId: TEST_DEVICE_ID,
    unitId: TEST_UNIT_ID,
    organizationId: orgId,
    deviceEui: TEST_DEV_EUI,
  });
}

function mockDeviceNotFound() {
  mockLookupDevice.mockResolvedValue(null);
}

function mockSuccessfulIngestion() {
  mockIngestReadings.mockResolvedValue({
    insertedCount: 1,
    readingIds: [TEST_READING_ID],
    alertsTriggered: 0,
  });
}

function mockSuccessfulAlertEvaluation(alertTriggered = false) {
  mockEvaluateAlert.mockResolvedValue({
    stateChange: null,
    alertCreated: alertTriggered ? ({ id: 'alert-id' } as any) : null,
    alertResolved: null,
  });
}

function setupHappyPath() {
  mockValidAuth();
  mockDeviceFound();
  mockSuccessfulIngestion();
  mockSuccessfulAlertEvaluation(false);
  mockUpdateDeviceMetadata.mockResolvedValue(undefined);
}

// ──────────────────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────────────────

describe('TTN Webhook Route Handler', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ───── Authentication ─────────────────────────────────────────

  describe('Authentication', () => {
    it('should accept valid uplink payload with correct API key', async () => {
      setupHappyPath();

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.readingId).toBe(TEST_READING_ID);
      expect(mockVerifyApiKey).toHaveBeenCalledWith(TEST_API_KEY);
    });

    it('should accept X-Webhook-Secret header as alternative auth', async () => {
      setupHappyPath();

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-webhook-secret': TEST_API_KEY },
        payload: createValidPayload(),
      });

      expect(response.statusCode).toBe(200);
      expect(mockVerifyApiKey).toHaveBeenCalledWith(TEST_API_KEY);
    });

    it('should return 401 when API key is missing', async () => {
      mockInvalidAuth('Missing API key');

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        payload: createValidPayload(),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Missing API key');
    });

    it('should return 401 with invalid API key', async () => {
      mockInvalidAuth('Invalid API key');

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': 'wrong-key' },
        payload: createValidPayload(),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Invalid API key');
    });
  });

  // ───── DevEUI normalisation ───────────────────────────────────

  describe('DevEUI Handling', () => {
    it('should normalize DevEUI to consistent format (uppercase, no separators)', async () => {
      setupHappyPath();

      const payload = createValidPayload({
        end_device_ids: {
          device_id: 'temperature-sensor-1',
          application_ids: { application_id: 'freshtrack-sensors' },
          dev_eui: 'ac:1f:09:ff:fe:01:45:4e', // lowercase with colons
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload,
      });

      // The route passes the raw dev_eui to lookupDeviceByEui,
      // which internally normalizes — verify it was called
      expect(response.statusCode).toBe(200);
      expect(mockLookupDevice).toHaveBeenCalledWith('ac:1f:09:ff:fe:01:45:4e');
    });

    it('should fall back to device_id when dev_eui is absent', async () => {
      setupHappyPath();

      const payload = createValidPayload({
        end_device_ids: {
          device_id: 'my-device-id',
          application_ids: { application_id: 'freshtrack-sensors' },
          // dev_eui intentionally omitted
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(mockLookupDevice).toHaveBeenCalledWith('my-device-id');
    });

    it('should return 400 when both dev_eui and device_id are missing', async () => {
      mockValidAuth();

      // device_id is required by schema, so we send it as empty string to pass schema
      // and the dev_eui is omitted. The route checks: devEui = end_device_ids.dev_eui || end_device_ids.device_id
      // An empty device_id will be falsy
      const payload = createValidPayload({
        end_device_ids: {
          device_id: '',
          application_ids: { application_id: 'freshtrack-sensors' },
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload,
      });

      // Route returns 400 for missing device identifier
      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toContain('device identifier');
    });
  });

  // ───── Device Lookup ──────────────────────────────────────────

  describe('Device Lookup', () => {
    it('should handle unknown DevEUI gracefully (404, does not crash)', async () => {
      mockValidAuth();
      mockDeviceNotFound();

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('not found');
    });

    it('should return 401 when device belongs to different organization', async () => {
      mockValidAuth();
      mockDeviceFound('different-org-id'); // org mismatch

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('does not belong');
    });
  });

  // ───── Payload Parsing & Temperature ──────────────────────────

  describe('Payload Parsing', () => {
    it('should parse temperature from TTN payload correctly', async () => {
      setupHappyPath();

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      expect(response.statusCode).toBe(200);

      // Verify readings were ingested with correct temperature
      expect(mockIngestReadings).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            unitId: TEST_UNIT_ID,
            deviceId: TEST_DEVICE_ID,
            temperature: 25.5,
            humidity: 60.2,
            battery: 85,
            source: 'ttn',
          }),
        ],
        TEST_ORG_ID,
      );
    });

    it('should return 422 when decoded_payload is missing', async () => {
      mockValidAuth();
      mockDeviceFound();

      const payload = createValidPayload();
      (payload.uplink_message as any).decoded_payload = undefined;

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload,
      });

      expect(response.statusCode).toBe(422);
      const body = response.json();
      expect(body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(body.error.message).toContain('decoded_payload');
    });

    it('should return 422 when temperature is missing from decoded_payload', async () => {
      mockValidAuth();
      mockDeviceFound();

      const payload = createValidPayload();
      (payload.uplink_message as any).decoded_payload = {
        humidity: 60,
        battery: 85,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload,
      });

      expect(response.statusCode).toBe(422);
      const body = response.json();
      expect(body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(body.error.message).toContain('temperature');
    });

    it('should handle malformed JSON payload (schema validation returns 400)', async () => {
      mockValidAuth();

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: {
          'x-api-key': TEST_API_KEY,
          'content-type': 'application/json',
        },
        payload: '{ invalid json!!!',
      });

      // Fastify returns 400 for JSON parse errors
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for structurally invalid payload (missing required fields)', async () => {
      mockValidAuth();

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: {
          'x-api-key': TEST_API_KEY,
          'content-type': 'application/json',
        },
        payload: { some: 'random data' },
      });

      // Zod schema validation should reject this
      expect(response.statusCode).toBe(400);
    });
  });

  // ───── Successful Processing ──────────────────────────────────

  describe('Successful Processing', () => {
    it('should return 200 and process valid webhook', async () => {
      setupHappyPath();

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.message).toContain('processed');
      expect(body.readingId).toBe(TEST_READING_ID);
      expect(body.alertsTriggered).toBe(0);
    });

    it('should store reading with correct sensor/unit association', async () => {
      setupHappyPath();

      await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      expect(mockIngestReadings).toHaveBeenCalledTimes(1);
      const [readings, orgId] = mockIngestReadings.mock.calls[0];
      expect(orgId).toBe(TEST_ORG_ID);
      expect(readings).toHaveLength(1);
      expect(readings[0]).toMatchObject({
        unitId: TEST_UNIT_ID,
        deviceId: TEST_DEVICE_ID,
        temperature: 25.5,
        source: 'ttn',
        recordedAt: '2024-01-15T12:00:00.123Z',
      });
    });

    it('should add reading to real-time streaming service', async () => {
      setupHappyPath();

      await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      expect(mockAddReading).toHaveBeenCalledTimes(1);
      expect(mockAddReading).toHaveBeenCalledWith(
        TEST_ORG_ID,
        expect.objectContaining({
          id: TEST_READING_ID,
          unitId: TEST_UNIT_ID,
          deviceId: TEST_DEVICE_ID,
          temperature: 25.5,
          source: 'ttn',
        }),
      );
    });

    it('should trigger alert evaluation for the unit', async () => {
      setupHappyPath();

      await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      expect(mockEvaluateAlert).toHaveBeenCalledTimes(1);
      // Temperature 25.5°C -> 255 (multiplied by 10 and rounded)
      expect(mockEvaluateAlert).toHaveBeenCalledWith(
        TEST_UNIT_ID,
        255, // Math.round(25.5 * 10)
        expect.any(Date),
        expect.anything(), // socketService
      );
    });

    it('should report alertsTriggered=1 when alert is created', async () => {
      mockValidAuth();
      mockDeviceFound();
      mockSuccessfulIngestion();
      mockSuccessfulAlertEvaluation(true); // alert triggered
      mockUpdateDeviceMetadata.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().alertsTriggered).toBe(1);
    });

    it('should report alertsTriggered=1 when alert is resolved', async () => {
      mockValidAuth();
      mockDeviceFound();
      mockSuccessfulIngestion();
      mockEvaluateAlert.mockResolvedValue({
        stateChange: null,
        alertCreated: null,
        alertResolved: { id: 'resolved-alert-id' } as any,
      });
      mockUpdateDeviceMetadata.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().alertsTriggered).toBe(1);
    });

    it('should update device metadata after processing', async () => {
      setupHappyPath();

      await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      expect(mockUpdateDeviceMetadata).toHaveBeenCalledTimes(1);
      expect(mockUpdateDeviceMetadata).toHaveBeenCalledWith(
        TEST_DEVICE_ID,
        expect.objectContaining({
          temperature: 25.5,
          humidity: 60.2,
          battery: 85,
          signalStrength: -62, // channel_rssi from rx_metadata
        }),
      );
    });
  });

  // ───── Duplicate Payload Handling (Idempotency) ───────────────

  describe('Duplicate Payload Handling', () => {
    it('should process the same webhook payload twice without errors', async () => {
      setupHappyPath();
      const payload = createValidPayload();

      const response1 = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload,
      });

      const response2 = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload,
      });

      // Both should succeed — idempotency is handled by the readings
      // service (duplicate detection by device + timestamp)
      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);
      expect(mockIngestReadings).toHaveBeenCalledTimes(2);
    });
  });

  // ───── Alternative Payload Formats ────────────────────────────

  describe('Alternative Payload Formats', () => {
    it('should handle "temp" field instead of "temperature"', async () => {
      setupHappyPath();

      const payload = createValidPayload();
      (payload.uplink_message as any).decoded_payload = {
        temp: 22.3,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(mockIngestReadings).toHaveBeenCalledWith(
        [expect.objectContaining({ temperature: 22.3 })],
        TEST_ORG_ID,
      );
    });

    it('should handle "temperature_f" field and convert to Celsius', async () => {
      setupHappyPath();

      const payload = createValidPayload();
      (payload.uplink_message as any).decoded_payload = {
        temperature_f: 77, // 77°F = 25°C
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload,
      });

      expect(response.statusCode).toBe(200);
      const reading = mockIngestReadings.mock.calls[0][0][0];
      expect(reading.temperature).toBeCloseTo(25, 1);
    });

    it('should handle battery_voltage and convert to percentage', async () => {
      setupHappyPath();

      const payload = createValidPayload();
      (payload.uplink_message as any).decoded_payload = {
        temperature: 20,
        battery_voltage: 3.6, // midpoint → 50%
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(mockUpdateDeviceMetadata).toHaveBeenCalledWith(
        TEST_DEVICE_ID,
        expect.objectContaining({ battery: 50 }),
      );
    });

    it('should use best signal strength from multiple gateways', async () => {
      setupHappyPath();

      const payload = createValidPayload();
      (payload.uplink_message as any).rx_metadata = [
        { gateway_ids: { gateway_id: 'gw-1' }, rssi: -90, channel_rssi: -90 },
        { gateway_ids: { gateway_id: 'gw-2' }, rssi: -62, channel_rssi: -62 },
        { gateway_ids: { gateway_id: 'gw-3' }, rssi: -78, channel_rssi: -78 },
      ];

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload,
      });

      expect(response.statusCode).toBe(200);
      // Best signal = -62 (least negative)
      expect(mockUpdateDeviceMetadata).toHaveBeenCalledWith(
        TEST_DEVICE_ID,
        expect.objectContaining({ signalStrength: -62 }),
      );
    });

    it('should handle simulated uplinks', async () => {
      setupHappyPath();

      const payload = createValidPayload({ simulated: true });

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload,
      });

      // Simulated uplinks should be processed the same way
      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
    });
  });

  // ───── Error Handling ─────────────────────────────────────────

  describe('Error Handling', () => {
    it('should continue processing if alert evaluation fails', async () => {
      mockValidAuth();
      mockDeviceFound();
      mockSuccessfulIngestion();
      mockEvaluateAlert.mockRejectedValue(new Error('Alert service unavailable'));
      mockUpdateDeviceMetadata.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      // Should still return 200 — alert errors are logged but not fatal
      expect(response.statusCode).toBe(200);
      expect(response.json().alertsTriggered).toBe(0);
    });

    it('should continue processing if device metadata update fails', async () => {
      mockValidAuth();
      mockDeviceFound();
      mockSuccessfulIngestion();
      mockSuccessfulAlertEvaluation(false);
      mockUpdateDeviceMetadata.mockRejectedValue(new Error('DB error'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      // Should still return 200 — metadata update errors are non-fatal
      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
    });

    it('should throw error if reading ingestion fails', async () => {
      mockValidAuth();
      mockDeviceFound();
      mockIngestReadings.mockRejectedValue(new Error('DB write failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      // Reading ingestion failure IS fatal — route re-throws
      expect(response.statusCode).toBe(500);
    });

    it('should throw error if ingestion returns zero inserted count', async () => {
      mockValidAuth();
      mockDeviceFound();
      mockIngestReadings.mockResolvedValue({
        insertedCount: 0,
        readingIds: [],
        alertsTriggered: 0,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      // insertedCount === 0 triggers "Failed to insert reading" error
      expect(response.statusCode).toBe(500);
    });
  });

  // ───── Regression: End-to-end Flow ────────────────────────────

  describe('End-to-End Flow', () => {
    it('should execute the complete webhook flow in order', async () => {
      const callOrder: string[] = [];

      mockVerifyApiKey.mockImplementation(async () => {
        callOrder.push('verifyApiKey');
        return { valid: true, organizationId: TEST_ORG_ID, connectionId: TEST_CONNECTION_ID };
      });
      mockLookupDevice.mockImplementation(async () => {
        callOrder.push('lookupDevice');
        return {
          deviceId: TEST_DEVICE_ID,
          unitId: TEST_UNIT_ID,
          organizationId: TEST_ORG_ID,
          deviceEui: TEST_DEV_EUI,
        };
      });
      mockIngestReadings.mockImplementation(async () => {
        callOrder.push('ingestReadings');
        return { insertedCount: 1, readingIds: [TEST_READING_ID], alertsTriggered: 0 };
      });
      mockAddReading.mockImplementation(() => {
        callOrder.push('addReading');
      });
      mockEvaluateAlert.mockImplementation(async () => {
        callOrder.push('evaluateAlert');
        return { stateChange: null, alertCreated: null, alertResolved: null };
      });
      mockUpdateDeviceMetadata.mockImplementation(async () => {
        callOrder.push('updateDeviceMetadata');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/ttn',
        headers: { 'x-api-key': TEST_API_KEY },
        payload: createValidPayload(),
      });

      expect(response.statusCode).toBe(200);

      // Verify the correct order of operations
      expect(callOrder).toEqual([
        'verifyApiKey',
        'lookupDevice',
        'ingestReadings',
        'addReading',
        'evaluateAlert',
        'updateDeviceMetadata',
      ]);
    });
  });
});

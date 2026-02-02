import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import * as alertEvaluator from '../../src/services/alert-evaluator.service.js';
import * as readingsService from '../../src/services/readings.service.js';
import * as ttnWebhookService from '../../src/services/ttn-webhook.service.js';

// --- Mock setup ---
// CRITICAL: Mock the socket plugin with Symbol.for('skip-override') to propagate
// decorators (io, socketService, sensorStreamService) through Fastify's encapsulation.
// Without this, request.server.sensorStreamService is undefined in the route handler.

const mockAddReading = vi.fn();
const mockGetLatestReading = vi.fn().mockReturnValue(null);
const mockStop = vi.fn();
const mockEmitToOrg = vi.fn();
const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockShutdown = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/plugins/socket.plugin.js', () => {
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
      { [Symbol.for('skip-override')]: true },
    ),
  };
});

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

// Mock TTN webhook service (partial mock: keep real extractSensorData + convertToReading)
vi.mock('../../src/services/ttn-webhook.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ttn-webhook.service.js')>();
  return {
    ...actual,
    verifyWebhookApiKey: vi.fn(),
    lookupDeviceByEui: vi.fn(),
    updateDeviceMetadata: vi.fn(),
  };
});

// Mock readings service
vi.mock('../../src/services/readings.service.js', () => ({
  ingestBulkReadings: vi.fn(),
}));

// Mock alert evaluator
vi.mock('../../src/services/alert-evaluator.service.js', () => ({
  evaluateUnitAfterReading: vi.fn(),
}));

// --- Typed mock references ---

const mockVerifyApiKey = vi.mocked(ttnWebhookService.verifyWebhookApiKey);
const mockLookupDevice = vi.mocked(ttnWebhookService.lookupDeviceByEui);
const mockUpdateDeviceMetadata = vi.mocked(ttnWebhookService.updateDeviceMetadata);
const mockIngestReadings = vi.mocked(readingsService.ingestBulkReadings);
const mockEvaluateAlert = vi.mocked(alertEvaluator.evaluateUnitAfterReading);

// --- Test constants ---

const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_CONNECTION_ID = 'a419185a-ccd5-4a1c-b1ac-8b4dfc6a01df';
const TEST_DEVICE_ID = '95e50b0a-9718-42bb-ba1c-7e56365e2c51';
const TEST_UNIT_ID = '6ee7bf36-9c9f-4a00-99ec-6e0730558f67';
const TEST_READING_ID = '12345678-1234-4234-a234-123456789012';
const TEST_DEV_EUI = 'AC1F09FFFE01454E';
const TEST_API_KEY = 'test-webhook-secret-key-12345';

// --- Valid TTN v3 uplink webhook payload ---

const validWebhookPayload = {
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
};

// --- Helper functions ---

function mockValidAuth() {
  mockVerifyApiKey.mockResolvedValue({
    valid: true,
    organizationId: TEST_ORG_ID,
    connectionId: TEST_CONNECTION_ID,
  });
}

function mockInvalidAuth(error: string = 'Invalid API key') {
  mockVerifyApiKey.mockResolvedValue({
    valid: false,
    error,
  });
}

function mockDeviceFound() {
  mockLookupDevice.mockResolvedValue({
    deviceId: TEST_DEVICE_ID,
    unitId: TEST_UNIT_ID,
    organizationId: TEST_ORG_ID,
    deviceEui: TEST_DEV_EUI,
  });
}

function mockDeviceNotFound() {
  mockLookupDevice.mockResolvedValue(null);
}

function mockDeviceInDifferentOrg() {
  mockLookupDevice.mockResolvedValue({
    deviceId: TEST_DEVICE_ID,
    unitId: TEST_UNIT_ID,
    organizationId: 'different-org-id',
    deviceEui: TEST_DEV_EUI,
  });
}

function mockSuccessfulIngestion() {
  mockIngestReadings.mockResolvedValue({
    insertedCount: 1,
    readingIds: [TEST_READING_ID],
    alertsTriggered: 0,
  });
}

function mockSuccessfulAlertEvaluation(alertTriggered: boolean = false) {
  mockEvaluateAlert.mockResolvedValue({
    stateChange: null,
    alertCreated: alertTriggered ? ({ id: 'alert-id' } as any) : null,
    alertResolved: null,
  });
}

/** Set up all mocks for a complete successful processing flow */
function mockFullSuccessFlow(opts?: { alertTriggered?: boolean }) {
  mockValidAuth();
  mockDeviceFound();
  mockSuccessfulIngestion();
  mockSuccessfulAlertEvaluation(opts?.alertTriggered ?? false);
  mockUpdateDeviceMetadata.mockResolvedValue(undefined);
}

// --- Tests ---

describe('TTN Webhooks API', () => {
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

  describe('POST /api/webhooks/ttn', () => {
    // ── Authentication ────────────────────────────────────────────────

    describe('Authentication', () => {
      it('should return 401 without API key header', async () => {
        mockInvalidAuth('Missing API key');

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          payload: validWebhookPayload,
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing API key',
          },
        });
      });

      it('should return 401 with invalid API key', async () => {
        mockInvalidAuth('Invalid API key');

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': 'invalid-key',
          },
          payload: validWebhookPayload,
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid API key',
          },
        });
      });

      it('should accept X-Webhook-Secret header as alternative auth', async () => {
        mockFullSuccessFlow();

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-webhook-secret': TEST_API_KEY,
          },
          payload: validWebhookPayload,
        });

        expect(response.statusCode).toBe(200);
        // The route handler reads both x-api-key and x-webhook-secret
        expect(mockVerifyApiKey).toHaveBeenCalledWith(TEST_API_KEY);
      });
    });

    // ── Device Lookup ─────────────────────────────────────────────────

    describe('Device Lookup', () => {
      it('should return 404 when device not found', async () => {
        mockValidAuth();
        mockDeviceNotFound();

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: validWebhookPayload,
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toMatchObject({
          error: {
            code: 'NOT_FOUND',
            message: expect.stringContaining('not found'),
          },
        });
      });

      it('should return 401 when device belongs to different organization', async () => {
        mockValidAuth();
        mockDeviceInDifferentOrg();

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: validWebhookPayload,
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Device does not belong to authenticated organization',
          },
        });
      });

      it('should fall back to device_id when dev_eui is absent', async () => {
        mockFullSuccessFlow();

        const payloadWithoutEui = {
          ...validWebhookPayload,
          end_device_ids: {
            device_id: 'temperature-sensor-1',
            application_ids: {
              application_id: 'freshtrack-sensors',
            },
            // No dev_eui field
          },
        };

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: payloadWithoutEui,
        });

        expect(response.statusCode).toBe(200);
        // lookupDeviceByEui should have been called with the device_id fallback
        expect(mockLookupDevice).toHaveBeenCalledWith('temperature-sensor-1');
      });
    });

    // ── Payload Validation ────────────────────────────────────────────

    describe('Payload Validation', () => {
      it('should return 400 for structurally invalid payload', async () => {
        // Missing required fields (end_device_ids, uplink_message)
        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: {
            some_random_field: 'not a TTN payload',
          },
        });

        // Zod schema validation returns 400 for structurally invalid body
        expect(response.statusCode).toBe(400);
      });

      it('should return 422 when decoded_payload is missing', async () => {
        mockValidAuth();
        mockDeviceFound();

        const payloadWithoutDecoded = {
          ...validWebhookPayload,
          uplink_message: {
            ...validWebhookPayload.uplink_message,
            decoded_payload: undefined,
          },
        };

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: payloadWithoutDecoded,
        });

        expect(response.statusCode).toBe(422);
        expect(response.json()).toMatchObject({
          error: {
            code: 'UNPROCESSABLE_ENTITY',
            message: expect.stringContaining('decoded_payload'),
          },
        });
      });

      it('should return 422 when temperature is missing from decoded_payload', async () => {
        mockValidAuth();
        mockDeviceFound();

        const payloadWithoutTemp = {
          ...validWebhookPayload,
          uplink_message: {
            ...validWebhookPayload.uplink_message,
            decoded_payload: {
              humidity: 60,
              battery: 85,
            },
          },
        };

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: payloadWithoutTemp,
        });

        expect(response.statusCode).toBe(422);
        expect(response.json()).toMatchObject({
          error: {
            code: 'UNPROCESSABLE_ENTITY',
            message: expect.stringContaining('temperature'),
          },
        });
      });
    });

    // ── Successful Processing ─────────────────────────────────────────

    describe('Successful Processing', () => {
      it('should return 200 and process valid webhook', async () => {
        mockFullSuccessFlow();

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: validWebhookPayload,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body).toMatchObject({
          success: true,
          message: 'Uplink processed successfully',
          readingId: TEST_READING_ID,
          alertsTriggered: 0,
        });
      });

      it('should store reading with correct sensor/unit association', async () => {
        mockFullSuccessFlow();

        await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: validWebhookPayload,
        });

        expect(mockIngestReadings).toHaveBeenCalledTimes(1);
        const [readings, orgId] = mockIngestReadings.mock.calls[0];
        expect(orgId).toBe(TEST_ORG_ID);
        expect(readings).toHaveLength(1);
        expect(readings[0]).toMatchObject({
          unitId: TEST_UNIT_ID,
          deviceId: TEST_DEVICE_ID,
          temperature: 25.5,
          humidity: 60.2,
          battery: 85,
          source: 'ttn',
          recordedAt: '2024-01-15T12:00:00.123Z',
        });
      });

      it('should add reading to real-time streaming service', async () => {
        mockFullSuccessFlow();

        await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: validWebhookPayload,
        });

        expect(mockAddReading).toHaveBeenCalledTimes(1);
        expect(mockAddReading).toHaveBeenCalledWith(
          TEST_ORG_ID,
          expect.objectContaining({
            id: TEST_READING_ID,
            unitId: TEST_UNIT_ID,
            deviceId: TEST_DEVICE_ID,
            temperature: 25.5,
            humidity: 60.2,
            battery: 85,
            source: 'ttn',
          }),
        );
      });

      it('should trigger alert evaluation for the unit', async () => {
        mockFullSuccessFlow();

        await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: validWebhookPayload,
        });

        expect(mockEvaluateAlert).toHaveBeenCalledTimes(1);
        const [unitId, tempInt, recordedAt, socketService] = mockEvaluateAlert.mock.calls[0];
        expect(unitId).toBe(TEST_UNIT_ID);
        // 25.5 * 10 = 255, rounded
        expect(tempInt).toBe(255);
        expect(recordedAt).toBeInstanceOf(Date);
        // socketService should be the mocked socket service
        expect(socketService).toBeDefined();
      });

      it('should report alertsTriggered=1 when alert is created', async () => {
        mockFullSuccessFlow({ alertTriggered: true });

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: validWebhookPayload,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          success: true,
          alertsTriggered: 1,
        });
      });

      it('should update device metadata after processing', async () => {
        mockFullSuccessFlow();

        await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: validWebhookPayload,
        });

        expect(mockUpdateDeviceMetadata).toHaveBeenCalledTimes(1);
        expect(mockUpdateDeviceMetadata).toHaveBeenCalledWith(
          TEST_DEVICE_ID,
          expect.objectContaining({
            temperature: 25.5,
            humidity: 60.2,
            battery: 85,
          }),
        );
      });

      it('should handle simulated uplinks', async () => {
        mockFullSuccessFlow();

        const simulatedPayload = {
          ...validWebhookPayload,
          simulated: true,
        };

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: simulatedPayload,
        });

        // Simulated uplinks should still be processed normally
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          success: true,
          message: 'Uplink processed successfully',
        });
        expect(mockIngestReadings).toHaveBeenCalledTimes(1);
      });
    });

    // ── Alternative Payload Formats ───────────────────────────────────

    describe('Alternative Payload Formats', () => {
      it('should handle "temp" field instead of "temperature"', async () => {
        mockFullSuccessFlow();

        const payloadWithTemp = {
          ...validWebhookPayload,
          uplink_message: {
            ...validWebhookPayload.uplink_message,
            decoded_payload: {
              temp: 22.3,
              humidity: 55,
            },
          },
        };

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: payloadWithTemp,
        });

        expect(response.statusCode).toBe(200);
        // Verify real extractSensorData correctly extracted temp -> temperature
        const [readings] = mockIngestReadings.mock.calls[0];
        expect(readings[0].temperature).toBe(22.3);
      });

      it('should handle battery_voltage field', async () => {
        mockFullSuccessFlow();

        // battery_voltage of 3.6V should convert to a percentage
        // Formula: ((v - 3.0) / (4.2 - 3.0)) * 100 = ((3.6 - 3.0) / 1.2) * 100 = 50%
        const payloadWithVoltage = {
          ...validWebhookPayload,
          uplink_message: {
            ...validWebhookPayload.uplink_message,
            decoded_payload: {
              temperature: 20.0,
              battery_voltage: 3.6,
            },
          },
        };

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: payloadWithVoltage,
        });

        expect(response.statusCode).toBe(200);
        const [readings] = mockIngestReadings.mock.calls[0];
        expect(readings[0].battery).toBe(50);
      });

      it('should use best signal strength from multiple gateways', async () => {
        mockFullSuccessFlow();

        const payloadWithMultipleGateways = {
          ...validWebhookPayload,
          uplink_message: {
            ...validWebhookPayload.uplink_message,
            rx_metadata: [
              {
                gateway_ids: { gateway_id: 'gw-1', eui: 'GW1EUI' },
                rssi: -95,
                channel_rssi: -95,
                snr: 3.0,
              },
              {
                gateway_ids: { gateway_id: 'gw-2', eui: 'GW2EUI' },
                rssi: -55,
                channel_rssi: -55,
                snr: 12.0,
              },
              {
                gateway_ids: { gateway_id: 'gw-3', eui: 'GW3EUI' },
                rssi: -78,
                channel_rssi: -78,
                snr: 7.0,
              },
            ],
          },
        };

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: payloadWithMultipleGateways,
        });

        expect(response.statusCode).toBe(200);
        // Best signal strength is -55 (least negative = strongest)
        const [readings] = mockIngestReadings.mock.calls[0];
        expect(readings[0].signalStrength).toBe(-55);
      });
    });

    // ── Error Handling ────────────────────────────────────────────────

    describe('Error Handling', () => {
      it('should continue processing if alert evaluation fails', async () => {
        mockValidAuth();
        mockDeviceFound();
        mockSuccessfulIngestion();
        mockUpdateDeviceMetadata.mockResolvedValue(undefined);
        // Alert evaluation throws an error
        mockEvaluateAlert.mockRejectedValue(new Error('Alert service unavailable'));

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: validWebhookPayload,
        });

        // Should still return 200 -- the route catches alert evaluation errors
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          success: true,
          alertsTriggered: 0,
        });
      });

      it('should continue processing if device metadata update fails', async () => {
        mockValidAuth();
        mockDeviceFound();
        mockSuccessfulIngestion();
        mockSuccessfulAlertEvaluation(false);
        // Metadata update throws an error
        mockUpdateDeviceMetadata.mockRejectedValue(new Error('DB write failed'));

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: validWebhookPayload,
        });

        // Should still return 200 -- the route catches metadata update errors
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          success: true,
          readingId: TEST_READING_ID,
        });
      });

      it('should return 500 if reading ingestion fails', async () => {
        mockValidAuth();
        mockDeviceFound();
        // Ingestion throws an error (not caught by the route -- it rethrows)
        mockIngestReadings.mockRejectedValue(new Error('Database connection lost'));

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/ttn',
          headers: {
            'x-api-key': TEST_API_KEY,
          },
          payload: validWebhookPayload,
        });

        expect(response.statusCode).toBe(500);
      });
    });
  });
});

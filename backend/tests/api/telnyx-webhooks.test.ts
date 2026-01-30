import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Mock JWT verification (required by app initialization)
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock user service (required by app initialization)
vi.mock('../../src/services/user.service.js', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock telnyx-webhook service
vi.mock('../../src/services/telnyx-webhook.service.js', () => ({
  handleTelnyxWebhookEvent: vi.fn(),
  handleMessageSent: vi.fn(),
  handleMessageDelivered: vi.fn(),
  handleMessageFailed: vi.fn(),
  TelnyxWebhookError: class TelnyxWebhookError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TelnyxWebhookError';
    }
  },
}));

import { buildApp } from '../../src/app.js';
import * as telnyxWebhookService from '../../src/services/telnyx-webhook.service.js';
import type { TelnyxWebhookEvent } from '../../src/schemas/telnyx-webhooks.js';

const mockHandleEvent = vi.mocked(telnyxWebhookService.handleTelnyxWebhookEvent);

// Test constants
const TEST_MESSAGE_ID = 'msg_abc123xyz';

// Helper to create valid Telnyx webhook events
function createMockEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
): TelnyxWebhookEvent {
  return {
    data: {
      event_type: eventType,
      id: `evt_${Date.now()}`,
      occurred_at: new Date().toISOString(),
      record_type: 'event',
      payload: {
        id: TEST_MESSAGE_ID,
        direction: 'outbound',
        ...payload,
      },
    },
    meta: {
      attempt: 1,
    },
  } as TelnyxWebhookEvent;
}

describe('Telnyx Webhooks API', () => {
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

  describe('POST /api/webhooks/telnyx', () => {
    it('should accept valid webhook event and return 200', async () => {
      const event = createMockEvent('message.sent');
      mockHandleEvent.mockResolvedValue({
        messageId: TEST_MESSAGE_ID,
        eventType: 'message.sent',
        updated: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/telnyx',
        headers: { 'content-type': 'application/json' },
        payload: event,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true });
      expect(mockHandleEvent).toHaveBeenCalledWith(event);
    });

    describe('message.sent event', () => {
      it('should process message.sent event successfully', async () => {
        const event = createMockEvent('message.sent', {
          sent_at: '2024-01-15T10:30:00Z',
        });
        mockHandleEvent.mockResolvedValue({
          messageId: TEST_MESSAGE_ID,
          eventType: 'message.sent',
          updated: true,
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: event,
        });

        expect(response.statusCode).toBe(200);
        expect(mockHandleEvent).toHaveBeenCalledWith(event);
      });
    });

    describe('message.delivered event', () => {
      it('should process message.delivered event successfully', async () => {
        const event = createMockEvent('message.delivered', {
          completed_at: '2024-01-15T10:31:00Z',
        });
        mockHandleEvent.mockResolvedValue({
          messageId: TEST_MESSAGE_ID,
          eventType: 'message.delivered',
          updated: true,
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: event,
        });

        expect(response.statusCode).toBe(200);
        expect(mockHandleEvent).toHaveBeenCalledWith(event);
      });
    });

    describe('message.failed event', () => {
      it('should process message.failed event successfully', async () => {
        const event = createMockEvent('message.failed', {
          errors: [{ code: '40300', title: 'Number opted out', detail: 'Recipient sent STOP' }],
        });
        mockHandleEvent.mockResolvedValue({
          messageId: TEST_MESSAGE_ID,
          eventType: 'message.failed',
          updated: true,
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: event,
        });

        expect(response.statusCode).toBe(200);
        expect(mockHandleEvent).toHaveBeenCalledWith(event);
      });

      it('should handle failed event with multiple error codes', async () => {
        const event = createMockEvent('message.failed', {
          errors: [
            { code: '40002', title: 'Blocked as spam', detail: 'Temporary block' },
            { code: '50000', title: 'Internal error' },
          ],
        });
        mockHandleEvent.mockResolvedValue({
          messageId: TEST_MESSAGE_ID,
          eventType: 'message.failed',
          updated: true,
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: event,
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('unhandled event types', () => {
      it('should accept and acknowledge unhandled event types', async () => {
        const event = createMockEvent('message.queued');
        mockHandleEvent.mockResolvedValue({
          messageId: TEST_MESSAGE_ID,
          eventType: 'message.queued',
          updated: false,
          reason: 'Unhandled event type',
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: event,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ received: true });
      });
    });

    describe('validation errors', () => {
      it('should return 400 for missing data object', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: { meta: { attempt: 1 } },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should return 400 for missing event_type', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: {
            data: {
              id: 'evt_123',
              occurred_at: new Date().toISOString(),
              payload: { id: TEST_MESSAGE_ID },
            },
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should return 400 for missing payload', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: {
            data: {
              event_type: 'message.sent',
              id: 'evt_123',
              occurred_at: new Date().toISOString(),
            },
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should return 400 for missing message ID in payload', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: {
            data: {
              event_type: 'message.sent',
              id: 'evt_123',
              occurred_at: new Date().toISOString(),
              payload: {
                direction: 'outbound',
              },
            },
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('error handling', () => {
      it('should return 400 when handler throws TelnyxWebhookError', async () => {
        const event = createMockEvent('message.sent');
        mockHandleEvent.mockRejectedValue(
          new telnyxWebhookService.TelnyxWebhookError('Missing message ID'),
        );

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: event,
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.message).toContain('Missing message ID');
      });

      it('should return 500 for unexpected errors', async () => {
        const event = createMockEvent('message.sent');
        mockHandleEvent.mockRejectedValue(new Error('Database connection failed'));

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: event,
        });

        expect(response.statusCode).toBe(500);
      });
    });

    describe('delivery record not found', () => {
      it('should still return 200 when delivery record not found', async () => {
        const event = createMockEvent('message.delivered');
        mockHandleEvent.mockResolvedValue({
          messageId: TEST_MESSAGE_ID,
          eventType: 'message.delivered',
          updated: false,
          reason: 'Delivery record not found',
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: event,
        });

        // Should acknowledge even if record not found
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ received: true });
      });
    });

    describe('metadata handling', () => {
      it('should process event with meta.attempt field', async () => {
        const event = createMockEvent('message.sent');
        event.meta = { attempt: 3, delivered_to: 'https://webhook.example.com' };
        mockHandleEvent.mockResolvedValue({
          messageId: TEST_MESSAGE_ID,
          eventType: 'message.sent',
          updated: true,
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: event,
        });

        expect(response.statusCode).toBe(200);
      });

      it('should process event without meta field', async () => {
        const event = createMockEvent('message.sent');
        delete event.meta;
        mockHandleEvent.mockResolvedValue({
          messageId: TEST_MESSAGE_ID,
          eventType: 'message.sent',
          updated: true,
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: event,
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('payload fields', () => {
      it('should process event with full phone number details', async () => {
        const event = createMockEvent('message.sent', {
          from: { phone_number: '+15551234567', carrier: 'Verizon' },
          to: [{ phone_number: '+15559876543', status: 'queued', carrier: 'AT&T' }],
          type: 'SMS',
        });
        mockHandleEvent.mockResolvedValue({
          messageId: TEST_MESSAGE_ID,
          eventType: 'message.sent',
          updated: true,
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/telnyx',
          headers: { 'content-type': 'application/json' },
          payload: event,
        });

        expect(response.statusCode).toBe(200);
      });
    });
  });
});

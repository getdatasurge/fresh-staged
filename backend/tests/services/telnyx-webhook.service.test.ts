import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database client
vi.mock('../../src/db/client.js', () => ({
  db: {
    update: vi.fn(),
  },
}));

import { db } from '../../src/db/client.js';
import * as telnyxWebhookService from '../../src/services/telnyx-webhook.service.js';
import type { TelnyxWebhookEvent } from '../../src/schemas/telnyx-webhooks.js';

const mockDb = vi.mocked(db);

// Test constants
const TEST_MESSAGE_ID = 'msg_abc123xyz';
const TEST_DELIVERY_ID = 'del_uuid_12345';

// Helper to create mock Telnyx webhook events
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

describe('Telnyx Webhook Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleMessageSent', () => {
    it('should update delivery status to sent', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: TEST_DELIVERY_ID }]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      const result = await telnyxWebhookService.handleMessageSent(
        TEST_MESSAGE_ID,
        '2024-01-15T10:30:00Z',
      );

      expect(result.updated).toBe(true);
      expect(result.messageId).toBe(TEST_MESSAGE_ID);
      expect(result.eventType).toBe('message.sent');
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'sent',
          sentAt: expect.any(Date),
        }),
      );
    });

    it('should use current time when sentAt not provided', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: TEST_DELIVERY_ID }]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      const before = new Date();
      await telnyxWebhookService.handleMessageSent(TEST_MESSAGE_ID);
      const after = new Date();

      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          sentAt: expect.any(Date),
        }),
      );

      const setCall = mockUpdateChain.set.mock.calls[0][0];
      expect(setCall.sentAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(setCall.sentAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should return updated false when delivery not found', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      const result = await telnyxWebhookService.handleMessageSent(TEST_MESSAGE_ID);

      expect(result.updated).toBe(false);
      expect(result.reason).toBe('Delivery record not found');
    });
  });

  describe('handleMessageDelivered', () => {
    it('should update delivery status to delivered', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: TEST_DELIVERY_ID }]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      const result = await telnyxWebhookService.handleMessageDelivered(
        TEST_MESSAGE_ID,
        '2024-01-15T10:31:00Z',
      );

      expect(result.updated).toBe(true);
      expect(result.eventType).toBe('message.delivered');
      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'delivered',
          deliveredAt: expect.any(Date),
        }),
      );
    });

    it('should return updated false when delivery not found', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      const result = await telnyxWebhookService.handleMessageDelivered(TEST_MESSAGE_ID);

      expect(result.updated).toBe(false);
      expect(result.reason).toBe('Delivery record not found');
    });
  });

  describe('handleMessageFailed', () => {
    it('should update delivery status to failed with error message', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: TEST_DELIVERY_ID }]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      const errors = [{ code: '40300', title: 'Number opted out', detail: 'Recipient sent STOP' }];

      const result = await telnyxWebhookService.handleMessageFailed(TEST_MESSAGE_ID, errors);

      expect(result.updated).toBe(true);
      expect(result.eventType).toBe('message.failed');
      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          failedAt: expect.any(Date),
          errorMessage: '[40300] Number opted out: Recipient sent STOP',
        }),
      );
    });

    it('should handle errors without detail', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: TEST_DELIVERY_ID }]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      const errors = [{ code: '40008', title: 'Undeliverable' }];

      await telnyxWebhookService.handleMessageFailed(TEST_MESSAGE_ID, errors);

      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: '[40008] Undeliverable',
        }),
      );
    });

    it('should use default error message when no errors provided', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: TEST_DELIVERY_ID }]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      await telnyxWebhookService.handleMessageFailed(TEST_MESSAGE_ID);

      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: 'Message delivery failed',
        }),
      );
    });

    it('should return updated false when delivery not found', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      const result = await telnyxWebhookService.handleMessageFailed(TEST_MESSAGE_ID);

      expect(result.updated).toBe(false);
      expect(result.reason).toBe('Delivery record not found');
    });
  });

  describe('handleTelnyxWebhookEvent', () => {
    it('should route message.sent event correctly', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: TEST_DELIVERY_ID }]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      const event = createMockEvent('message.sent', {
        sent_at: '2024-01-15T10:30:00Z',
      });

      const result = await telnyxWebhookService.handleTelnyxWebhookEvent(event);

      expect(result.eventType).toBe('message.sent');
      expect(result.updated).toBe(true);
      expect(mockUpdateChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
    });

    it('should route message.delivered event correctly', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: TEST_DELIVERY_ID }]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      const event = createMockEvent('message.delivered', {
        completed_at: '2024-01-15T10:31:00Z',
      });

      const result = await telnyxWebhookService.handleTelnyxWebhookEvent(event);

      expect(result.eventType).toBe('message.delivered');
      expect(result.updated).toBe(true);
      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'delivered' }),
      );
    });

    it('should route message.failed event correctly', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: TEST_DELIVERY_ID }]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      const event = createMockEvent('message.failed', {
        errors: [{ code: '40300', title: 'Opted out' }],
      });

      const result = await telnyxWebhookService.handleTelnyxWebhookEvent(event);

      expect(result.eventType).toBe('message.failed');
      expect(result.updated).toBe(true);
      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('should handle unrecognized event types gracefully', async () => {
      const event = createMockEvent('message.queued');

      const result = await telnyxWebhookService.handleTelnyxWebhookEvent(event);

      expect(result.updated).toBe(false);
      expect(result.reason).toBe('Unhandled event type');
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should throw TelnyxWebhookError when message ID is missing', async () => {
      const event = {
        data: {
          event_type: 'message.sent',
          id: 'evt_123',
          occurred_at: new Date().toISOString(),
          payload: {
            // No id
          },
        },
      } as TelnyxWebhookEvent;

      await expect(telnyxWebhookService.handleTelnyxWebhookEvent(event)).rejects.toThrow(
        telnyxWebhookService.TelnyxWebhookError,
      );
    });

    it('should use occurred_at as fallback for sent timestamp', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: TEST_DELIVERY_ID }]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      const occurredAt = '2024-01-15T12:00:00Z';
      const event = createMockEvent('message.sent');
      event.data.occurred_at = occurredAt;
      // No sent_at in payload

      await telnyxWebhookService.handleTelnyxWebhookEvent(event);

      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          sentAt: new Date(occurredAt),
        }),
      );
    });

    it('should use received_at as fallback for delivered timestamp', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: TEST_DELIVERY_ID }]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      const receivedAt = '2024-01-15T12:01:00Z';
      const event = createMockEvent('message.delivered', {
        received_at: receivedAt,
      });

      await telnyxWebhookService.handleTelnyxWebhookEvent(event);

      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveredAt: new Date(receivedAt),
        }),
      );
    });
  });

  describe('TelnyxWebhookError', () => {
    it('should be an instance of Error', () => {
      const error = new telnyxWebhookService.TelnyxWebhookError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('TelnyxWebhookError');
      expect(error.message).toBe('Test error');
    });
  });
});

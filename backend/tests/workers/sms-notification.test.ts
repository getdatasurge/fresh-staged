/**
 * SMS Notification Processor Integration Tests
 *
 * These tests verify the SMS processor behavior including:
 * - Successful SMS sending
 * - E.164 validation
 * - Error categorization (unrecoverable vs retryable)
 * - UnrecoverableError handling
 *
 * NOTE: Tests mock TelnyxService to avoid real API calls.
 * Run with: npm test -- tests/workers/sms-notification.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Job, UnrecoverableError } from 'bullmq';
import { processSmsNotification } from '../../src/workers/processors/sms-notification.processor.js';
import {
  setTelnyxService,
  getTelnyxService,
  type TelnyxService,
  type SendSmsResult,
} from '../../src/services/telnyx.service.js';
import { categorizeError, validateE164 } from '../../src/config/telnyx.config.js';
import type { SmsNotificationJobData } from '../../src/jobs/index.js';

// Mock TelnyxService
const mockSendSms = vi.fn<[{ to: string; message: string }], Promise<SendSmsResult>>();

const mockTelnyxService = {
  sendSms: mockSendSms,
  isEnabled: () => true,
} as unknown as TelnyxService;

// Mock database operations
vi.mock('../../src/db/client.js', () => ({
  db: {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

describe('SMS Notification Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setTelnyxService(mockTelnyxService);
  });

  afterEach(() => {
    setTelnyxService(null as unknown as TelnyxService);
  });

  describe('E.164 Validation', () => {
    it('should validate correct E.164 numbers', () => {
      expect(validateE164('+15551234567')).toBe(true);
      expect(validateE164('+442071234567')).toBe(true);
      expect(validateE164('+61412345678')).toBe(true);
      expect(validateE164('+819012345678')).toBe(true);
    });

    it('should reject numbers without + prefix', () => {
      expect(validateE164('5551234567')).toBe(false);
      expect(validateE164('15551234567')).toBe(false);
    });

    it('should reject numbers starting with 0 after +', () => {
      expect(validateE164('+05551234567')).toBe(false);
    });

    it('should reject too short numbers', () => {
      // E.164 requires minimum 2 digits after + (country code + at least 1 subscriber digit)
      expect(validateE164('+1')).toBe(false);
      expect(validateE164('+')).toBe(false);
    });

    it('should reject non-numeric strings', () => {
      expect(validateE164('not-a-number')).toBe(false);
      expect(validateE164('+1abc123')).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(validateE164('')).toBe(false);
    });
  });

  describe('Error Categorization', () => {
    it('should categorize opted-out as unrecoverable', () => {
      expect(categorizeError('40300')).toBe('unrecoverable');
    });

    it('should categorize do-not-contact as unrecoverable', () => {
      expect(categorizeError('40301')).toBe('unrecoverable');
    });

    it('should categorize invalid number as unrecoverable', () => {
      expect(categorizeError('40012')).toBe('unrecoverable');
      expect(categorizeError('10002')).toBe('unrecoverable');
    });

    it('should categorize blocked spam as unrecoverable', () => {
      expect(categorizeError('40003')).toBe('unrecoverable');
    });

    it('should categorize rate limit as retryable', () => {
      expect(categorizeError('10011')).toBe('retryable');
    });

    it('should categorize AT&T rate limit as retryable', () => {
      expect(categorizeError('40018')).toBe('retryable');
    });

    it('should categorize internal error as retryable', () => {
      expect(categorizeError('50000')).toBe('retryable');
      expect(categorizeError('50001')).toBe('retryable');
    });

    it('should categorize service unavailable as retryable', () => {
      expect(categorizeError('40006')).toBe('retryable');
    });

    it('should categorize unknown codes as unknown', () => {
      expect(categorizeError('99999')).toBe('unknown');
      expect(categorizeError('12345')).toBe('unknown');
    });
  });

  describe('processSmsNotification', () => {
    const createMockJob = (
      data: Partial<SmsNotificationJobData> = {},
    ): Job<SmsNotificationJobData> => {
      const defaultData: SmsNotificationJobData = {
        organizationId: 'org-123',
        phoneNumber: '+15551234567',
        message: 'Test alert message',
        alertId: 'alert-456',
        ...data,
      };

      return {
        id: 'job-789',
        data: defaultData,
        attemptsMade: 0,
        opts: { attempts: 5 },
      } as unknown as Job<SmsNotificationJobData>;
    };

    it('should send SMS successfully', async () => {
      mockSendSms.mockResolvedValueOnce({
        messageId: 'msg-123',
        status: 'queued',
      });

      const job = createMockJob();
      const result = await processSmsNotification(job);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-123');
      expect(mockSendSms).toHaveBeenCalledWith({
        to: '+15551234567',
        message: 'Test alert message',
      });
    });

    it('should include deliveryId in tracking', async () => {
      mockSendSms.mockResolvedValueOnce({
        messageId: 'msg-456',
        status: 'queued',
      });

      const job = createMockJob({ deliveryId: 'delivery-789' });
      const result = await processSmsNotification(job);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-456');
    });

    it('should throw UnrecoverableError for invalid phone number', async () => {
      const job = createMockJob({ phoneNumber: 'invalid' });

      await expect(processSmsNotification(job)).rejects.toThrow(UnrecoverableError);
      await expect(processSmsNotification(job)).rejects.toThrow('Invalid phone number format');
    });

    it('should throw UnrecoverableError for phone without + prefix', async () => {
      const job = createMockJob({ phoneNumber: '5551234567' });

      await expect(processSmsNotification(job)).rejects.toThrow(UnrecoverableError);
    });

    it('should throw UnrecoverableError for opted-out number', async () => {
      mockSendSms.mockRejectedValueOnce({
        code: '40300',
        message: 'Number opted out',
      });

      const job = createMockJob();

      try {
        await processSmsNotification(job);
        expect.fail('Should have thrown UnrecoverableError');
      } catch (error) {
        expect(error).toBeInstanceOf(UnrecoverableError);
        expect((error as Error).message).toContain('Permanent SMS failure');
      }
    });

    it('should throw UnrecoverableError for invalid destination', async () => {
      mockSendSms.mockRejectedValueOnce({
        code: '40012',
        message: 'Invalid destination number',
      });

      const job = createMockJob();

      await expect(processSmsNotification(job)).rejects.toThrow(UnrecoverableError);
    });

    it('should throw regular Error for retryable failures', async () => {
      mockSendSms.mockRejectedValueOnce({
        code: '50000',
        message: 'Internal error',
      });

      const job = createMockJob();

      // First call should throw Error (not UnrecoverableError)
      try {
        await processSmsNotification(job);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(UnrecoverableError);
        expect((error as Error).message).toContain('retryable');
      }
    });

    it('should throw regular Error for rate limit failures', async () => {
      mockSendSms.mockRejectedValueOnce({
        code: '10011',
        message: 'Too many requests',
      });

      const job = createMockJob();

      try {
        await processSmsNotification(job);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(UnrecoverableError);
      }
    });

    it('should throw Error when TelnyxService not configured', async () => {
      setTelnyxService(null as unknown as TelnyxService);
      const job = createMockJob();

      await expect(processSmsNotification(job)).rejects.toThrow('TelnyxService not initialized');
    });

    it('should handle unknown error codes as retryable', async () => {
      mockSendSms.mockRejectedValueOnce({
        code: '99999',
        message: 'Unknown error',
      });

      const job = createMockJob();

      try {
        await processSmsNotification(job);
        expect.fail('Should have thrown');
      } catch (error) {
        // Unknown errors should trigger retry (not UnrecoverableError)
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(UnrecoverableError);
      }
    });
  });
});

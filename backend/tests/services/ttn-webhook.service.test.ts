import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  verifyHmacSignature,
  normalizeDeviceEui,
  extractBestSignalStrength,
  extractTemperature,
  extractHumidity,
  extractBattery,
  extractSensorData,
  convertToReading,
} from '../../src/services/ttn-webhook.service.js';
import type {
  TTNUplinkMessage,
  TTNUplinkWebhook,
  DecodedSensorPayload,
} from '../../src/schemas/ttn-webhooks.js';
import type { DeviceLookupResult } from '../../src/services/ttn-webhook.service.js';

describe('TTN Webhook Service', () => {
  describe('verifyHmacSignature', () => {
    const testSecret = 'test-webhook-secret-123';
    const testPayload = '{"test": "payload"}';

    it('should return true for valid HMAC signature', () => {
      // Generate expected signature
      const crypto = require('node:crypto');
      const expectedSignature = crypto
        .createHmac('sha256', testSecret)
        .update(testPayload)
        .digest('hex');

      expect(verifyHmacSignature(expectedSignature, testPayload, testSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      expect(verifyHmacSignature('invalid-signature', testPayload, testSecret)).toBe(false);
    });

    it('should return false for wrong secret', () => {
      const crypto = require('node:crypto');
      const signatureWithWrongSecret = crypto
        .createHmac('sha256', 'wrong-secret')
        .update(testPayload)
        .digest('hex');

      expect(verifyHmacSignature(signatureWithWrongSecret, testPayload, testSecret)).toBe(false);
    });

    it('should return false for tampered payload', () => {
      const crypto = require('node:crypto');
      const originalSignature = crypto
        .createHmac('sha256', testSecret)
        .update(testPayload)
        .digest('hex');

      expect(verifyHmacSignature(originalSignature, '{"test": "tampered"}', testSecret)).toBe(false);
    });

    it('should handle Buffer payloads', () => {
      const crypto = require('node:crypto');
      const bufferPayload = Buffer.from(testPayload);
      const expectedSignature = crypto
        .createHmac('sha256', testSecret)
        .update(bufferPayload)
        .digest('hex');

      expect(verifyHmacSignature(expectedSignature, bufferPayload, testSecret)).toBe(true);
    });
  });

  describe('normalizeDeviceEui', () => {
    it('should uppercase EUI', () => {
      expect(normalizeDeviceEui('ac1f09fffe01454e')).toBe('AC1F09FFFE01454E');
    });

    it('should remove colons', () => {
      expect(normalizeDeviceEui('AC:1F:09:FF:FE:01:45:4E')).toBe('AC1F09FFFE01454E');
    });

    it('should remove dashes', () => {
      expect(normalizeDeviceEui('AC1F09FF-FE01454E')).toBe('AC1F09FFFE01454E');
    });

    it('should handle already normalized EUI', () => {
      expect(normalizeDeviceEui('AC1F09FFFE01454E')).toBe('AC1F09FFFE01454E');
    });

    it('should handle mixed case and separators', () => {
      expect(normalizeDeviceEui('ac:1f:09:ff-fe:01:45:4e')).toBe('AC1F09FFFE01454E');
    });
  });

  describe('extractBestSignalStrength', () => {
    it('should return undefined for empty array', () => {
      expect(extractBestSignalStrength([])).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      expect(extractBestSignalStrength(undefined)).toBeUndefined();
    });

    it('should return single RSSI value', () => {
      expect(extractBestSignalStrength([{ rssi: -75 }])).toBe(-75);
    });

    it('should prefer channel_rssi over rssi', () => {
      expect(extractBestSignalStrength([{ rssi: -80, channel_rssi: -75 }])).toBe(-75);
    });

    it('should return strongest signal from multiple gateways', () => {
      const metadata = [
        { rssi: -90 },
        { rssi: -75 },
        { rssi: -85 },
      ];
      expect(extractBestSignalStrength(metadata)).toBe(-75);
    });

    it('should handle mixed RSSI types', () => {
      const metadata = [
        { channel_rssi: -80 },
        { rssi: -70 },
        { channel_rssi: -65 },
      ];
      expect(extractBestSignalStrength(metadata)).toBe(-65);
    });

    it('should skip entries without RSSI', () => {
      const metadata = [
        {},
        { rssi: -80 },
        { snr: 10 },
      ];
      expect(extractBestSignalStrength(metadata)).toBe(-80);
    });
  });

  describe('extractTemperature', () => {
    it('should extract temperature field', () => {
      expect(extractTemperature({ temperature: 25.5 })).toBe(25.5);
    });

    it('should extract temp field', () => {
      expect(extractTemperature({ temp: 22.3 })).toBe(22.3);
    });

    it('should extract temperature_c field', () => {
      expect(extractTemperature({ temperature_c: 18.7 })).toBe(18.7);
    });

    it('should convert temperature_f to Celsius', () => {
      // 77°F = 25°C
      const result = extractTemperature({ temperature_f: 77 });
      expect(result).toBeCloseTo(25, 1);
    });

    it('should prefer temperature over other fields', () => {
      expect(extractTemperature({ temperature: 20, temp: 25, temperature_f: 100 })).toBe(20);
    });

    it('should return undefined for missing temperature', () => {
      expect(extractTemperature({ humidity: 50 })).toBeUndefined();
    });

    it('should handle zero temperature', () => {
      expect(extractTemperature({ temperature: 0 })).toBe(0);
    });

    it('should handle negative temperature', () => {
      expect(extractTemperature({ temperature: -10.5 })).toBe(-10.5);
    });
  });

  describe('extractHumidity', () => {
    it('should extract humidity field', () => {
      expect(extractHumidity({ humidity: 65.5 })).toBe(65.5);
    });

    it('should extract relative_humidity field', () => {
      expect(extractHumidity({ relative_humidity: 72.3 })).toBe(72.3);
    });

    it('should extract rh field', () => {
      expect(extractHumidity({ rh: 55 })).toBe(55);
    });

    it('should prefer humidity over other fields', () => {
      expect(extractHumidity({ humidity: 60, relative_humidity: 70, rh: 80 })).toBe(60);
    });

    it('should return undefined for missing humidity', () => {
      expect(extractHumidity({ temperature: 25 })).toBeUndefined();
    });
  });

  describe('extractBattery', () => {
    it('should extract battery percentage', () => {
      expect(extractBattery({ battery: 85 })).toBe(85);
    });

    it('should extract battery_level field', () => {
      expect(extractBattery({ battery_level: 72.5 })).toBe(73);
    });

    it('should extract batt field', () => {
      expect(extractBattery({ batt: 50 })).toBe(50);
    });

    it('should convert battery voltage to percentage', () => {
      // 3.6V is midpoint between 3.0V (0%) and 4.2V (100%)
      const result = extractBattery({ battery_voltage: 3.6 });
      expect(result).toBe(50);
    });

    it('should convert millivolt battery voltage', () => {
      // 3600mV = 3.6V = 50%
      const result = extractBattery({ battery_voltage: 3600 });
      expect(result).toBe(50);
    });

    it('should clamp low voltage to 0%', () => {
      expect(extractBattery({ battery_voltage: 2.5 })).toBe(0);
    });

    it('should clamp high voltage to 100%', () => {
      expect(extractBattery({ battery_voltage: 4.5 })).toBe(100);
    });

    it('should return undefined for missing battery', () => {
      expect(extractBattery({ temperature: 25 })).toBeUndefined();
    });

    it('should handle 0% battery', () => {
      expect(extractBattery({ battery: 0 })).toBe(0);
    });

    it('should handle 100% battery', () => {
      expect(extractBattery({ battery: 100 })).toBe(100);
    });
  });

  describe('extractSensorData', () => {
    const baseUplinkMessage: TTNUplinkMessage = {
      f_port: 1,
      received_at: '2024-01-15T12:00:00Z',
      frm_payload: 'dGVzdA==',
      rx_metadata: [
        { gateway_ids: { gateway_id: 'gw1' }, rssi: -75, snr: 8.5 },
      ],
    };

    it('should extract all sensor fields', () => {
      const message: TTNUplinkMessage = {
        ...baseUplinkMessage,
        decoded_payload: {
          temperature: 25.5,
          humidity: 60,
          battery: 85,
        },
      };

      const result = extractSensorData(message);

      expect(result.temperature).toBe(25.5);
      expect(result.humidity).toBe(60);
      expect(result.battery).toBe(85);
      expect(result.signalStrength).toBe(-75);
      expect(result.rawPayload).toBe('dGVzdA==');
    });

    it('should extract only temperature when other fields missing', () => {
      const message: TTNUplinkMessage = {
        ...baseUplinkMessage,
        decoded_payload: {
          temperature: 18.3,
        },
      };

      const result = extractSensorData(message);

      expect(result.temperature).toBe(18.3);
      expect(result.humidity).toBeUndefined();
      expect(result.battery).toBeUndefined();
    });

    it('should throw error when decoded_payload is missing', () => {
      const message: TTNUplinkMessage = {
        ...baseUplinkMessage,
        decoded_payload: undefined,
      };

      expect(() => extractSensorData(message)).toThrow(
        'No decoded_payload in uplink message'
      );
    });

    it('should throw error when temperature is missing', () => {
      const message: TTNUplinkMessage = {
        ...baseUplinkMessage,
        decoded_payload: {
          humidity: 60,
        },
      };

      expect(() => extractSensorData(message)).toThrow(
        'Could not extract temperature from decoded_payload'
      );
    });

    it('should handle various field naming conventions', () => {
      const message: TTNUplinkMessage = {
        ...baseUplinkMessage,
        decoded_payload: {
          temp: 22.5,
          relative_humidity: 55,
          battery_voltage: 3.9,
        },
      };

      const result = extractSensorData(message);

      expect(result.temperature).toBe(22.5);
      expect(result.humidity).toBe(55);
      expect(result.battery).toBe(75); // 3.9V ≈ 75%
    });
  });

  describe('convertToReading', () => {
    const testWebhook: TTNUplinkWebhook = {
      end_device_ids: {
        device_id: 'test-device',
        application_ids: {
          application_id: 'test-app',
        },
        dev_eui: 'AC1F09FFFE01454E',
      },
      received_at: '2024-01-15T12:00:00Z',
      uplink_message: {
        f_port: 1,
        received_at: '2024-01-15T12:00:00.500Z',
        decoded_payload: {
          temperature: 25.5,
          humidity: 60,
          battery: 85,
        },
        rx_metadata: [
          { gateway_ids: { gateway_id: 'gw1' }, rssi: -75 },
        ],
        frm_payload: 'dGVzdA==',
      },
    };

    const testDeviceLookup: DeviceLookupResult = {
      deviceId: 'device-uuid-123',
      unitId: 'unit-uuid-456',
      organizationId: 'org-uuid-789',
      deviceEui: 'AC1F09FFFE01454E',
    };

    const testSensorData = {
      temperature: 25.5,
      humidity: 60,
      battery: 85,
      signalStrength: -75,
      rawPayload: 'dGVzdA==',
    };

    it('should convert to SingleReading format', () => {
      const result = convertToReading(testWebhook, testDeviceLookup, testSensorData);

      expect(result.unitId).toBe('unit-uuid-456');
      expect(result.deviceId).toBe('device-uuid-123');
      expect(result.temperature).toBe(25.5);
      expect(result.humidity).toBe(60);
      expect(result.battery).toBe(85);
      expect(result.signalStrength).toBe(-75);
      expect(result.source).toBe('ttn');
      expect(result.rawPayload).toBe('dGVzdA==');
    });

    it('should use uplink_message.received_at as recordedAt', () => {
      const result = convertToReading(testWebhook, testDeviceLookup, testSensorData);

      expect(result.recordedAt).toBe('2024-01-15T12:00:00.500Z');
    });

    it('should handle optional fields', () => {
      const minimalSensorData = {
        temperature: 20,
      };

      const result = convertToReading(testWebhook, testDeviceLookup, minimalSensorData);

      expect(result.temperature).toBe(20);
      expect(result.humidity).toBeUndefined();
      expect(result.battery).toBeUndefined();
      expect(result.signalStrength).toBeUndefined();
    });
  });
});

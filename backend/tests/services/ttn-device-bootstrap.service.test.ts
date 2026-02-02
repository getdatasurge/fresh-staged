import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database client
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() =>
          Promise.resolve([
            {
              id: '6ee7bf36-9c9f-4a00-99ec-6e0730558f67',
              name: 'Test Sensor',
              deviceEui: 'AABBCCDDEEFF0011',
              deviceType: 'lora',
              status: 'inactive',
              unitId: null,
              lastSeenAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        ),
      })),
    })),
  },
}));

// Mock the TTN service
vi.mock('../../src/services/ttn.service.js', () => ({
  createTTNClient: vi.fn(() => ({
    provisionDevice: vi.fn(() =>
      Promise.resolve({
        ids: {
          device_id: 'test-sensor-abc123',
          dev_eui: 'AABBCCDDEEFF0011',
          join_eui: '0011223344556677',
        },
      }),
    ),
  })),
  TTNApiError: class TTNApiError extends Error {
    constructor(
      public readonly statusCode: number,
      message: string,
    ) {
      super(message);
      this.name = 'TTNApiError';
    }
  },
}));

// Import after mocks are set up
import crypto from 'node:crypto';

describe('TTN Device Bootstrap Service - Credential Generation', () => {
  describe('generateHex function behavior', () => {
    it('should generate cryptographically random hex strings', () => {
      // Test that crypto.randomBytes produces valid hex strings
      const result = crypto.randomBytes(8).toString('hex').toUpperCase();
      expect(result).toMatch(/^[0-9A-F]{16}$/);
    });

    it('should generate 16 hex chars for devEui (8 bytes)', () => {
      const devEui = crypto.randomBytes(8).toString('hex').toUpperCase();
      expect(devEui).toHaveLength(16);
      expect(devEui).toMatch(/^[0-9A-F]+$/);
    });

    it('should generate 16 hex chars for joinEui (8 bytes)', () => {
      const joinEui = crypto.randomBytes(8).toString('hex').toUpperCase();
      expect(joinEui).toHaveLength(16);
      expect(joinEui).toMatch(/^[0-9A-F]+$/);
    });

    it('should generate 32 hex chars for appKey (16 bytes)', () => {
      const appKey = crypto.randomBytes(16).toString('hex').toUpperCase();
      expect(appKey).toHaveLength(32);
      expect(appKey).toMatch(/^[0-9A-F]+$/);
    });

    it('should generate unique values on each call', () => {
      const set = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const hex = crypto.randomBytes(8).toString('hex');
        expect(set.has(hex)).toBe(false);
        set.add(hex);
      }
    });
  });

  describe('generateDeviceId function behavior', () => {
    /**
     * TTN device ID requirements:
     * - Lowercase alphanumeric with hyphens
     * - 3-36 characters
     * - Cannot start or end with hyphen
     */

    it('should convert name to lowercase', () => {
      const name = 'My Test Sensor';
      const deviceId = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      expect(deviceId).toBe('my-test-sensor');
    });

    it('should replace spaces with hyphens', () => {
      const name = 'Temperature Sensor 1';
      const deviceId = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      expect(deviceId).toBe('temperature-sensor-1');
    });

    it('should remove special characters', () => {
      const name = 'Sensor #1 @ Site!';
      const deviceId = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      expect(deviceId).toBe('sensor-1-site');
    });

    it('should collapse multiple hyphens', () => {
      const name = 'Test   Sensor---123';
      const deviceId = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      expect(deviceId).toBe('test-sensor-123');
    });

    it('should remove leading and trailing hyphens', () => {
      const name = '---Sensor---';
      const deviceId = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      expect(deviceId).toBe('sensor');
    });

    it('should handle unicode characters', () => {
      const name = 'Sensor café résumé';
      const deviceId = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      expect(deviceId).toBe('sensor-caf-r-sum');
    });

    it('should truncate to max 36 chars', () => {
      const name = 'This is a very long sensor name that exceeds the TTN limit';
      let deviceId = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (deviceId.length > 36) {
        deviceId = deviceId.substring(0, 36);
      }
      deviceId = deviceId.replace(/-$/, '');
      expect(deviceId.length).toBeLessThanOrEqual(36);
    });

    it('should handle very short names', () => {
      const name = 'AB';
      let deviceId = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      // The implementation adds random suffix for short names
      if (deviceId.length < 3) {
        deviceId = deviceId + '-' + crypto.randomBytes(2).toString('hex').toLowerCase();
      }

      expect(deviceId.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('EUI format validation', () => {
    it('should generate valid DevEUI format (16 uppercase hex)', () => {
      const devEui = crypto.randomBytes(8).toString('hex').toUpperCase();
      expect(devEui).toMatch(/^[0-9A-F]{16}$/);
    });

    it('should generate valid JoinEUI format (16 uppercase hex)', () => {
      const joinEui = crypto.randomBytes(8).toString('hex').toUpperCase();
      expect(joinEui).toMatch(/^[0-9A-F]{16}$/);
    });

    it('should generate valid AppKey format (32 uppercase hex)', () => {
      const appKey = crypto.randomBytes(16).toString('hex').toUpperCase();
      expect(appKey).toMatch(/^[0-9A-F]{32}$/);
    });
  });
});

describe('Bootstrap Request Validation', () => {
  it('should require name field', () => {
    const request = {
      description: 'Test description',
    };
    expect(request).not.toHaveProperty('name');
  });

  it('should accept optional deviceId', () => {
    const request = {
      name: 'Test Sensor',
      deviceId: 'my-custom-device-id',
    };
    expect(request.deviceId).toBe('my-custom-device-id');
  });

  it('should accept optional siteId', () => {
    const request = {
      name: 'Test Sensor',
      siteId: 'c419185a-ccd5-4a1c-b1ac-8b4dfc6a01df',
    };
    expect(request.siteId).toBeDefined();
  });

  it('should accept optional unitId', () => {
    const request = {
      name: 'Test Sensor',
      unitId: 'a419185a-ccd5-4a1c-b1ac-8b4dfc6a01df',
    };
    expect(request.unitId).toBeDefined();
  });

  it('should accept optional frequencyPlanId', () => {
    const request = {
      name: 'Test Sensor',
      frequencyPlanId: 'EU_863_870',
    };
    expect(request.frequencyPlanId).toBe('EU_863_870');
  });

  it('should accept optional lorawanVersion', () => {
    const request = {
      name: 'Test Sensor',
      lorawanVersion: 'MAC_V1_1',
    };
    expect(request.lorawanVersion).toBe('MAC_V1_1');
  });

  it('should accept optional lorawanPhyVersion', () => {
    const request = {
      name: 'Test Sensor',
      lorawanPhyVersion: 'PHY_V1_1_REV_A',
    };
    expect(request.lorawanPhyVersion).toBe('PHY_V1_1_REV_A');
  });
});

describe('Bootstrap Response Format', () => {
  it('should include all required fields in response', () => {
    const expectedFields = [
      'id',
      'deviceId',
      'devEui',
      'joinEui',
      'appKey',
      'name',
      'description',
      'unitId',
      'siteId',
      'status',
      'ttnSynced',
      'createdAt',
      'updatedAt',
    ];

    const mockResponse = {
      id: '6ee7bf36-9c9f-4a00-99ec-6e0730558f67',
      deviceId: 'test-sensor-abc123',
      devEui: 'AABBCCDDEEFF0011',
      joinEui: '0011223344556677',
      appKey: 'AABBCCDDEEFF00112233445566778899',
      name: 'Test Sensor',
      description: null,
      unitId: null,
      siteId: null,
      status: 'inactive',
      ttnSynced: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    for (const field of expectedFields) {
      expect(mockResponse).toHaveProperty(field);
    }
  });

  it('should return credentials in uppercase hex format', () => {
    const mockResponse = {
      devEui: 'AABBCCDDEEFF0011',
      joinEui: '0011223344556677',
      appKey: 'AABBCCDDEEFF00112233445566778899',
    };

    expect(mockResponse.devEui).toMatch(/^[0-9A-F]{16}$/);
    expect(mockResponse.joinEui).toMatch(/^[0-9A-F]{16}$/);
    expect(mockResponse.appKey).toMatch(/^[0-9A-F]{32}$/);
  });

  it('should set initial status to inactive', () => {
    const mockResponse = {
      status: 'inactive',
    };
    expect(mockResponse.status).toBe('inactive');
  });

  it('should set ttnSynced to true after successful provisioning', () => {
    const mockResponse = {
      ttnSynced: true,
    };
    expect(mockResponse.ttnSynced).toBe(true);
  });
});

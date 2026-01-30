import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TTNClient,
  TTNApiError,
  createTTNClient,
  getTTNConfigFromEnv,
  type TTNConfig,
} from '../../src/services/ttn.service.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TTN Service', () => {
  const testConfig: TTNConfig = {
    apiUrl: 'https://nam1.cloud.thethings.network',
    applicationId: 'test-app',
    apiKey: 'NNSXS.TEST-API-KEY.SECRET',
  };

  let client: TTNClient;

  beforeEach(() => {
    client = new TTNClient(testConfig);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('TTNClient constructor', () => {
    it('should strip trailing slash from API URL', () => {
      const clientWithSlash = new TTNClient({
        ...testConfig,
        apiUrl: 'https://nam1.cloud.thethings.network/',
      });
      expect(clientWithSlash).toBeDefined();
    });
  });

  describe('listDevices', () => {
    it('should list devices from TTN application', async () => {
      const mockDevices = {
        end_devices: [
          {
            ids: {
              device_id: 'my-sensor-001',
              application_ids: { application_id: 'test-app' },
              dev_eui: '0011223344556677',
            },
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            name: 'My Sensor',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDevices),
      });

      const devices = await client.listDevices();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://nam1.cloud.thethings.network/api/v3/applications/test-app/devices',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer NNSXS.TEST-API-KEY.SECRET',
          }),
        }),
      );
      expect(devices).toHaveLength(1);
      expect(devices[0].ids.device_id).toBe('my-sensor-001');
    });

    it('should return empty array when no devices exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ end_devices: [] }),
      });

      const devices = await client.listDevices();
      expect(devices).toEqual([]);
    });

    it('should handle missing end_devices field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const devices = await client.listDevices();
      expect(devices).toEqual([]);
    });

    it('should throw TTNApiError on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ message: 'Unauthorized' })),
      });

      await expect(client.listDevices()).rejects.toThrow(TTNApiError);
    });
  });

  describe('getDevice', () => {
    it('should get device by ID', async () => {
      const mockDevice = {
        ids: {
          device_id: 'my-sensor-001',
          application_ids: { application_id: 'test-app' },
          dev_eui: '0011223344556677',
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        name: 'My Sensor',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDevice),
      });

      const device = await client.getDevice('my-sensor-001');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://nam1.cloud.thethings.network/api/v3/applications/test-app/devices/my-sensor-001',
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(device?.ids.device_id).toBe('my-sensor-001');
    });

    it('should return null for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve(JSON.stringify({ message: 'Not found' })),
      });

      const device = await client.getDevice('non-existent');
      expect(device).toBeNull();
    });

    it('should throw for other errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ message: 'Server error' })),
      });

      await expect(client.getDevice('my-sensor-001')).rejects.toThrow(TTNApiError);
    });
  });

  describe('provisionDevice', () => {
    const provisionParams = {
      deviceId: 'my-sensor-001',
      devEui: '0011223344556677',
      joinEui: '70B3D57ED0000000',
      appKey: '0011223344556677889900AABBCCDDEEFF',
      name: 'My Sensor',
      description: 'Test sensor',
    };

    it('should provision device in all TTN components', async () => {
      // Mock all 4 API calls (Identity, Join Server, Network Server, App Server)
      const mockDevice = {
        ids: {
          device_id: 'my-sensor-001',
          application_ids: { application_id: 'test-app' },
          dev_eui: '0011223344556677',
          join_eui: '70B3D57ED0000000',
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        name: 'My Sensor',
      };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockDevice) }) // Identity Server
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }) // Join Server
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }) // Network Server
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }); // App Server

      const device = await client.provisionDevice(provisionParams);

      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(device.ids.device_id).toBe('my-sensor-001');
    });

    it('should use default frequency plan if not specified', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ids: { device_id: 'test' } }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      await client.provisionDevice(provisionParams);

      // Check Network Server call includes default frequency plan
      const nsCall = mockFetch.mock.calls[2];
      const nsBody = JSON.parse(nsCall[1].body);
      expect(nsBody.end_device.frequency_plan_id).toBe('US_902_928_FSB_2');
    });

    it('should normalize EUI values to uppercase', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ids: { device_id: 'test' } }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      await client.provisionDevice({
        ...provisionParams,
        devEui: 'aabbccddeeff0011',
      });

      const identityCall = mockFetch.mock.calls[0];
      const identityBody = JSON.parse(identityCall[1].body);
      expect(identityBody.end_device.ids.dev_eui).toBe('AABBCCDDEEFF0011');
    });

    it('should throw TTNApiError on provisioning failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: () => Promise.resolve(JSON.stringify({ message: 'Device already exists' })),
      });

      await expect(client.provisionDevice(provisionParams)).rejects.toThrow(TTNApiError);
    });
  });

  describe('updateDevice', () => {
    it('should update device name', async () => {
      const mockDevice = {
        ids: {
          device_id: 'my-sensor-001',
          application_ids: { application_id: 'test-app' },
        },
        name: 'Updated Name',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDevice),
      });

      const device = await client.updateDevice('my-sensor-001', { name: 'Updated Name' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://nam1.cloud.thethings.network/api/v3/applications/test-app/devices/my-sensor-001',
        expect.objectContaining({
          method: 'PUT',
        }),
      );
      expect(device.name).toBe('Updated Name');
    });

    it('should update multiple fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ids: { device_id: 'test' } }),
      });

      await client.updateDevice('my-sensor-001', {
        name: 'New Name',
        description: 'New Description',
        attributes: { location: 'warehouse' },
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.field_mask.paths).toContain('name');
      expect(body.field_mask.paths).toContain('description');
      expect(body.field_mask.paths).toContain('attributes');
    });

    it('should only include provided fields in update', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ids: { device_id: 'test' } }),
      });

      await client.updateDevice('my-sensor-001', { name: 'New Name' });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.field_mask.paths).toEqual(['name']);
    });
  });

  describe('deprovisionDevice', () => {
    it('should delete device from all TTN components', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true }) // App Server
        .mockResolvedValueOnce({ ok: true }) // Network Server
        .mockResolvedValueOnce({ ok: true }) // Join Server
        .mockResolvedValueOnce({ ok: true }); // Identity Server

      await client.deprovisionDevice('my-sensor-001');

      expect(mockFetch).toHaveBeenCalledTimes(4);

      // Verify each component is called with DELETE
      for (const call of mockFetch.mock.calls) {
        expect(call[1].method).toBe('DELETE');
      }
    });

    it('should handle 404 gracefully during deprovisioning', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false, status: 404 }); // Identity Server 404

      // Should not throw
      await expect(client.deprovisionDevice('my-sensor-001')).resolves.toBeUndefined();
    });

    it('should throw on non-404 errors during deprovisioning', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server error'),
        });

      await expect(client.deprovisionDevice('my-sensor-001')).rejects.toThrow();
    });
  });

  describe('validateApiKey', () => {
    it('should identify personal API key with gateway rights', async () => {
      const authInfoResponse = {
        api_key: {
          api_key: {
            rights: ['RIGHT_GATEWAY_ALL', 'RIGHT_APPLICATION_ALL'],
          },
          entity_ids: {
            user_ids: { user_id: 'test-user' },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authInfoResponse),
      });

      const result = await client.validateApiKey();

      expect(result.key_type).toBe('personal');
      expect(result.owner_scope).toBe('user');
      expect(result.scope_id).toBe('test-user');
      expect(result.has_gateway_rights).toBe(true);
      expect(result.allowed).toBe(true);
      expect(result.missing_rights).toEqual([]);
    });

    it('should identify organization API key', async () => {
      const authInfoResponse = {
        api_key: {
          api_key: {
            rights: ['RIGHT_GATEWAY_INFO', 'RIGHT_GATEWAY_SETTINGS_BASIC'],
          },
          entity_ids: {
            organization_ids: { organization_id: 'test-org' },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authInfoResponse),
      });

      const result = await client.validateApiKey();

      expect(result.key_type).toBe('organization');
      expect(result.owner_scope).toBe('organization');
      expect(result.scope_id).toBe('test-org');
      expect(result.has_gateway_rights).toBe(true);
      expect(result.allowed).toBe(true);
    });

    it('should reject application API keys for gateway provisioning', async () => {
      const authInfoResponse = {
        api_key: {
          api_key: {
            rights: ['RIGHT_APPLICATION_ALL'],
          },
          entity_ids: {
            application_ids: { application_id: 'test-app' },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authInfoResponse),
      });

      const result = await client.validateApiKey();

      expect(result.key_type).toBe('application');
      expect(result.allowed).toBe(false);
      expect(result.has_gateway_rights).toBe(false);
    });

    it('should detect missing gateway write rights', async () => {
      const authInfoResponse = {
        api_key: {
          api_key: {
            rights: ['RIGHT_GATEWAY_INFO'], // read only, no write
          },
          entity_ids: {
            user_ids: { user_id: 'test-user' },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authInfoResponse),
      });

      const result = await client.validateApiKey();

      expect(result.key_type).toBe('personal');
      expect(result.has_gateway_rights).toBe(false);
      expect(result.allowed).toBe(false);
      expect(result.missing_rights).toContain('gateways:write');
    });

    it('should handle invalid/expired API key (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await client.validateApiKey();

      expect(result.allowed).toBe(false);
      expect(result.key_type).toBe('unknown');
      expect(result.has_gateway_rights).toBe(false);
    });

    it('should allow validating a different API key', async () => {
      const authInfoResponse = {
        api_key: {
          api_key: { rights: ['RIGHT_GATEWAY_ALL'] },
          entity_ids: { user_ids: { user_id: 'other-user' } },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authInfoResponse),
      });

      const result = await client.validateApiKey('NNSXS.OTHER-KEY.SECRET');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://nam1.cloud.thethings.network/api/v3/auth_info',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer NNSXS.OTHER-KEY.SECRET',
          }),
        }),
      );
      expect(result.allowed).toBe(true);
    });

    it('should use universal_rights as fallback when inner rights missing', async () => {
      const authInfoResponse = {
        universal_rights: ['RIGHT_GATEWAY_ALL'],
        api_key: {
          entity_ids: {
            user_ids: { user_id: 'admin-user' },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authInfoResponse),
      });

      const result = await client.validateApiKey();

      expect(result.has_gateway_rights).toBe(true);
      expect(result.allowed).toBe(true);
    });

    it('should throw TTNApiError for server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      });

      await expect(client.validateApiKey()).rejects.toThrow(TTNApiError);
    });
  });

  describe('getApplicationInfo', () => {
    it('should get application info', async () => {
      const mockApp = {
        ids: { application_id: 'test-app' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        name: 'Test Application',
        description: 'A test TTN application',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApp),
      });

      const appInfo = await client.getApplicationInfo();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://nam1.cloud.thethings.network/api/v3/applications/test-app',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer NNSXS.TEST-API-KEY.SECRET',
          }),
        }),
      );
      expect(appInfo.ids.application_id).toBe('test-app');
      expect(appInfo.name).toBe('Test Application');
    });

    it('should throw TTNApiError for 404 (app not found)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve(JSON.stringify({ message: 'Application not found' })),
      });

      await expect(client.getApplicationInfo()).rejects.toThrow(TTNApiError);
    });

    it('should throw TTNApiError for 401 (invalid credentials)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ message: 'Unauthorized' })),
      });

      await expect(client.getApplicationInfo()).rejects.toThrow(TTNApiError);
    });
  });

  describe('TTNApiError', () => {
    it('should include status code', () => {
      const error = new TTNApiError(401, 'Unauthorized');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Unauthorized');
      expect(error.name).toBe('TTNApiError');
    });
  });

  describe('createTTNClient', () => {
    it('should create a TTN client', () => {
      const client = createTTNClient(testConfig);
      expect(client).toBeInstanceOf(TTNClient);
    });
  });

  describe('getTTNConfigFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return config from environment variables', () => {
      process.env.TTN_API_URL = 'https://test.api.url';
      process.env.TTN_APPLICATION_ID = 'my-app';
      process.env.TTN_API_KEY = 'my-key';

      const config = getTTNConfigFromEnv();

      expect(config).toEqual({
        apiUrl: 'https://test.api.url',
        applicationId: 'my-app',
        apiKey: 'my-key',
      });
    });

    it('should return null if API URL is missing', () => {
      process.env.TTN_APPLICATION_ID = 'my-app';
      process.env.TTN_API_KEY = 'my-key';
      delete process.env.TTN_API_URL;

      const config = getTTNConfigFromEnv();
      expect(config).toBeNull();
    });

    it('should return null if application ID is missing', () => {
      process.env.TTN_API_URL = 'https://test.api.url';
      process.env.TTN_API_KEY = 'my-key';
      delete process.env.TTN_APPLICATION_ID;

      const config = getTTNConfigFromEnv();
      expect(config).toBeNull();
    });

    it('should return null if API key is missing', () => {
      process.env.TTN_API_URL = 'https://test.api.url';
      process.env.TTN_APPLICATION_ID = 'my-app';
      delete process.env.TTN_API_KEY;

      const config = getTTNConfigFromEnv();
      expect(config).toBeNull();
    });
  });
});

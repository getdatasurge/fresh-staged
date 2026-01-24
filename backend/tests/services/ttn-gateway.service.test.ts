import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TTNClient,
  TTNApiError,
  type TTNGateway,
} from '../../src/services/ttn.service.js';

describe('TTNClient Gateway Methods', () => {
  let client: TTNClient;
  const mockConfig = {
    apiUrl: 'https://nam1.cloud.thethings.network',
    applicationId: 'test-app',
    apiKey: 'NNSXS.TEST-API-KEY',
  };

  beforeEach(() => {
    client = new TTNClient(mockConfig);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  const mockGateway: TTNGateway = {
    ids: {
      gateway_id: 'my-gateway-001',
      eui: '0011223344556677',
    },
    created_at: '2025-01-24T00:00:00Z',
    updated_at: '2025-01-24T00:00:00Z',
    name: 'Main Building Gateway',
    description: 'Gateway on the rooftop',
    frequency_plan_id: 'US_902_928_FSB_2',
    gateway_server_address: 'nam1.cloud.thethings.network',
    antennas: [
      {
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: 50,
          source: 'SOURCE_REGISTRY',
        },
      },
    ],
  };

  describe('listGateways', () => {
    it('should list all gateways', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ gateways: [mockGateway] }),
      } as Response);

      const gateways = await client.listGateways();

      expect(gateways).toHaveLength(1);
      expect(gateways[0].ids.gateway_id).toBe('my-gateway-001');
      expect(fetch).toHaveBeenCalledWith(
        'https://nam1.cloud.thethings.network/api/v3/gateways',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer NNSXS.TEST-API-KEY',
          }),
        })
      );
    });

    it('should return empty array when no gateways exist', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const gateways = await client.listGateways();

      expect(gateways).toEqual([]);
    });

    it('should throw TTNApiError on failure', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ message: 'Permission denied' }),
      } as Response);

      await expect(client.listGateways()).rejects.toThrow(TTNApiError);
      await expect(client.listGateways()).rejects.toThrow('Permission denied');
    });
  });

  describe('getGateway', () => {
    it('should get a specific gateway', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockGateway,
      } as Response);

      const gateway = await client.getGateway('my-gateway-001');

      expect(gateway).toBeDefined();
      expect(gateway?.ids.gateway_id).toBe('my-gateway-001');
      expect(fetch).toHaveBeenCalledWith(
        'https://nam1.cloud.thethings.network/api/v3/gateways/my-gateway-001',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should return null for non-existent gateway', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: 'Gateway not found' }),
      } as Response);

      const gateway = await client.getGateway('non-existent');

      expect(gateway).toBeNull();
    });
  });

  describe('getGatewayStatus', () => {
    it('should get gateway status when online', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ last_status_received_at: '2025-01-24T10:00:00Z' }),
      } as Response);

      const status = await client.getGatewayStatus('my-gateway-001');

      expect(status).toEqual({
        online: true,
        last_seen_at: '2025-01-24T10:00:00Z',
      });
      expect(fetch).toHaveBeenCalledWith(
        'https://nam1.cloud.thethings.network/api/v3/gs/gateways/my-gateway-001/connection/stats',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return offline status when no stats available', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const status = await client.getGatewayStatus('my-gateway-001');

      expect(status).toEqual({ online: false });
    });

    it('should return offline for 404 response', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: 'Not found' }),
      } as Response);

      const status = await client.getGatewayStatus('my-gateway-001');

      expect(status).toEqual({ online: false });
    });
  });

  describe('registerGateway', () => {
    it('should register a gateway with minimal params', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockGateway,
      } as Response);

      const gateway = await client.registerGateway({
        gatewayId: 'my-gateway-001',
        gatewayEui: '0011223344556677',
      });

      expect(gateway.ids.gateway_id).toBe('my-gateway-001');
      expect(fetch).toHaveBeenCalledWith(
        'https://nam1.cloud.thethings.network/api/v3/users/me/gateways',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"gateway_id":"my-gateway-001"'),
        })
      );
    });

    it('should normalize EUI to uppercase', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockGateway,
      } as Response);

      await client.registerGateway({
        gatewayId: 'my-gateway-001',
        gatewayEui: 'aabbccddeeff0011',
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"eui":"AABBCCDDEEFF0011"'),
        })
      );
    });

    it('should include location when coordinates provided', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockGateway,
      } as Response);

      await client.registerGateway({
        gatewayId: 'my-gateway-001',
        gatewayEui: '0011223344556677',
        latitude: 37.7749,
        longitude: -122.4194,
        altitude: 50,
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"latitude":37.7749'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"antennas"'),
        })
      );
    });

    it('should apply default frequency plan', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockGateway,
      } as Response);

      await client.registerGateway({
        gatewayId: 'my-gateway-001',
        gatewayEui: '0011223344556677',
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"frequency_plan_id":"US_902_928_FSB_2"'),
        })
      );
    });

    it('should throw TTNApiError on registration failure', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 409,
        text: async () => JSON.stringify({ message: 'Gateway already exists' }),
      } as Response);

      await expect(
        client.registerGateway({
          gatewayId: 'my-gateway-001',
          gatewayEui: '0011223344556677',
        })
      ).rejects.toThrow(TTNApiError);
    });
  });

  describe('updateGateway', () => {
    it('should update gateway name', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ ...mockGateway, name: 'New Name' }),
      } as Response);

      const gateway = await client.updateGateway('my-gateway-001', {
        name: 'New Name',
      });

      expect(gateway.name).toBe('New Name');
      expect(fetch).toHaveBeenCalledWith(
        'https://nam1.cloud.thethings.network/api/v3/gateways/my-gateway-001',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"name":"New Name"'),
        })
      );
    });

    it('should only include specified fields in field_mask', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockGateway,
      } as Response);

      await client.updateGateway('my-gateway-001', {
        name: 'New Name',
        description: 'New Description',
      });

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);

      expect(body.field_mask.paths).toContain('name');
      expect(body.field_mask.paths).toContain('description');
      expect(body.field_mask.paths).not.toContain('frequency_plan_id');
    });

    it('should update location', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockGateway,
      } as Response);

      await client.updateGateway('my-gateway-001', {
        latitude: 40.7128,
        longitude: -74.006,
      });

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);

      expect(body.field_mask.paths).toContain('antennas');
      expect(body.gateway.antennas[0].location.latitude).toBe(40.7128);
    });

    it('should clear location when null coordinates provided', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockGateway,
      } as Response);

      await client.updateGateway('my-gateway-001', {
        latitude: null,
        longitude: null,
      });

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);

      expect(body.field_mask.paths).toContain('antennas');
      expect(body.gateway.antennas).toEqual([]);
    });
  });

  describe('deregisterGateway', () => {
    it('should deregister a gateway', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
      } as Response);

      await expect(
        client.deregisterGateway('my-gateway-001')
      ).resolves.toBeUndefined();

      expect(fetch).toHaveBeenCalledWith(
        'https://nam1.cloud.thethings.network/api/v3/gateways/my-gateway-001',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should not throw on 404 response', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      await expect(
        client.deregisterGateway('non-existent')
      ).resolves.toBeUndefined();
    });

    it('should throw on other error responses', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ message: 'Permission denied' }),
      } as Response);

      await expect(
        client.deregisterGateway('my-gateway-001')
      ).rejects.toThrow(TTNApiError);
    });
  });
});

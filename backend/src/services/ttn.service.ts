/**
 * TTN (The Things Network) API Client Service
 *
 * Handles device provisioning, deprovisioning, and management
 * through The Things Stack API v3.
 *
 * API Reference: https://www.thethingsindustries.com/docs/reference/api/
 */

// TTN auth_info response types (for API key validation)
export interface TTNAuthInfo {
  is_admin?: boolean;
  universal_rights?: string[];
  api_key?: {
    api_key?: {
      rights?: string[];
    };
    entity_ids?: {
      user_ids?: { user_id: string };
      organization_ids?: { organization_id: string };
      application_ids?: { application_id: string };
    };
  };
}

export interface TTNApiKeyValidation {
  allowed: boolean;
  key_type: 'personal' | 'organization' | 'application' | 'unknown';
  owner_scope: 'user' | 'organization' | null;
  scope_id: string | null;
  has_gateway_rights: boolean;
  missing_rights: string[];
  rights: string[];
}

export interface TTNApplicationInfo {
  ids: {
    application_id: string;
  };
  created_at: string;
  updated_at: string;
  name?: string;
  description?: string;
  attributes?: Record<string, string>;
}

// TTN API response types for gateways
export interface TTNGateway {
  ids: {
    gateway_id: string;
    eui: string;
  };
  created_at: string;
  updated_at: string;
  name?: string;
  description?: string;
  attributes?: Record<string, string>;
  frequency_plan_id?: string;
  gateway_server_address?: string;
  status_public?: boolean;
  location_public?: boolean;
  antennas?: Array<{
    location?: {
      latitude?: number;
      longitude?: number;
      altitude?: number;
      source?: string;
    };
  }>;
}

export interface TTNGatewayList {
  gateways: TTNGateway[];
}

export interface TTNGatewayStatus {
  online: boolean;
  last_seen_at?: string;
}

// TTN API response types
export interface TTNDevice {
  ids: {
    device_id: string;
    application_ids: {
      application_id: string;
    };
    dev_eui: string;
    join_eui?: string;
  };
  created_at: string;
  updated_at: string;
  name?: string;
  description?: string;
  attributes?: Record<string, string>;
  version_ids?: {
    brand_id?: string;
    model_id?: string;
    hardware_version?: string;
    firmware_version?: string;
  };
  network_server_address?: string;
  application_server_address?: string;
  join_server_address?: string;
}

export interface TTNDeviceList {
  end_devices: TTNDevice[];
}

export interface TTNEndDeviceRegistration {
  end_device: {
    ids: {
      device_id: string;
      dev_eui: string;
      join_eui?: string;
    };
    name?: string;
    description?: string;
    attributes?: Record<string, string>;
    lorawan_version: string;
    lorawan_phy_version: string;
    frequency_plan_id: string;
    supports_join: boolean;
    root_keys?: {
      app_key?: {
        key: string;
      };
      nwk_key?: {
        key: string;
      };
    };
  };
  field_mask: {
    paths: string[];
  };
}

export interface TTNError {
  code: number;
  message: string;
  details?: unknown[];
}

// Configuration for TTN API client
export interface TTNConfig {
  apiUrl: string;
  applicationId: string;
  apiKey: string;
}

/**
 * TTN API Client for device management
 */
export class TTNClient {
  private readonly apiUrl: string;
  private readonly applicationId: string;
  private readonly apiKey: string;

  constructor(config: TTNConfig) {
    // Remove trailing slash if present
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.applicationId = config.applicationId;
    this.apiKey = config.apiKey;
  }

  /**
   * Common headers for TTN API requests
   */
  private getHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Handle TTN API response
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage: string;
      try {
        const errorJson = JSON.parse(errorBody) as TTNError;
        errorMessage = errorJson.message || `TTN API error: ${response.status}`;
      } catch {
        errorMessage = errorBody || `TTN API error: ${response.status}`;
      }
      throw new TTNApiError(response.status, errorMessage);
    }
    return response.json() as Promise<T>;
  }

  /**
   * List all devices in the TTN application
   */
  async listDevices(): Promise<TTNDevice[]> {
    const url = `${this.apiUrl}/api/v3/applications/${this.applicationId}/devices`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    const result = await this.handleResponse<TTNDeviceList>(response);
    return result.end_devices || [];
  }

  /**
   * Get a specific device by ID
   */
  async getDevice(deviceId: string): Promise<TTNDevice | null> {
    const url = `${this.apiUrl}/api/v3/applications/${this.applicationId}/devices/${deviceId}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return await this.handleResponse<TTNDevice>(response);
    } catch (error) {
      if (error instanceof TTNApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Provision (create) a new device in TTN
   *
   * Creates the device in the Identity Server, Network Server, and Application Server
   */
  async provisionDevice(params: {
    deviceId: string;
    devEui: string;
    joinEui: string;
    appKey: string;
    name?: string;
    description?: string;
    frequencyPlanId?: string;
    lorawanVersion?: string;
    lorawanPhyVersion?: string;
  }): Promise<TTNDevice> {
    const {
      deviceId,
      devEui,
      joinEui,
      appKey,
      name,
      description,
      frequencyPlanId = 'US_902_928_FSB_2',
      lorawanVersion = 'MAC_V1_0_3',
      lorawanPhyVersion = 'PHY_V1_0_3_REV_A',
    } = params;

    // Step 1: Create in Identity Server
    const identityUrl = `${this.apiUrl}/api/v3/applications/${this.applicationId}/devices`;
    const identityPayload = {
      end_device: {
        ids: {
          device_id: deviceId,
          dev_eui: devEui.toUpperCase(),
          join_eui: joinEui.toUpperCase(),
          application_ids: {
            application_id: this.applicationId,
          },
        },
        name: name || deviceId,
        description,
      },
      field_mask: {
        paths: [
          'ids.device_id',
          'ids.dev_eui',
          'ids.join_eui',
          'ids.application_ids',
          'name',
          'description',
        ],
      },
    };

    const identityResponse = await fetch(identityUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(identityPayload),
    });
    const identityDevice = await this.handleResponse<TTNDevice>(identityResponse);

    // Step 2: Create in Join Server with keys
    const joinServerUrl = `${this.apiUrl}/api/v3/js/applications/${this.applicationId}/devices/${deviceId}`;
    const joinServerPayload = {
      end_device: {
        ids: {
          device_id: deviceId,
          dev_eui: devEui.toUpperCase(),
          join_eui: joinEui.toUpperCase(),
          application_ids: {
            application_id: this.applicationId,
          },
        },
        root_keys: {
          app_key: {
            key: appKey.toUpperCase(),
          },
        },
      },
      field_mask: {
        paths: [
          'ids.device_id',
          'ids.dev_eui',
          'ids.join_eui',
          'ids.application_ids',
          'root_keys.app_key.key',
        ],
      },
    };

    await fetch(joinServerUrl, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(joinServerPayload),
    });

    // Step 3: Create in Network Server
    const networkServerUrl = `${this.apiUrl}/api/v3/ns/applications/${this.applicationId}/devices/${deviceId}`;
    const networkServerPayload = {
      end_device: {
        ids: {
          device_id: deviceId,
          dev_eui: devEui.toUpperCase(),
          join_eui: joinEui.toUpperCase(),
          application_ids: {
            application_id: this.applicationId,
          },
        },
        frequency_plan_id: frequencyPlanId,
        lorawan_version: lorawanVersion,
        lorawan_phy_version: lorawanPhyVersion,
        supports_join: true,
      },
      field_mask: {
        paths: [
          'ids.device_id',
          'ids.dev_eui',
          'ids.join_eui',
          'ids.application_ids',
          'frequency_plan_id',
          'lorawan_version',
          'lorawan_phy_version',
          'supports_join',
        ],
      },
    };

    await fetch(networkServerUrl, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(networkServerPayload),
    });

    // Step 4: Create in Application Server
    const appServerUrl = `${this.apiUrl}/api/v3/as/applications/${this.applicationId}/devices/${deviceId}`;
    const appServerPayload = {
      end_device: {
        ids: {
          device_id: deviceId,
          dev_eui: devEui.toUpperCase(),
          join_eui: joinEui.toUpperCase(),
          application_ids: {
            application_id: this.applicationId,
          },
        },
      },
      field_mask: {
        paths: ['ids.device_id', 'ids.dev_eui', 'ids.join_eui', 'ids.application_ids'],
      },
    };

    await fetch(appServerUrl, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(appServerPayload),
    });

    return identityDevice;
  }

  /**
   * Update device metadata in TTN
   */
  async updateDevice(
    deviceId: string,
    params: {
      name?: string;
      description?: string;
      attributes?: Record<string, string>;
    },
  ): Promise<TTNDevice> {
    const url = `${this.apiUrl}/api/v3/applications/${this.applicationId}/devices/${deviceId}`;

    const paths: string[] = [];
    const endDevice: Record<string, unknown> = {
      ids: {
        device_id: deviceId,
        application_ids: {
          application_id: this.applicationId,
        },
      },
    };

    if (params.name !== undefined) {
      endDevice.name = params.name;
      paths.push('name');
    }
    if (params.description !== undefined) {
      endDevice.description = params.description;
      paths.push('description');
    }
    if (params.attributes !== undefined) {
      endDevice.attributes = params.attributes;
      paths.push('attributes');
    }

    const payload = {
      end_device: endDevice,
      field_mask: { paths },
    };

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    return this.handleResponse<TTNDevice>(response);
  }

  // ==========================================
  // API Key Validation & Application Info
  // ==========================================

  /**
   * Validate an API key by calling TTN's auth_info endpoint.
   * Determines key type (personal/organization/application), scope, and gateway rights.
   * Replicates the logic from the ttn-gateway-preflight edge function.
   */
  async validateApiKey(apiKey?: string): Promise<TTNApiKeyValidation> {
    const keyToValidate = apiKey ?? this.apiKey;
    const url = `${this.apiUrl}/api/v3/auth_info`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${keyToValidate}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          allowed: false,
          key_type: 'unknown',
          owner_scope: null,
          scope_id: null,
          has_gateway_rights: false,
          missing_rights: ['gateways:read', 'gateways:write'],
          rights: [],
        };
      }
      const errorBody = await response.text();
      throw new TTNApiError(response.status, `TTN auth_info failed: ${errorBody}`);
    }

    const authInfo: TTNAuthInfo = (await response.json()) as TTNAuthInfo;

    // CRITICAL: TTN auth_info response for Personal API keys is DOUBLE-NESTED:
    // { api_key: { api_key: { rights: [...] }, entity_ids: { user_ids: { user_id: "..." } } } }
    const apiKeyWrapper = authInfo.api_key;
    const entityIds = apiKeyWrapper?.entity_ids;
    const innerApiKey = apiKeyWrapper?.api_key;

    // Determine key type and scope from entity_ids
    let keyType: TTNApiKeyValidation['key_type'] = 'unknown';
    let ownerScope: TTNApiKeyValidation['owner_scope'] = null;
    let scopeId: string | null = null;

    if (entityIds?.user_ids?.user_id) {
      keyType = 'personal';
      ownerScope = 'user';
      scopeId = entityIds.user_ids.user_id;
    } else if (entityIds?.organization_ids?.organization_id) {
      keyType = 'organization';
      ownerScope = 'organization';
      scopeId = entityIds.organization_ids.organization_id;
    } else if (entityIds?.application_ids?.application_id) {
      keyType = 'application';
      ownerScope = null;
      scopeId = entityIds.application_ids.application_id;
    }

    // Rights: inner.rights → universal_rights fallback
    const rights = innerApiKey?.rights ?? authInfo.universal_rights ?? [];
    const hasGatewayRead = rights.some(
      (r) => r === 'RIGHT_GATEWAY_ALL' || r === 'RIGHT_GATEWAY_INFO' || r.includes('GATEWAY'),
    );
    const hasGatewayWrite = rights.some(
      (r) =>
        r === 'RIGHT_GATEWAY_ALL' ||
        r === 'RIGHT_GATEWAY_SETTINGS_BASIC' ||
        r === 'RIGHT_GATEWAY_SETTINGS_API_KEYS' ||
        r === 'RIGHT_USER_GATEWAYS_CREATE',
    );

    const missingRights: string[] = [];
    if (!hasGatewayRead) missingRights.push('gateways:read');
    if (!hasGatewayWrite) missingRights.push('gateways:write');

    // Application keys cannot provision gateways
    const allowed = keyType !== 'application' && hasGatewayRead && hasGatewayWrite;

    return {
      allowed,
      key_type: keyType,
      owner_scope: ownerScope,
      scope_id: scopeId,
      has_gateway_rights: hasGatewayRead && hasGatewayWrite,
      missing_rights: missingRights,
      rights,
    };
  }

  /**
   * Get TTN application info. Verifies that the application exists
   * and the API key has access to it.
   */
  async getApplicationInfo(): Promise<TTNApplicationInfo> {
    const url = `${this.apiUrl}/api/v3/applications/${this.applicationId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    return this.handleResponse<TTNApplicationInfo>(response);
  }

  // ==========================================
  // Gateway Management Methods
  // ==========================================

  /**
   * List all gateways in TTN (organization-scoped via API key)
   */
  async listGateways(): Promise<TTNGateway[]> {
    const url = `${this.apiUrl}/api/v3/gateways`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    const result = await this.handleResponse<TTNGatewayList>(response);
    return result.gateways || [];
  }

  /**
   * Get a specific gateway by ID
   */
  async getGateway(gatewayId: string): Promise<TTNGateway | null> {
    const url = `${this.apiUrl}/api/v3/gateways/${gatewayId}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return await this.handleResponse<TTNGateway>(response);
    } catch (error) {
      if (error instanceof TTNApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get gateway connection status
   */
  async getGatewayStatus(gatewayId: string): Promise<TTNGatewayStatus | null> {
    const url = `${this.apiUrl}/api/v3/gs/gateways/${gatewayId}/connection/stats`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const stats = await this.handleResponse<{ last_status_received_at?: string }>(response);
      return {
        online: !!stats.last_status_received_at,
        last_seen_at: stats.last_status_received_at,
      };
    } catch (error) {
      if (error instanceof TTNApiError && error.statusCode === 404) {
        return { online: false };
      }
      throw error;
    }
  }

  /**
   * Register (create) a new gateway in TTN
   */
  async registerGateway(params: {
    gatewayId: string;
    gatewayEui: string;
    name?: string;
    description?: string;
    frequencyPlanId?: string;
    latitude?: number;
    longitude?: number;
    altitude?: number;
  }): Promise<TTNGateway> {
    const {
      gatewayId,
      gatewayEui,
      name,
      description,
      frequencyPlanId = 'US_902_928_FSB_2',
      latitude,
      longitude,
      altitude,
    } = params;

    const url = `${this.apiUrl}/api/v3/users/me/gateways`;

    // Build gateway payload
    const gateway: Record<string, unknown> = {
      ids: {
        gateway_id: gatewayId,
        eui: gatewayEui.toUpperCase(),
      },
      name: name || gatewayId,
      description,
      frequency_plan_id: frequencyPlanId,
      gateway_server_address: 'nam1.cloud.thethings.network', // Default for US
      status_public: false,
      location_public: false,
    };

    // Add antenna location if coordinates provided
    if (latitude !== undefined && longitude !== undefined) {
      gateway.antennas = [
        {
          location: {
            latitude,
            longitude,
            altitude: altitude ?? 0,
            source: 'SOURCE_REGISTRY',
          },
        },
      ];
    }

    const paths = [
      'ids.gateway_id',
      'ids.eui',
      'name',
      'frequency_plan_id',
      'gateway_server_address',
      'status_public',
      'location_public',
    ];

    if (description !== undefined) {
      paths.push('description');
    }

    if (latitude !== undefined && longitude !== undefined) {
      paths.push('antennas');
    }

    const payload = {
      gateway,
      field_mask: { paths },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    return this.handleResponse<TTNGateway>(response);
  }

  /**
   * Update gateway metadata in TTN
   */
  async updateGateway(
    gatewayId: string,
    params: {
      name?: string;
      description?: string;
      frequencyPlanId?: string;
      latitude?: number | null;
      longitude?: number | null;
      altitude?: number | null;
    },
  ): Promise<TTNGateway> {
    const url = `${this.apiUrl}/api/v3/gateways/${gatewayId}`;

    const paths: string[] = [];
    const gateway: Record<string, unknown> = {
      ids: {
        gateway_id: gatewayId,
      },
    };

    if (params.name !== undefined) {
      gateway.name = params.name;
      paths.push('name');
    }
    if (params.description !== undefined) {
      gateway.description = params.description;
      paths.push('description');
    }
    if (params.frequencyPlanId !== undefined) {
      gateway.frequency_plan_id = params.frequencyPlanId;
      paths.push('frequency_plan_id');
    }

    // Handle location updates
    if (params.latitude !== undefined || params.longitude !== undefined) {
      if (params.latitude !== null && params.longitude !== null) {
        gateway.antennas = [
          {
            location: {
              latitude: params.latitude,
              longitude: params.longitude,
              altitude: params.altitude ?? 0,
              source: 'SOURCE_REGISTRY',
            },
          },
        ];
      } else {
        // Clear location by setting empty antennas
        gateway.antennas = [];
      }
      paths.push('antennas');
    }

    const payload = {
      gateway,
      field_mask: { paths },
    };

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    return this.handleResponse<TTNGateway>(response);
  }

  /**
   * Deregister (delete) a gateway from TTN
   */
  async deregisterGateway(gatewayId: string): Promise<void> {
    const url = `${this.apiUrl}/api/v3/gateways/${gatewayId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok && response.status !== 404) {
      await this.handleResponse<void>(response);
    }
  }

  /**
   * Deprovision (delete) a device from TTN
   *
   * Removes from Identity Server, Network Server, Application Server, and Join Server
   */
  async deprovisionDevice(deviceId: string): Promise<void> {
    // Delete from Application Server
    const appServerUrl = `${this.apiUrl}/api/v3/as/applications/${this.applicationId}/devices/${deviceId}`;
    await fetch(appServerUrl, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    // Delete from Network Server
    const networkServerUrl = `${this.apiUrl}/api/v3/ns/applications/${this.applicationId}/devices/${deviceId}`;
    await fetch(networkServerUrl, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    // Delete from Join Server
    const joinServerUrl = `${this.apiUrl}/api/v3/js/applications/${this.applicationId}/devices/${deviceId}`;
    await fetch(joinServerUrl, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    // Delete from Identity Server (this must be last)
    const identityUrl = `${this.apiUrl}/api/v3/applications/${this.applicationId}/devices/${deviceId}`;
    const response = await fetch(identityUrl, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok && response.status !== 404) {
      await this.handleResponse<void>(response);
    }
  }
}

/**
 * Custom error class for TTN API errors
 */
export class TTNApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'TTNApiError';
  }
}

/**
 * Factory function to create TTN client from environment or TTN connection config
 */
export function createTTNClient(config: TTNConfig): TTNClient {
  return new TTNClient(config);
}

/**
 * Get TTN client configuration from environment variables
 */
export function getTTNConfigFromEnv(): TTNConfig | null {
  const apiUrl = process.env.TTN_API_URL;
  const applicationId = process.env.TTN_APPLICATION_ID;
  const apiKey = process.env.TTN_API_KEY;

  if (!apiUrl || !applicationId || !apiKey) {
    return null;
  }

  return { apiUrl, applicationId, apiKey };
}

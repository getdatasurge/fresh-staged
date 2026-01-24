/**
 * TTN (The Things Network) API Client Service
 *
 * Handles device provisioning, deprovisioning, and management
 * through The Things Stack API v3.
 *
 * API Reference: https://www.thethingsindustries.com/docs/reference/api/
 */

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
      'Authorization': `Bearer ${this.apiKey}`,
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
        paths: ['ids.device_id', 'ids.dev_eui', 'ids.join_eui', 'ids.application_ids', 'name', 'description'],
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
        paths: ['ids.device_id', 'ids.dev_eui', 'ids.join_eui', 'ids.application_ids', 'root_keys.app_key.key'],
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
    }
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
    message: string
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

/**
 * TTN Client & Base Constants
 * Ported from supabase/functions/_shared/ttnBase.ts
 *
 * ARCHITECTURE:
 * - NAM1-ONLY: Strict enforcement of single cluster (nam1.cloud.thethings.network)
 * - Native fetch wrapper for consistent error handling
 */

// NAM1-ONLY: All operations target this cluster
export const CLUSTER_HOST = "nam1.cloud.thethings.network";
export const CLUSTER_BASE_URL = `https://${CLUSTER_HOST}`;
export const TTN_BASE_URL = CLUSTER_BASE_URL;

/**
 * NAM1-ONLY Enforcement: Assert that a host matches the strict NAM1 requirement
 */
export function assertClusterHost(url: string | URL): void {
    const host = typeof url === 'string' ? new URL(url).hostname : url.hostname;
    // Allow status page, ignore it
    if (host === 'status.thethings.network') return;

    if (host !== CLUSTER_HOST) {
        console.error(`[assertClusterHost] CRITICAL: Attempted to access ${host} but only ${CLUSTER_HOST} is allowed`);
        throw new Error(`Security Exception: TTN API calls restricted to ${CLUSTER_HOST} only.`);
    }
}

/**
 * Validate region is nam1 (case-insensitive)
 */
export function assertNam1Only(region: string): void {
    if (region.toLowerCase().trim() !== "nam1") {
        throw new Error(`Region '${region}' is not supported. This instance is locked to 'nam1'.`);
    }
}

/**
 * Determine TTN plane (Identity vs Application)
 */
export function identifyPlane(endpoint: string): "identity" | "application" {
    if (endpoint.includes("/api/v3/users") ||
        endpoint.includes("/api/v3/organizations") ||
        endpoint.includes("/api/v3/auth_info") ||
        endpoint.includes("/api/v3/gateways")) {
        return "identity";
    }
    return "application";
}

/**
 * Build TTN URL with strict host validation
 */
export function buildTtnUrl(endpoint: string): string {
    // Ensure endpoint starts with slash
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${CLUSTER_BASE_URL}${path}`;

    assertClusterHost(url);
    return url;
}

/**
 * Log structured API calls
 */
export function logTtnApiCall(
    context: string,
    method: string,
    url: string,
    step: string,
    requestId: string
): void {
    console.log(JSON.stringify({
        event: "ttn_api_call",
        context,
        method,
        url,
        step,
        request_id: requestId,
        timestamp: new Date().toISOString(),
    }));
}

export class TtnClient {
    /**
     * Authenticated fetch wrapper
     */
    static async fetch(
        endpoint: string,
        apiKey: string,
        options: RequestInit = {}
    ): Promise<Response> {
        const url = buildTtnUrl(endpoint);

        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                "Authorization": `Bearer ${apiKey}`,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        });
    }

    /**
     * Get JSON response with error handling
     */
    static async getJson<T>(
        endpoint: string,
        apiKey: string
    ): Promise<T> {
        const response = await this.fetch(endpoint, apiKey, { method: "GET" });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`TTN API Error ${response.status}: ${text}`);
        }

        return response.json() as Promise<T>;
    }
}

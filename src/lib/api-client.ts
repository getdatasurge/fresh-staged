import ky from 'ky';
import type { ApiError } from './api-types';

// Base API URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Base API client with retry logic and error handling.
 * Use createAuthenticatedClient() for authenticated requests.
 */
export const apiClient = ky.create({
  prefixUrl: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  retry: {
    limit: 3,
    methods: ['get', 'post', 'put', 'patch', 'delete'],
    statusCodes: [408, 413, 429, 500, 502, 503, 504],
    backoffLimit: 30000,
  },
  hooks: {
    afterResponse: [
      async (request, options, response) => {
        if (!response.ok) {
          let errorBody: any;
          try {
            errorBody = await response.json();
          } catch {
            errorBody = { message: `HTTP ${response.status}` };
          }

          const url = request.url;
          const status = response.status;
          const message = errorBody?.error?.message || errorBody?.message || `API error: ${status}`;

          // Log ALL errors to console
          console.error('[API Error]', {
            url,
            status,
            error: errorBody,
          });

          // Create typed error based on status
          let apiError: ApiError;
          
          if (status === 401) {
            apiError = { type: 'auth', code: 401, message };
          } else if (status === 403) {
            apiError = { type: 'auth', code: 403, message };
          } else if (status >= 400 && status < 500) {
            apiError = {
              type: 'validation',
              message,
              details: errorBody?.error?.details,
            };
          } else if (status >= 500) {
            apiError = { type: 'server', status, message };
          } else {
            apiError = { type: 'network', message };
          }

          // Throw error with typed structure
          const error = new Error(message) as Error & { apiError: ApiError };
          error.apiError = apiError;
          throw error;
        }
        return response;
      },
    ],
  },
});

/**
 * Create an authenticated API client with access token.
 * Use this factory in hooks with token from Stack Auth.
 * 
 * @param accessToken - JWT access token from Stack Auth
 * @returns Ky instance with Authorization header
 * 
 * @example
 * ```typescript
 * const user = useUser();
 * const { accessToken } = await user.getAuthJson();
 * const client = createAuthenticatedClient(accessToken);
 * const org = await client.get('api/orgs/123').json();
 * ```
 */
export function createAuthenticatedClient(accessToken: string) {
  return apiClient.extend({
    headers: {
      'x-stack-access-token': accessToken,
    },
  });
}

/**
 * Environment configuration validation utilities
 *
 * These utilities ensure required environment variables are set correctly
 * before the application starts, providing clear error messages to developers.
 */
import { logger } from './logger.js';

const log = logger.child({ service: 'env-check' });

/**
 * Stack Auth environment configuration
 */
export interface StackAuthEnvConfig {
  /** Stack Auth Project ID */
  projectId: string;
  /** JWKS endpoint URL */
  jwksUrl: string;
}

/**
 * Validate Stack Auth configuration from environment variables
 *
 * This function should be called at application startup to ensure
 * Stack Auth is properly configured before accepting requests.
 *
 * @throws {Error} If STACK_AUTH_PROJECT_ID is missing or invalid
 * @returns Stack Auth configuration
 *
 * @example
 * ```typescript
 * // In your application startup (e.g., src/index.ts)
 * try {
 *   const config = validateStackAuthConfig();
 *   console.log('Stack Auth configured:', config.projectId);
 * } catch (error) {
 *   console.error('Stack Auth configuration error:', error.message);
 *   process.exit(1);
 * }
 * ```
 */
export function validateStackAuthConfig(): StackAuthEnvConfig {
  const projectId = process.env.STACK_AUTH_PROJECT_ID;

  if (!projectId) {
    throw new Error(
      'STACK_AUTH_PROJECT_ID environment variable is required. ' +
        'Get this from Stack Auth Dashboard -> Project Settings -> Project ID',
    );
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    throw new Error(
      'STACK_AUTH_PROJECT_ID has invalid format. ' +
        'Expected alphanumeric characters, underscores, or hyphens.',
    );
  }

  const jwksUrl = `https://api.stack-auth.com/api/v1/projects/${projectId}/.well-known/jwks.json`;

  return { projectId, jwksUrl };
}

/**
 * Check if JWKS endpoint is reachable
 *
 * This is an optional startup check to verify Stack Auth connectivity.
 * If the endpoint is unreachable, the application can still start,
 * but authentication will fail at runtime.
 *
 * @param jwksUrl - JWKS endpoint URL to check
 * @returns true if endpoint is reachable and returns valid JWKS, false otherwise
 *
 * @example
 * ```typescript
 * const config = validateStackAuthConfig();
 * const isReachable = await checkJwksReachable(config.jwksUrl);
 * if (!isReachable) {
 *   console.warn('Warning: Stack Auth JWKS endpoint is not reachable');
 * }
 * ```
 */
export async function checkJwksReachable(jwksUrl: string): Promise<boolean> {
  try {
    const response = await fetch(jwksUrl, { method: 'GET' });
    if (!response.ok) {
      log.warn(
        { status: response.status },
        'JWKS endpoint returned non-OK status. Stack Auth may not be configured correctly',
      );
      return false;
    }
    const data = await response.json();
    if (!data.keys || !Array.isArray(data.keys)) {
      log.warn('JWKS response missing keys array');
      return false;
    }
    return true;
  } catch (error) {
    log.warn({ err: error }, 'Could not reach JWKS endpoint');
    return false;
  }
}

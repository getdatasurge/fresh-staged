/**
 * Test helper factory functions for creating test fixtures.
 *
 * Re-exports and adapts the existing fixtures from tests/helpers/fixtures.ts
 * with a consistent naming convention for use across all test suites.
 */

import {
  createTestOrg,
  createTestSite as _createTestSite,
  createTestArea as _createTestArea,
  createTestUnit as _createTestUnit,
  createTestAlertRule as _createTestAlertRule,
  createTestReading as _createTestReading,
  createTestUser,
  createTestApiKey,
  createTestAlert,
  cleanupTestData,
  type TestOrgData,
  type TestUserData,
} from '../helpers/fixtures.js';

// Re-export types
export type { TestOrgData, TestUserData };

// Re-export unchanged helpers
export { createTestUser, createTestApiKey, createTestAlert, cleanupTestData };

/**
 * Creates a minimal test organization with subscription.
 * Alias for createTestOrg with a cleaner name.
 */
export async function createTestOrganization(
  data: Partial<TestOrgData> = {},
): Promise<TestOrgData> {
  return createTestOrg(data);
}

/**
 * Creates a test site linked to an organization.
 */
export async function createTestSite(
  orgId: string,
  data: Partial<{ name: string; timezone: string }> = {},
): Promise<{ id: string; name: string }> {
  return _createTestSite(orgId, data);
}

/**
 * Creates a test area linked to a site.
 */
export async function createTestArea(
  siteId: string,
  data: Partial<{ name: string; sortOrder: number }> = {},
): Promise<{ id: string; name: string }> {
  return _createTestArea(siteId, data);
}

/**
 * Creates a test unit with default temperature thresholds.
 * Default thresholds: min=32.0°F (320), max=40.0°F (400)
 */
export async function createTestUnit(
  areaId: string,
  data: Partial<{ name: string; unitType: string; tempMin: number; tempMax: number }> = {},
): Promise<{ id: string; name: string }> {
  return _createTestUnit(areaId, data);
}

/**
 * Creates a test alert rule with min/max temperature thresholds.
 */
export async function createTestAlertRule(
  unitId: string,
  options: {
    organizationId: string;
    siteId?: string;
    tempMin?: number;
    tempMax?: number;
    name?: string;
  },
): Promise<ReturnType<typeof _createTestAlertRule>> {
  return _createTestAlertRule({
    organizationId: options.organizationId,
    unitId,
    siteId: options.siteId,
    tempMin: options.tempMin,
    tempMax: options.tempMax,
    name: options.name,
  });
}

/**
 * Creates a sensor reading fixture (in-memory object, not persisted).
 */
export function createTestReading(
  unitId: string,
  temperature: string = '35.0',
  timestamp?: Date,
): ReturnType<typeof _createTestReading> {
  return _createTestReading(unitId, {
    temperature,
    ...(timestamp ? { recordedAt: timestamp } : {}),
  });
}

/**
 * Database seeding and cleanup utilities for integration tests.
 *
 * Provides convenience functions for creating full entity hierarchies
 * and cleaning up test data after test runs.
 */

import {
  createTestOrg,
  createTestSite,
  createTestArea,
  createTestUnit,
  createTestUser,
  createTestApiKey,
  createTestAlertRule,
  cleanupTestData as _cleanupTestData,
  type TestOrgData,
  type TestUserData,
} from '../helpers/fixtures.js';
import type { AlertRule } from '../../src/db/schema/alerts.js';

export interface TestHierarchy {
  org: TestOrgData;
  site: { id: string; name: string };
  area: { id: string; name: string };
  unit: { id: string; name: string };
}

export interface TestHierarchyWithUser extends TestHierarchy {
  user: TestUserData;
}

export interface TestHierarchyFull extends TestHierarchyWithUser {
  alertRule: AlertRule;
  webhookSecret: string;
}

/**
 * Creates a complete org → site → area → unit chain and returns all IDs.
 * This is the most common test setup pattern.
 */
export async function seedTestHierarchy(
  options: {
    orgName?: string;
    siteName?: string;
    areaName?: string;
    unitName?: string;
    tempMin?: number;
    tempMax?: number;
  } = {},
): Promise<TestHierarchy> {
  const org = await createTestOrg({
    name: options.orgName,
  });

  const site = await createTestSite(org.id, {
    name: options.siteName,
  });

  const area = await createTestArea(site.id, {
    name: options.areaName,
  });

  const unit = await createTestUnit(area.id, {
    name: options.unitName,
    tempMin: options.tempMin,
    tempMax: options.tempMax,
  });

  return { org, site, area, unit };
}

/**
 * Creates a full hierarchy with an admin user.
 * Useful for tests that require authenticated operations.
 */
export async function seedTestHierarchyWithUser(
  options: {
    role?: 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';
  } = {},
): Promise<TestHierarchyWithUser> {
  const hierarchy = await seedTestHierarchy();
  const user = await createTestUser(hierarchy.org.id, options.role ?? 'admin');

  return { ...hierarchy, user };
}

/**
 * Creates a full hierarchy with user, alert rule, and webhook secret.
 * Complete setup for alert and webhook integration tests.
 */
export async function seedFullTestEnvironment(): Promise<TestHierarchyFull> {
  const hierarchyWithUser = await seedTestHierarchyWithUser({ role: 'admin' });

  const alertRule = await createTestAlertRule({
    organizationId: hierarchyWithUser.org.id,
    unitId: hierarchyWithUser.unit.id,
  });

  const webhookSecret = await createTestApiKey(hierarchyWithUser.org.id);

  return { ...hierarchyWithUser, alertRule, webhookSecret };
}

/**
 * Deletes all test data for one or more organizations.
 * Uses cascade deletes to clean up all related entities.
 *
 * Call this in afterEach/afterAll to prevent test data accumulation.
 */
export async function cleanupTestData(orgIds: string | string[]): Promise<void> {
  const ids = Array.isArray(orgIds) ? orgIds : [orgIds];
  await _cleanupTestData(ids);
}

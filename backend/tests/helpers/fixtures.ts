import { db } from '../../src/db/client.js';
import { organizations, subscriptions, ttnConnections } from '../../src/db/schema/tenancy.js';
import { profiles, userRoles } from '../../src/db/schema/users.js';
import { sites, areas, units } from '../../src/db/schema/hierarchy.js';
import { alertRules, alerts } from '../../src/db/schema/alerts.js';
import { eq } from 'drizzle-orm';
import type { AppRole } from '../../src/types/auth.js';
import type { AlertRule, InsertAlert } from '../../src/db/schema/alerts.js';
import type { InsertSensorReading } from '../../src/db/schema/telemetry.js';

// Test organization data
export interface TestOrgData {
  id: string;
  name: string;
  slug: string;
}

// Test user data
export interface TestUserData {
  userId: string;  // Stack Auth user ID
  profileId: string;
  role: AppRole;
}

// Create a test organization with subscription
export async function createTestOrg(
  data: Partial<TestOrgData> = {}
): Promise<TestOrgData> {
  const orgId = data.id || crypto.randomUUID();
  const name = data.name || `Test Org ${Date.now()}`;
  const slug = data.slug || `test-org-${Date.now()}`;

  await db.insert(organizations).values({
    id: orgId,
    name,
    slug,
    timezone: 'UTC',
    complianceMode: 'standard',
    sensorLimit: 10,
  });

  // Create subscription for org
  await db.insert(subscriptions).values({
    organizationId: orgId,
    plan: 'starter',
    status: 'active',
  });

  return { id: orgId, name, slug };
}

// Create a test user with role in org
export async function createTestUser(
  organizationId: string,
  role: AppRole = 'viewer',
  userId?: string
): Promise<TestUserData> {
  const stackAuthUserId = userId || crypto.randomUUID();
  const profileId = crypto.randomUUID();

  // Create profile
  await db.insert(profiles).values({
    id: profileId,
    userId: stackAuthUserId,
    organizationId,
    email: `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    fullName: 'Test User',
  });

  // Create user role
  await db.insert(userRoles).values({
    userId: stackAuthUserId,
    organizationId,
    role,
  });

  return { userId: stackAuthUserId, profileId, role };
}

// Create a test site
export async function createTestSite(
  organizationId: string,
  data: Partial<{ name: string; timezone: string }> = {}
): Promise<{ id: string; name: string }> {
  const name = data.name || `Test Site ${Date.now()}`;

  const [site] = await db.insert(sites).values({
    organizationId,
    name,
    timezone: data.timezone || 'UTC',
  }).returning();

  return { id: site.id, name: site.name };
}

// Create a test area
export async function createTestArea(
  siteId: string,
  data: Partial<{ name: string; sortOrder: number }> = {}
): Promise<{ id: string; name: string }> {
  const name = data.name || `Test Area ${Date.now()}`;

  const [area] = await db.insert(areas).values({
    siteId,
    name,
    sortOrder: data.sortOrder || 0,
  }).returning();

  return { id: area.id, name: area.name };
}

// Create a test unit
export async function createTestUnit(
  areaId: string,
  data: Partial<{ name: string; unitType: string; tempMin: number; tempMax: number }> = {}
): Promise<{ id: string; name: string }> {
  const name = data.name || `Test Unit ${Date.now()}`;

  const [unit] = await db.insert(units).values({
    areaId,
    name,
    unitType: (data.unitType as any) || 'fridge',
    tempMin: data.tempMin ?? 320,  // 32.0 F
    tempMax: data.tempMax ?? 400,  // 40.0 F
    tempUnit: 'F',
  }).returning();

  return { id: unit.id, name: unit.name };
}

// Create a test API key (TTN connection) for webhook authentication
export async function createTestApiKey(organizationId: string): Promise<string> {
  const webhookSecret = `test-webhook-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await db.insert(ttnConnections).values({
    organizationId,
    applicationId: `test-app-${Date.now()}`,
    webhookSecret,
    isActive: true,
  });

  return webhookSecret;
}

// Create a test alert rule with specified scope
export async function createTestAlertRule(options: {
  organizationId: string;
  siteId?: string;
  unitId?: string;
  tempMin?: number;
  tempMax?: number;
  name?: string;
}): Promise<AlertRule> {
  const name = options.name || `Test Alert Rule ${Date.now()}`;

  const [rule] = await db.insert(alertRules).values({
    organizationId: options.organizationId,
    siteId: options.siteId,
    unitId: options.unitId,
    name,
    tempMin: options.tempMin ?? 320, // 32.0 F
    tempMax: options.tempMax ?? 400, // 40.0 F
    delayMinutes: 5,
    alertType: 'alarm_active',
    severity: 'warning',
    isEnabled: true,
  }).returning();

  return rule;
}

// Factory for creating test reading objects
export function createTestReading(
  unitId: string,
  overrides?: Partial<InsertSensorReading>
): InsertSensorReading {
  return {
    unitId,
    temperature: '35.0', // 35.0°F - in safe range
    humidity: '50.0',
    battery: 85,
    signalStrength: -75,
    recordedAt: new Date(),
    source: 'api',
    ...overrides,
  };
}

// Create a test alert for lifecycle testing
export async function createTestAlert(options: {
  unitId: string;
  alertRuleId?: string;
  status?: 'active' | 'acknowledged' | 'resolved' | 'escalated';
  triggerTemperature?: number;
}): Promise<InsertAlert & { id: string }> {
  const [alert] = await db.insert(alerts).values({
    unitId: options.unitId,
    alertRuleId: options.alertRuleId,
    alertType: 'alarm_active',
    severity: 'warning',
    status: options.status || 'active',
    message: 'Test alert message',
    triggerTemperature: options.triggerTemperature ?? 450, // 45.0°F
    thresholdViolated: 'max',
    triggeredAt: new Date(),
    escalationLevel: 0,
  }).returning();

  return alert;
}

// Clean up test data (run after each test)
export async function cleanupTestData(orgIds: string[]): Promise<void> {
  // Cascade delete handles sites, areas, units, profiles, userRoles, ttnConnections, alertRules, alerts
  for (const orgId of orgIds) {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
}

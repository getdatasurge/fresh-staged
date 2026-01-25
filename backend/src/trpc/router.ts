/**
 * Root tRPC application router
 *
 * This is the main router that merges all domain routers.
 */

import { z } from 'zod';
import { router, publicProcedure } from './index.js';
import { organizationsRouter } from '../routers/organizations.router.js';
import { sitesRouter } from '../routers/sites.router.js';
import { areasRouter } from '../routers/areas.router.js';
import { unitsRouter } from '../routers/units.router.js';
import { readingsRouter } from '../routers/readings.router.js';
import { alertsRouter } from '../routers/alerts.router.js';
import { preferencesRouter } from '../routers/preferences.router.js';
import { smsConfigRouter } from '../routers/sms-config.router.js';
import { paymentsRouter } from '../routers/payments.router.js';
import { adminRouter } from '../routers/admin.router.js';
import { assetsRouter } from '../routers/assets.router.js';
import { ttnGatewaysRouter } from '../routers/ttn-gateways.router.js';
import { ttnDevicesRouter } from '../routers/ttn-devices.router.js';
import { ttnSettingsRouter } from '../routers/ttn-settings.router.js';
import { availabilityRouter } from '../routers/availability.router.js';
import { escalationContactsRouter } from '../routers/escalation-contacts.router.js';
import { notificationPoliciesRouter } from '../routers/notification-policies.router.js';

/**
 * Application router
 * Domain routers:
 * - organizations: Organization CRUD and member management
 * - sites: Site CRUD operations
 * - areas: Area CRUD operations
 * - units: Unit CRUD operations (Plan 02)
 * - readings: Sensor reading queries (Plan 02)
 * - alerts: Alert management and workflows (Plan 02)
 */
export const appRouter = router({
  /**
   * Health check procedure
   * Public endpoint to verify tRPC infrastructure is working
   */
  health: publicProcedure
    .output(z.object({ status: z.string(), timestamp: z.string() }))
    .query(() => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })),

  /**
   * Organizations domain router
   * Procedures: get, update, listMembers, stats
   */
  organizations: organizationsRouter,

  /**
   * Sites domain router
   * Procedures: list, get, create, update, delete
   */
  sites: sitesRouter,

  /**
   * Areas domain router
   * Procedures: list, get, create, update, delete
   */
  areas: areasRouter,

  /**
   * Units domain router
   * Procedures: list, get, create, update, delete
   */
  units: unitsRouter,

  /**
   * Readings domain router
   * Procedures: list, latest
   * NOTE: Bulk ingestion stays as REST (API key auth)
   */
  readings: readingsRouter,

  /**
   * Alerts domain router
   * Procedures: list, get, acknowledge, resolve
   */
  alerts: alertsRouter,

  /**
   * Preferences domain router
   * Procedures: getDigest, updateDigest, disableAllDigests
   */
  preferences: preferencesRouter,

  /**
   * SMS Configuration domain router
   * Procedures: get, upsert
   */
  smsConfig: smsConfigRouter,

  /**
   * Payments domain router
   * Procedures: getSubscription, createCheckoutSession, createPortalSession
   */
  payments: paymentsRouter,

  /**
   * Admin domain router
   * Procedures: queueHealth, systemStatus
   */
  admin: adminRouter,

  /**
   * Assets domain router
   * Procedures: getUploadUrl
   */
  assets: assetsRouter,

  /**
   * TTN Gateways domain router
   * Procedures: list, get, register, update, deregister, refreshStatus
   */
  ttnGateways: ttnGatewaysRouter,

  /**
   * TTN Devices domain router
   * Procedures: list, get, provision, bootstrap, update, deprovision
   */
  ttnDevices: ttnDevicesRouter,

  /**
   * TTN Settings domain router
   * Procedures: get, update, test
   */
  ttnSettings: ttnSettingsRouter,

  /**
   * Availability domain router (PUBLIC - no auth required)
   * Procedures: checkEmail, checkPhone
   */
  availability: availabilityRouter,

  /**
   * Escalation Contacts domain router
   * Procedures: list, create, update, delete
   */
  escalationContacts: escalationContactsRouter,

  /**
   * Notification Policies domain router
   * Procedures: listByOrg, listBySite, listByUnit, getEffective, upsert, delete
   */
  notificationPolicies: notificationPoliciesRouter,
});

/**
 * Type export for tRPC client
 * This allows frontend to have full type safety
 */
export type AppRouter = typeof appRouter;

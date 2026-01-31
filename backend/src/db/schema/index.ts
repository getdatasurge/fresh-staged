// Schema index - exports all tables and types
// This file is referenced by drizzle.config.ts for migration generation

// Enums (must be first - other schemas depend on these)
export * from './enums.js';

// Foundation schemas (no dependencies on other tables)
export * from './tenancy.js';

// User management (depends on tenancy)
export * from './users.js';

// Physical hierarchy (depends on tenancy)
export * from './hierarchy.js';

// Device management (depends on hierarchy)
export * from './devices.js';

// Telemetry data (depends on hierarchy, devices, users)
export * from './telemetry.js';

// Reading metrics (depends on hierarchy)
export * from './reading-metrics.js';

// Alerting system (depends on tenancy, hierarchy, users)
export * from './alerts.js';

// Notifications (depends on alerts, users)
export * from './notifications.js';

// Audit logging (depends on tenancy, users)
export * from './audit.js';

// Billing (Stripe integration)
export * from './billing.js';

// Pilot feedback
export * from './pilot-feedback.js';

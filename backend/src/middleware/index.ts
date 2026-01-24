// Middleware barrel export
// Complete middleware stack for authentication, RBAC, and organization context

// Auth middleware (02-02)
export { requireAuth } from './auth.js';

// RBAC middleware (02-03)
export {
  ROLE_HIERARCHY,
  requireRole,
  requireViewer,
  requireStaff,
  requireManager,
  requireAdmin,
  requireOwner,
} from './rbac.js';

// Organization context middleware (02-04)
export { requireOrgContext } from './org-context.js';

// API key authentication middleware (04-01)
export { requireApiKey } from './api-key-auth.js';

// Re-export types for convenience
export type { AppRole } from './rbac.js';

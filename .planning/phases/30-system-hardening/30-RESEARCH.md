# Phase 30: System Hardening - Research

**Researched:** 2026-01-28
**Domain:** Security Audit, Performance Tuning, Production Stabilization
**Confidence:** HIGH

## Summary

Phase 30 is the final phase of the v2.2 Technical Debt & Stabilization milestone. The research covers three primary areas: security audit, performance tuning, and addressing remaining placeholder flows from the Supabase removal (Phase 28).

The codebase already has solid security foundations including:

- JWT authentication via Stack Auth with JWKS validation
- Role-Based Access Control (RBAC) with hierarchy enforcement
- Rate limiting on all endpoints (configurable via env)
- Parameterized SQL queries via Drizzle ORM (no raw SQL injection vectors)
- Webhook signature verification for Stripe and TTN
- Structured logging with sensitive data redaction
- Sentry integration for production error tracking

Key gaps identified:

1. **Supabase placeholder still active** - 45+ frontend files still import the placeholder, calling disabled functions
2. **Missing security headers** - @fastify/helmet not installed for Content-Security-Policy, HSTS, etc.
3. **No request body size limits** - Only multipart has 5MB limit; JSON body unlimited
4. **Edge function flows not migrated** - TTN provisioning, compliance exports still use `supabase.functions.invoke()`

**Primary recommendation:** Complete security hardening by adding @fastify/helmet, implementing stricter body limits, and either migrate or disable the remaining Supabase placeholder flows.

## Standard Stack

### Core (Already Implemented)

| Library             | Version       | Purpose                           | Status     |
| ------------------- | ------------- | --------------------------------- | ---------- |
| @fastify/rate-limit | ^10.3.0       | Rate limiting protection          | Configured |
| @fastify/cors       | ^11.2.0       | Cross-origin resource sharing     | Configured |
| jose                | ^6.1.3        | JWT verification via JWKS         | Configured |
| zod                 | ^4.3.6        | Input validation (backend)        | Configured |
| drizzle-orm         | ^0.38.0       | Type-safe SQL (injection-proof)   | Configured |
| pino                | (via fastify) | Structured logging with redaction | Configured |

### Required Additions

| Library           | Version | Purpose                                | Priority |
| ----------------- | ------- | -------------------------------------- | -------- |
| @fastify/helmet   | ^12.0.1 | Security headers (CSP, HSTS, etc.)     | HIGH     |
| @fastify/sensible | ^6.0.1  | HTTP error utilities, request timeouts | MEDIUM   |

### Supporting (Optional)

| Library         | Version | Purpose                                           | When to Use        |
| --------------- | ------- | ------------------------------------------------- | ------------------ |
| @sentry/node    | ^8.x    | Error tracking (already integrated conditionally) | Production         |
| fastify-metrics | ^11.x   | Prometheus metrics endpoint                       | If /metrics needed |

**Installation:**

```bash
cd backend && npm install @fastify/helmet @fastify/sensible
```

## Architecture Patterns

### Current Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Vite/React)                    │
│   - Stack Auth SDK handles tokens                            │
│   - x-stack-access-token header for API calls                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Fastify + tRPC)                   │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐│
│  │ Rate Limiter│  │    CORS     │  │  Error Handler       ││
│  │ (global)    │  │ (whitelist) │  │  (Sentry optional)   ││
│  └─────────────┘  └─────────────┘  └──────────────────────┘│
│                              │                               │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │                  Authentication Layer                    ││
│  │  - requireAuth: JWT verification via Stack Auth JWKS    ││
│  │  - requireOrgContext: Organization membership check      ││
│  │  - requireRole: RBAC hierarchy enforcement               ││
│  └──────────────────────────────────────────────────────────┘│
│                              │                               │
│                              ▼                               │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │   REST Routes   │  │   tRPC Router   │                   │
│  │   /api/*        │  │   /trpc/*       │                   │
│  └─────────────────┘  └─────────────────┘                   │
│                              │                               │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │           Drizzle ORM (Parameterized Queries)            ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Pattern 1: Security Header Configuration

**What:** Add @fastify/helmet for comprehensive HTTP security headers
**When to use:** All production deployments
**Example:**

```typescript
// Source: Fastify official docs
import helmet from '@fastify/helmet';

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Required for React
      styleSrc: ["'self'", "'unsafe-inline'"], // Required for styled-components
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.stack-auth.com', 'wss://*'],
    },
  },
  // HSTS already handled by reverse proxy (Caddy/nginx)
  strictTransportSecurity: false,
});
```

### Pattern 2: Request Body Limits

**What:** Enforce maximum request body sizes to prevent DoS
**When to use:** All routes accepting JSON body
**Example:**

```typescript
// Source: Fastify body limit docs
const app = Fastify({
  bodyLimit: 1048576, // 1MB default for JSON bodies
});

// Override for specific routes if needed
app.route({
  method: 'POST',
  url: '/api/large-import',
  bodyLimit: 10485760, // 10MB for this route only
  handler: async (request, reply) => { ... }
});
```

### Pattern 3: Graceful Supabase Placeholder Removal

**What:** Replace placeholder with explicit disabled notices or migrate to tRPC
**When to use:** For flows still using supabase.functions.invoke()
**Example:**

```typescript
// Option A: Throw clear error for unmigrated flows
export function requireTTNMigration(): never {
  throw new Error(
    'TTN provisioning is temporarily unavailable. ' +
      'This feature is being migrated to the new backend.',
  );
}

// Option B: Replace with tRPC call (if backend endpoint exists)
const { data, error } = await trpc.ttnSettings.provision.mutate({
  organizationId,
  action: 'start_fresh',
  ttnRegion: 'nam1',
});
```

### Anti-Patterns to Avoid

- **Never expose stack traces in production responses** - Already handled: `error-handler.plugin.ts` redacts messages in production
- **Never log sensitive tokens** - Already handled: `logger.ts` has REDACT_PATHS for auth headers
- **Never use raw SQL strings** - Already avoided: All queries use Drizzle ORM parameterization
- **Never skip webhook signature verification** - Already implemented for Stripe and TTN

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                  | Don't Build           | Use Instead         | Why                                               |
| ------------------------ | --------------------- | ------------------- | ------------------------------------------------- |
| Security headers         | Manual header setting | @fastify/helmet     | CSP rules are complex, helmet covers edge cases   |
| JWT validation           | Custom JWT parsing    | jose library        | JWKS rotation, clock skew, algorithm verification |
| Rate limiting            | Custom counter        | @fastify/rate-limit | Distributed rate limiting, Redis support          |
| Input validation         | Manual type checking  | Zod schemas         | Type inference, consistent error format           |
| SQL injection prevention | String concatenation  | Drizzle ORM         | Parameterization is automatic                     |

**Key insight:** The codebase already follows these patterns. System hardening is about filling gaps (helmet, body limits) rather than replacing existing solutions.

## Common Pitfalls

### Pitfall 1: Premature Supabase Placeholder Removal

**What goes wrong:** Removing the placeholder file breaks 45+ components with import errors
**Why it happens:** Frontend still imports from `supabase-placeholder.ts` for edge function calls
**How to avoid:**

1. First migrate or disable the actual Supabase-dependent flows
2. Use `grep -r "supabase-placeholder" src/` to find all usages
3. Replace imports with tRPC calls or explicit "feature unavailable" messages
4. Only then remove the placeholder file

**Warning signs:** Build errors mentioning `supabase`, runtime errors about missing functions

### Pitfall 2: Overly Restrictive CSP Breaking React

**What goes wrong:** Content-Security-Policy blocks inline scripts, breaking React hydration
**Why it happens:** React uses inline scripts for initial state hydration
**How to avoid:**

- Use `'unsafe-inline'` for scriptSrc (or nonces, but complex for SPA)
- Test CSP in report-only mode first before enforcing
- Check browser console for CSP violations

**Warning signs:** Blank page in production, console CSP errors

### Pitfall 3: Rate Limit Key Selection

**What goes wrong:** Rate limits applied per IP block legitimate users behind NAT/VPN
**Why it happens:** Single IP key causes shared limits for users on same network
**How to avoid:** Current implementation uses IP + User-Agent which is reasonable, but consider:

- Adding authenticated user ID to key for logged-in users
- Setting higher limits for authenticated requests

**Warning signs:** Support complaints about rate limiting, especially from corporate networks

### Pitfall 4: Missing Request Timeout

**What goes wrong:** Slow queries tie up connections indefinitely
**Why it happens:** Default `requestTimeout: 0` means no timeout
**How to avoid:** Set reasonable requestTimeout (e.g., 30-120 seconds)

**Warning signs:** Connection pool exhaustion under load

## Code Examples

### Adding Helmet to app.ts

```typescript
// Source: Fastify helmet plugin docs
import helmet from '@fastify/helmet';

// After CORS registration, before routes
app.register(helmet, {
  // CSP configured for React SPA
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: [
        "'self'",
        'https://api.stack-auth.com',
        'https://*.thethings.network',
        process.env.VITE_WS_URL || 'ws://localhost:3000',
      ],
    },
  },
  // Disable HSTS if reverse proxy handles it
  strictTransportSecurity: !process.env.REVERSE_PROXY_HSTS,
});
```

### Setting Request Timeout and Body Limits

```typescript
// Source: Fastify server options docs
const app = Fastify({
  logger: loggerConfig,
  requestIdHeader: 'x-request-id',
  // Security: Set body limits
  bodyLimit: 1048576, // 1MB for JSON
  // Security: Set request timeout (DoS protection)
  requestTimeout: 30000, // 30 seconds
  // Support batched tRPC requests
  maxParamLength: 5000,
});
```

### Disabling Supabase Edge Function Flows

```typescript
// src/lib/supabase-placeholder.ts - Update to throw clearer errors
const MIGRATION_ERROR = new Error(
  'This feature requires Supabase Edge Functions which have been removed. ' +
    'The feature will be restored in a future update.',
);

export const supabase = {
  from: () => createQuery(),
  rpc: async () => {
    console.warn('[Migration] Supabase RPC called - feature unavailable');
    return { data: null, error: MIGRATION_ERROR };
  },
  functions: {
    invoke: async (functionName: string) => {
      console.warn(`[Migration] Edge function "${functionName}" called - unavailable`);
      // Return structured error so UI can display appropriate message
      return {
        data: null,
        error: MIGRATION_ERROR,
        // Include function name for debugging
        __unavailable: functionName,
      };
    },
  },
  channel: () => createChannel(),
  removeChannel: () => {},
};
```

## State of the Art

| Old Approach                  | Current Approach           | When Changed    | Impact               |
| ----------------------------- | -------------------------- | --------------- | -------------------- |
| Supabase client for all data  | tRPC for queries/mutations | v2.2 (Phase 28) | Most flows migrated  |
| Supabase Auth                 | Stack Auth                 | v2.0            | Complete migration   |
| Direct database from frontend | Backend API only           | v2.0            | Security improvement |
| No rate limiting              | @fastify/rate-limit        | v2.1            | DoS protection added |

**Deprecated/outdated:**

- `@supabase/supabase-js`: Removed from dependencies but placeholder still referenced
- Supabase Edge Functions: All `supabase.functions.invoke()` calls should be migrated or disabled

## Open Questions

1. **TTN Provisioning Flow Migration**
   - What we know: `TTNCredentialsPanel.tsx` and `EmulatorTTNRoutingCard.tsx` call Supabase edge functions
   - What's unclear: Whether backend TTN service (`ttn.service.ts`, `ttn-settings.service.ts`) can fully replace edge functions
   - Recommendation: Audit backend TTN routers to determine if provisioning endpoints exist; if not, mark feature as temporarily unavailable

2. **Compliance Export Flow**
   - What we know: `ComplianceReportCard.tsx` calls `export-temperature-logs` edge function
   - What's unclear: Whether this can be migrated to existing `/api/readings` endpoints
   - Recommendation: Check if `readingsRouter` supports export format; if not, add endpoint or disable feature

3. **Database Index Optimization**
   - What we know: No explicit index audit found in prior phases
   - What's unclear: Whether slow queries exist that would benefit from additional indexes
   - Recommendation: Run EXPLAIN ANALYZE on high-frequency queries during performance tuning

## Sources

### Primary (HIGH confidence)

- Fastify official docs via Context7: Security headers, rate limiting, body limits
- OWASP Node.js Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html
- Codebase review: `backend/src/app.ts`, `backend/src/middleware/auth.ts`, `backend/src/trpc/procedures.ts`

### Secondary (MEDIUM confidence)

- Phase 28 verification report: `.planning/phases/28-supabase-removal/28-VERIFICATION.md`
- Fastify security best practices 2026: https://astconsulting.in/java-script/nodejs/fastify/fastify-security-best-practices-7
- Better Stack Node.js security guide: https://betterstack.com/community/guides/scaling-nodejs/securing-nodejs-applications/

### Tertiary (LOW confidence)

- Web search for "Fastify production hardening 2026" - general patterns confirmed with official docs

## Metadata

**Confidence breakdown:**

- Security audit: HIGH - Direct codebase review of auth middleware, RBAC, and error handling
- Performance tuning: MEDIUM - General Fastify patterns; specific query optimization needs profiling
- Placeholder migration: HIGH - Direct file analysis of remaining Supabase usages

**Research date:** 2026-01-28
**Valid until:** 2026-02-28 (30 days - stable domain, no breaking changes expected)

---

## Appendix: Files Requiring Attention

### Frontend Files Still Using Supabase Placeholder (45 files)

**High Priority (Edge Function calls):**

- `src/components/settings/TTNCredentialsPanel.tsx` - TTN provisioning
- `src/components/admin/EmulatorTTNRoutingCard.tsx` - TTN routing
- `src/components/reports/ComplianceReportCard.tsx` - Export functionality
- `src/components/settings/TTNProvisioningLogs.tsx` - TTN logs

**Medium Priority (Data queries that should use tRPC):**

- `src/pages/OrganizationDashboard.tsx`
- `src/components/settings/AlertRulesScopedEditor.tsx`
- `src/components/admin/SensorSimulatorPanel.tsx`
- `src/features/dashboard-layout/widgets/*.tsx` (multiple widget files)

**Low Priority (Can remain as disabled placeholders):**

- Debug/diagnostic components
- Legacy settings panels

### Backend Security Checklist

| Item                            | Status     | Notes                             |
| ------------------------------- | ---------- | --------------------------------- |
| JWT validation with JWKS        | ✅ Done    | `utils/jwt.ts`                    |
| RBAC enforcement                | ✅ Done    | `middleware/rbac.ts`              |
| Organization context validation | ✅ Done    | `middleware/org-context.ts`       |
| Rate limiting                   | ✅ Done    | `@fastify/rate-limit` in `app.ts` |
| CORS whitelist                  | ✅ Done    | Configurable via `CORS_ORIGINS`   |
| Input validation (tRPC)         | ✅ Done    | Zod schemas on all procedures     |
| Input validation (REST)         | ✅ Done    | `fastify-type-provider-zod`       |
| Webhook signature verification  | ✅ Done    | Stripe and TTN webhooks           |
| SQL injection prevention        | ✅ Done    | Drizzle ORM parameterization      |
| Error message sanitization      | ✅ Done    | Production error handler          |
| Sensitive data redaction        | ✅ Done    | Pino logger config                |
| Security headers (helmet)       | ❌ Missing | Need to add                       |
| Request body limits             | ⚠️ Partial | Only multipart has limit          |
| Request timeout                 | ❌ Missing | Default 0 (no timeout)            |

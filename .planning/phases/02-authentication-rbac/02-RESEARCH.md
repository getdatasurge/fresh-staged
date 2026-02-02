# Phase 2: Authentication & RBAC - Research

**Researched:** 2026-01-23
**Domain:** Stack Auth JWT validation, Fastify middleware, RBAC, multi-tenant isolation
**Confidence:** HIGH

## Summary

This research covers implementing JWT-based authentication using Stack Auth and role-based access control (RBAC) middleware in a Fastify TypeScript backend. The project already has a database schema with `profiles` (referencing external Stack Auth user IDs), `user_roles` (with app_role enum: owner, admin, manager, staff, viewer), and `organizations` tables established in Phase 1.

Key findings from 2026 research reveal:

- Stack Auth uses the `jose` library for JWT verification with remote JWKS
- JWT tokens include `sub` (user ID), `email`, `selected_team_id`, and standard claims
- Fastify's decorator and hook patterns (not traditional Express middleware) are the standard approach
- Multi-tenant isolation requires explicit organization context validation on every request
- Role hierarchy enforcement should use numeric comparison for flexibility

**Primary recommendation:** Use `jose` library for JWT verification against Stack Auth's JWKS endpoint, implement Fastify preHandler hooks for auth validation, decorate requests with user/org context, and enforce RBAC via role hierarchy comparison middleware.

## Standard Stack

### Core

| Library        | Version | Purpose                    | Why Standard                                                                                        |
| -------------- | ------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| jose           | 5.x     | JWT verification with JWKS | Official Stack Auth recommendation, universal JS/TS support, tree-shakeable, no native dependencies |
| fastify        | 4.x+    | Web framework              | Already chosen in Phase 1, excellent TypeScript support                                             |
| fastify-plugin | 4.x     | Plugin wrapper             | Required for proper encapsulation of auth plugins                                                   |

**Sources:**

- [Stack Auth Backend Integration](<https://github.com/stack-auth/stack-auth/blob/dev/docs/content/docs/(guides)/concepts/backend-integration.mdx>) - Context7
- [jose JWKS Documentation](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md) - Context7

### Supporting

| Library         | Version | Purpose          | When to Use                                  |
| --------------- | ------- | ---------------- | -------------------------------------------- |
| @fastify/cookie | 9.x     | Cookie parsing   | If refresh tokens stored in HttpOnly cookies |
| @fastify/cors   | 9.x     | CORS handling    | For cross-origin requests from frontend      |
| drizzle-orm     | 0.38+   | Database queries | Already installed, for profile/role lookups  |

### Alternatives Considered

| Instead of  | Could Use      | Tradeoff                                                                  |
| ----------- | -------------- | ------------------------------------------------------------------------- |
| jose        | @fastify/jwt   | @fastify/jwt is opinionated, less control over Stack Auth integration     |
| jose        | jsonwebtoken   | jsonwebtoken lacks built-in JWKS support, requires manual key management  |
| Custom RBAC | @rbac/rbac npm | External library adds dependency, custom is simpler for 5-level hierarchy |

**Installation:**

```bash
pnpm add jose fastify-plugin
pnpm add -D @types/node
```

## Architecture Patterns

### Recommended Project Structure

```
backend/
├── src/
│   ├── middleware/
│   │   ├── auth.ts              # JWT validation hook + request decoration
│   │   ├── rbac.ts              # Role hierarchy enforcement
│   │   ├── org-context.ts       # Organization context validation
│   │   └── index.ts             # Re-exports all middleware
│   ├── plugins/
│   │   └── auth.plugin.ts       # Fastify plugin wrapping auth middleware
│   ├── types/
│   │   ├── auth.ts              # AuthUser, JWTPayload interfaces
│   │   └── fastify.d.ts         # FastifyRequest augmentation
│   ├── utils/
│   │   └── jwt.ts               # JWKS setup and token verification
│   └── services/
│       └── user.service.ts      # Profile lookup, auto-creation
```

**Rationale:**

- Middleware separate from plugins allows unit testing
- Types centralized for consistency
- Services handle database interactions, middleware handles HTTP concerns

### Pattern 1: Stack Auth JWT Verification with jose

**What:** Verify JWT tokens against Stack Auth's JWKS endpoint using the `jose` library.

**When to use:** Every protected API endpoint.

**Example:**

```typescript
// Source: Context7 /stack-auth/stack-auth + /panva/jose
// src/utils/jwt.ts
import * as jose from 'jose';

const STACK_AUTH_PROJECT_ID = process.env.STACK_AUTH_PROJECT_ID!;
const JWKS_URL = `https://api.stack-auth.com/api/v1/projects/${STACK_AUTH_PROJECT_ID}/.well-known/jwks.json`;

// Cache JWKS - jose handles refresh automatically
const jwks = jose.createRemoteJWKSet(new URL(JWKS_URL));

export interface StackAuthJWTPayload {
  sub: string; // User ID (e.g., "user_123456")
  iss: string; // Issuer
  aud: string; // Audience (project ID)
  exp: number; // Expiration timestamp
  iat: number; // Issued at timestamp
  email?: string; // User email
  email_verified?: boolean;
  name?: string; // User display name
  selected_team_id?: string; // Currently selected team/org
  is_anonymous?: boolean;
}

export async function verifyAccessToken(
  accessToken: string,
): Promise<{ payload: StackAuthJWTPayload; userId: string }> {
  const { payload } = await jose.jwtVerify(accessToken, jwks, {
    audience: STACK_AUTH_PROJECT_ID,
  });

  return {
    payload: payload as unknown as StackAuthJWTPayload,
    userId: payload.sub as string,
  };
}
```

**Key points:**

- JWKS is cached automatically by jose with configurable cooldown
- Audience validation ensures token is for this project
- Expiration validated automatically by jose

**Source:** [Stack Auth JWT Verification](https://context7.com/stack-auth/stack-auth/llms.txt), [jose createRemoteJWKSet](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md)

### Pattern 2: Fastify Request Decoration for Auth Context

**What:** Use Fastify's decorator pattern to add typed user/auth properties to requests.

**When to use:** Store authenticated user info for downstream handlers.

**Example:**

```typescript
// Source: Context7 /fastify/fastify
// src/types/fastify.d.ts
import { FastifyRequest } from 'fastify';

export interface AuthUser {
  id: string; // Stack Auth user ID (sub claim)
  profileId?: string; // Local profile.id (UUID)
  email?: string;
  name?: string;
  organizationId?: string; // Current org context
  role?: AppRole; // Role in current org
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}
```

```typescript
// src/plugins/auth.plugin.ts
import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';

async function authPlugin(fastify: FastifyInstance) {
  // Decorate request with null user (avoids shape changes)
  fastify.decorateRequest('user', null);
}

export default fp(authPlugin, {
  name: 'auth-plugin',
});
```

**Why decoration:** Fastify optimizes object shapes. Adding properties dynamically causes V8 deoptimization. Decorating with null first preserves shape.

**Source:** [Fastify Decorators](https://github.com/fastify/fastify/blob/main/docs/Reference/Decorators.md), [Fastify TypeScript](https://github.com/fastify/fastify/blob/main/docs/Reference/TypeScript.md)

### Pattern 3: preHandler Hook for Authentication

**What:** Use Fastify's preHandler hook (not Express-style middleware) for JWT validation.

**When to use:** Protecting routes that require authentication.

**Example:**

```typescript
// Source: Context7 /fastify/fastify
// src/middleware/auth.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../utils/jwt.js';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    });
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  try {
    const { payload, userId } = await verifyAccessToken(token);

    request.user = {
      id: userId,
      email: payload.email,
      name: payload.name,
    };
  } catch (error) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

// Usage in route
fastify.get(
  '/protected',
  {
    preHandler: [requireAuth],
  },
  async (request, reply) => {
    return { userId: request.user!.id };
  },
);
```

**Source:** [Fastify Hooks](https://github.com/fastify/fastify/blob/main/docs/Reference/Hooks.md)

### Pattern 4: Role Hierarchy with Numeric Levels

**What:** Implement role hierarchy using numeric comparison for flexible permission checking.

**When to use:** RBAC enforcement across all protected endpoints.

**Example:**

```typescript
// Source: Best practices from Logto/Permit.io patterns
// src/middleware/rbac.ts
import { FastifyRequest, FastifyReply } from 'fastify';

// Higher number = more permissions
export const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 1,
  staff: 2,
  manager: 3,
  admin: 4,
  owner: 5,
};

export type AppRole = keyof typeof ROLE_HIERARCHY;

export function requireRole(minimumRole: AppRole) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!request.user.role) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'No role assigned in this organization',
      });
    }

    const userLevel = ROLE_HIERARCHY[request.user.role];
    const requiredLevel = ROLE_HIERARCHY[minimumRole];

    if (userLevel < requiredLevel) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Requires ${minimumRole} role or higher`,
      });
    }
  };
}

// Usage
fastify.delete(
  '/users/:id',
  {
    preHandler: [requireAuth, requireRole('admin')],
  },
  handler,
);
```

**Why numeric hierarchy:** Simple comparison, easy to extend, matches database enum order, clear semantics.

**Source:** [Logto RBAC Guide](https://docs.logto.io/api-protection/nodejs/fastify), [@rbac/rbac](https://www.npmjs.com/package/@rbac/rbac)

### Pattern 5: Organization Context Middleware

**What:** Validate and attach organization context from request path/header, ensure user has access.

**When to use:** All multi-tenant endpoints (most of the API).

**Example:**

```typescript
// src/middleware/org-context.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import { userRoles, profiles } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';

interface OrgParams {
  organizationId: string;
}

export async function requireOrgContext(
  request: FastifyRequest<{ Params: OrgParams }>,
  reply: FastifyReply,
): Promise<void> {
  if (!request.user) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  const { organizationId } = request.params;

  if (!organizationId) {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Organization ID required',
    });
  }

  // Check user's role in this organization
  const [role] = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, request.user.id), eq(userRoles.organizationId, organizationId)))
    .limit(1);

  if (!role) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'No access to this organization',
    });
  }

  // Attach org context to request
  request.user.organizationId = organizationId;
  request.user.role = role.role;
}

// Usage: /orgs/:organizationId/units
fastify.get(
  '/orgs/:organizationId/units',
  {
    preHandler: [requireAuth, requireOrgContext],
  },
  handler,
);
```

**Key insight:** Tenant isolation happens at the middleware layer, preventing cross-org data access before reaching business logic.

**Source:** [Multi-tenant Node.js patterns](https://medium.com/@aliaftabk/designing-multi-tenant-saas-systems-with-node-js-4a12688dba27)

### Pattern 6: Auto-Create Profile on First Login

**What:** Create local profile record when Stack Auth user first accesses the system.

**When to use:** During authentication flow after JWT validation succeeds.

**Example:**

```typescript
// src/services/user.service.ts
import { db } from '../db/client.js';
import { profiles } from '../db/schema/users.js';
import { eq } from 'drizzle-orm';

export async function getOrCreateProfile(
  stackAuthUserId: string,
  email?: string,
  name?: string,
): Promise<{ id: string; isNew: boolean }> {
  // Try to find existing profile
  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, stackAuthUserId))
    .limit(1);

  if (existing) {
    return { id: existing.id, isNew: false };
  }

  // Create new profile
  const [created] = await db
    .insert(profiles)
    .values({
      userId: stackAuthUserId,
      email: email || '',
      fullName: name,
    })
    .returning({ id: profiles.id });

  return { id: created.id, isNew: true };
}
```

**Note:** The current schema requires `organizationId` on profiles, so auto-creation may need to happen after org assignment, or the schema may need adjustment for users without an org.

### Anti-Patterns to Avoid

- **Storing JWTs in localStorage:** Use HttpOnly cookies for refresh tokens, memory for access tokens
- **Not validating audience:** Always verify `aud` claim matches your project ID
- **Hardcoding JWKS:** Use createRemoteJWKSet which handles key rotation automatically
- **Express-style app.use() middleware:** Use Fastify hooks (preHandler, onRequest) instead
- **Mutating request object shape:** Always decorate first with null, then assign values
- **Checking roles with string equality:** Use numeric hierarchy for "admin or higher" patterns
- **Trusting organization from JWT only:** Always verify user membership in database
- **Missing tenant context in queries:** Every database query must include organization filter

**Sources:**

- [Fastify Decorators Best Practices](https://github.com/fastify/fastify/blob/main/docs/Reference/Decorators.md)
- [Multi-tenant security patterns](https://dev.to/rampa2510/guide-to-building-multi-tenant-architecture-in-nodejs-40og)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                    | Don't Build              | Use Instead                            | Why                                                        |
| -------------------------- | ------------------------ | -------------------------------------- | ---------------------------------------------------------- |
| JWT signature verification | Manual crypto operations | jose library                           | Handles algorithm detection, key selection, timing attacks |
| JWKS key caching           | Custom cache with expiry | jose.createRemoteJWKSet                | Built-in cooldown, automatic refresh, handles rotation     |
| Token extraction           | Manual string parsing    | Helper function with proper validation | Edge cases (multiple spaces, lowercase 'bearer', etc.)     |
| Session refresh            | Custom refresh logic     | Stack Auth's refresh endpoint          | Handles rotation, revocation, expiry correctly             |
| Rate limiting on auth      | Custom counters          | @fastify/rate-limit                    | Production-tested, Redis support                           |

**Key insight:** Authentication and cryptographic operations have subtle security implications. Use battle-tested libraries rather than rolling custom solutions.

## Common Pitfalls

### Pitfall 1: JWKS Endpoint Unreachable

**What goes wrong:** Stack Auth JWKS endpoint is down or network issues cause JWT verification to fail for all users.

**Why it happens:** Hard dependency on external service for every request.

**How to avoid:**

1. Cache JWKS keys locally with longer TTL
2. Use jose's built-in caching (cooldownDuration option)
3. Consider fallback to REST API verification for critical paths
4. Implement circuit breaker pattern for JWKS fetches

**Warning signs:**

- Sudden spike in 401 errors
- Latency increase on protected endpoints
- Error logs showing JWKS fetch failures

### Pitfall 2: Clock Skew on Token Expiration

**What goes wrong:** Valid tokens rejected as expired due to server time differences.

**Why it happens:** JWT `exp` validation compares against server clock, which may differ from token issuer.

**How to avoid:**

1. jose has built-in clockTolerance option (default 0)
2. Configure reasonable tolerance: `{ clockTolerance: '30 seconds' }`
3. Ensure server time is synchronized (NTP)

**Example:**

```typescript
const { payload } = await jose.jwtVerify(token, jwks, {
  audience: PROJECT_ID,
  clockTolerance: 30, // 30 seconds tolerance
});
```

**Source:** [jose jwtVerify options](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md)

### Pitfall 3: Missing Organization Context in Queries

**What goes wrong:** User from Organization A can see data from Organization B due to missing tenant filter.

**Why it happens:** Developer forgets to include organizationId in WHERE clause.

**How to avoid:**

1. Make organizationId required in service function signatures
2. Create helper functions that always include tenant filter
3. Use database views or row-level security as defense-in-depth
4. Integration tests that verify cross-tenant isolation

**Example:**

```typescript
// BAD - No tenant filter
const units = await db.select().from(units);

// GOOD - Always filter by org
const units = await db
  .select()
  .from(units)
  .where(eq(units.organizationId, request.user.organizationId));
```

### Pitfall 4: Inconsistent Error Responses

**What goes wrong:** Some endpoints return `{ error: 'message' }`, others `{ message: 'text' }`, causing frontend confusion.

**Why it happens:** Multiple developers, no enforced standard.

**How to avoid:**

1. Define error response schema upfront
2. Create centralized error helpers
3. Use Fastify's setErrorHandler for consistency

**Recommended format:**

```typescript
interface ApiError {
  error: string; // Error type (e.g., 'Unauthorized', 'Forbidden')
  message: string; // Human-readable description
  code?: string; // Machine-readable code (e.g., 'AUTH_001')
}
```

### Pitfall 5: Profile/Role Lookup on Every Request

**What goes wrong:** Database queries for profile and role on every API call cause latency and database load.

**Why it happens:** Naive implementation queries DB in every auth middleware call.

**How to avoid:**

1. Include essential data in JWT custom claims (if Stack Auth supports)
2. Use Redis cache for profile/role data with reasonable TTL
3. Cache in request.user after first lookup within request lifecycle
4. Consider session-based caching for related requests

**Source:** [JWT claims best practices](https://stytch.com/blog/jwt-claims/)

## Code Examples

Verified patterns from official sources:

### Complete Auth Plugin

```typescript
// Source: Context7 /fastify/fastify + /stack-auth/stack-auth
// src/plugins/auth.plugin.ts
import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as jose from 'jose';

const STACK_AUTH_PROJECT_ID = process.env.STACK_AUTH_PROJECT_ID!;
const JWKS_URL = `https://api.stack-auth.com/api/v1/projects/${STACK_AUTH_PROJECT_ID}/.well-known/jwks.json`;

const jwks = jose.createRemoteJWKSet(new URL(JWKS_URL), {
  cooldownDuration: 30_000, // 30 seconds between refreshes
  cacheMaxAge: 600_000, // Cache for 10 minutes
});

async function authPlugin(fastify: FastifyInstance) {
  // Decorate request to maintain object shape
  fastify.decorateRequest('user', null);

  // Export verification function for use in preHandler
  fastify.decorate('verifyJWT', async function (request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      });
    }

    try {
      const token = authHeader.slice(7);
      const { payload } = await jose.jwtVerify(token, jwks, {
        audience: STACK_AUTH_PROJECT_ID,
        clockTolerance: 30,
      });

      request.user = {
        id: payload.sub as string,
        email: payload.email as string | undefined,
        name: payload.name as string | undefined,
      };
    } catch (error) {
      const message = error instanceof jose.errors.JWTExpired ? 'Token expired' : 'Invalid token';

      return reply.code(401).send({
        error: 'Unauthorized',
        message,
      });
    }
  });
}

export default fp(authPlugin, {
  name: 'auth-plugin',
  dependencies: [],
});

// Type augmentation
declare module 'fastify' {
  interface FastifyInstance {
    verifyJWT: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user?: {
      id: string;
      email?: string;
      name?: string;
      profileId?: string;
      organizationId?: string;
      role?: string;
    };
  }
}
```

### RBAC Middleware Factory

```typescript
// Source: Logto RBAC patterns + @rbac/rbac middleware pattern
// src/middleware/rbac.ts
import { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';

export const ROLE_HIERARCHY = {
  viewer: 1,
  staff: 2,
  manager: 3,
  admin: 4,
  owner: 5,
} as const;

export type AppRole = keyof typeof ROLE_HIERARCHY;

export function requireRole(minimumRole: AppRole): preHandlerHookHandler {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Ensure auth ran first
    if (!request.user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // Ensure org context is set
    if (!request.user.organizationId || !request.user.role) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Organization context required',
      });
    }

    const userLevel = ROLE_HIERARCHY[request.user.role as AppRole] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole];

    if (userLevel < requiredLevel) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `This action requires ${minimumRole} role or higher`,
      });
    }
  };
}

// Convenience exports for common checks
export const requireViewer = requireRole('viewer');
export const requireStaff = requireRole('staff');
export const requireManager = requireRole('manager');
export const requireAdmin = requireRole('admin');
export const requireOwner = requireRole('owner');
```

### Integration Test Pattern

```typescript
// Source: Context7 /fastify/fastify Testing guide
// tests/auth.test.ts
import { test, describe, beforeEach, afterEach } from 'vitest';
import { expect } from 'vitest';
import * as jose from 'jose';
import buildApp from '../src/app.js';

describe('Authentication Middleware', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  test('returns 401 when no token provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/protected',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: 'Unauthorized',
    });
  });

  test('returns 401 for invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: {
        authorization: 'Bearer invalid.token.here',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  test('returns 403 when user lacks required role', async () => {
    // Mock a valid JWT with 'viewer' role
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/orgs/org-123/users/user-456',
      headers: {
        authorization: `Bearer ${mockViewerToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: 'Forbidden',
      message: expect.stringContaining('admin'),
    });
  });
});
```

## State of the Art

| Old Approach           | Current Approach             | When Changed      | Impact                                        |
| ---------------------- | ---------------------------- | ----------------- | --------------------------------------------- |
| express-jwt middleware | jose library + Fastify hooks | 2024+             | Better TypeScript support, framework-agnostic |
| Hardcoded signing keys | JWKS with automatic rotation | Standard practice | No key management, automatic rotation support |
| String role comparison | Numeric hierarchy            | Best practice     | Simpler "X or higher" checks                  |
| req.user mutation      | decorateRequest + hooks      | Fastify standard  | Better V8 optimization, type safety           |
| Passport.js            | Direct JWT verification      | Modern APIs       | Less abstraction, more control                |

**Deprecated/outdated:**

- **express-jwt:** Works but designed for Express, not Fastify-native
- **Manual JWT parsing:** Use jose which handles all edge cases
- **Session-based auth for APIs:** JWT is standard for stateless APIs
- **Role strings in comparisons:** Numeric hierarchy is more maintainable

## Open Questions

Things that couldn't be fully resolved:

1. **Stack Auth Custom Claims**
   - What we know: JWT payload includes standard claims (sub, email, name, selected_team_id)
   - What's unclear: Whether custom claims can be added via Stack Auth dashboard
   - Recommendation: Start with standard claims, use database lookups for additional data

2. **Refresh Token Strategy**
   - What we know: Stack Auth provides refresh tokens, supports `/refresh` endpoint
   - What's unclear: Best practice for backend handling (pass-through vs. manage)
   - Recommendation: Let frontend handle refresh, backend only validates access tokens

3. **Profile Table Organization Requirement**
   - What we know: Current schema requires `organizationId` on profiles
   - What's unclear: How to handle users before they join an organization
   - Recommendation: Either make organizationId nullable OR create profile only after org assignment

4. **Stack Auth Team vs Local Organization**
   - What we know: Stack Auth has "teams" concept with selected_team_id in JWT
   - What's unclear: Whether to sync with local organizations table or use independently
   - Recommendation: Use local organizations, Stack Auth teams optional for future multi-org users

## Sources

### Primary (HIGH confidence)

- **Stack Auth Documentation** - Context7 `/stack-auth/stack-auth` - JWT verification, backend integration, teams
- **jose Library** - Context7 `/panva/jose` - JWKS handling, jwtVerify, error types
- **Fastify Documentation** - Context7 `/fastify/fastify` - Hooks, decorators, TypeScript, testing
- [Stack Auth JWT Payload Structure](<https://github.com/stack-auth/stack-auth/blob/dev/docs/content/docs/(guides)/concepts/jwt.mdx>) - Official JWT claims documentation

### Secondary (MEDIUM confidence)

- [Logto Fastify RBAC Guide](https://docs.logto.io/api-protection/nodejs/fastify) - JWT validation patterns, middleware structure
- [Permit.io Fastify Authorization](https://www.permit.io/blog/how-to-create-an-authorization-middleware-for-fastify) - Authorization middleware patterns
- [@rbac/rbac npm](https://www.npmjs.com/package/@rbac/rbac) - Fastify RBAC middleware patterns
- [Multi-tenant Node.js Design](https://medium.com/@aliaftabk/designing-multi-tenant-saas-systems-with-node-js-4a12688dba27) - Tenant isolation patterns
- [DEV.to Fastify Vitest Testing](https://dev.to/robertoumbelino/testing-your-api-with-fastify-and-vitest-a-step-by-step-guide-2840) - Testing patterns

### Tertiary (LOW confidence)

- None used - all findings verified through Context7 or official documentation

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - jose and Fastify hooks verified through official docs
- Architecture: HIGH - Patterns from Context7 Fastify and Stack Auth documentation
- RBAC: HIGH - Standard pattern verified across multiple sources
- Multi-tenant: MEDIUM - General patterns, needs validation with specific Stack Auth integration
- Testing: HIGH - Fastify inject() pattern well-documented

**Research date:** 2026-01-23
**Valid until:** 2026-03-23 (60 days - auth libraries are stable)

**Key version assumptions:**

- jose 5.x (current stable)
- Fastify 4.x (already in project)
- Stack Auth API v1 (current)
- Node.js 20+ LTS

**Re-research triggers:**

- Stack Auth major version change
- jose 6.x release with breaking changes
- Fastify 5.x release
- New authentication requirements (MFA, passkeys)

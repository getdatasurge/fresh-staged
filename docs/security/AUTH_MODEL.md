# Authentication & Authorization Model

> How users authenticate and what they can access

---

## Authentication Architecture

### Authentication Provider

FrostGuard uses **Stack Auth** for all user authentication:

| Component         | Technology                       |
| ----------------- | -------------------------------- |
| Identity Provider | Stack Auth                       |
| Token Format      | JWT (RS256 signed)               |
| Session Storage   | Browser (Stack Auth SDK manages) |
| Token Refresh     | Automatic (Stack Auth SDK)       |
| Password Hashing  | Stack Auth managed               |

### Authentication Flow

```mermaid
sequenceDiagram
    participant U as User Browser
    participant A as Auth Page
    participant SA as Stack Auth
    participant D as Dashboard

    U->>A: Navigate to /auth
    A->>U: Display login form
    U->>A: Submit email/password
    A->>SA: Stack Auth sign-in
    SA->>SA: Validate credentials
    SA->>A: Return JWT + refresh token
    A->>U: Store tokens (SDK managed)
    A->>D: Redirect to /dashboard
    D->>SA: Verify JWT on each request
    SA->>D: Return user context
```

### Token Structure

```typescript
// JWT Payload (decoded) - issued by Stack Auth
{
  "exp": 1704931200,           // Expiration timestamp
  "sub": "user-uuid-here",     // User ID
  "email": "user@example.com",
  "session_id": "session-uuid"
}
```

### Session Management

| Aspect                 | Configuration                     |
| ---------------------- | --------------------------------- |
| Access token lifetime  | 1 hour (Stack Auth default)       |
| Refresh token lifetime | 7 days                            |
| Concurrent sessions    | Unlimited                         |
| Session invalidation   | On password change, manual logout |

### Authentication Endpoints

Stack Auth handles all authentication endpoints externally via its SDK. The application does not expose direct auth API endpoints - all authentication flows are managed through the Stack Auth service and SDK integration.

---

## Password Security

### Password Requirements

Enforced in `/src/pages/Auth.tsx`:

```typescript
// Password validation
password.length >= 8           // Minimum length
/[A-Z]/.test(password)        // Uppercase required
/[a-z]/.test(password)        // Lowercase required
/[0-9]/.test(password)        // Number required
/[^A-Za-z0-9]/.test(password) // Special character required
```

### Password Storage

- **Hashing**: Stack Auth managed (secure hashing algorithm)
- **Salt**: Unique per password (Stack Auth built-in)
- **Storage**: Stack Auth service (never in application database)

### Password Reset Flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as Auth Page
    participant SA as Stack Auth
    participant E as Email Service

    U->>A: Click "Forgot Password"
    A->>SA: Stack Auth reset flow
    SA->>E: Send reset link email
    E->>U: Email with magic link
    U->>A: Click reset link
    A->>SA: Verify token from URL
    SA->>A: Token valid
    A->>U: Show new password form
    U->>A: Submit new password
    A->>SA: Stack Auth password update
    SA->>SA: Invalidate other sessions
    SA->>A: Success
```

---

## Authorization Model

### Role Hierarchy

FrostGuard implements a **role-based access control (RBAC)** model:

```
┌─────────────────────────────────────────────────┐
│                    OWNER                         │
│  Full control, billing, user management          │
├─────────────────────────────────────────────────┤
│                    ADMIN                         │
│  All operations except billing                   │
├─────────────────────────────────────────────────┤
│                   MANAGER                        │
│  Operational control, settings, reports          │
├─────────────────────────────────────────────────┤
│                    STAFF                         │
│  Daily operations, temperature logging           │
├─────────────────────────────────────────────────┤
│                   VIEWER                         │
│  Read-only access to alerts                      │
├─────────────────────────────────────────────────┤
│                  INSPECTOR                       │
│  Alerts + export reports for audits              │
└─────────────────────────────────────────────────┘
```

### Role Permissions Matrix

| Permission               | Owner | Admin | Manager | Staff | Viewer | Inspector |
| ------------------------ | :---: | :---: | :-----: | :---: | :----: | :-------: |
| View dashboard           |   ✓   |   ✓   |    ✓    |   ✓   |   ✓    |     ✓     |
| View alerts              |   ✓   |   ✓   |    ✓    |   ✓   |   ✓    |     ✓     |
| Acknowledge alerts       |   ✓   |   ✓   |    ✓    |   -   |   -    |     -     |
| Log temperatures         |   ✓   |   ✓   |    ✓    |   ✓   |   -    |     -     |
| Edit temperature limits  |   ✓   |   ✓   |    ✓    |   -   |   -    |     -     |
| Manage sites/areas/units |   ✓   |   ✓   |    ✓    |   -   |   -    |     -     |
| Configure TTN            |   ✓   |   ✓   |    -    |   -   |   -    |     -     |
| Manage sensors/gateways  |   ✓   |   ✓   |    -    |   -   |   -    |     -     |
| Manage users             |   ✓   |   ✓   |    -    |   -   |   -    |     -     |
| Export reports           |   ✓   |   ✓   |    ✓    |   -   |   -    |     ✓     |
| Access billing           |   ✓   |   -   |    -    |   -   |   -    |     -     |
| Delete organization      |   ✓   |   -   |    -    |   -   |   -    |     -     |

### Role Assignment

Roles are stored in the `user_roles` table:

```sql
CREATE TABLE user_roles (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    organization_id UUID REFERENCES organizations(id),
    role TEXT NOT NULL CHECK (role IN (
        'owner', 'admin', 'manager', 'staff', 'viewer', 'inspector'
    )),
    created_at TIMESTAMPTZ,
    UNIQUE (user_id, organization_id)  -- One role per user per org
);
```

### Permission Checking (Frontend)

```typescript
// src/hooks/useUserRole.ts
const { role, permissions } = useUserRole();

// Check specific permission
if (permissions.canManageSites) {
  // Show site management UI
}

// Check role directly
if (role === 'owner' || role === 'admin') {
  // Show admin features
}
```

### Permission Checking (Backend)

```typescript
// tRPC middleware pattern (backend/src/trpc/procedures.ts)

// Auth only - no role check
export const protectedProcedure = t.procedure.use(authMiddleware);

// Org-scoped - verifies user belongs to organization
export const orgProcedure = protectedProcedure.use(orgScopeMiddleware);

// Platform admin - checks platform_roles table for SUPER_ADMIN
export const platformAdminProcedure = protectedProcedure.use(platformAdminMiddleware);
```

---

## Organization/User Separation

### Multi-Tenancy Model

```mermaid
graph TD
    subgraph "Organization A"
        UA1[User A1 - Owner]
        UA2[User A2 - Staff]
        SA[Site A]
        DA[(Data A)]
    end

    subgraph "Organization B"
        UB1[User B1 - Owner]
        SB[Site B]
        DB[(Data B)]
    end

    UA1 --> SA
    UA2 --> SA
    SA --> DA

    UB1 --> SB
    SB --> DB

    DA -.-x|RLS Blocks| UB1
    DB -.-x|RLS Blocks| UA1
```

### Organization Isolation Enforcement

**Primary enforcement** is via tRPC middleware (`orgProcedure`) with RLS as defense-in-depth.

#### Database Level (RLS)

```sql
-- Example RLS policy on units table
CREATE POLICY "Users can view their org's units"
    ON units
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id
            FROM profiles
            WHERE id = auth.uid()
        )
    );
```

#### Helper Functions

```sql
-- Check if user belongs to organization
CREATE FUNCTION user_belongs_to_org(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = _user_id AND organization_id = _org_id
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- Check if user has specific role
CREATE FUNCTION has_role(_user_id UUID, _org_id UUID, _role TEXT)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = _user_id
        AND organization_id = _org_id
        AND role = _role
    );
$$ LANGUAGE sql SECURITY DEFINER;
```

#### Application Level

```typescript
// tRPC orgProcedure automatically injects organizationId
// All queries in org-scoped routers include org filter via middleware
const units = await db
  .select()
  .from(unitsTable)
  .where(eq(unitsTable.organizationId, ctx.organizationId));
```

### Cross-Organization Protection

| Scenario                          | Protection Mechanism                           |
| --------------------------------- | ---------------------------------------------- |
| User A queries Org B data         | RLS returns empty result                       |
| User A's token used with Org B ID | RLS blocks + function validation               |
| DevEUI registered in both orgs    | `UNIQUE (organization_id, dev_eui)` constraint |
| Webhook for wrong org             | Webhook secret lookup isolates                 |

---

## Session and Token Security

### Token Storage

| Token Type    | Storage Location | Security Consideration       |
| ------------- | ---------------- | ---------------------------- |
| Access token  | localStorage     | XSS vulnerable, short-lived  |
| Refresh token | localStorage     | Longer-lived, rotated on use |

### Token Refresh Flow

```typescript
// Automatic refresh (Stack Auth SDK)
// SDK handles refresh automatically

// Triggered when:
// - Access token expires
// - Manual refresh called
// - Page load with valid refresh token
```

### Session Invalidation

| Event            | Action                                               |
| ---------------- | ---------------------------------------------------- |
| User logout      | Clear localStorage, server-side session invalidation |
| Password change  | All sessions invalidated                             |
| Account deletion | All sessions and data deleted                        |
| Admin revocation | Session invalidated on next request                  |

---

## JWT Verification in Backend

### Automatic Verification (tRPC Middleware)

All tRPC procedures use middleware for JWT verification:

| Procedure                | Verification           | Use Case                   |
| ------------------------ | ---------------------- | -------------------------- |
| `publicProcedure`        | None                   | Health checks, public data |
| `protectedProcedure`     | JWT required           | Authenticated endpoints    |
| `orgProcedure`           | JWT + org membership   | Org-scoped data access     |
| `platformAdminProcedure` | JWT + SUPER_ADMIN role | Platform administration    |

### Webhook Verification

| Integration     | Auth Method            | Implementation                   |
| --------------- | ---------------------- | -------------------------------- |
| TTN webhooks    | Per-org webhook secret | Constant-time comparison         |
| Stripe webhooks | HMAC signature         | stripe.webhooks.constructEvent() |

---

## API Authentication Methods

### Method 1: JWT Bearer Token

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

Used by: Browser clients, authenticated API calls

### Method 2: API Key Header

```http
X-Internal-Key: sk_internal_xxxxx
```

Used by: Scheduled jobs, service-to-service

### Method 3: Webhook Secret

```http
X-Webhook-Secret: whsec_xxxxxxx
```

Used by: TTN webhooks (per-organization)

### Method 4: Signature Verification

```http
stripe-signature: t=xxx,v1=xxx
```

Used by: Stripe webhooks

---

## Security Events Logged

| Event             | Logged Data                            | Table        |
| ----------------- | -------------------------------------- | ------------ |
| Login success     | user_id, IP, user_agent, timestamp     | Stack Auth   |
| Login failure     | email, IP, timestamp                   | Stack Auth   |
| Password change   | user_id, timestamp                     | Stack Auth   |
| Role change       | actor, target_user, old_role, new_role | event_logs   |
| Permission denied | user_id, resource, action, timestamp   | Backend logs |

---

## Security Recommendations

### Current Implementation

- [x] Password complexity requirements
- [x] JWT-based session management
- [x] Role-based access control
- [x] Row-level security policies
- [x] Webhook signature verification
- [x] Service role isolation
- [x] Platform admin role enforcement (platformAdminProcedure)

### Recommended Enhancements

| Enhancement                       | Priority | Status |
| --------------------------------- | -------- | ------ |
| Multi-factor authentication (MFA) | High     | TBD    |
| Session timeout configuration     | Medium   | TBD    |
| Login anomaly detection           | Medium   | TBD    |
| API key rotation workflow         | Medium   | TBD    |
| OAuth/SSO integration             | Low      | TBD    |

---

## Related Documents

- [SECURITY_OVERVIEW.md](./SECURITY_OVERVIEW.md) — High-level security architecture
- [DATA_PROTECTION.md](./DATA_PROTECTION.md) — Encryption and secrets management
- [THREAT_MODEL.md](./THREAT_MODEL.md) — Threats and mitigations
- [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) — Security incident procedures

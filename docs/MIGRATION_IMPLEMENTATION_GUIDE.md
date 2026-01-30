# Self-Hosted Database Migration Implementation Guide

## Quick Start Implementation

This guide provides concrete implementation steps for migrating FrostGuard from Supabase to a self-hosted PostgreSQL database.

---

## Phase 1: Backend API Server Setup

### Directory Structure

Create a new backend project alongside the frontend:

```
freshtrack-pro/
├── frontend/          # Existing React app (rename from current root)
└── backend/           # New backend server
    ├── src/
    │   ├── config/
    │   │   ├── database.ts
    │   │   ├── env.ts
    │   │   └── cors.ts
    │   ├── db/
    │   │   ├── schema/
    │   │   │   ├── organizations.ts
    │   │   │   ├── profiles.ts
    │   │   │   ├── sites.ts
    │   │   │   ├── units.ts
    │   │   │   ├── sensors.ts
    │   │   │   ├── alerts.ts
    │   │   │   └── index.ts
    │   │   ├── migrations/
    │   │   └── client.ts
    │   ├── middleware/
    │   │   ├── auth.ts
    │   │   ├── rbac.ts
    │   │   └── validation.ts
    │   ├── routes/
    │   │   ├── auth.ts
    │   │   ├── organizations.ts
    │   │   ├── sites.ts
    │   │   ├── units.ts
    │   │   ├── readings.ts
    │   │   ├── alerts.ts
    │   │   └── index.ts
    │   ├── services/
    │   │   ├── auth.service.ts
    │   │   ├── organization.service.ts
    │   │   ├── alert.service.ts
    │   │   └── notification.service.ts
    │   ├── websocket/
    │   │   ├── server.ts
    │   │   └── handlers.ts
    │   ├── jobs/
    │   │   ├── queue.ts
    │   │   └── processors/
    │   └── index.ts
    ├── drizzle.config.ts
    ├── package.json
    └── tsconfig.json
```

### Step 1: Initialize Backend Project

```bash
mkdir -p freshtrack-pro/backend
cd freshtrack-pro/backend

npm init -y
npm install fastify @fastify/cors @fastify/jwt @fastify/websocket
npm install drizzle-orm pg dotenv zod
npm install bullmq ioredis
npm install -D drizzle-kit typescript @types/node @types/pg tsx
```

### Step 2: Environment Configuration

Create `backend/.env`:

```env
# Database
DATABASE_URL=postgresql://frostguard:password@localhost:5432/frostguard
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Auth
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_EXPIRES_IN=30d

# Redis (for jobs and real-time)
REDIS_URL=redis://localhost:6379

# Server
PORT=4000
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:3000

# Storage (MinIO S3-compatible)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=frostguard
```

### Step 3: Database Schema with Drizzle

Create `backend/src/db/schema/enums.ts`:

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

export const unitTypeEnum = pgEnum('unit_type', [
  'fridge',
  'freezer',
  'display_case',
  'walk_in_cooler',
  'walk_in_freezer',
  'blast_chiller',
]);

export const unitStatusEnum = pgEnum('unit_status', [
  'ok',
  'excursion',
  'alarm_active',
  'monitoring_interrupted',
  'manual_required',
  'restoring',
  'offline',
]);

export const alertTypeEnum = pgEnum('alert_type', [
  'alarm_active',
  'monitoring_interrupted',
  'missed_manual_entry',
  'low_battery',
  'sensor_fault',
  'door_open',
  'calibration_due',
]);

export const alertSeverityEnum = pgEnum('alert_severity', ['info', 'warning', 'critical']);

export const alertStatusEnum = pgEnum('alert_status', [
  'active',
  'acknowledged',
  'resolved',
  'escalated',
]);

export const appRoleEnum = pgEnum('app_role', ['owner', 'admin', 'manager', 'staff', 'viewer']);

export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'starter',
  'pro',
  'haccp',
  'enterprise',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial',
  'active',
  'past_due',
  'canceled',
  'paused',
]);
```

Create `backend/src/db/schema/organizations.ts`:

```typescript
import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  logoUrl: text('logo_url'),
  timezone: text('timezone').default('UTC'),
  complianceMode: text('compliance_mode').default('standard'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

Create `backend/src/db/schema/profiles.ts`:

```typescript
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique(), // Links to auth.users
  organizationId: uuid('organization_id').references(() => organizations.id),
  email: text('email').notNull(),
  fullName: text('full_name'),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  notificationPreferences: jsonb('notification_preferences').default({
    push: true,
    email: true,
    sms: false,
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

Create `backend/src/db/schema/user_roles.ts`:

```typescript
import { pgTable, uuid, timestamp, unique } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
import { organizations } from './organizations';
import { appRoleEnum } from './enums';

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    role: appRoleEnum('role').notNull().default('viewer'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserOrg: unique().on(table.userId, table.organizationId),
  }),
);
```

### Step 4: Auth Middleware

Create `backend/src/middleware/auth.ts`:

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client';
import { profiles, userRoles } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export interface AuthUser {
  userId: string;
  email: string;
  organizationId: string | null;
  role: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();

    const payload = request.user as { sub: string; email: string };

    // Fetch profile and role
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, payload.sub))
      .limit(1);

    if (!profile) {
      return reply.status(401).send({ error: 'User not found' });
    }

    let role = null;
    if (profile.organizationId) {
      const [userRole] = await db
        .select()
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, payload.sub),
            eq(userRoles.organizationId, profile.organizationId),
          ),
        )
        .limit(1);
      role = userRole?.role || null;
    }

    request.user = {
      userId: payload.sub,
      email: payload.email,
      organizationId: profile.organizationId,
      role,
    };
  } catch (err) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}
```

### Step 5: RBAC Middleware

Create `backend/src/middleware/rbac.ts`:

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

type Role = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

const roleHierarchy: Record<Role, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  staff: 2,
  viewer: 1,
};

export function requireRole(...allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userRole = request.user?.role as Role;

    if (!userRole) {
      return reply.status(403).send({ error: 'No role assigned' });
    }

    const hasPermission = allowedRoles.some(
      (role) => roleHierarchy[userRole] >= roleHierarchy[role],
    );

    if (!hasPermission) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };
}

export function requireOrgAccess() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.params as { orgId?: string };

    if (orgId && request.user.organizationId !== orgId) {
      return reply.status(403).send({ error: 'Access denied to this organization' });
    }
  };
}
```

### Step 6: API Routes Example

Create `backend/src/routes/units.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client';
import { units, areas, sites } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { requireRole, requireOrgAccess } from '../middleware/rbac';

const createUnitSchema = z.object({
  name: z.string().min(1).max(100),
  unitType: z.enum([
    'fridge',
    'freezer',
    'display_case',
    'walk_in_cooler',
    'walk_in_freezer',
    'blast_chiller',
  ]),
  tempMin: z.number().optional(),
  tempMax: z.number().optional(),
});

export async function unitRoutes(app: FastifyInstance) {
  // All routes require auth
  app.addHook('preHandler', authMiddleware);

  // GET /areas/:areaId/units
  app.get('/areas/:areaId/units', async (request, reply) => {
    const { areaId } = request.params as { areaId: string };

    // Verify user has access to this area's organization
    const [area] = await db
      .select({ orgId: sites.organizationId })
      .from(areas)
      .innerJoin(sites, eq(areas.siteId, sites.id))
      .where(eq(areas.id, areaId))
      .limit(1);

    if (!area || area.orgId !== request.user.organizationId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const result = await db.select().from(units).where(eq(units.areaId, areaId));

    return result;
  });

  // POST /areas/:areaId/units
  app.post(
    '/areas/:areaId/units',
    {
      preHandler: [requireRole('admin', 'owner')],
    },
    async (request, reply) => {
      const { areaId } = request.params as { areaId: string };
      const body = createUnitSchema.parse(request.body);

      const [newUnit] = await db
        .insert(units)
        .values({
          areaId,
          name: body.name,
          unitType: body.unitType,
          tempMin: body.tempMin,
          tempMax: body.tempMax,
        })
        .returning();

      return reply.status(201).send(newUnit);
    },
  );

  // GET /units/:id
  app.get('/units/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [unit] = await db.select().from(units).where(eq(units.id, id)).limit(1);

    if (!unit) {
      return reply.status(404).send({ error: 'Unit not found' });
    }

    return unit;
  });

  // PUT /units/:id
  app.put(
    '/units/:id',
    {
      preHandler: [requireRole('admin', 'owner')],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = createUnitSchema.partial().parse(request.body);

      const [updated] = await db
        .update(units)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(units.id, id))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: 'Unit not found' });
      }

      return updated;
    },
  );
}
```

### Step 7: Main Server Entry Point

Create `backend/src/index.ts`:

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { authRoutes } from './routes/auth';
import { organizationRoutes } from './routes/organizations';
import { siteRoutes } from './routes/sites';
import { unitRoutes } from './routes/units';
import { readingRoutes } from './routes/readings';
import { alertRoutes } from './routes/alerts';
import { setupWebSocket } from './websocket/server';
import { env } from './config/env';

const app = Fastify({ logger: true });

async function start() {
  // Plugins
  await app.register(cors, { origin: env.CORS_ORIGIN });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(websocket);

  // Routes
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(organizationRoutes, { prefix: '/organizations' });
  await app.register(siteRoutes, { prefix: '/sites' });
  await app.register(unitRoutes);
  await app.register(readingRoutes, { prefix: '/readings' });
  await app.register(alertRoutes, { prefix: '/alerts' });

  // WebSocket
  setupWebSocket(app);

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  // Start
  await app.listen({ port: env.PORT, host: env.HOST });
  console.log(`Server running at http://${env.HOST}:${env.PORT}`);
}

start().catch(console.error);
```

---

## Phase 2: Frontend API Client Migration

### New API Client

Replace Supabase client with custom API client.

Create `frontend/src/lib/api-client.ts`:

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('access_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('access_token', token);
    } else {
      localStorage.removeItem('access_token');
    }
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;

    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.setToken(null);
        window.location.href = '/login';
      }
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.message || error.error || 'Request failed');
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    const result = await this.request<{ access_token: string; refresh_token: string }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    );
    this.setToken(result.access_token);
    localStorage.setItem('refresh_token', result.refresh_token);
    return result;
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.setToken(null);
    localStorage.removeItem('refresh_token');
  }

  // Organizations
  getOrganization(id: string) {
    return this.request<Organization>(`/organizations/${id}`);
  }

  // Sites
  getSites(orgId: string) {
    return this.request<Site[]>(`/organizations/${orgId}/sites`);
  }

  createSite(orgId: string, data: CreateSiteInput) {
    return this.request<Site>(`/organizations/${orgId}/sites`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Units
  getUnits(areaId: string) {
    return this.request<Unit[]>(`/areas/${areaId}/units`);
  }

  getUnit(id: string) {
    return this.request<Unit>(`/units/${id}`);
  }

  createUnit(areaId: string, data: CreateUnitInput) {
    return this.request<Unit>(`/areas/${areaId}/units`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateUnit(id: string, data: Partial<Unit>) {
    return this.request<Unit>(`/units/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Readings
  getReadings(unitId: string, timeRange: string) {
    return this.request<SensorReading[]>(`/units/${unitId}/readings`, {
      params: { range: timeRange },
    });
  }

  // Alerts
  getAlerts(unitId: string) {
    return this.request<Alert[]>(`/units/${unitId}/alerts`);
  }

  acknowledgeAlert(id: string) {
    return this.request<Alert>(`/alerts/${id}/acknowledge`, { method: 'PUT' });
  }

  resolveAlert(id: string) {
    return this.request<Alert>(`/alerts/${id}/resolve`, { method: 'PUT' });
  }
}

export const api = new ApiClient(API_BASE);
```

### Hook Migration Example

Before (Supabase):

```typescript
// Old: src/hooks/useUnits.ts
export function useUnits(areaId: string) {
  return useQuery({
    queryKey: qk.area(areaId).units(),
    queryFn: async () => {
      const { data, error } = await supabase.from('units').select('*').eq('area_id', areaId);
      if (error) throw error;
      return data;
    },
  });
}
```

After (Custom API):

```typescript
// New: src/hooks/useUnits.ts
import { api } from '@/lib/api-client';

export function useUnits(areaId: string) {
  return useQuery({
    queryKey: qk.area(areaId).units(),
    queryFn: () => api.getUnits(areaId),
  });
}
```

---

## Phase 3: Docker Compose Setup

Create `docker-compose.yml` in project root:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: frostguard
      POSTGRES_PASSWORD: frostguard_secret
      POSTGRES_DB: frostguard
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U frostguard']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    ports:
      - '9000:9000'
      - '9001:9001'

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://frostguard:frostguard_secret@postgres:5432/frostguard
      REDIS_URL: redis://redis:6379
      JWT_SECRET: your-super-secret-jwt-key-here
      S3_ENDPOINT: http://minio:9000
      S3_ACCESS_KEY: minioadmin
      S3_SECRET_KEY: minioadmin
    ports:
      - '4000:4000'
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

  frontend:
    build: ./frontend
    environment:
      VITE_API_URL: http://localhost:4000
    ports:
      - '3000:3000'
    depends_on:
      - backend

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

---

## Migration Checklist

### Epic 1: Infrastructure

- [ ] PostgreSQL server provisioned
- [ ] Redis server provisioned
- [ ] MinIO storage provisioned
- [ ] Docker Compose working locally

### Epic 2: Schema

- [ ] All enums created
- [ ] All tables created
- [ ] All indexes created
- [ ] Migrations tested

### Epic 3: Auth

- [ ] JWT auth implemented
- [ ] Login/register working
- [ ] Password reset working
- [ ] Token refresh working

### Epic 4: API

- [ ] All CRUD endpoints
- [ ] RBAC middleware
- [ ] Validation middleware
- [ ] Error handling

### Epic 5: Real-Time

- [ ] WebSocket server
- [ ] Sensor readings stream
- [ ] Alert notifications

### Epic 6: Frontend

- [ ] API client created
- [ ] All hooks migrated
- [ ] Auth flow working
- [ ] Real-time working

### Epic 7: Data Migration

- [ ] Export scripts ready
- [ ] Import scripts ready
- [ ] Data validated
- [ ] Production migrated

---

_Implementation Guide Version: 1.0_

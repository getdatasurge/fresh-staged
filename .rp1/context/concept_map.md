# Domain Concepts & Terminology

**Project**: FreshStaged (Temperature Monitoring SaaS)
**Domain**: IoT Cold Chain Monitoring & Compliance

## Core Business Concepts

### Organization
**Definition**: Multi-tenant container for users, devices, and locations with role-based access control
**Implementation**: [`backend/src/db/schema/organizations.ts`, `backend/src/services/organization.service.ts`]
**Key Properties**:
- organizationId: Unique tenant identifier for data isolation
- members: Users with role assignments (owner, admin, manager, staff, viewer)
- devices: IoT sensors owned by organization
- locations: Physical spaces being monitored

**Business Rules**:
- All data queries must enforce organizationId scoping
- User must belong to organization to access its data
- RBAC enforced via middleware for all operations

### Device
**Definition**: IoT temperature monitoring hardware (LoRa sensor) assigned to a specific location
**Implementation**: [`backend/src/db/schema/devices.ts`, `backend/src/services/device.service.ts`]
**Relationships**:
- Assigned to single Location
- Generates time-series Temperature Events
- Provisioned via TTN (The Things Network)

**Business Rules**:
- Device DevEUI must be unique across platform
- Must be provisioned in TTN before registration
- Generates readings at configured intervals

### Temperature Event
**Definition**: Time-series measurement from device with alert/alarm classification based on threshold violations
**Implementation**: [`backend/src/db/schema/temperature-events.ts`, `backend/src/services/temperatureEvent.service.ts`]
**Key Properties**:
- temperature: Measured value in Celsius/Fahrenheit
- timestamp: Reading time (UTC)
- alarmState: Classification (normal, too_hot, too_cold)
- deviceId: Source device identifier

**Business Rules**:
- If temperature exceeds thresholds, create Alert
- Historical events used for compliance reporting
- Real-time events pushed via WebSocket to dashboard

### Location
**Definition**: Physical space (freezer, refrigerator, storage room) monitored by devices
**Implementation**: [`backend/src/db/schema/locations.ts`, `backend/src/services/location.service.ts`]
**Relationships**:
- Contains Products (temperature-sensitive items)
- Monitored by one or more Devices
- Has configured temperature thresholds (min/max)

### Alert & Notification
**Definition**: Threshold violation event triggering notification to escalation contacts
**Implementation**: [`backend/src/db/schema/notifications.ts`]
**Business Rules**:
- Alert created when temperature exceeds thresholds
- Escalation contacts notified via SMS/Email
- Notification delivery tracked for audit

### AI Assistant
**Definition**: Conversational agent for querying temperature data and insights
**Implementation**: [`backend/src/db/schema/ai-assistants.ts`, `backend/src/services/ai-assistants/conversation.service.ts`]
**Key Properties**:
- conversationHistory: Chat message history
- context: Relevant data fetched by Context Builder

**Technical Concepts**:
- Context Builder assembles historical temperature data
- LLM queries use assembled context for accurate responses

## Technical Concepts

### Multi-Tenant Isolation
**Purpose**: Ensure organizations cannot access each other's data
**Implementation**: All database queries filtered by organizationId
**Usage Examples**:
```typescript
// All services enforce organization scoping
const devices = await deviceService.list({ organizationId });
const events = db.query.temperatureEvents.findMany({
  where: eq(temperatureEvents.organizationId, organizationId)
});
```

### Event-Driven Alert Processing
**Purpose**: Asynchronous processing of temperature violations
**Implementation**: BullMQ background jobs for notification dispatch
**Flow**:
1. Temperature event ingested via TTN webhook
2. Threshold evaluation triggers alert creation
3. Escalation job enqueued
4. Worker sends SMS/Email to contacts
5. Delivery status tracked

### Real-Time Dashboard Updates
**Purpose**: Live temperature monitoring without polling
**Implementation**: Socket.io WebSocket events
**Usage**:
```typescript
// Backend emits events on temperature updates
socket.to(organizationRoom).emit('unitUpdate', { unitId, temperature });

// Frontend listens and invalidates TanStack Query cache
socket.on('unitUpdate', () => {
  queryClient.invalidateQueries(['units']);
});
```

### Type-Safe API with tRPC
**Purpose**: End-to-end type safety from backend to frontend
**Implementation**: Drizzle ORM schemas → tRPC procedures → Frontend client
**Benefits**: Compile-time API contract validation, no manual API type definitions

## Terminology Glossary

### Business Terms
- **Temperature Threshold**: Min/max temperature bounds for alerts; violations trigger notifications
- **Alarm State**: Device status indicating threshold violation (too_hot, too_cold, normal)
- **Escalation Contact**: Person notified when alerts occur (via SMS/Email)
- **Cold Chain Compliance**: Maintaining temperature within acceptable range for product safety
- **LoRa Sensor**: Low-power wide-area network device for temperature monitoring
- **DevEUI**: Device Extended Unique Identifier for LoRa devices

### Technical Terms
- **Multi-tenancy**: Isolation model where each organization has separate data/users
- **Time-series Data**: Temperature readings stored with timestamps for trend analysis
- **RBAC (Role-Based Access Control)**: Permission model based on user roles (admin, manager, viewer)
- **Device Provisioning**: Process of registering and assigning device to location/organization
- **Conversational Context**: Historical data assembled for AI assistant to answer queries
- **Drizzle ORM**: TypeScript ORM used for database schema and queries
- **Zod Schema**: Runtime validation schema for API request/response payloads
- **tRPC**: Type-safe RPC framework for API communication
- **BullMQ**: Redis-based background job queue for async processing
- **Socket.io**: WebSocket library for real-time bidirectional communication
- **Stack Auth**: Authentication service for user identity and session management
- **TTN (The Things Network)**: LoRaWAN network server for IoT device communication
- **Stripe**: Payment processing for subscription billing
- **Telnyx**: SMS delivery service for alert notifications
- **Resend**: Email delivery service for transactional emails

## Relationships

### Organization → User
**Type**: contains (one-to-many)
**Description**: Organization has many users with role assignments
**Implementation**: `users.organizationId` foreign key

### Organization → Device
**Type**: owns (one-to-many)
**Description**: Organization owns and manages devices
**Implementation**: `devices.organizationId` foreign key

### Device → Location
**Type**: assigned_to (many-to-one)
**Description**: Device monitors single location
**Implementation**: `devices.locationId` foreign key

### Device → Temperature Event
**Type**: generates (one-to-many)
**Description**: Device produces time-series temperature events
**Implementation**: `temperatureEvents.deviceId` foreign key

### Temperature Event → Notification
**Type**: triggers (one-to-many)
**Description**: Threshold violations create notifications
**Implementation**: Notification creation in alert processing

### Location → Product
**Type**: stores (one-to-many)
**Description**: Location contains temperature-sensitive products
**Implementation**: `products.locationId` foreign key

### Dashboard → Organization
**Type**: aggregates (one-to-one)
**Description**: Dashboard summarizes org-wide metrics and alerts
**Implementation**: Dashboard queries aggregate by organizationId

### AI Assistant → Context Builder
**Type**: uses (one-to-one)
**Description**: AI assistant queries context builder for relevant data
**Implementation**: `context-builder.service.ts` fetches data for LLM

### User → Authentication
**Type**: authenticated_by
**Description**: User identity verified via Stack Auth service
**Implementation**: JWT token validation middleware

## Context Boundaries

### Core Monitoring
**Scope**: Device and event management
**Concepts**: Device, Location, Temperature Event, Notification
**Boundaries**: Owns device lifecycle, event ingestion, and alert generation. Does not handle billing or AI queries.

### Organization Management
**Scope**: Multi-tenancy and access control
**Concepts**: Organization, User, Authentication, RBAC
**Boundaries**: Owns tenant isolation, user management, and permissions. Does not handle monitoring logic.

### AI Assistance
**Scope**: Conversational data queries
**Concepts**: AI Assistant, Context Builder, Conversational Context
**Boundaries**: Owns conversational interface and context assembly. Reads monitoring data but does not modify devices or events.

### Analytics
**Scope**: Data aggregation and reporting
**Concepts**: Dashboard, Metrics, Search
**Boundaries**: Owns computed metrics and summary views. Reads from all domains but does not modify source data.

### Billing
**Scope**: Subscription and payments
**Concepts**: Payment
**Boundaries**: Owns payment records. References organizations but does not modify monitoring or user data.

## Cross-Cutting Concerns

### Multi-tenant Isolation
**Approach**: All database queries enforce organizationId filter; services validate user belongs to target organization
**Affects**: device management, location management, event queries, dashboard aggregation, AI context building

### Input Validation
**Approach**: Zod schemas validate all API inputs; schemas co-located with services for maintainability
**Affects**: authentication, device operations, location operations, AI queries, search operations

### Type Safety
**Approach**: Drizzle ORM schemas generate TypeScript types; end-to-end type checking from DB to API
**Affects**: all database operations, service layer logic, API response formatting

### Error Handling
**Approach**: Services throw domain-specific errors; controllers map to HTTP status codes
**Affects**: all service operations, API error responses

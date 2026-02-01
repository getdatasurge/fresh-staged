# FreshStaged — Bird's-Eye View

## 1) Summary

FreshStaged is a multi-tenant IoT temperature monitoring SaaS platform for cold chain compliance. It ingests real-time temperature data from LoRaWAN sensors via The Things Network, enforces threshold-based alerting with SMS/Email escalation, and provides real-time dashboard updates via WebSocket. Built for organizations managing temperature-sensitive products (food service, healthcare, retail), the platform combines continuous monitoring, intelligent alerting, and compliance reporting to prevent product spoilage and ensure regulatory compliance.

- Domain: `IoT Cold Chain Monitoring & Compliance` • Tech stack: `Fastify, tRPC, React, PostgreSQL, Redis, BullMQ, Socket.io` • Repos: `fresh-staged`

## 2) System Context

External actors include end users (facility managers, compliance officers, operations staff), LoRa sensors transmitting via The Things Network, Stack Auth for authentication, and notification services (Telnyx SMS, Resend Email). The platform sits behind a Caddy reverse proxy, integrates with Stripe for billing, and uses external monitoring tools (Prometheus, Grafana, Loki) for observability.

```mermaid
flowchart TB
    Users[Users/Mobile Browsers]
    LoRaSensors[LoRa Temperature Sensors]
    TTN[The Things Network]
    StackAuth[Stack Auth Service]
    Stripe[Stripe Payments]
    Telnyx[Telnyx SMS]
    Resend[Resend Email]

    Platform[FreshStaged Platform<br/>Caddy + Fastify + React]

    Users -->|HTTPS Login/Dashboard| Platform
    LoRaSensors -->|LoRaWAN Uplink| TTN
    TTN -->|Webhook Temperature Data| Platform
    Platform -->|Validate JWT| StackAuth
    Platform -->|Send SMS Alerts| Telnyx
    Platform -->|Send Email Alerts| Resend
    Platform -->|Process Payments| Stripe
    StackAuth -->|Auth Tokens| Users
```

## 3) Architecture Overview (components & layers)

The system uses a monolithic layered architecture with event-driven processing. The presentation layer (React SPA) communicates with the application layer (Fastify API) via tRPC and WebSocket. The application layer orchestrates business logic through a domain services layer that interacts with the infrastructure layer (PostgreSQL, Redis, external APIs). Background workers process asynchronous jobs (notifications, digests) via BullMQ queues.

```mermaid
flowchart TB
    subgraph Presentation_Layer
        React[React SPA<br/>Vite + TanStack Query]
        PWA[Service Worker<br/>Offline Support]
    end

    subgraph Edge_Layer
        Caddy[Caddy Reverse Proxy<br/>HTTPS + Routing]
    end

    subgraph Application_Layer
        Fastify[Fastify API Server<br/>tRPC + REST]
        Socket[Socket.io Plugin<br/>Real-time Events]
        Auth[Auth Plugin<br/>Stack Auth]
    end

    subgraph Domain_Layer
        Services[Service Layer<br/>15 Services]
        Routers[tRPC Routers<br/>28 Routers]
    end

    subgraph Background_Layer
        Workers[BullMQ Workers<br/>Email, SMS, Digest]
    end

    subgraph Infrastructure_Layer
        Postgres[(PostgreSQL<br/>Drizzle ORM)]
        Redis[(Redis<br/>Cache + Queue)]
        MinIO[(MinIO<br/>S3 Storage)]
        External[External APIs<br/>TTN, Telnyx, Resend]
    end

    React --> Caddy
    Caddy --> Fastify
    Fastify --> Auth
    Fastify --> Socket
    Fastify --> Routers
    Routers --> Services
    Services --> Postgres
    Services --> Redis
    Services --> MinIO
    Services --> External
    Workers --> Redis
    Workers --> Services
```

## 4) Module & Package Relationships

The backend follows a strict layered dependency pattern. tRPC routers and REST route handlers depend on the service layer, which encapsulates business logic and enforces multi-tenant isolation. Services use Drizzle ORM schemas for database operations and interact with external APIs via plugin abstractions. Background workers invoke service layer methods for async job processing.

```mermaid
flowchart TD
    Frontend[Frontend<br/>React SPA]
    tRPC_Routers[tRPC Routers<br/>28 Domain Routers]
    REST_Routes[REST Routes<br/>Webhooks]
    Services[Service Layer<br/>15 Services]
    Schemas[Database Schemas<br/>14 Drizzle Schemas]
    Plugins[Fastify Plugins<br/>Auth, Queue, Socket]
    Workers[BullMQ Workers<br/>Background Jobs]
    Utils[Utilities<br/>Logger, DB Client]

    Frontend -->|Type-safe API| tRPC_Routers
    Frontend -->|WebSocket| Plugins
    tRPC_Routers --> Services
    REST_Routes --> Services
    Services --> Schemas
    Services --> Utils
    Services --> Plugins
    Workers --> Services
    Plugins --> Services
```

## 5) Data Model (key entities)

The data model centers on a hierarchical multi-tenant structure where organizations own sites, sites contain areas, areas contain units (monitored appliances), and units have devices (sensors) that generate temperature events. Alerts are created from threshold violations and trigger notification deliveries to escalation contacts.

```mermaid
erDiagram
    organizations ||--o{ users : has
    organizations ||--o{ sites : owns
    organizations ||--o{ subscriptions : has
    sites ||--o{ areas : contains
    areas ||--o{ units : contains
    units ||--o{ devices : monitors
    units ||--o{ alerts : triggers
    devices ||--o{ sensor_readings : generates
    alerts ||--o{ notification_deliveries : creates
    organizations ||--o{ escalation_contacts : defines
```

## 6) API Surface (public endpoints → owning components)

The API surface consists of type-safe tRPC procedures for queries and mutations, REST webhooks for external integrations, and WebSocket events for real-time updates. Authentication is enforced via Stack Auth JWT validation middleware, with RBAC checking user roles before procedure execution.

- `POST /api/trpc/organizations.create` → tRPC Router → Organization Service
- `GET /api/trpc/units.list` → tRPC Router → Unit Service
- `POST /api/trpc/alerts.resolve` → tRPC Router → Alert Service
- `POST /api/webhooks/ttn` → REST Handler → Device Service
- `POST /api/webhooks/stripe` → REST Handler → Subscription Service
- `WS /socket.io` → Socket.io Plugin → Real-time Events

```mermaid
sequenceDiagram
    participant Client as React Client
    participant Caddy as Caddy Proxy
    participant Fastify as Fastify API
    participant Auth as Auth Middleware
    participant Router as tRPC Router
    participant Service as Service Layer
    participant DB as PostgreSQL

    Client->>Caddy: POST /api/trpc/units.list<br/>(JWT in header)
    Caddy->>Fastify: Forward request
    Fastify->>Auth: Validate JWT
    Auth->>Fastify: User + Organization context
    Fastify->>Router: Execute procedure
    Router->>Service: Call business logic
    Service->>DB: Query with organizationId filter
    DB->>Service: Return filtered data
    Service->>Router: Business result
    Router->>Client: Type-safe response
```

## 7) End-to-End Data Flow (hot path)

The critical path handles sensor data ingestion from LoRa devices. TTN receives sensor uplinks and posts to the webhook endpoint, which validates payloads and stores readings in PostgreSQL. The unit state processor evaluates alert rules, creates alerts for threshold violations, and enqueues notification jobs. Workers send SMS/Email notifications, and Socket.io emits real-time events to dashboard clients.

```mermaid
sequenceDiagram
    participant Sensor as LoRa Sensor
    participant TTN as The Things Network
    participant Webhook as TTN Webhook Handler
    participant DB as PostgreSQL
    participant Processor as Unit State Processor
    participant Queue as BullMQ Queue
    participant Worker as Notification Worker
    participant Socket as Socket.io
    participant Client as Dashboard Client

    Sensor->>TTN: LoRaWAN Uplink<br/>(Temperature Reading)
    TTN->>Webhook: POST /api/webhooks/ttn
    Webhook->>DB: Store sensor_reading
    Webhook->>Processor: Evaluate thresholds
    Processor->>DB: Create alert if violated
    Processor->>Queue: Enqueue notification job
    Processor->>Socket: Emit unitUpdate event
    Socket->>Client: WebSocket push
    Queue->>Worker: Process job
    Worker->>DB: Fetch escalation contacts
    Worker->>Telnyx: Send SMS
    Worker->>Resend: Send Email
    Worker->>DB: Update delivery status
```

## 8) State Model (critical domain entity)

Alerts transition through states based on user actions and system events. New alerts are created in `active` state when thresholds are violated. Users can acknowledge alerts (transitions to `acknowledged`), resolve them with notes (transitions to `resolved`), or silence false alarms (transitions to `silenced`). Auto-resolution occurs when temperature returns to normal range.

```mermaid
stateDiagram-v2
    [*] --> active: Threshold violation detected
    active --> acknowledged: User acknowledges alert
    active --> resolved: User resolves with notes
    active --> silenced: User silences false alarm
    acknowledged --> resolved: User resolves
    acknowledged --> active: Threshold re-violated
    resolved --> [*]: Audit trail retained
    silenced --> [*]: Audit trail retained
    active --> resolved: Auto-resolve on normal temp
```

## 9) User Flows (top 1-2 tasks)

The primary user task is provisioning a new device to monitor a location. Users navigate to device management, create a unit (monitored appliance), configure temperature thresholds, register the device with TTN DevEUI, assign it to the unit, and verify sensor data is flowing.

```mermaid
flowchart TD
    Start([User logs in])
    Navigate[Navigate to Device Management]
    CreateUnit[Create Unit - freezer/fridge]
    SetThresholds[Configure min/max thresholds]
    RegisterDevice[Register device in TTN]
    AssignDevice[Assign DevEUI to unit]
    VerifyData{Temperature data<br/>received?}
    Success([Device provisioned])
    Troubleshoot[Troubleshoot connectivity]

    Start --> Navigate
    Navigate --> CreateUnit
    CreateUnit --> SetThresholds
    SetThresholds --> RegisterDevice
    RegisterDevice --> AssignDevice
    AssignDevice --> VerifyData
    VerifyData -->|Yes| Success
    VerifyData -->|No| Troubleshoot
    Troubleshoot --> VerifyData
```

## 10) Key Components & Responsibilities

The system is organized into focused components with clear responsibilities. The tRPC layer provides type-safe API contracts, the service layer enforces business rules and multi-tenant isolation, Fastify plugins handle infrastructure concerns, and BullMQ workers process async operations.

- `backend/src/trpc/` — Type-safe API layer; merges 28 domain routers into unified AppRouter
- `backend/src/services/` — Business logic layer; enforces organizationId isolation and hierarchy validation
- `backend/src/db/schema/` — Drizzle ORM schemas; defines database structure with 14 table definitions
- `backend/src/plugins/` — Fastify infrastructure plugins; auth, queue, socket, email integrations
- `backend/src/workers/` — BullMQ job processors; SMS, email, digest generation, stripe metering
- `backend/src/middleware/` — Request chain handlers; JWT validation, RBAC, organization context
- `supabase/functions/` — Serverless edge functions; 54 webhook handlers for TTN, Stripe, Telnyx
- `src/` — React frontend; 407 files with pages, components, features, tRPC client

## 11) Integrations & External Systems

The platform integrates with nine external systems for authentication, IoT connectivity, notifications, payments, and monitoring. Critical dependencies include TTN for sensor data, Stack Auth for user identity, and PostgreSQL for persistence. High-priority dependencies include Telnyx/Resend for alerting and Redis for background jobs.

```mermaid
flowchart TB
    Platform[FreshStaged Platform]

    subgraph Critical_Dependencies
        TTN[The Things Network<br/>LoRa sensor data]
        StackAuth[Stack Auth<br/>JWT authentication]
        Postgres[(PostgreSQL<br/>Primary database)]
    end

    subgraph High_Priority
        Telnyx[Telnyx<br/>SMS delivery]
        Resend[Resend<br/>Email delivery]
        Redis[(Redis<br/>Queue + Cache + Pub/Sub)]
    end

    subgraph Standard_Dependencies
        Stripe[Stripe<br/>Subscription billing]
        MinIO[(MinIO<br/>S3 storage)]
        Claude[Claude API<br/>AI assistant]
    end

    subgraph Observability
        Prometheus[Prometheus<br/>Metrics]
        Grafana[Grafana<br/>Dashboards]
        Loki[Loki<br/>Log aggregation]
    end

    Platform --> TTN
    Platform --> StackAuth
    Platform --> Postgres
    Platform --> Telnyx
    Platform --> Resend
    Platform --> Redis
    Platform --> Stripe
    Platform --> MinIO
    Platform --> Claude
    Platform --> Prometheus
    Prometheus --> Grafana
    Grafana --> Loki
```

## 12) Assumptions & Gaps

The knowledge base provides comprehensive coverage of system architecture, domain model, and implementation patterns. Key assumptions include single-region deployment, English-only UI, and off-the-shelf TTN-compatible sensors. Missing details include specific hosting infrastructure, CI/CD pipelines, and detailed user journey steps beyond device provisioning.

- TBD: `Specific hosting provider and infrastructure details (DigitalOcean, AWS, or self-hosted VPS)`
- TBD: `CI/CD pipeline automation (GitHub Actions, GitLab CI, or manual deployment)`
- TBD: `Detailed user journey flows beyond device provisioning (alert resolution, report generation)`
- TBD: `Specific tRPC procedure request/response examples for API reference`
- TBD: `Testing strategy details (unit test coverage, integration test patterns, E2E test framework)`
- Next reads: `backend/src/trpc/router.ts` for complete AppRouter definition, `backend/tests/` for testing patterns
- Risks to verify: `Multi-tenant isolation enforcement in all query paths`, `BullMQ job concurrency tuning for production loads`, `WebSocket scaling beyond 1000 concurrent connections`

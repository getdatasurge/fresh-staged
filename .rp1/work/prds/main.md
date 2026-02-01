# PRD: FrostGuard Complete Platform v1

**Charter**: [Project Charter](../context/charter.md)
**Version**: 1.0.0
**Status**: Complete
**Created**: 2026-02-01

## Surface Overview

**FrostGuard Complete Platform v1** is an end-to-end IoT-based temperature monitoring SaaS platform for organizations managing temperature-sensitive products (food service, healthcare, retail). The platform delivers real-time monitoring, intelligent alerting, compliance reporting, and AI-powered insights across six integrated functional areas:

1. **Core Monitoring**: LoRaWAN sensor integration via The Things Network (TTN), real-time temperature event ingestion, configurable threshold management, and automated alarm state classification

2. **Alerting & Notifications**: Threshold-based alert creation, multi-channel notifications (SMS via Telnyx, Email via Resend), escalation contact management, and delivery tracking

3. **Dashboard & Visualization**: Real-time WebSocket-powered dashboard (Socket.io), multi-location temperature status views, alert history interface, and device management UI

4. **Multi-Tenancy & Access Control**: Organization-based data isolation, role-based access control (owner, admin, manager, staff, viewer), Stack Auth authentication, and tRPC type-safe API

5. **AI Features**: Conversational AI assistant for temperature data queries, context builder for historical data retrieval, and natural language insights

6. **Compliance & Reporting**: Historical temperature data storage, immutable audit trails for all alerts and notifications, and time-series event query capabilities

This PRD defines the complete v1 platform scope, covering all functional areas end-to-end.

## Scope

### In Scope

**1. Core Monitoring**
- IoT sensor integration via The Things Network (TTN) LoRaWAN
- Real-time temperature event ingestion and storage
- Configurable temperature thresholds per location
- Alarm state classification (normal, too_hot, too_cold)

**2. Alerting & Notifications**
- Threshold-based alert creation
- SMS notifications via Telnyx
- Email notifications via Resend
- Escalation contact management
- Notification delivery tracking

**3. Dashboard & Visualization**
- Real-time dashboard with WebSocket updates (Socket.io)
- Multi-location temperature status view
- Alert history and status
- Device management interface

**4. Multi-Tenancy & Access Control**
- Organization-based data isolation
- Role-based access control (owner, admin, manager, staff, viewer)
- User authentication via Stack Auth
- Secure API with tRPC type-safety

**5. AI Features**
- Conversational AI assistant for temperature data queries
- Context builder for historical data retrieval
- Natural language insights

**6. Compliance & Reporting**
- Historical temperature data storage
- Audit trail of all alerts and notifications
- Time-series event queries

### Out of Scope

**Explicitly NOT Included in v1:**
- Physical sensor manufacturing or hardware sales (use off-the-shelf LoRa sensors)
- Custom hardware development (rely on TTN-compatible devices)
- Predictive analytics or machine learning (future v2 feature)
- Mobile native apps (PWA with offline support instead)
- Multi-language internationalization (English only for v1)
- Custom integrations beyond TTN/Stripe/Stack Auth
- White-label or private-label deployments

## Requirements

### Functional Requirements

#### Core Monitoring
- **REQ-MON-001**: Ingest temperature events from TTN LoRaWAN sensors via webhook endpoint
- **REQ-MON-002**: Store events with timestamps, device metadata, and organizationId in PostgreSQL
- **REQ-MON-003**: Classify alarm states (normal, too_hot, too_cold) based on location thresholds
- **REQ-MON-004**: Support configurable min/max thresholds per location (unit-level granularity)
- **REQ-MON-005**: Maintain hierarchical location model: Organization → Site → Area → Unit

#### Alerting & Notifications
- **REQ-ALT-001**: Create alerts automatically when temperature exceeds configured thresholds
- **REQ-ALT-002**: Send SMS notifications via Telnyx to escalation contacts
- **REQ-ALT-003**: Send email notifications via Resend to escalation contacts
- **REQ-ALT-004**: Track notification delivery status (sent, delivered, failed)
- **REQ-ALT-005**: Support escalation contact hierarchy (primary, secondary, tertiary)
- **REQ-ALT-006**: Allow manual alert resolution with user-provided notes
- **REQ-ALT-007**: Prevent duplicate alerts for same unit within configurable time window

#### Dashboard & Visualization
- **REQ-DASH-001**: Real-time WebSocket updates via Socket.io when temperature events arrive
- **REQ-DASH-002**: Display current temperature status for all locations in organization
- **REQ-DASH-003**: Show alert history with timestamps, severity, and resolution status
- **REQ-DASH-004**: Provide device management UI for provisioning and configuration
- **REQ-DASH-005**: Multi-location overview dashboard with drill-down capability
- **REQ-DASH-006**: Display device online/offline status and last heartbeat timestamp

#### Multi-Tenancy & Access Control
- **REQ-AUTH-001**: Organization-based data isolation with strict organizationId filtering
- **REQ-AUTH-002**: Support 5 user roles: owner, admin, manager, staff, viewer
- **REQ-AUTH-003**: Stack Auth integration for authentication and session management
- **REQ-AUTH-004**: tRPC type-safe API with RBAC middleware
- **REQ-AUTH-005**: Permission checks for all sensitive operations (device provisioning, alert resolution, user management)
- **REQ-AUTH-006**: JWT token validation on all API requests
- **REQ-AUTH-007**: Prevent cross-tenant data leakage through hierarchy joins

#### AI Features
- **REQ-AI-001**: Conversational AI assistant using Claude API for natural language queries
- **REQ-AI-002**: Context builder that retrieves historical temperature data for AI context
- **REQ-AI-003**: Support natural language queries about temperature trends (e.g., "What was the coldest temperature yesterday?")
- **REQ-AI-004**: Answer compliance status questions (e.g., "Were there any violations last week?")
- **REQ-AI-005**: Maintain conversation context within session

#### Compliance & Reporting
- **REQ-COMP-001**: Store all temperature events with immutable timestamps
- **REQ-COMP-002**: Maintain audit trail for all alerts and notifications
- **REQ-COMP-003**: Support time-series queries for historical reporting
- **REQ-COMP-004**: Retain temperature data for 2+ years
- **REQ-COMP-005**: Track notification delivery confirmations for regulatory compliance
- **REQ-COMP-006**: Generate exportable reports for audit purposes

### Non-Functional Requirements

#### Monitoring Reliability
- **NFR-MON-001**: Achieve 99.9% uptime for monitoring service
- **NFR-MON-002**: Maintain < 5 second latency from sensor reading to alert creation
- **NFR-MON-003**: Zero cross-tenant data leakage (strict organizationId isolation)

#### Alert Delivery Performance
- **NFR-ALT-001**: Trigger alerts within 10 seconds of threshold violation
- **NFR-ALT-002**: Achieve 99.5% successful SMS/Email delivery rate
- **NFR-ALT-003**: Deliver notifications < 1 minute from alert creation to notification sent

#### Real-Time Performance
- **NFR-RT-001**: Deliver WebSocket events < 1 second after temperature update
- **NFR-RT-002**: Load dashboard in < 2 seconds
- **NFR-RT-003**: Support 1000+ concurrent WebSocket connections

#### Scalability
- **NFR-SCALE-001**: Horizontal scaling support via Docker Compose replicas
- **NFR-SCALE-002**: Redis adapter enables multi-instance Socket.io deployment
- **NFR-SCALE-003**: PgBouncer connection pooling for PostgreSQL

#### Security
- **NFR-SEC-001**: HTTPS via Caddy with TLS termination
- **NFR-SEC-002**: JWT token validation on all authenticated endpoints
- **NFR-SEC-003**: Role-based access control enforcement at middleware layer
- **NFR-SEC-004**: Secure environment variable management (no credentials in code)

## Dependencies & Constraints

### External Dependencies

#### Critical Dependencies (Platform Cannot Function Without)
- **The Things Network (TTN)**: LoRaWAN network server for sensor data ingestion
  - **Risk**: TTN service outage blocks all sensor data flow
  - **Mitigation**: Monitor TTN uptime; implement retry logic for webhook delivery failures

- **Stack Auth**: User authentication and session management
  - **Risk**: Stack Auth outage prevents user login and API access
  - **Mitigation**: JWT token validation caching; graceful degradation for existing sessions

- **PostgreSQL**: Primary relational database for all operational data
  - **Risk**: Database failure causes complete platform outage
  - **Mitigation**: Regular backups; PgBouncer connection pooling; database health monitoring

#### High-Priority Dependencies (Degrades User Experience)
- **Telnyx**: SMS notification delivery
  - **Risk**: Failed SMS delivery means users miss critical alerts
  - **Mitigation**: Retry logic with exponential backoff; fallback to email notifications

- **Resend**: Email notification delivery
  - **Risk**: Failed email delivery reduces alerting effectiveness
  - **Mitigation**: BullMQ retry mechanism; delivery status tracking

- **Redis**: Caching, job queuing, and pub/sub for Socket.io
  - **Risk**: Redis failure stops background jobs and real-time updates
  - **Mitigation**: Health check degradation; graceful handling of queue failures

#### Standard Dependencies (Feature-Specific)
- **Claude API (Anthropic)**: AI assistant functionality
  - **Risk**: API outage disables conversational AI features
  - **Mitigation**: Graceful error handling; inform user of temporary unavailability

- **Stripe**: Subscription billing and payment processing
  - **Risk**: Billing issues affect revenue but not core monitoring
  - **Mitigation**: Webhook retry logic; billing reconciliation processes

- **MinIO**: S3-compatible object storage for uploaded assets
  - **Risk**: Storage outage prevents file uploads
  - **Mitigation**: Self-hosted deployment; regular backup procedures

### Technical Constraints

#### Infrastructure
- **Deployment Model**: Docker Compose on single host (v1); Kubernetes future consideration
- **Database**: PostgreSQL 14+ required for specific JSON operators and indexing features
- **Node.js Version**: Node.js 22+ required (see .nvmrc)
- **Memory**: Minimum 4GB RAM for combined services (2GB for PostgreSQL, 1GB for backend, 512MB for Redis, 512MB for worker)

#### Technology Stack Lock-In
- **Backend Framework**: Fastify (plugin architecture requires Fastify-specific patterns)
- **ORM**: Drizzle ORM (schema migrations tied to Drizzle tooling)
- **API Protocol**: tRPC (frontend-backend type coupling)
- **Real-time Protocol**: Socket.io (WebSocket scaling tied to Redis adapter)

#### Integration Constraints
- **LoRa Sensors**: Must be TTN-compatible (cannot support proprietary LoRa networks)
- **SMS Provider**: Single provider (Telnyx); no multi-provider failover in v1
- **Email Provider**: Single provider (Resend); no multi-provider failover in v1
- **Authentication**: Stack Auth only (no alternative auth providers in v1)

### Architectural Constraints

- **Monolithic Architecture**: Single backend deployment (not microservices)
- **Single Region**: No multi-region deployment support in v1
- **English Only**: UI and notifications in English only
- **Synchronous Webhook Processing**: TTN webhook must respond within TTN timeout window (30 seconds)

## Milestones & Timeline

### Phase 1: Foundation (Weeks 1-4)
**Goal**: Core infrastructure and data pipeline operational

**Deliverables**:
- PostgreSQL schema with full hierarchy (Organization → Site → Area → Unit)
- Drizzle ORM setup with migrations
- TTN webhook endpoint ingesting sensor data
- Basic tRPC API with authentication middleware
- Stack Auth integration (login/signup flows)
- Docker Compose development environment

**Success Criteria**:
- Sensor data successfully ingested and stored
- Users can authenticate and access API
- Multi-tenant data isolation verified

### Phase 2: Monitoring & Alerting (Weeks 5-8)
**Goal**: Real-time monitoring with threshold-based alerting

**Deliverables**:
- Configurable threshold management UI
- Alert creation logic with state classification
- BullMQ job queue for background processing
- SMS notification delivery via Telnyx
- Email notification delivery via Resend
- Escalation contact management
- Notification delivery tracking

**Success Criteria**:
- Alerts trigger within 10 seconds of threshold violation
- 99.5% notification delivery rate achieved
- Escalation contacts receive notifications in priority order

### Phase 3: Dashboard & Real-Time (Weeks 9-12)
**Goal**: Real-time dashboard with WebSocket updates

**Deliverables**:
- Socket.io integration with Redis adapter
- Real-time temperature status dashboard
- Multi-location overview interface
- Alert history and resolution UI
- Device management interface
- Device provisioning workflows

**Success Criteria**:
- WebSocket events delivered < 1 second after update
- Dashboard loads in < 2 seconds
- Support 100+ concurrent connections (scaled to 1000+ in production)

### Phase 4: AI & Compliance (Weeks 13-16)
**Goal**: AI assistant and compliance reporting ready

**Deliverables**:
- Claude API integration for conversational AI
- Historical data context builder
- Natural language query processing
- Time-series reporting queries
- Audit trail export functionality
- Data retention policies (2+ years)

**Success Criteria**:
- AI assistant answers 80%+ of temperature queries correctly
- Historical data queryable for full retention period
- Audit reports generated on demand

### Phase 5: Production Readiness (Weeks 17-20)
**Goal**: Production deployment with monitoring and observability

**Deliverables**:
- Prometheus + Grafana monitoring dashboards
- Loki + Promtail log aggregation
- Caddy reverse proxy with HTTPS
- Health check endpoints for all services
- Production Docker Compose configuration
- Backup and recovery procedures
- Load testing and performance validation

**Success Criteria**:
- 99.9% uptime achieved in staging environment
- All performance targets met under load
- Monitoring alerts configured and tested
- Disaster recovery procedures documented

### Phase 6: Launch (Week 21)
**Goal**: Production launch with initial customers

**Deliverables**:
- Production deployment to hosting environment
- Customer onboarding documentation
- Support runbook and escalation procedures
- Initial customer organizations provisioned (10+ target)
- Marketing website and signup flow

**Success Criteria**:
- Production environment stable for 7 days
- 10+ organizations onboarded
- 50+ devices provisioned across all organizations
- Zero critical production incidents

## Success Metrics

### Technical Success Metrics

**Monitoring Reliability**:
- **Target**: 99.9% uptime for monitoring service
- **Measurement**: Uptime monitoring via Prometheus/Grafana
- **Frequency**: Continuous monitoring with weekly reports

**Alert Performance**:
- **Target**: < 5 second latency from sensor reading to alert creation
- **Measurement**: Timestamp diff between sensor_readings.created_at and alerts.created_at
- **Frequency**: Daily P95 latency reports

**Notification Delivery**:
- **Target**: 99.5% successful SMS/Email delivery rate
- **Measurement**: notification_deliveries table status tracking
- **Frequency**: Daily delivery rate dashboard

**Real-Time Performance**:
- **Target**: WebSocket events delivered < 1 second after temperature update
- **Measurement**: Server-side event emission timestamps vs client receipt
- **Frequency**: Real-time latency monitoring

**Dashboard Performance**:
- **Target**: Dashboard loads in < 2 seconds
- **Measurement**: Frontend performance monitoring (Lighthouse/Web Vitals)
- **Frequency**: Weekly performance audits

**Concurrent Connections**:
- **Target**: Support 1000+ concurrent WebSocket connections
- **Measurement**: Load testing with Socket.io connection metrics
- **Frequency**: Monthly load tests

### Business Success Metrics

**User Adoption**:
- **Target**: 10+ organizations onboarded in first 3 months
- **Measurement**: organizations table count with active status
- **Frequency**: Monthly growth reports

**Device Deployment**:
- **Target**: 50+ devices provisioned across all organizations
- **Measurement**: devices table count with active status
- **Frequency**: Monthly device count

**User Retention**:
- **Target**: 90% user retention after 30 days
- **Measurement**: Active users at day 30 vs signup date
- **Frequency**: Monthly cohort analysis

**Alert Response Time**:
- **Target**: Users respond to alerts within 15 minutes (average)
- **Measurement**: Time between alert creation and resolution
- **Frequency**: Weekly alert response dashboard

**False Positive Rate**:
- **Target**: < 5% false positive alert rate
- **Measurement**: User-reported false positives vs total alerts
- **Frequency**: Monthly feedback analysis

**Dashboard Engagement**:
- **Target**: Users check dashboard at least 2x per day
- **Measurement**: Session analytics (login frequency)
- **Frequency**: Weekly engagement reports

### Compliance Metrics

**Audit Trail Completeness**:
- **Target**: 100% of alerts tracked with delivery confirmation
- **Measurement**: Alerts with matching notification_deliveries records
- **Frequency**: Daily completeness checks

**Data Retention**:
- **Target**: Historical temperature data retained for 2+ years
- **Measurement**: Oldest sensor_readings record timestamp
- **Frequency**: Monthly retention verification

**Audit Report Generation**:
- **Target**: Audit reports generated on demand
- **Measurement**: Report generation success rate
- **Frequency**: Per-request monitoring

### User Satisfaction Metrics

**Device Provisioning Time**:
- **Target**: Users provision devices in < 5 minutes
- **Measurement**: Time from device creation to first temperature reading
- **Frequency**: Monthly provisioning flow analysis

**Escalation Configuration Time**:
- **Target**: Alert escalation contacts configured in < 2 minutes
- **Measurement**: User session time on escalation setup page
- **Frequency**: Monthly onboarding analysis

**AI Assistant Accuracy**:
- **Target**: AI assistant answers 80%+ of temperature queries correctly
- **Measurement**: User feedback (thumbs up/down on AI responses)
- **Frequency**: Weekly AI performance review

**Net Promoter Score (NPS)**:
- **Target**: NPS score > 50 within first 6 months
- **Measurement**: Quarterly NPS surveys
- **Frequency**: Quarterly (months 3, 6, 9, 12)

## Open Questions

### Technical Open Questions
- **Q1**: How should we handle TTN webhook timeout scenarios (30-second limit)? Should processing be fully asynchronous beyond initial webhook acknowledgment?
- **Q2**: What is the optimal BullMQ job concurrency for production loads (currently 5 SMS, 2 email, 5 meters)?
- **Q3**: Should we implement rate limiting on TTN webhook endpoint to prevent abuse or sensor misconfiguration floods?
- **Q4**: How should we handle timezone conversions for multi-region organizations (currently assumes single timezone per organization)?

### Business Open Questions
- **Q5**: What is the pricing model for v1 (per-device, per-location, tiered plans)?
- **Q6**: Should trial period be time-limited (e.g., 14 days) or feature-limited?
- **Q7**: What are the support SLAs for different customer tiers?
- **Q8**: Should v1 include self-service device onboarding or require support team involvement?

### Compliance Open Questions
- **Q9**: Are there specific regulatory frameworks we must comply with (FDA 21 CFR Part 11, EU MDR, HACCP)?
- **Q10**: Do we need data residency guarantees (e.g., EU customers data stored in EU)?
- **Q11**: What is the data export format requirement for compliance reports (PDF, CSV, JSON)?
- **Q12**: Should we implement automated compliance report generation (daily/weekly/monthly)?

## Assumptions & Risks

| ID | Assumption | Risk if Wrong | Charter Reference | Mitigation |
|----|------------|---------------|-------------------|------------|
| A1 | Organizations have reliable internet connectivity for LoRa gateway uplinks to TTN | Sensor data doesn't reach platform; alerts fail to trigger | Charter: LoRa sensor monitoring | Document minimum connectivity requirements; provide offline buffer guidance for gateways |
| A2 | Users have mobile devices capable of receiving SMS notifications | SMS alerting ineffective; users miss critical alerts | Charter: SMS notifications via Telnyx | Offer email-only notification option; support VOIP/app-based alternatives in future |
| A3 | Target users have basic technical literacy to configure thresholds and devices | Poor configuration leads to false positives or missed alerts | Charter: Self-service device provisioning | Provide guided onboarding; offer configuration templates for common use cases |
| A4 | Off-the-shelf TTN-compatible LoRa sensors meet accuracy requirements | Temperature readings unreliable; compliance value degraded | Charter: Use off-the-shelf sensors | Document certified sensor models; provide calibration verification workflows |
| A5 | Single-region deployment (no multi-region) acceptable for v1 customers | Latency issues for global customers; data residency concerns | Charter: Out of scope for v1 | Clearly communicate regional limitations; plan multi-region for v2 |
| A6 | English-only UI acceptable for initial market | Limits international expansion; user experience issues for non-English speakers | Charter: English only for v1 | Target English-speaking markets first; plan i18n for v2 |
| A7 | Stack Auth provides sufficient scalability and reliability | Auth provider outage causes complete platform unavailability | Charter: Stack Auth integration | Monitor Stack Auth SLA; plan multi-provider auth for enterprise tier |
| A8 | Stripe subscription billing model fits customer payment preferences | Payment friction reduces conversion; churn increases | Charter: Stripe integration | Offer flexible payment terms; support invoice-based billing for enterprise |
| A9 | 2-year data retention sufficient for compliance needs | Regulatory audit failures; customer compliance requirements not met | Charter: 2+ year retention | Allow configurable retention per organization; support longer retention as upgrade |
| A10 | Docker Compose deployment scalable to initial customer targets (10+ orgs, 50+ devices) | Performance degradation; platform cannot handle growth | Charter: 10+ orgs in 3 months | Load testing before launch; plan Kubernetes migration for scaling beyond initial targets |

## Risk Register

| Risk ID | Risk Description | Likelihood | Impact | Mitigation Strategy |
|---------|-----------------|------------|--------|---------------------|
| R1 | TTN service degradation or outage blocks all sensor data ingestion | Medium | Critical | Monitor TTN status page; implement webhook retry queue; document manual data entry fallback |
| R2 | Notification delivery failures (Telnyx/Resend) result in missed alerts | Medium | High | BullMQ retry with exponential backoff; multi-channel redundancy (SMS + email); delivery status monitoring with alerts |
| R3 | Cross-tenant data leakage due to organizationId filtering bug | Low | Critical | Comprehensive integration tests for multi-tenancy; code review focus on authorization; regular security audits |
| R4 | WebSocket connection scaling issues under high concurrent load | Medium | Medium | Redis adapter for horizontal scaling; load testing at 2x target capacity; connection limit monitoring |
| R5 | Database performance degradation as time-series data grows | High | Medium | Index optimization on sensor_readings table; implement data archival strategy; partition tables by time period |
| R6 | Alert fatigue from false positives degrades user engagement | Medium | High | Configurable alert thresholds; snooze/mute functionality; AI-based anomaly detection for v2 |
| R7 | LoRa sensor battery depletion without notification | Medium | Medium | Device heartbeat monitoring; battery level reporting; proactive replacement alerts |
| R8 | AI assistant provides incorrect compliance information | Low | High | Disclaimer on AI responses; audit AI accuracy metrics; human review option for compliance queries |
| R9 | Production deployment complexity delays launch | Medium | Medium | Staged rollout plan; deployment automation; comprehensive runbook documentation |
| R10 | Customer onboarding friction reduces adoption rate | High | Medium | Self-service onboarding wizard; video tutorials; dedicated customer success support for first 10 customers |

## Appendix

### Related Documentation
- [Project Charter](../context/charter.md) - Vision, problem, users, scope, success criteria
- [System Architecture](../context/architecture.md) - Technical architecture and patterns
- [Module Breakdown](../context/modules.md) - Component structure and dependencies
- [Implementation Patterns](../context/patterns.md) - Coding standards and conventions

### Key Terminology
- **Organization**: Top-level tenant entity; all data scoped to organizationId
- **Site**: Physical location owned by organization (e.g., restaurant branch)
- **Area**: Zone within site (e.g., kitchen, storage room)
- **Unit**: Individual monitored appliance (e.g., walk-in freezer, refrigerator)
- **Device**: LoRa sensor hardware monitoring a unit
- **Alert**: Threshold violation event requiring user action
- **Escalation Contact**: User designated to receive alert notifications
- **Notification Delivery**: Record of SMS/Email sent for an alert

### Revision History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-01 | BlueprintGPT | Initial PRD creation - complete platform v1 scope |

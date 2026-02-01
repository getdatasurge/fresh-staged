# Project Charter: FreshStaged

**Version**: 1.0.0
**Status**: Complete
**Created**: 2026-02-01
**Source**: Extracted from knowledge base

## Problem & Context

**Problem**: Organizations managing temperature-sensitive products (food, pharmaceuticals, vaccines) face critical risks from temperature excursions that can lead to product spoilage, regulatory violations, and safety issues. Current solutions often lack real-time monitoring, rely on manual temperature checks, or use expensive proprietary systems.

**Why It's Painful**:
- Temperature violations go undetected until too late (product already spoiled)
- Manual temperature logging is time-consuming and error-prone
- No immediate alerting when thresholds are violated
- Difficult to maintain audit trails for regulatory compliance
- Expensive enterprise solutions not accessible to smaller organizations

**Why Now**:
- LoRaWAN sensor technology makes low-cost, long-range IoT monitoring viable
- Cloud infrastructure enables affordable multi-tenant SaaS deployment
- Increasing regulatory requirements for cold chain compliance
- Post-pandemic focus on supply chain reliability and food safety

## Target Users

**Primary Users**:

1. **Facility Managers** (restaurants, pharmacies, food distributors, hospitals)
   - Need to monitor multiple freezers/refrigerators across locations
   - Require real-time alerts when temperature thresholds violated
   - Want centralized dashboard for all monitored locations

2. **Compliance Officers**
   - Need audit trails and historical temperature data for regulatory reporting
   - Require proof of continuous cold chain compliance
   - Must demonstrate alert response procedures

3. **Operations Staff**
   - Respond to temperature alerts (check equipment, transfer products)
   - Need mobile access to current temperature status
   - Require clear escalation procedures

**Current Workflow Pain Points**:
- Manual temperature checks multiple times per day
- Paper logbooks that get lost or filled incorrectly
- No alerts - discover problems only during scheduled checks
- Difficult to aggregate data across multiple locations

## Value Proposition

**Unique Value**:

1. **Real-Time IoT Monitoring**: LoRa sensors provide continuous temperature monitoring with low power consumption and wide-area coverage (no WiFi required in remote storage areas)

2. **Instant Alerting**: SMS/Email notifications within seconds of threshold violations, enabling immediate response before products spoil

3. **Multi-Tenant SaaS**: Affordable subscription model accessible to organizations of all sizes, not just large enterprises

4. **Compliance-Ready**: Automated audit trails, historical reporting, and timestamped alert notifications meet regulatory requirements

5. **AI-Powered Insights**: Conversational AI assistant for querying temperature trends, compliance status, and historical data

**Better Than Alternatives**:
- **vs. Manual Logging**: Automated, continuous monitoring eliminates human error and missed checks
- **vs. WiFi Sensors**: LoRa provides longer range and works in areas without WiFi infrastructure
- **vs. Enterprise Systems**: 10x lower cost with SaaS pricing instead of large upfront investment
- **vs. Basic Monitoring**: Real-time WebSocket updates, background job processing, and multi-tenant isolation

## Scope

### In Scope (v1)

**Core Monitoring**:
- IoT sensor integration via The Things Network (TTN) LoRaWAN
- Real-time temperature event ingestion and storage
- Configurable temperature thresholds per location
- Alarm state classification (normal, too_hot, too_cold)

**Alerting & Notifications**:
- Threshold-based alert creation
- SMS notifications via Telnyx
- Email notifications via Resend
- Escalation contact management
- Notification delivery tracking

**Dashboard & Visualization**:
- Real-time dashboard with WebSocket updates (Socket.io)
- Multi-location temperature status view
- Alert history and status
- Device management interface

**Multi-Tenancy & Access Control**:
- Organization-based data isolation
- Role-based access control (owner, admin, manager, staff, viewer)
- User authentication via Stack Auth
- Secure API with tRPC type-safety

**AI Features**:
- Conversational AI assistant for temperature data queries
- Context builder for historical data retrieval
- Natural language insights

**Compliance & Reporting**:
- Historical temperature data storage
- Audit trail of all alerts and notifications
- Time-series event queries

### Out of Scope (v1)

**Explicitly NOT Included**:
- Physical sensor manufacturing or hardware sales (use off-the-shelf LoRa sensors)
- Custom hardware development (rely on TTN-compatible devices)
- Predictive analytics or machine learning (future v2 feature)
- Mobile native apps (PWA with offline support instead)
- Multi-language internationalization (English only for v1)
- Custom integrations beyond TTN/Stripe/Stack Auth
- White-label or private-label deployments

## Success Criteria

### Technical Success Metrics

1. **Monitoring Reliability**:
   - 99.9% uptime for monitoring service
   - < 5 second latency from sensor reading to alert creation
   - Zero cross-tenant data leakage (strict organizationId isolation)

2. **Alert Delivery**:
   - Alerts trigger within 10 seconds of threshold violation
   - 99.5% successful SMS/Email delivery rate
   - < 1 minute from alert creation to notification sent

3. **Real-Time Performance**:
   - WebSocket events delivered < 1 second after temperature update
   - Dashboard loads in < 2 seconds
   - Support 1000+ concurrent WebSocket connections

### Business Success Metrics

1. **User Adoption**:
   - 10+ organizations onboarded in first 3 months
   - 50+ devices provisioned across all organizations
   - 90% user retention after 30 days

2. **Operational Effectiveness**:
   - Users respond to alerts within 15 minutes (average)
   - < 5% false positive alert rate
   - Users check dashboard at least 2x per day

3. **Compliance Value**:
   - 100% of alerts tracked with delivery confirmation
   - Historical temperature data retained for 2+ years
   - Audit reports generated on demand

### User Satisfaction

- Users can provision devices in < 5 minutes
- Alert escalation contacts configured in < 2 minutes
- AI assistant answers 80%+ of temperature queries correctly
- NPS score > 50 within first 6 months

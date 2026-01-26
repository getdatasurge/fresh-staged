# StayFrosty - Product Requirements Document

**Version:** 1.0  
**Date:** January 25, 2026  
**Author:** Matrix Agent  
**Status:** Final Draft  
**Classification:** Internal

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-25 | Matrix Agent | Initial PRD release |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Overview](#2-product-overview)
3. [Goals and Objectives](#3-goals-and-objectives)
4. [User Stories and Requirements](#4-user-stories-and-requirements)
5. [Feature Specifications](#5-feature-specifications)
6. [Technical Architecture Overview](#6-technical-architecture-overview)
7. [Release Planning](#7-release-planning)
8. [Risks and Mitigations](#8-risks-and-mitigations)
9. [Appendices](#9-appendices)

---

## 1. Executive Summary

### 1.1 Product Vision and Mission

**Vision:** Become the trusted partner for growers and facility operators in protecting their assets from frost damage through intelligent, accessible, and actionable environmental monitoring.

**Mission:** Democratize frost protection technology by combining enterprise-grade predictive analytics with consumer-friendly user experience at accessible price points.

### 1.2 Problem Statement

Frost events cause over **$854 million** in annual crop losses in the United States alone, with single late-spring frost events capable of causing catastrophic damage (e.g., 2017 European frost event: $3.3 billion). Current solutions suffer from critical gaps:

| Problem | Current State | Impact |
|---------|---------------|--------|
| **Reactive, not predictive** | Alerts trigger when frost occurs, not before | Actions come too late to prevent damage |
| **Cost prohibitive** | Enterprise solutions cost $1,000+ upfront | Small/medium operations cannot afford protection |
| **Complex setup** | Technical expertise required for installation | Low adoption among non-technical users |
| **Poor UX** | Legacy interfaces, data overload | Alert fatigue, missed critical warnings |
| **Siloed systems** | Limited API/integration capabilities | Cannot connect to existing farm management systems |

### 1.3 Solution Overview

**StayFrosty** is an intelligent frost monitoring and prevention platform that provides:

1. **Real-time Environmental Monitoring** - Temperature, humidity, soil moisture tracking with LoRaWAN sensor networks
2. **Predictive Frost Forecasting** - ML-powered 6-24 hour advance warnings with >85% accuracy
3. **Multi-channel Alerts** - SMS, email, push notifications, and webhook integrations
4. **Historical Analytics** - Trend analysis, seasonal comparisons, and actionable insights
5. **Multi-tenant Access** - Role-based access for consultants managing multiple farms
6. **Open Integration Architecture** - Public API, webhook support, third-party compatibility

### 1.4 Success Metrics / KPIs

| Category | Metric | Target | Measurement Method |
|----------|--------|--------|-------------------|
| **Adoption** | Monthly Active Users (MAU) | 5,000 by Month 12 | Product analytics |
| **Engagement** | Daily Active Users (DAU) | 60% of MAU | Product analytics |
| **Retention** | 90-day retention rate | >70% | Cohort analysis |
| **Alert Performance** | Prediction accuracy | >85% precision, >90% recall | Model validation |
| **Customer Satisfaction** | Net Promoter Score (NPS) | >50 | Quarterly surveys |
| **Revenue** | Monthly Recurring Revenue (MRR) | $150K by Month 12 | Financial tracking |
| **Churn** | Monthly churn rate | <3% | Subscription analytics |
| **Time to Value** | First sensor to first data | <15 minutes | Onboarding tracking |

### 1.5 Timeline Overview

| Phase | Timeline | Key Deliverables |
|-------|----------|------------------|
| **Phase 1: MVP** | Months 1-4 | Core monitoring, alerts, basic forecasting |
| **Phase 2: Enhancement** | Months 5-8 | Advanced predictions, multi-tenant, API |
| **Phase 3: Scale** | Months 9-12 | Integrations, automation, enterprise features |

---

## 2. Product Overview

### 2.1 Product Description

StayFrosty is a SaaS platform with accompanying IoT hardware that enables agricultural growers, facility operators, and consultants to:

- **Monitor** real-time environmental conditions across multiple locations
- **Predict** frost events 6-24 hours in advance using machine learning
- **Alert** stakeholders through multiple channels before damage occurs
- **Analyze** historical data to improve protection strategies
- **Integrate** with existing farm management and automation systems

The platform consists of three components:

1. **StayFrosty Sensors** - LoRaWAN-enabled environmental sensors (temperature, humidity, soil moisture)
2. **StayFrosty Gateway** - Cellular hub connecting sensor networks to the cloud
3. **StayFrosty Platform** - Web and mobile applications for monitoring, alerts, and analytics

### 2.2 Value Proposition

| Stakeholder | Value Delivered |
|-------------|-----------------|
| **Growers/Farmers** | Sleep peacefully knowing you will be warned 6+ hours before frost threatens your crop |
| **Agricultural Consultants** | Monitor all client farms from a single dashboard, deliver professional data-driven recommendations |
| **Facility Operators** | Prevent equipment damage with automated alerts integrated into existing systems |
| **IoT Integrators** | Deploy reliable sensor networks with comprehensive diagnostics and batch management tools |

**Unique Value Proposition:** StayFrosty is the only solution combining predictive analytics, consumer-friendly UX, and accessible pricing in a single platform.

### 2.3 Target Users and Personas

#### Primary Personas

**Persona 1: Alex - Vineyard Owner (Primary)**
| Attribute | Detail |
|-----------|--------|
| Demographics | Age 52, Napa Valley, CA, 50-acre vineyard |
| Tech Comfort | Basic smartphone use |
| Primary Need | Overnight frost alerts to protect grape harvest |
| Usage Pattern | Mobile-first, reactive, checks app each morning |
| Pain Points | Generic weather apps, lost crops to microclimate frost, complex systems overwhelming |
| Success Metric | Zero frost-related crop losses per season |

**Persona 2: Jordan - Agricultural Consultant**
| Attribute | Detail |
|-----------|--------|
| Demographics | Age 38, Central Valley, CA, manages 15 farms |
| Tech Comfort | Proficient with farm software |
| Primary Need | Multi-site monitoring, professional reports |
| Usage Pattern | Desktop dashboard, analytical, iPad for field visits |
| Pain Points | Multiple logins, manual data compilation, blame for missed warnings |
| Success Metric | Client satisfaction, accurate recommendations |

**Persona 3: Sam - Facility Operator**
| Attribute | Detail |
|-----------|--------|
| Demographics | Age 45, Phoenix, AZ, outdoor HVAC/irrigation infrastructure |
| Tech Comfort | Comfortable with industrial systems |
| Primary Need | Prevent freeze damage, integrate with SCADA/BMS |
| Usage Pattern | Integration-focused, automated responses |
| Pain Points | Manual temperature checks, false alarms, lack of integration |
| Success Metric | 99.5%+ equipment uptime |

**Persona 4: Morgan - IoT Integrator**
| Attribute | Detail |
|-----------|--------|
| Demographics | Age 29, Sacramento, CA, deploys sensors for clients |
| Tech Comfort | Advanced (developer background) |
| Primary Need | Reliable deployment, quick troubleshooting |
| Usage Pattern | Technical configuration, batch operations |
| Pain Points | Poor API docs, difficult diagnostics, tedious calibration |
| Success Metric | <2% sensor failure rate post-deployment |

### 2.4 Use Cases

#### UC-01: Overnight Frost Protection (Primary)
- **Actor:** Vineyard Owner (Alex)
- **Trigger:** Nighttime temperature drop
- **Preconditions:** Sensors installed, alert thresholds configured
- **Main Flow:**
  1. Sensors continuously monitor temperature
  2. System predicts frost risk 6 hours in advance
  3. User receives proactive warning via SMS
  4. User prepares protection equipment
  5. System sends real-time alert when threshold breached
  6. User activates wind machines/heaters
  7. System confirms temperature recovery
  8. User reviews event summary next morning
- **Postconditions:** Crop protected, event logged for analysis

#### UC-02: Multi-Farm Oversight
- **Actor:** Agricultural Consultant (Jordan)
- **Trigger:** Daily monitoring routine
- **Preconditions:** Multiple client farms onboarded
- **Main Flow:**
  1. Consultant opens unified dashboard
  2. Reviews status of all client farms
  3. Identifies farm with anomalous readings
  4. Drills into specific sensor data
  5. Contacts client with recommendations
  6. Generates monthly report for client meeting
- **Postconditions:** All clients proactively managed

#### UC-03: Automated Facility Protection
- **Actor:** Facility Operator (Sam)
- **Trigger:** Temperature approaching freeze threshold
- **Preconditions:** Sensors installed, webhook configured to SCADA
- **Main Flow:**
  1. System detects temperature dropping
  2. Webhook triggers SCADA alert
  3. SCADA automatically activates heat tape
  4. System confirms temperature stabilization
  5. Event logged for compliance reporting
- **Postconditions:** Equipment protected, automated response documented

#### UC-04: Large-Scale Sensor Deployment
- **Actor:** IoT Integrator (Morgan)
- **Trigger:** New client installation project
- **Preconditions:** Sensors and gateway hardware received
- **Main Flow:**
  1. Integrator surveys client property
  2. Plans sensor placement for optimal coverage
  3. Installs gateway at client site
  4. Batch provisions 50+ sensors via CSV upload
  5. Verifies connectivity for all devices
  6. Calibrates sensors against reference
  7. Documents deployment for client
- **Postconditions:** Fully operational sensor network

### 2.5 Competitive Positioning

```
                    Enterprise Features
                           ^
                           |
         Semios            |              StayFrosty
         ($$$$)            |              Target Position
                           |              ($$)
   -----------------------+-----------------------> 
   Complex                 |                   Simple
   UX                      |                   UX
                           |
         Davis             |              SensorPush
         EnviroMonitor     |              ($)
         ($$$)             |
                           |
                    Consumer Features
```

**Competitive Differentiation:**

| Differentiator | StayFrosty | Competitors |
|----------------|------------|-------------|
| Predictive Alerts | 6-24 hour advance | Reactive only |
| Entry Price | $299 hardware, $10/month | $1,000+ hardware |
| Setup Time | <15 minutes | 1-2 hours |
| API Access | Full public API | Limited or enterprise-only |
| Multi-tenant RBAC | Included | Enterprise tier only |
| Mobile Experience | Native-quality | Web wrapper or limited |

---

## 3. Goals and Objectives

### 3.1 Business Goals

| Goal ID | Goal | Success Criteria | Timeline |
|---------|------|------------------|----------|
| BG-01 | Achieve product-market fit | >40% "very disappointed" on PMF survey | Month 6 |
| BG-02 | Generate sustainable revenue | $150K MRR | Month 12 |
| BG-03 | Build brand recognition | 10,000 qualified leads | Month 12 |
| BG-04 | Establish market presence | #3 market awareness in target segment | Month 18 |
| BG-05 | Enable expansion | Platform architecture supports 3 new verticals | Month 12 |

### 3.2 User Goals

| Goal ID | Persona | Goal | Success Criteria |
|---------|---------|------|------------------|
| UG-01 | Alex (Grower) | Protect crops from frost damage | Zero preventable frost losses |
| UG-02 | Alex (Grower) | Peace of mind during frost season | Trust in alert reliability >90% |
| UG-03 | Jordan (Consultant) | Efficiently manage multiple clients | <30 min daily for all-client review |
| UG-04 | Jordan (Consultant) | Deliver data-driven recommendations | Monthly reports in <10 min each |
| UG-05 | Sam (Facility) | Prevent equipment damage | 99.5%+ uptime |
| UG-06 | Sam (Facility) | Integrate with existing systems | <1 hour webhook setup |
| UG-07 | Morgan (Integrator) | Reliable sensor deployments | <2% post-deployment failure |
| UG-08 | Morgan (Integrator) | Efficient batch operations | 50+ sensors in <1 hour |

### 3.3 Technical Goals

| Goal ID | Goal | Success Criteria | Priority |
|---------|------|------------------|----------|
| TG-01 | System reliability | 99.9% uptime | P0 |
| TG-02 | Alert latency | <30 seconds from trigger to delivery | P0 |
| TG-03 | Prediction accuracy | >85% precision, >90% recall | P0 |
| TG-04 | Data freshness | <5 minute sensor-to-dashboard latency | P0 |
| TG-05 | Scalability | Support 100,000+ concurrent sensors | P1 |
| TG-06 | API performance | <200ms p95 response time | P1 |
| TG-07 | Mobile performance | <3s time to interactive | P1 |
| TG-08 | Security | SOC 2 Type II compliance | P1 |

### 3.4 Success Criteria Summary

**Phase 1 (MVP) Success:**
- 500+ active users
- 2,000+ sensors deployed
- 85%+ alert accuracy
- <5% monthly churn
- >30 NPS score

**Phase 2 Success:**
- 2,500+ active users
- 10,000+ sensors deployed
- API adoption by 50+ integrators
- Multi-tenant feature used by 100+ consultants
- >40 NPS score

**Phase 3 Success:**
- 5,000+ active users
- 25,000+ sensors deployed
- $150K MRR
- 3+ enterprise integration partners
- >50 NPS score

---

## 4. User Stories and Requirements

### 4.1 User Stories by Persona

#### 4.1.1 Grower/Farmer Stories (Alex)

| Story ID | User Story | Acceptance Criteria | Priority |
|----------|------------|---------------------|----------|
| US-GRW-01 | As a grower, I want to see current temperature readings from my sensors so that I know if my crops are at risk | - Dashboard shows current temp for each sensor<br>- Data refreshes within 5 minutes<br>- Clear visual indicator of status (safe/warning/danger) | P0 |
| US-GRW-02 | As a grower, I want to receive SMS alerts when temperature drops below my threshold so that I can take protective action | - Alert delivered within 30 seconds of threshold breach<br>- SMS contains sensor name, current temp, threshold<br>- User can acknowledge alert from SMS reply | P0 |
| US-GRW-03 | As a grower, I want to set custom temperature thresholds for different sensors so that I can protect different crop types | - User can set unique threshold per sensor<br>- Thresholds support above/below/range conditions<br>- Changes take effect immediately | P0 |
| US-GRW-04 | As a grower, I want to see a frost risk prediction for the next 6-24 hours so that I can prepare in advance | - Risk score displayed as 0-100 gauge<br>- Hour-by-hour breakdown available<br>- Contributing factors explained | P1 |
| US-GRW-05 | As a grower, I want to view historical temperature data so that I can understand patterns on my property | - At least 30 days of historical data<br>- Interactive chart with zoom/pan<br>- Ability to compare time periods | P1 |
| US-GRW-06 | As a grower, I want to add a new sensor in under 5 minutes so that expanding coverage is easy | - QR code scanning for provisioning<br>- Auto-discovery of nearby sensors<br>- Guided setup wizard | P0 |
| US-GRW-07 | As a grower, I want to receive push notifications on my phone so that I am alerted even without cell service SMS | - Push notification within 30 seconds<br>- Works when app is in background<br>- Tapping notification opens relevant screen | P1 |
| US-GRW-08 | As a grower, I want to see my sensors on a map so that I understand coverage across my property | - Map view with sensor pins<br>- Color-coded by current status<br>- Tap pin to see sensor details | P2 |

#### 4.1.2 Consultant Stories (Jordan)

| Story ID | User Story | Acceptance Criteria | Priority |
|----------|------------|---------------------|----------|
| US-CON-01 | As a consultant, I want to view all my client farms in a single dashboard so that I can efficiently monitor multiple properties | - All client farms visible on one screen<br>- Summary status for each farm<br>- Quick navigation to any farm | P0 |
| US-CON-02 | As a consultant, I want to invite client farms to my organization so that I can manage them centrally | - Email invitation workflow<br>- Client accepts and links their account<br>- Consultant gains view access | P0 |
| US-CON-03 | As a consultant, I want to set different permission levels for team members so that I can control access appropriately | - At least 3 role levels (Admin, Manager, Viewer)<br>- Granular permissions per farm<br>- Audit log of permission changes | P1 |
| US-CON-04 | As a consultant, I want to generate reports for client meetings so that I can demonstrate value | - PDF report generation<br>- Customizable date ranges<br>- Includes charts, data tables, recommendations | P1 |
| US-CON-05 | As a consultant, I want to compare data across multiple farms so that I can identify regional patterns | - Side-by-side comparison view<br>- Overlay charts for multiple sensors<br>- Export comparison data | P2 |
| US-CON-06 | As a consultant, I want to receive aggregated alerts for all clients so that I don't miss critical events | - Single notification channel for all clients<br>- Alert indicates which farm affected<br>- Configurable alert routing rules | P1 |

#### 4.1.3 Facility Operator Stories (Sam)

| Story ID | User Story | Acceptance Criteria | Priority |
|----------|------------|---------------------|----------|
| US-FAC-01 | As a facility operator, I want to configure webhook alerts so that my SCADA system receives notifications | - Webhook URL configuration<br>- JSON payload with alert details<br>- Test webhook button<br>- Retry logic for failed deliveries | P0 |
| US-FAC-02 | As a facility operator, I want to define monitoring zones so that I can organize sensors by area | - Create/edit/delete zones<br>- Assign sensors to zones<br>- Zone-level status aggregation | P1 |
| US-FAC-03 | As a facility operator, I want to view alert history with timestamps so that I have audit documentation | - Complete alert history log<br>- Filterable by date, sensor, type<br>- Exportable for compliance | P1 |
| US-FAC-04 | As a facility operator, I want to set quiet hours for non-critical alerts so that I'm not disturbed unnecessarily | - Configurable quiet hours schedule<br>- Critical alerts always delivered<br>- Different schedules per alert rule | P2 |
| US-FAC-05 | As a facility operator, I want API access to retrieve historical data so that I can integrate with our BI tools | - REST API for data export<br>- API key authentication<br>- Rate limiting with clear documentation | P1 |

#### 4.1.4 IoT Integrator Stories (Morgan)

| Story ID | User Story | Acceptance Criteria | Priority |
|----------|------------|---------------------|----------|
| US-INT-01 | As an integrator, I want to batch provision multiple sensors so that large deployments are efficient | - CSV upload for batch provisioning<br>- Progress indicator for batch operations<br>- Error report for failed devices | P0 |
| US-INT-02 | As an integrator, I want to view diagnostic information for each sensor so that I can troubleshoot issues | - Signal strength indicator<br>- Packet loss rate<br>- Last seen timestamp<br>- Error log access | P0 |
| US-INT-03 | As an integrator, I want to calibrate sensors against a reference so that readings are accurate | - Calibration workflow with instructions<br>- Offset calculation and application<br>- Calibration history log | P1 |
| US-INT-04 | As an integrator, I want to push firmware updates to sensors so that devices stay current | - OTA update capability<br>- Batch update selection<br>- Rollback option if update fails | P1 |
| US-INT-05 | As an integrator, I want comprehensive API documentation so that I can build custom integrations | - OpenAPI 3.0 specification<br>- Code examples in multiple languages<br>- Sandbox environment for testing | P0 |
| US-INT-06 | As an integrator, I want to generate API keys for client integrations so that each client has separate credentials | - Multiple API keys per organization<br>- Key-level permission scoping<br>- Key revocation capability | P1 |

### 4.2 Functional Requirements

#### 4.2.1 FR-MON: Real-Time Monitoring

| Req ID | Requirement | Description | Acceptance Criteria | Priority |
|--------|-------------|-------------|---------------------|----------|
| FR-MON-01 | Live data display | Display current sensor readings on dashboard | Data updates within 5 minutes, shows timestamp | P0 |
| FR-MON-02 | Data freshness indicator | Show status of data currency | Green (<5 min), Yellow (5-15 min), Red (>15 min) | P0 |
| FR-MON-03 | Multi-sensor overview | Show all sensors in a single view | Card or list view with key metrics per sensor | P0 |
| FR-MON-04 | Sensor detail view | Detailed view for individual sensors | Current reading, 24h sparkline, threshold lines | P0 |
| FR-MON-05 | Map visualization | Display sensors on geographic map | Pins with color-coded status, tap to view details | P2 |
| FR-MON-06 | Historical charting | Interactive historical data charts | Zoom, pan, date range selection, data point tooltips | P1 |
| FR-MON-07 | Multi-metric display | Show temperature, humidity, soil moisture | Each metric in dedicated card/widget | P0 |
| FR-MON-08 | Comparison view | Compare multiple sensors side-by-side | Overlay charts, tabular comparison | P2 |

#### 4.2.2 FR-ALT: Alerts & Notifications

| Req ID | Requirement | Description | Acceptance Criteria | Priority |
|--------|-------------|-------------|---------------------|----------|
| FR-ALT-01 | Threshold alerts | Trigger alert when sensor crosses threshold | Alert within 30 seconds of threshold breach | P0 |
| FR-ALT-02 | SMS delivery | Send alerts via SMS | Delivery to configured phone numbers | P0 |
| FR-ALT-03 | Email delivery | Send alerts via email | Delivery to configured email addresses | P0 |
| FR-ALT-04 | Push notifications | Send alerts via mobile push | Works when app in background | P1 |
| FR-ALT-05 | Webhook delivery | Send alerts to webhook URL | JSON payload, retry on failure | P1 |
| FR-ALT-06 | Custom thresholds | User-defined threshold values | Per-sensor threshold configuration | P0 |
| FR-ALT-07 | Threshold types | Support multiple condition types | Below, above, range, rate of change | P1 |
| FR-ALT-08 | Alert acknowledgment | Allow user to acknowledge alerts | Ack via app, SMS reply, or API | P0 |
| FR-ALT-09 | Alert history | Log all alerts with outcomes | Searchable, filterable, exportable | P1 |
| FR-ALT-10 | Quiet hours | Suppress non-critical alerts during configured times | Schedule configuration, critical override | P2 |
| FR-ALT-11 | Alert escalation | Escalate unacknowledged alerts | Configurable escalation chain | P2 |
| FR-ALT-12 | Sensor offline alerts | Alert when sensor goes offline | Configurable offline threshold (default 15 min) | P0 |

#### 4.2.3 FR-HIS: Historical Data & Trends

| Req ID | Requirement | Description | Acceptance Criteria | Priority |
|--------|-------------|-------------|---------------------|----------|
| FR-HIS-01 | Data retention | Store historical sensor data | Minimum 1 year retention | P0 |
| FR-HIS-02 | Time range selection | Allow custom date range queries | Preset ranges + custom date picker | P1 |
| FR-HIS-03 | Data aggregation | Aggregate data for long time ranges | Auto-aggregate to hourly/daily for >7 days | P1 |
| FR-HIS-04 | Trend analysis | Identify patterns in historical data | Display trend lines, min/max/avg statistics | P2 |
| FR-HIS-05 | Event markers | Mark frost events on charts | Visual indicators for alert events | P1 |
| FR-HIS-06 | Data export | Export historical data | CSV and JSON formats | P1 |
| FR-HIS-07 | Seasonal comparison | Compare current season to previous | Year-over-year overlay charts | P2 |

#### 4.2.4 FR-PRE: Predictive Forecasting

| Req ID | Requirement | Description | Acceptance Criteria | Priority |
|--------|-------------|-------------|---------------------|----------|
| FR-PRE-01 | Frost risk score | Calculate frost probability score | 0-100 scale with confidence interval | P1 |
| FR-PRE-02 | Short-term forecast | Predict frost risk for next 6 hours | Hour-by-hour breakdown | P1 |
| FR-PRE-03 | Extended forecast | Predict frost risk for next 24 hours | Accuracy degrades gracefully with time | P2 |
| FR-PRE-04 | Contributing factors | Explain factors driving prediction | Temperature trend, humidity, wind, etc. | P1 |
| FR-PRE-05 | Proactive alerts | Alert based on predicted risk | Configurable risk threshold for alerts | P1 |
| FR-PRE-06 | Accuracy tracking | Track and display prediction accuracy | Historical accuracy statistics | P2 |
| FR-PRE-07 | Weather API integration | Incorporate external weather data | Blend sensor data with forecast APIs | P1 |

#### 4.2.5 FR-DEV: Device Management

| Req ID | Requirement | Description | Acceptance Criteria | Priority |
|--------|-------------|-------------|---------------------|----------|
| FR-DEV-01 | Device provisioning | Add new sensors to account | QR scan, manual entry, CSV batch | P0 |
| FR-DEV-02 | Device naming | Assign custom names to sensors | Editable names, max 50 characters | P0 |
| FR-DEV-03 | Device grouping | Organize sensors into groups/zones | Create/edit groups, assign sensors | P1 |
| FR-DEV-04 | Health monitoring | Track sensor health metrics | Battery level, signal strength, packet loss | P0 |
| FR-DEV-05 | Firmware management | View and update device firmware | Current version display, OTA updates | P1 |
| FR-DEV-06 | Calibration | Calibrate sensors against reference | Guided workflow, offset application | P1 |
| FR-DEV-07 | Device removal | Remove sensors from account | Soft delete with data retention option | P1 |
| FR-DEV-08 | Gateway management | Manage gateway devices | Status, connectivity, connected sensors | P0 |
| FR-DEV-09 | Batch operations | Perform actions on multiple devices | Batch update, batch calibrate, batch remove | P1 |
| FR-DEV-10 | Device diagnostics | Detailed diagnostic information | Error logs, connectivity history, packet analysis | P1 |

#### 4.2.6 FR-USR: User Management & RBAC

| Req ID | Requirement | Description | Acceptance Criteria | Priority |
|--------|-------------|-------------|---------------------|----------|
| FR-USR-01 | User registration | Create new user accounts | Email verification, password requirements | P0 |
| FR-USR-02 | Authentication | Secure user login | Email/password, optional 2FA | P0 |
| FR-USR-03 | Password management | Reset and change passwords | Email reset flow, secure change | P0 |
| FR-USR-04 | Organization creation | Create organizations for multi-user | Owner role automatically assigned | P0 |
| FR-USR-05 | Team invitations | Invite users to organization | Email invitation, role assignment | P1 |
| FR-USR-06 | Role definitions | Define access roles | Admin, Manager, Viewer (minimum) | P1 |
| FR-USR-07 | Permission management | Granular permission control | Per-resource permissions | P1 |
| FR-USR-08 | Multi-tenant access | Consultant access to multiple orgs | Org switching, unified dashboard | P1 |
| FR-USR-09 | Audit logging | Log user actions | Timestamped action log, exportable | P2 |
| FR-USR-10 | Session management | Control active sessions | View sessions, remote logout | P2 |

#### 4.2.7 FR-INT: Integrations & API

| Req ID | Requirement | Description | Acceptance Criteria | Priority |
|--------|-------------|-------------|---------------------|----------|
| FR-INT-01 | REST API | Provide RESTful API for data access | OpenAPI 3.0 documentation | P1 |
| FR-INT-02 | API authentication | Secure API access | API key authentication | P1 |
| FR-INT-03 | API rate limiting | Prevent API abuse | Documented rate limits, 429 responses | P1 |
| FR-INT-04 | Webhook configuration | Configure outbound webhooks | URL, secret, event selection | P1 |
| FR-INT-05 | Webhook events | Define webhook event types | Alert triggered, sensor offline, etc. | P1 |
| FR-INT-06 | Data export API | Bulk data export via API | Date range queries, pagination | P1 |
| FR-INT-07 | API sandbox | Test environment for developers | Separate sandbox credentials | P2 |
| FR-INT-08 | SDK/Libraries | Client libraries for popular languages | Python, JavaScript (minimum) | P2 |

### 4.3 Non-Functional Requirements

#### 4.3.1 Performance Requirements

| Req ID | Requirement | Target | Measurement |
|--------|-------------|--------|-------------|
| NFR-PERF-01 | Dashboard load time | <3 seconds | 90th percentile, mobile 4G |
| NFR-PERF-02 | Alert delivery latency | <30 seconds | From threshold breach to notification |
| NFR-PERF-03 | API response time | <200ms | 95th percentile |
| NFR-PERF-04 | Real-time data latency | <5 minutes | Sensor to dashboard |
| NFR-PERF-05 | Chart rendering | <1 second | For 30-day data range |
| NFR-PERF-06 | Search/filter response | <500ms | User-initiated queries |

#### 4.3.2 Scalability Requirements

| Req ID | Requirement | Target | Notes |
|--------|-------------|--------|-------|
| NFR-SCAL-01 | Concurrent sensors | 100,000+ | Per deployment |
| NFR-SCAL-02 | Concurrent users | 10,000+ | Simultaneous active sessions |
| NFR-SCAL-03 | Data ingestion rate | 1M+ events/minute | Peak capacity |
| NFR-SCAL-04 | Historical data volume | 10+ TB | Growing storage requirements |
| NFR-SCAL-05 | Horizontal scaling | Auto-scale | Cloud-native architecture |

#### 4.3.3 Security Requirements

| Req ID | Requirement | Description | Priority |
|--------|-------------|-------------|----------|
| NFR-SEC-01 | Data encryption in transit | TLS 1.3 for all connections | P0 |
| NFR-SEC-02 | Data encryption at rest | AES-256 for stored data | P0 |
| NFR-SEC-03 | Authentication security | Secure password hashing (bcrypt/Argon2) | P0 |
| NFR-SEC-04 | API security | Key-based auth, HTTPS only | P0 |
| NFR-SEC-05 | Input validation | Sanitize all user inputs | P0 |
| NFR-SEC-06 | Vulnerability scanning | Regular automated scans | P1 |
| NFR-SEC-07 | Penetration testing | Annual third-party testing | P1 |
| NFR-SEC-08 | SOC 2 compliance | Type II certification | P1 |

#### 4.3.4 Reliability/Availability Requirements

| Req ID | Requirement | Target | Notes |
|--------|-------------|--------|-------|
| NFR-REL-01 | System uptime | 99.9% | Excluding planned maintenance |
| NFR-REL-02 | Alert delivery success | 99.5% | Across all channels |
| NFR-REL-03 | Data durability | 99.999999999% | 11 nines |
| NFR-REL-04 | Recovery time objective (RTO) | <1 hour | For critical systems |
| NFR-REL-05 | Recovery point objective (RPO) | <5 minutes | Maximum data loss |
| NFR-REL-06 | Failover capability | Automatic | Multi-region deployment |

#### 4.3.5 Usability Requirements

| Req ID | Requirement | Description | Priority |
|--------|-------------|-------------|----------|
| NFR-USA-01 | Time to first value | <15 minutes | From signup to first data visible |
| NFR-USA-02 | Mobile responsiveness | Full functionality on mobile | Native-quality experience |
| NFR-USA-03 | Accessibility | WCAG 2.1 AA compliance | Color contrast, touch targets, screen readers |
| NFR-USA-04 | Internationalization | Support multiple languages | English first, Spanish Phase 2 |
| NFR-USA-05 | Offline capability | Basic functionality offline | Cache last 24h, queue actions |
| NFR-USA-06 | Onboarding flow | Guided setup experience | Step-by-step wizard |

#### 4.3.6 Compliance Requirements

| Req ID | Requirement | Description | Priority |
|--------|-------------|-------------|----------|
| NFR-CMP-01 | Data ownership | Users own their data | Clear ToS, export capability |
| NFR-CMP-02 | Data retention | Configurable retention policies | User-controlled, minimum 1 year |
| NFR-CMP-03 | Data deletion | GDPR-compliant deletion | Complete data removal on request |
| NFR-CMP-04 | Audit trails | Complete action logging | Timestamped, immutable logs |
| NFR-CMP-05 | Privacy policy | Clear privacy documentation | Published, accessible |

---

## 5. Feature Specifications

### 5.1 Feature: Real-Time Dashboard (FR-DASH)

**Feature ID:** FR-DASH  
**Priority:** P0  
**Target Release:** MVP (Phase 1)

#### Description
The Real-Time Dashboard is the primary interface for users to monitor current environmental conditions across all their sensors. It provides at-a-glance status information, quick access to detailed views, and clear visual indicators of system health.

#### User Flow Reference
- Flow 2: Real-Time Monitoring (Process Modeling Document, Section 4.2)

#### UI/UX Requirements

**Dashboard Overview Layout:**
```
+------------------------------------------------------------------+
| [Logo] StayFrosty          [Alerts: 2]  [User Menu]              |
+------------------------------------------------------------------+
| Overview                                         Last updated: Now|
+------------------------------------------------------------------+
| +----------------+ +----------------+ +----------------+          |
| | TEMPERATURE    | | HUMIDITY       | | FROST RISK     |          |
| |    34.2°F      | |    78%         | |    LOW (12)    |          |
| | [Sparkline]    | | [Sparkline]    | | [Gauge]        |          |
| | Vineyard North | | Vineyard North | | Next 6 hours   |          |
| +----------------+ +----------------+ +----------------+          |
+------------------------------------------------------------------+
| SENSORS (12 total)                               [+ Add Sensor]  |
+------------------------------------------------------------------+
| [Live] Vineyard North      34.2°F  78%  [OK]     >               |
| [Live] Vineyard South      35.1°F  75%  [OK]     >               |
| [!]    Orchard East        32.8°F  82%  [WARN]   >               |
| [--]   Storage Shed        --      --   [OFFLINE] >               |
+------------------------------------------------------------------+
```

**Status Indicators:**
| Status | Color | Icon | Condition |
|--------|-------|------|-----------|
| Live/OK | Green | Filled circle | Data <5 min old, within thresholds |
| Warning | Yellow | Exclamation triangle | Data <5 min old, approaching threshold |
| Alert | Red | Exclamation circle | Threshold breached |
| Delayed | Yellow | Clock icon | Data 5-15 min old |
| Offline | Gray | Dash | Data >15 min old |

#### Data Requirements
- Real-time sensor readings (temperature, humidity, soil moisture)
- Sensor metadata (name, location, group)
- Alert threshold configurations
- Historical data for sparklines (last 24 hours)
- Frost risk predictions (next 6 hours)

#### Business Rules
1. Dashboard refreshes automatically every 60 seconds
2. Manual refresh available via pull-to-refresh (mobile) or refresh button (web)
3. Sensors sorted by status priority (Alert > Warning > OK > Offline)
4. Frost risk calculation runs every 15 minutes
5. Sparklines show last 24 hours of data, auto-aggregated to 15-minute intervals

#### Edge Cases and Error Handling
| Scenario | Behavior |
|----------|----------|
| No sensors provisioned | Show empty state with "Add your first sensor" CTA |
| All sensors offline | Show warning banner, prioritize gateway health check |
| API timeout | Show cached data with "Last updated X minutes ago" |
| Network offline (mobile) | Show cached data, disable real-time refresh |

#### Dependencies
- Sensor data ingestion pipeline (FR-DEV)
- Alert system (FR-ALT)
- Prediction engine (FR-PRE)

---

### 5.2 Feature: Alert Management System (FR-ALT)

**Feature ID:** FR-ALT  
**Priority:** P0  
**Target Release:** MVP (Phase 1)

#### Description
The Alert Management System enables users to configure, receive, and manage notifications when sensor readings cross defined thresholds. It supports multiple delivery channels and provides tools for reducing alert fatigue.

#### User Flow Reference
- Flow 3: Alert Management (Process Modeling Document, Section 4.3)
- Flow 4: Frost Event Response (Process Modeling Document, Section 4.4)

#### UI/UX Requirements

**Alert Rule Configuration:**
```
+------------------------------------------------------------------+
| Create Alert Rule                                        [X Close]|
+------------------------------------------------------------------+
| Rule Name: [Overnight Frost Alert                              ] |
+------------------------------------------------------------------+
| APPLY TO:                                                        |
| ( ) All Sensors  (o) Selected Sensors  ( ) Sensor Group          |
| [x] Vineyard North  [x] Vineyard South  [ ] Orchard East         |
+------------------------------------------------------------------+
| CONDITION:                                                       |
| When [Temperature ▼] is [Below ▼] [ 35 ] °F                     |
+------------------------------------------------------------------+
| NOTIFY VIA:                                                      |
| [x] SMS: +1 (555) 123-4567                                       |
| [x] Email: alex@vineyard.com                                     |
| [ ] Webhook: Configure URL...                                    |
| [x] Push Notification                                            |
+------------------------------------------------------------------+
| SCHEDULE:                                                        |
| [x] Always active  ( ) Custom schedule                           |
+------------------------------------------------------------------+
|                              [Cancel]  [Test Alert]  [Save Rule] |
+------------------------------------------------------------------+
```

**Alert Banner (When Active):**
```
+------------------------------------------------------------------+
| [!] FROST WARNING                                      [Dismiss] |
| Vineyard North: 33.2°F (below 35°F threshold)                    |
| Triggered at 3:42 AM                                             |
|                                    [View Details]  [Acknowledge] |
+------------------------------------------------------------------+
```

#### Data Requirements
- Alert rule definitions (sensors, conditions, channels, schedule)
- Alert event history (timestamp, readings, acknowledgment status)
- User notification preferences
- Delivery status tracking per channel

#### Business Rules

**Alert Triggering:**
1. Alert triggers when reading crosses threshold (not on every reading below threshold)
2. Hysteresis: Alert clears only when reading moves 2°F beyond threshold (prevents flapping)
3. Rate limiting: Maximum 1 alert per sensor per 15 minutes for same rule
4. Duration-based alerts: Trigger after X consecutive readings below threshold

**Delivery Priority:**
1. SMS: Highest priority, always delivered regardless of quiet hours for critical alerts
2. Push notification: Delivered within 30 seconds
3. Email: Delivered within 1 minute
4. Webhook: Delivered within 30 seconds, 3 retry attempts on failure

**Alert Lifecycle:**
```
[Triggered] → [Sent] → [Delivered] → [Acknowledged] → [Resolved]
                ↓                          ↓
           [Failed] → [Retry]         [Escalated]
```

#### Edge Cases and Error Handling
| Scenario | Behavior |
|----------|----------|
| SMS delivery failure | Retry 2x, then fallback to email, log failure |
| User has no notification channels | Prevent rule save, show error |
| Sensor goes offline during alert | Keep alert active, add "Sensor offline" note |
| Threshold changed during active alert | Re-evaluate against new threshold |
| Duplicate alerts within window | Suppress duplicate, increment counter |

#### Dependencies
- SMS gateway integration (Twilio)
- Email service integration (SendGrid)
- Push notification service (Firebase Cloud Messaging)
- Webhook delivery service

---

### 5.3 Feature: Predictive Frost Forecasting (FR-PRE)

**Feature ID:** FR-PRE  
**Priority:** P1  
**Target Release:** Phase 2

#### Description
The Predictive Frost Forecasting feature uses machine learning to predict frost events 6-24 hours in advance, enabling users to take proactive protective measures before frost occurs.

#### User Flow Reference
- Flow 5: Predictive Forecasting (Process Modeling Document, Section 4.5)

#### UI/UX Requirements

**Forecast Dashboard Widget:**
```
+------------------------------------------------------------------+
| FROST RISK - Next 24 Hours                          [View Details]|
+------------------------------------------------------------------+
|                                                                  |
|              +----+                                               |
|              |    |   Frost Risk Score                           |
|              | 72 |   HIGH RISK                                  |
|              |    |                                               |
|              +----+                                               |
|                                                                  |
| Predicted low tonight: 31°F at 4:00 AM                          |
| Confidence: 78%                                                  |
+------------------------------------------------------------------+
| Hour-by-Hour Forecast:                                           |
| 6PM  8PM  10PM 12AM  2AM  4AM  6AM  8AM  10AM 12PM              |
| [==][==][===][====][====][====][===][==][=][=]                   |
|  Low ←←←←←←←←←←←←←← HIGH →→→→→→→→→→→→→→ Low                     |
+------------------------------------------------------------------+
| Contributing Factors:                                            |
| • Clear skies forecast (high radiative cooling)                  |
| • Low wind speed (<5 mph)                                        |
| • High humidity (favorable for frost formation)                  |
| • Temperature trend: dropping 3°F/hour                           |
+------------------------------------------------------------------+
```

#### Data Requirements
- Real-time sensor readings (temperature, humidity)
- External weather API data (forecast, cloud cover, wind)
- Historical frost event data (for model training)
- Seasonal patterns and microclimate data

#### Business Rules

**Risk Score Calculation:**
| Risk Level | Score Range | UI Treatment | Alert Behavior |
|------------|-------------|--------------|----------------|
| Low | 0-30 | Green | No proactive alert |
| Medium | 31-60 | Yellow | Optional proactive alert |
| High | 61-85 | Orange | Proactive alert 6 hours before |
| Critical | 86-100 | Red | Immediate proactive alert |

**Prediction Model:**
1. Ensemble model combining:
   - Temperature trend analysis (sensor data)
   - Weather API forecast integration
   - Historical frost occurrence patterns
   - Seasonal adjustment factors
2. Model retrains weekly with new data
3. Confidence intervals provided for all predictions

**Accuracy Tracking:**
1. Log all predictions with actual outcomes
2. Calculate and display rolling accuracy statistics
3. Target: >85% precision, >90% recall for frost events

#### Edge Cases and Error Handling
| Scenario | Behavior |
|----------|----------|
| Weather API unavailable | Fall back to sensor-only prediction, lower confidence |
| Insufficient historical data | Use generic regional model, flag as "Limited accuracy" |
| Prediction confidence <50% | Show prediction with prominent "Low confidence" warning |
| Model disagrees with weather API | Weight sensor data higher for 6-hour window |

#### Dependencies
- Weather API integration (Tomorrow.io)
- ML model training infrastructure
- Historical data warehouse
- Prediction service (isolated microservice)

---

### 5.4 Feature: Device Management (FR-DEV)

**Feature ID:** FR-DEV  
**Priority:** P0  
**Target Release:** MVP (Phase 1)

#### Description
Device Management enables users to provision, configure, monitor, and maintain their sensor and gateway devices. It includes tools for individual device management and batch operations for large deployments.

#### User Flow Reference
- Flow 6: Device Management (Process Modeling Document, Section 4.6)

#### UI/UX Requirements

**Device List View:**
```
+------------------------------------------------------------------+
| Devices (12 sensors, 1 gateway)            [+ Add Device]        |
+------------------------------------------------------------------+
| Filter: [All ▼]  Status: [All ▼]  Sort: [Name ▼]  [Batch Actions]|
+------------------------------------------------------------------+
| GATEWAYS                                                         |
+------------------------------------------------------------------+
| [G] Gateway-Main     Online   12 sensors   FW 2.1.0   Battery: AC|
+------------------------------------------------------------------+
| SENSORS                                                          |
+------------------------------------------------------------------+
| [ ] [●] Vineyard North    OK      -71 dBm   100%    FW 1.4.2     |
| [ ] [●] Vineyard South    OK      -68 dBm    95%    FW 1.4.2     |
| [ ] [!] Orchard East      Warn    -82 dBm    45%    FW 1.4.1     |
| [ ] [○] Storage Shed      Offline -89 dBm    12%    FW 1.3.8     |
+------------------------------------------------------------------+
```

**Device Detail View:**
```
+------------------------------------------------------------------+
| Vineyard North Sensor                            [Edit] [Delete] |
+------------------------------------------------------------------+
| INFORMATION                                                      |
| Device ID: SF-2024-00001234                                      |
| Firmware: v1.4.2 (Latest)                                        |
| Added: January 15, 2026                                          |
| Last Seen: 2 minutes ago                                         |
+------------------------------------------------------------------+
| HEALTH METRICS                                                   |
| Signal Strength: -71 dBm [========  ] Good                       |
| Battery Level: 100% [==========] Full (Est. 18 months remaining) |
| Packet Loss: 0.2% [=         ] Excellent                         |
| Uptime: 99.9% (30 days)                                          |
+------------------------------------------------------------------+
| ACTIONS                                                          |
| [Calibrate Sensor]  [Update Firmware]  [View Diagnostics]        |
+------------------------------------------------------------------+
```

#### Data Requirements
- Device registry (ID, name, type, firmware version, provisioning date)
- Real-time health telemetry (signal, battery, packet loss)
- Firmware inventory and update packages
- Calibration history and offset values

#### Business Rules

**Provisioning:**
1. QR code scan auto-populates device ID
2. Device must connect within 5 minutes of provisioning attempt
3. New devices default to organization-level alert thresholds
4. Batch provisioning via CSV supports up to 500 devices per upload

**Health Monitoring:**
| Indicator | Healthy | Warning | Critical |
|-----------|---------|---------|----------|
| Battery | >50% | 20-50% | <20% |
| Signal | >-70 dBm | -70 to -85 dBm | <-85 dBm |
| Packet Loss | <1% | 1-5% | >5% |
| Last Seen | <5 min | 5-15 min | >15 min |

**Firmware Updates:**
1. OTA updates supported for all devices
2. Updates staged: 10% rollout, monitor for 24h, then full rollout
3. Automatic rollback if device fails health check post-update
4. Force update option for security patches

#### Edge Cases and Error Handling
| Scenario | Behavior |
|----------|----------|
| QR code scan fails | Offer manual entry fallback |
| Device not found during provisioning | Suggest power cycle, check gateway proximity |
| Firmware update fails | Auto-rollback, flag for manual intervention |
| Battery critically low | Push notification, add to maintenance queue |
| CSV batch has errors | Process valid entries, report errors with line numbers |

#### Dependencies
- LoRaWAN network server
- Firmware storage and delivery service
- Device registry database

---

### 5.5 Feature: Multi-Tenant RBAC (FR-USR)

**Feature ID:** FR-USR  
**Priority:** P1  
**Target Release:** Phase 2

#### Description
Multi-Tenant RBAC enables consultants and team-based users to manage multiple organizations and control access permissions for team members with granular role-based controls.

#### User Flow Reference
- Persona journey: Jordan (Agricultural Consultant)
- Section 5.2: Role-Based Access Matrix (Process Modeling Document)

#### UI/UX Requirements

**Organization Switcher:**
```
+------------------------------------------------------------------+
| [Current: Jordan's Consulting]                           [Switch]|
+------------------------------------------------------------------+
| ● Jordan's Consulting (Owner)                                    |
| ○ Smith Vineyard (Manager)                                       |
| ○ Johnson Orchards (Viewer)                                      |
| ○ Valley Farms (Manager)                                         |
|                                                                  |
|                                               [+ Add Organization]|
+------------------------------------------------------------------+
```

**Team Management:**
```
+------------------------------------------------------------------+
| Team Members                                          [+ Invite] |
+------------------------------------------------------------------+
| NAME              EMAIL                  ROLE      STATUS         |
+------------------------------------------------------------------+
| Jordan (You)      jordan@consulting.com  Owner     Active         |
| Sarah Miller      sarah@consulting.com   Manager   Active    [Edit]|
| Tom Wilson        tom@consulting.com     Viewer    Pending   [Edit]|
+------------------------------------------------------------------+
```

**Role Definitions:**
| Role | Dashboard | Sensors | Alerts | Devices | Team | Billing |
|------|-----------|---------|--------|---------|------|---------|
| Owner | Full | Full | Full | Full | Full | Full |
| Admin | Full | Full | Full | Full | Edit | View |
| Manager | Full | Edit | Edit | View | View | None |
| Viewer | View | View | View | None | None | None |

#### Data Requirements
- User accounts and profiles
- Organization membership records
- Role assignments
- Invitation tokens and status
- Audit log of permission changes

#### Business Rules

**Organization Structure:**
1. Users can belong to multiple organizations
2. Each organization has exactly one Owner
3. Ownership can be transferred to Admin users
4. Users see combined view or can filter by organization

**Invitation Flow:**
1. Inviter selects email and role
2. System sends email with unique invitation link
3. Link expires after 7 days
4. Invitee creates account (or links existing) and joins org

**Consultant Multi-Org View:**
1. Default dashboard shows aggregated data across all orgs
2. Alerts indicate which organization they belong to
3. Reports can be filtered or generated per organization
4. Unified notification settings with per-org overrides

#### Edge Cases and Error Handling
| Scenario | Behavior |
|----------|----------|
| Owner tries to leave organization | Must transfer ownership first |
| Invitation email bounces | Mark invitation as failed, notify inviter |
| User already has account with invited email | Prompt to link existing account |
| Last Admin removed | Prevent removal, show error |
| Concurrent permission edits | Optimistic locking, last write wins with notification |

#### Dependencies
- Email service for invitations
- Session management service
- Audit logging service

---

### 5.6 Feature: API & Integrations (FR-INT)

**Feature ID:** FR-INT  
**Priority:** P1  
**Target Release:** Phase 2

#### Description
The API & Integrations feature provides a comprehensive REST API for third-party integrations, webhook support for real-time event notifications, and developer tools for building custom integrations.

#### User Flow Reference
- Persona journey: Morgan (IoT Integrator), Sam (Facility Operator)
- Use Case: UC-03 (Automated Facility Protection)

#### UI/UX Requirements

**API Keys Management:**
```
+------------------------------------------------------------------+
| API Keys                                          [+ Create Key] |
+------------------------------------------------------------------+
| NAME           CREATED       LAST USED     PERMISSIONS    ACTIONS|
+------------------------------------------------------------------+
| Production     2026-01-10    2 hours ago   Full Access    [Revoke]|
| SCADA-Webhook  2026-01-15    5 minutes ago Alerts Only    [Revoke]|
| Test Key       2026-01-20    Never         Read Only      [Revoke]|
+------------------------------------------------------------------+
```

**Webhook Configuration:**
```
+------------------------------------------------------------------+
| Configure Webhook                                                |
+------------------------------------------------------------------+
| Endpoint URL: [https://scada.facility.com/stayfrosty/webhook   ] |
| Secret Key:   [sk_webhook_abc123...                            ] |
+------------------------------------------------------------------+
| EVENTS TO SEND:                                                  |
| [x] alert.triggered                                              |
| [x] alert.resolved                                               |
| [x] sensor.offline                                               |
| [x] sensor.online                                                |
| [ ] reading.threshold_warning                                    |
+------------------------------------------------------------------+
| [Test Webhook]                              [Cancel]  [Save]     |
+------------------------------------------------------------------+
```

#### API Specification

**Base URL:** `https://api.stayfrosty.io/v1`

**Authentication:** Bearer token (API key)

**Core Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /sensors | List all sensors |
| GET | /sensors/{id} | Get sensor details |
| GET | /sensors/{id}/readings | Get sensor readings |
| POST | /sensors | Provision new sensor |
| PUT | /sensors/{id} | Update sensor settings |
| DELETE | /sensors/{id} | Remove sensor |
| GET | /alerts | List alerts |
| POST | /alerts/rules | Create alert rule |
| GET | /forecast | Get frost predictions |
| GET | /organizations | List organizations |

**Webhook Payload Example:**
```json
{
  "event": "alert.triggered",
  "timestamp": "2026-01-25T03:42:15Z",
  "data": {
    "alert_id": "alt_abc123",
    "rule_id": "rul_def456",
    "sensor_id": "sen_ghi789",
    "sensor_name": "Vineyard North",
    "metric": "temperature",
    "value": 33.2,
    "threshold": 35.0,
    "condition": "below"
  }
}
```

#### Data Requirements
- API key registry with permissions
- Request logging for rate limiting
- Webhook delivery queue and retry state
- API usage analytics

#### Business Rules

**Rate Limiting:**
| Tier | Requests/minute | Requests/day |
|------|-----------------|--------------|
| Free | 60 | 1,000 |
| Professional | 300 | 50,000 |
| Enterprise | 1,000 | Unlimited |

**Webhook Delivery:**
1. First attempt: Immediate
2. Retry 1: 1 minute delay
3. Retry 2: 5 minute delay
4. Retry 3: 30 minute delay
5. After 3 failures: Webhook disabled, user notified

**API Versioning:**
1. Version included in URL path (/v1/)
2. Breaking changes require new version
3. Old versions supported for minimum 12 months after deprecation notice

#### Edge Cases and Error Handling
| Scenario | Behavior |
|----------|----------|
| Invalid API key | 401 Unauthorized response |
| Rate limit exceeded | 429 Too Many Requests with retry-after header |
| Webhook endpoint returns 5xx | Retry with exponential backoff |
| Webhook endpoint consistently fails | Disable webhook, email notification to user |
| API request timeout | Return 504, log for investigation |

#### Dependencies
- API gateway service
- Webhook delivery queue (message queue)
- API documentation generator (OpenAPI)

---

## 6. Technical Architecture Overview

### 6.1 System Architecture Diagram

```
                                    +---------------------------+
                                    |     External Services     |
                                    |  +---------------------+  |
                                    |  | Weather API         |  |
                                    |  | (Tomorrow.io)       |  |
                                    |  +---------------------+  |
                                    |  | SMS Gateway         |  |
                                    |  | (Twilio)            |  |
                                    |  +---------------------+  |
                                    |  | Email Service       |  |
                                    |  | (SendGrid)          |  |
                                    |  +---------------------+  |
                                    +-------------+-------------+
                                                  |
+---------------+    +---------------+    +-------v-------+    +---------------+
|   IoT Layer   |    |   Edge Layer  |    |  Cloud Layer  |    | Client Layer  |
+---------------+    +---------------+    +---------------+    +---------------+
|               |    |               |    |               |    |               |
| +-----------+ |    | +-----------+ |    | +-----------+ |    | +-----------+ |
| | LoRaWAN   | |    | | Gateway   | |    | | API       | |    | | Web App   | |
| | Sensors   |-+--->| | (LTE)     |-+--->| | Gateway   |-+--->| | (React)   | |
| +-----------+ |    | +-----------+ |    | +-----------+ |    | +-----------+ |
|               |    |               |    |      |        |    |               |
| +-----------+ |    |               |    | +----v------+ |    | +-----------+ |
| | Temp/     | |    |               |    | | Services  | |    | | Mobile    | |
| | Humidity  | |    |               |    | | Cluster   | |    | | App (RN)  | |
| +-----------+ |    |               |    | +-----------+ |    | +-----------+ |
|               |    |               |    |      |        |    |               |
| +-----------+ |    |               |    | +----v------+ |    | +-----------+ |
| | Soil      | |    |               |    | | Database  | |    | | Third     | |
| | Moisture  | |    |               |    | | Cluster   | |    | | Party     | |
| +-----------+ |    |               |    | +-----------+ |    | | (API)     | |
|               |    |               |    |               |    | +-----------+ |
+---------------+    +---------------+    +---------------+    +---------------+
```

### 6.2 Technology Stack Recommendations

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend Web** | React 18, TypeScript | Component reusability, type safety, ecosystem |
| **Frontend Mobile** | React Native | Code sharing with web, cross-platform |
| **API Gateway** | Kong or AWS API Gateway | Rate limiting, authentication, routing |
| **Backend Services** | Node.js (TypeScript) or Go | Event-driven, high concurrency |
| **Real-time** | WebSocket (Socket.io) | Live dashboard updates |
| **Message Queue** | Apache Kafka or AWS SQS | Event streaming, decoupling |
| **Primary Database** | PostgreSQL | Relational data, time-series extensions |
| **Time Series DB** | TimescaleDB or InfluxDB | Optimized for sensor data |
| **Cache** | Redis | Session management, real-time state |
| **Object Storage** | AWS S3 | Firmware, exports, backups |
| **ML Platform** | Python, TensorFlow/PyTorch | Frost prediction models |
| **Container Orchestration** | Kubernetes (EKS) | Scalability, deployment automation |
| **CI/CD** | GitHub Actions | Automated testing, deployment |
| **Monitoring** | Datadog or Prometheus/Grafana | System observability |

### 6.3 Data Model Overview

#### Core Entities

```
+-------------------+     +-------------------+     +-------------------+
|   Organization    |     |       User        |     |   Membership      |
+-------------------+     +-------------------+     +-------------------+
| id (PK)           |     | id (PK)           |     | id (PK)           |
| name              |<--->| email             |<--->| user_id (FK)      |
| created_at        |     | password_hash     |     | org_id (FK)       |
| plan_type         |     | created_at        |     | role              |
+-------------------+     +-------------------+     | created_at        |
         |                                          +-------------------+
         |
         v
+-------------------+     +-------------------+     +-------------------+
|      Sensor       |     |     Gateway       |     |   SensorGroup     |
+-------------------+     +-------------------+     +-------------------+
| id (PK)           |     | id (PK)           |     | id (PK)           |
| org_id (FK)       |     | org_id (FK)       |     | org_id (FK)       |
| gateway_id (FK)   |     | name              |     | name              |
| name              |     | firmware_version  |     +-------------------+
| device_id         |     | last_seen         |
| firmware_version  |     | status            |
| calibration_offset|     +-------------------+
| created_at        |
+-------------------+
         |
         v
+-------------------+     +-------------------+     +-------------------+
|  SensorReading    |     |    AlertRule      |     |    AlertEvent     |
+-------------------+     +-------------------+     +-------------------+
| id (PK)           |     | id (PK)           |     | id (PK)           |
| sensor_id (FK)    |     | org_id (FK)       |     | rule_id (FK)      |
| temperature       |     | name              |     | sensor_id (FK)    |
| humidity          |     | condition_type    |     | triggered_at      |
| soil_moisture     |     | threshold_value   |     | acknowledged_at   |
| battery_level     |     | sensors (array)   |     | resolved_at       |
| signal_strength   |     | channels (array)  |     | status            |
| recorded_at       |     | schedule          |     | value             |
+-------------------+     | enabled           |     +-------------------+
                          +-------------------+
```

### 6.4 Integration Points

| Integration | Protocol | Purpose | Data Flow |
|-------------|----------|---------|-----------|
| LoRaWAN Network Server | MQTT | Sensor data ingestion | Inbound |
| Weather API (Tomorrow.io) | REST/HTTPS | Forecast data | Inbound |
| SMS Gateway (Twilio) | REST/HTTPS | Alert delivery | Outbound |
| Email Service (SendGrid) | REST/HTTPS | Alert & notification delivery | Outbound |
| Push Notifications (FCM) | REST/HTTPS | Mobile push alerts | Outbound |
| Customer Webhooks | REST/HTTPS | Event notifications | Outbound |
| Public API | REST/HTTPS | Third-party integration | Bidirectional |

### 6.5 Security Architecture

```
+------------------------------------------------------------------+
|                       Security Layers                             |
+------------------------------------------------------------------+
|                                                                  |
|  +--------------------+  +--------------------+                   |
|  | Network Security   |  | Application Sec.   |                   |
|  | - WAF (CloudFlare) |  | - Input validation |                   |
|  | - DDoS protection  |  | - OWASP Top 10     |                   |
|  | - TLS 1.3          |  | - CSRF protection  |                   |
|  | - VPC isolation    |  | - XSS prevention   |                   |
|  +--------------------+  +--------------------+                   |
|                                                                  |
|  +--------------------+  +--------------------+                   |
|  | Identity & Access  |  | Data Security      |                   |
|  | - JWT tokens       |  | - AES-256 at rest  |                   |
|  | - API key auth     |  | - TLS in transit   |                   |
|  | - RBAC enforcement |  | - Key management   |                   |
|  | - 2FA support      |  | - Data masking     |                   |
|  +--------------------+  +--------------------+                   |
|                                                                  |
|  +--------------------+  +--------------------+                   |
|  | Monitoring & Audit |  | Compliance         |                   |
|  | - Access logging   |  | - SOC 2 Type II    |                   |
|  | - Anomaly detection|  | - GDPR readiness   |                   |
|  | - Incident response|  | - Data retention   |                   |
|  +--------------------+  +--------------------+                   |
|                                                                  |
+------------------------------------------------------------------+
```

---

## 7. Release Planning

### 7.1 MVP Scope (Phase 1)

**Timeline:** Months 1-4  
**Theme:** Core Monitoring & Alerting

#### MVP Feature Set

| Feature Area | Included Features | Explicitly Excluded |
|--------------|-------------------|---------------------|
| **Monitoring** | Real-time dashboard, sensor list, basic charts | Map view, seasonal comparison |
| **Alerts** | SMS/email alerts, custom thresholds, acknowledgment | Webhooks, escalation, quiet hours |
| **Devices** | QR provisioning, health monitoring, naming | Batch provisioning, OTA updates |
| **Users** | Registration, login, single org | Multi-tenant, RBAC, team invites |
| **Forecasting** | Basic frost risk indicator | ML predictions, accuracy tracking |
| **Reporting** | 30-day history view | PDF reports, data export |
| **Integrations** | None | API, webhooks |

#### MVP User Stories (P0 Only)

- US-GRW-01: See current temperature readings
- US-GRW-02: Receive SMS alerts below threshold
- US-GRW-03: Set custom temperature thresholds
- US-GRW-06: Add new sensor in under 5 minutes
- FR-DEV-01: Device provisioning
- FR-DEV-02: Device naming
- FR-DEV-04: Health monitoring
- FR-DEV-08: Gateway management

#### MVP Timeline

| Month | Milestone | Deliverables |
|-------|-----------|--------------|
| 1 | Foundation | Infrastructure, auth, basic dashboard skeleton |
| 2 | Core Data | Sensor data pipeline, real-time display, device management |
| 3 | Alerts | Alert rule creation, SMS/email delivery, history |
| 4 | Polish & Launch | Mobile optimization, onboarding flow, beta launch |

#### MVP Success Criteria

- 500+ beta users onboarded
- 2,000+ sensors deployed
- <15 minute average time to first data
- >95% alert delivery success rate
- <5% week-1 churn
- NPS >30 from beta users

### 7.2 Phase 2 Features

**Timeline:** Months 5-8  
**Theme:** Intelligence & Scale

#### Phase 2 Feature Set

| Feature Area | Features | Priority |
|--------------|----------|----------|
| **Forecasting** | ML-based frost prediction, 6-24 hour forecast, accuracy tracking | P1 |
| **Multi-tenant** | Organization management, team invitations, RBAC | P1 |
| **API** | REST API, API keys, documentation | P1 |
| **Webhooks** | Outbound webhooks, event configuration | P1 |
| **Devices** | Batch provisioning, OTA updates, calibration | P1 |
| **Alerts** | Push notifications, webhook delivery, quiet hours | P1 |
| **Reporting** | PDF report generation, data export | P1 |

#### Phase 2 Timeline

| Month | Milestone | Deliverables |
|-------|-----------|--------------|
| 5 | Prediction Engine | ML model deployment, forecast UI, accuracy baseline |
| 6 | Multi-tenant & API | RBAC, org management, API v1 launch |
| 7 | Advanced Devices | Batch tools, OTA infrastructure, calibration workflow |
| 8 | Integration & Polish | Webhooks, reports, performance optimization |

#### Phase 2 Success Criteria

- 2,500+ active users
- 10,000+ sensors deployed
- >85% frost prediction accuracy
- 50+ API integrations active
- 100+ consultant accounts with multi-tenant
- $50K MRR

### 7.3 Future Roadmap

**Timeline:** Months 9-12+  
**Theme:** Enterprise & Automation

#### Phase 3 Features (Months 9-12)

| Feature | Description | Business Value |
|---------|-------------|----------------|
| **Wind Machine Integration** | API control of frost protection equipment | Automated response to predictions |
| **MQTT Support** | Real-time streaming API | Low-latency integrations |
| **White-label** | Branded deployments for partners | Channel expansion |
| **Advanced Analytics** | Seasonal reports, ROI calculator | Value demonstration |
| **Mobile Offline** | Full offline functionality | Remote area support |
| **Internationalization** | Spanish, Portuguese languages | Market expansion |

#### Long-term Vision (Year 2+)

| Feature | Description | Timeline |
|---------|-------------|----------|
| **Insurance Integration** | Automated claim documentation | Year 2 |
| **Irrigation Optimization** | Water management features | Year 2 |
| **Pest & Disease Prediction** | Expanded prediction models | Year 2 |
| **Satellite Imagery** | Remote sensing integration | Year 2-3 |
| **Marketplace** | Third-party sensor support | Year 2-3 |
| **AI Assistant** | Natural language queries | Year 3 |

---

## 8. Risks and Mitigations

### 8.1 Technical Risks

| Risk ID | Risk | Probability | Impact | Mitigation Strategy |
|---------|------|-------------|--------|---------------------|
| TR-01 | LoRaWAN connectivity issues in rural areas | High | High | Support multiple protocols (cellular backup), provide signal testing tools |
| TR-02 | ML prediction accuracy below target | Medium | High | Hybrid approach (sensor + weather API), continuous model improvement |
| TR-03 | Alert delivery latency exceeds SLA | Medium | Critical | Multiple delivery channels, priority queuing, redundant providers |
| TR-04 | Database scaling bottlenecks | Medium | Medium | Time-series database optimization, data archival strategy |
| TR-05 | Security breach | Low | Critical | SOC 2 compliance, penetration testing, bug bounty program |
| TR-06 | Third-party API dependency failures | Medium | Medium | Caching, fallback providers, graceful degradation |

### 8.2 Market Risks

| Risk ID | Risk | Probability | Impact | Mitigation Strategy |
|---------|------|-------------|--------|---------------------|
| MR-01 | Incumbent price cuts (Semios, Davis) | Medium | High | Focus on UX differentiation, build brand loyalty before competition responds |
| MR-02 | Slow farmer technology adoption | Medium | High | Extended free trials, ROI calculator, case studies, consultant partnerships |
| MR-03 | Economic downturn reduces farm tech spend | Medium | Medium | Emphasize ROI and loss prevention, flexible pricing, monthly plans |
| MR-04 | Climate change reduces frost frequency | Low | Medium | Position as comprehensive environmental monitoring, expand to other risks |
| MR-05 | Regulatory changes (data privacy) | Low | Medium | Proactive compliance, data portability, transparent policies |

### 8.3 Operational Risks

| Risk ID | Risk | Probability | Impact | Mitigation Strategy |
|---------|------|-------------|--------|---------------------|
| OR-01 | Hardware supply chain disruptions | Medium | Medium | Multiple sensor suppliers, 3-month inventory buffer |
| OR-02 | Customer support scaling | Medium | Medium | Self-service tools, knowledge base, community forums |
| OR-03 | Seasonal demand spikes | High | Medium | Cloud auto-scaling, capacity planning for frost season |
| OR-04 | Key personnel departure | Medium | Medium | Documentation, cross-training, competitive compensation |
| OR-05 | Partner/integration failures | Low | Medium | SLAs with partners, fallback options, monitoring |

### 8.4 Financial Risks

| Risk ID | Risk | Probability | Impact | Mitigation Strategy |
|---------|------|-------------|--------|---------------------|
| FR-01 | Hardware margin erosion | Medium | Medium | Value-added services focus, premium tiers |
| FR-02 | High customer acquisition cost | Medium | High | Referral programs, consultant partnerships, content marketing |
| FR-03 | Revenue seasonality | High | Medium | Annual plans, diversify to year-round crops, facility operators |
| FR-04 | Subscription churn | Medium | High | Engagement features, success team, annual discount incentives |

### 8.5 Risk Management Process

1. **Weekly Risk Review:** Product team reviews active risks
2. **Monthly Risk Assessment:** Update probability/impact based on new information
3. **Quarterly Risk Audit:** Executive review of risk register
4. **Incident Response:** Documented playbooks for high-impact scenarios

---

## 9. Appendices

### Appendix A: Glossary of Terms

| Term | Definition |
|------|------------|
| **Advection Frost** | Frost caused by cold air mass movement (wind-driven) |
| **Alert Fatigue** | Reduced response to alerts due to excessive notifications |
| **Calibration** | Process of adjusting sensor readings against a known reference |
| **Dew Point** | Temperature at which water vapor condenses into dew |
| **Gateway** | Hub device connecting multiple sensors to cloud via cellular |
| **LoRaWAN** | Long Range Wide Area Network - low-power IoT protocol |
| **Microclimate** | Localized climate conditions different from surrounding area |
| **MQTT** | Message Queuing Telemetry Transport - lightweight IoT protocol |
| **OTA** | Over-the-Air updates (firmware updates delivered wirelessly) |
| **Radiation Frost** | Frost occurring on clear, calm nights due to radiative cooling |
| **RBAC** | Role-Based Access Control - permission system based on user roles |
| **SCADA** | Supervisory Control and Data Acquisition - industrial control systems |
| **SLA** | Service Level Agreement - guaranteed performance standards |
| **Webhook** | HTTP callback for real-time event notifications |
| **Wind Machine** | Large fan used to circulate air and prevent frost formation |

### Appendix B: Reference to User Flows

| Flow | Location | Key Personas |
|------|----------|--------------|
| Flow 1: New User Onboarding | Process Modeling Doc, Section 4.1 | All |
| Flow 2: Real-Time Monitoring | Process Modeling Doc, Section 4.2 | Alex, Jordan |
| Flow 3: Alert Management | Process Modeling Doc, Section 4.3 | All |
| Flow 4: Frost Event Response | Process Modeling Doc, Section 4.4 | Alex, Sam |
| Flow 5: Predictive Forecasting | Process Modeling Doc, Section 4.5 | Alex, Jordan |
| Flow 6: Device Management | Process Modeling Doc, Section 4.6 | Morgan, Sam |

### Appendix C: Reference to Research

| Topic | Location | Key Findings |
|-------|----------|--------------|
| Market Analysis | Background Research, Section 1 | $1.8B market, 5-6% CAGR |
| Competitor Landscape | Background Research, Section 2 | Gap in price-performance |
| Technology Assessment | Background Research, Section 3 | LoRaWAN recommended |
| User Pain Points | Background Research, Section 4 | Alert reliability, setup complexity |
| Pricing Benchmarks | Background Research, Appendix B | $300-500 hardware target |

### Appendix D: Requirement Traceability Matrix

| Requirement | User Story | Feature | Test Case |
|-------------|------------|---------|-----------|
| FR-MON-01 | US-GRW-01 | FR-DASH | TC-DASH-001 |
| FR-ALT-01 | US-GRW-02 | FR-ALT | TC-ALT-001 |
| FR-ALT-06 | US-GRW-03 | FR-ALT | TC-ALT-006 |
| FR-PRE-01 | US-GRW-04 | FR-PRE | TC-PRE-001 |
| FR-HIS-01 | US-GRW-05 | FR-DASH | TC-HIS-001 |
| FR-DEV-01 | US-GRW-06 | FR-DEV | TC-DEV-001 |
| FR-USR-08 | US-CON-01 | FR-USR | TC-USR-008 |
| FR-INT-04 | US-FAC-01 | FR-INT | TC-INT-004 |
| FR-DEV-01 | US-INT-01 | FR-DEV | TC-DEV-010 |

### Appendix E: Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-20 | Matrix Agent | Initial draft structure |
| 0.5 | 2026-01-22 | Matrix Agent | Added user stories, requirements |
| 0.8 | 2026-01-24 | Matrix Agent | Added feature specifications, architecture |
| 1.0 | 2026-01-25 | Matrix Agent | Final review, formatting, PDF preparation |

---

## Document Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | | | |
| Engineering Lead | | | |
| Design Lead | | | |
| QA Lead | | | |

---

*End of Document*

**StayFrosty PRD v1.0 - Confidential**

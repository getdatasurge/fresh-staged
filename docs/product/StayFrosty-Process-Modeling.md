# StayFrosty - Process Modeling Document

**Version:** 1.0  
**Date:** January 24, 2026  
**Author:** Matrix Agent  
**Status:** Draft for Review

---

## Table of Contents

1. [Executive Overview](#1-executive-overview)
2. [User Personas Summary](#2-user-personas-summary)
3. [User Journey Maps](#3-user-journey-maps)
4. [Core User Flows](#4-core-user-flows)
5. [Information Architecture](#5-information-architecture)
6. [Key Experience Analysis](#6-key-experience-analysis)
7. [Main Path vs Branch Paths](#7-main-path-vs-branch-paths)
8. [UI/UX Recommendations](#8-uiux-recommendations)

---

## 1. Executive Overview

### 1.1 Purpose

This document defines the user interaction flows, process models, and experience design for **StayFrosty** - an intelligent frost monitoring and prevention platform. It translates validated market requirements into actionable user journeys and technical specifications for development teams.

### 1.2 Product Vision

StayFrosty bridges the gap between enterprise-grade predictive analytics and consumer-friendly user experience, making advanced frost protection accessible to growers of all technical abilities at competitive pricing.

### 1.3 Market Context

| Metric                | Value                                                                      |
| --------------------- | -------------------------------------------------------------------------- |
| Market Size (2024)    | $1.8B                                                                      |
| Projected Size (2030) | $2.9B                                                                      |
| CAGR                  | 8.2%                                                                       |
| Key Gap               | No solution combines predictive analytics + simple UX + accessible pricing |

### 1.4 Core Capabilities

1. **Real-time Environmental Monitoring** - Temperature, humidity, soil moisture
2. **Custom Threshold Alerts** - SMS, email, webhook notifications
3. **Historical Data & Trend Visualization** - Long-term pattern analysis
4. **Predictive Frost Forecasting** - 6-24 hour advance warnings
5. **Device/Sensor Management** - Provisioning, health monitoring, calibration
6. **Multi-tenant RBAC** - Role-based access for teams and consultants
7. **API/Webhook Integrations** - Connect to existing farm management systems

---

## 2. User Personas Summary

### 2.1 Persona Overview Matrix

| Persona    | Role                    | Tech Level  | Primary Need               | Usage Pattern                  |
| ---------- | ----------------------- | ----------- | -------------------------- | ------------------------------ |
| **Alex**   | Vineyard Owner          | Low         | Overnight frost alerts     | Mobile-first, reactive         |
| **Jordan** | Agricultural Consultant | Medium      | Multi-site monitoring      | Desktop dashboard, analytical  |
| **Sam**    | Facility Operator       | Medium-High | Equipment protection       | Integration-focused, automated |
| **Morgan** | IoT Integrator          | High        | Sensor network reliability | Technical configuration        |

### 2.2 Detailed Persona Profiles

#### Alex - Vineyard Owner (Primary Persona)

```
Profile:
- Age: 52
- Location: Napa Valley, CA
- Property: 50-acre vineyard
- Technical Comfort: Basic smartphone use
- Critical Season: March-May (spring frost risk)

Goals:
- Protect grape harvest from frost damage (potential $500K+ loss)
- Sleep peacefully knowing alerts will wake them if needed
- Understand data without technical expertise

Frustrations:
- Current weather apps are generic, not field-specific
- Has lost crops before due to microclimate frost events
- Complex systems feel overwhelming

Devices:
- iPhone 14 (primary)
- Older laptop for occasional use
```

#### Jordan - Agricultural Consultant

```
Profile:
- Age: 38
- Location: Central Valley, CA
- Clients: 15 farms, various crops
- Technical Comfort: Proficient with farm software

Goals:
- Monitor multiple client sites from one dashboard
- Generate professional reports for clients
- Provide data-driven recommendations

Frustrations:
- Managing multiple logins for different farms
- Manually compiling data for reports
- Clients blame them for missed warnings

Devices:
- MacBook Pro (primary)
- iPad for field visits
- iPhone for alerts
```

#### Sam - Facility Operator

```
Profile:
- Age: 45
- Location: Phoenix, AZ
- Facility: Outdoor HVAC/irrigation infrastructure
- Technical Comfort: Comfortable with industrial systems

Goals:
- Prevent freeze damage to pipes and equipment
- Integrate alerts with existing SCADA/BMS systems
- Minimize downtime and emergency repairs

Frustrations:
- Manual temperature checks are time-consuming
- False alarms from generic weather services
- Lack of integration with existing systems

Devices:
- Windows workstation (primary)
- Android phone
- Industrial tablet
```

#### Morgan - IoT Integrator

```
Profile:
- Age: 29
- Location: Sacramento, CA
- Role: Deploys sensors for agricultural clients
- Technical Comfort: Advanced (developer background)

Goals:
- Reliable sensor deployment and maintenance
- Quick troubleshooting of connectivity issues
- Batch configuration for large deployments

Frustrations:
- Poor documentation for sensor APIs
- Difficult to diagnose intermittent failures
- Manual calibration is tedious

Devices:
- Linux laptop (primary)
- Android phone with debugging tools
- Raspberry Pi for testing
```

---

## 3. User Journey Maps

### 3.1 Alex - Vineyard Owner Journey

```mermaid
journey
    title Alex's User Journey - Vineyard Owner
    section Awareness
      Sees frost damage at neighbor's farm: 2: Alex
      Searches for frost alert solutions: 3: Alex
      Finds StayFrosty via Google search: 4: Alex
      Reads case study about vineyards: 5: Alex
    section Evaluation
      Signs up for free trial: 4: Alex
      Watches 2-minute setup video: 5: Alex
      Receives trial sensor kit: 5: Alex
    section Onboarding
      Installs first sensor in vineyard: 3: Alex
      Sensor connects automatically: 5: Alex
      Sets overnight frost alert threshold: 4: Alex
      Receives test alert confirmation: 5: Alex
    section Daily Usage
      Checks app each morning: 4: Alex
      Views overnight temperature chart: 4: Alex
      Sees 24-hour forecast widget: 5: Alex
    section Alert Response
      Wakes to SMS frost alert at 3am: 5: Alex
      Opens app to verify reading: 4: Alex
      Activates wind machines: 5: Alex
      Saves crop from frost event: 5: Alex
    section Long-term Value
      Reviews seasonal frost history: 4: Alex
      Plans next year's frost protection: 5: Alex
      Recommends to fellow growers: 5: Alex
      Upgrades to premium plan: 5: Alex
```

#### Alex Journey - Detailed Breakdown

| Phase               | Duration  | Key Actions                         | Emotions                  | Touchpoints               |
| ------------------- | --------- | ----------------------------------- | ------------------------- | ------------------------- |
| **Awareness**       | 1-2 weeks | Research solutions, compare options | Anxious, hopeful          | Google, ads, case studies |
| **Evaluation**      | 3-5 days  | Free trial signup, watch videos     | Curious, cautious         | Website, email, YouTube   |
| **Onboarding**      | 1-2 hours | Install sensor, configure alerts    | Excited, slightly nervous | Mobile app, hardware      |
| **Daily Usage**     | Ongoing   | Morning check, view forecasts       | Reassured, confident      | Mobile app (primary)      |
| **Alert Response**  | Minutes   | Receive alert, take action          | Alert, focused            | SMS, phone call, app      |
| **Long-term Value** | Seasonal  | Review data, plan ahead             | Satisfied, loyal          | Dashboard, reports        |

---

### 3.2 Jordan - Agricultural Consultant Journey

```mermaid
journey
    title Jordan's User Journey - Agricultural Consultant
    section Awareness
      Client asks about frost monitoring: 3: Jordan
      Evaluates multiple solutions: 3: Jordan
      Discovers StayFrosty multi-tenant feature: 5: Jordan
    section Evaluation
      Requests demo for consultants: 4: Jordan
      Attends sales call with account manager: 4: Jordan
      Reviews API documentation: 4: Jordan
      Negotiates volume pricing: 4: Jordan
    section Onboarding
      Creates consultant organization: 4: Jordan
      Invites first 3 client farms: 4: Jordan
      Configures role permissions: 3: Jordan
      Sets up unified alert routing: 4: Jordan
    section Daily Usage
      Reviews all-clients dashboard: 5: Jordan
      Identifies farm with anomalies: 4: Jordan
      Drills into specific sensors: 4: Jordan
      Calls client with recommendations: 5: Jordan
    section Reporting
      Generates monthly frost report: 4: Jordan
      Exports data for presentation: 4: Jordan
      Presents findings to client board: 5: Jordan
    section Scaling
      Adds 5 more client farms: 4: Jordan
      Creates report templates: 5: Jordan
      Trains junior staff on platform: 4: Jordan
```

#### Jordan Journey - Key Moments

| Moment                     | Description                                     | Design Implication           |
| -------------------------- | ----------------------------------------------- | ---------------------------- |
| **Multi-tenant Discovery** | Realizes one login can manage all clients       | Highlight this in marketing  |
| **Permission Setup**       | Needs to limit client access to their data only | Clear RBAC UI is critical    |
| **Cross-farm Comparison**  | Wants to compare trends across clients          | Build comparison views       |
| **Report Generation**      | Needs professional output for client meetings   | Invest in export/PDF quality |

---

### 3.3 Sam - Facility Operator Journey

```mermaid
journey
    title Sam's User Journey - Facility Operator
    section Awareness
      Experiences pipe freeze incident: 1: Sam
      Estimates $50K in damage and downtime: 1: Sam
      Manager approves monitoring solution: 4: Sam
      Researches industrial freeze monitoring: 3: Sam
    section Evaluation
      Checks webhook/API capabilities: 4: Sam
      Confirms compatibility with existing BMS: 5: Sam
      Tests alert latency requirements: 4: Sam
      Approves vendor selection: 4: Sam
    section Onboarding
      Works with Morgan to install sensors: 4: Sam
      Configures webhook to SCADA system: 3: Sam
      Tests alert-to-action automation: 4: Sam
      Documents runbook procedures: 4: Sam
    section Daily Operations
      Monitors facility dashboard: 4: Sam
      Reviews automated health checks: 5: Sam
      Minimal manual intervention required: 5: Sam
    section Incident Response
      Receives automated freeze warning: 5: Sam
      SCADA triggers heat tape automatically: 5: Sam
      Reviews incident in dashboard: 4: Sam
      No equipment damage occurred: 5: Sam
    section Optimization
      Analyzes false alarm rate: 4: Sam
      Adjusts thresholds based on history: 4: Sam
      Achieves 99.5% uptime: 5: Sam
```

#### Sam Journey - Integration Focus

| Integration Point | Protocol   | Latency Requirement | Notes              |
| ----------------- | ---------- | ------------------- | ------------------ |
| Alert Webhook     | HTTPS POST | < 30 seconds        | Critical path      |
| Data Export       | REST API   | < 5 minutes         | Batch acceptable   |
| SCADA Bridge      | MQTT       | < 5 seconds         | Real-time required |
| Dashboard Embed   | iframe/SSO | N/A                 | Optional           |

---

### 3.4 Morgan - IoT Integrator Journey

```mermaid
journey
    title Morgan's User Journey - IoT Integrator
    section Awareness
      Client requests StayFrosty deployment: 4: Morgan
      Reviews technical documentation: 4: Morgan
      Identifies supported sensor models: 4: Morgan
    section Deployment Planning
      Surveys client property for coverage: 4: Morgan
      Plans sensor placement for accuracy: 4: Morgan
      Orders sensors and gateway: 4: Morgan
    section Installation
      Installs gateway at client site: 4: Morgan
      Provisions sensors via batch tool: 5: Morgan
      Verifies connectivity for all devices: 4: Morgan
      Calibrates sensors against reference: 3: Morgan
    section Configuration
      Sets up alert thresholds per zone: 4: Morgan
      Configures data retention policies: 4: Morgan
      Tests alert delivery channels: 4: Morgan
      Documents deployment for client: 4: Morgan
    section Maintenance
      Receives low battery alerts: 4: Morgan
      Diagnoses connectivity issues remotely: 4: Morgan
      Schedules on-site calibration visit: 3: Morgan
    section Troubleshooting
      Client reports data gaps: 3: Morgan
      Uses diagnostic dashboard to identify cause: 4: Morgan
      Discovers interference from new equipment: 4: Morgan
      Relocates affected sensors: 4: Morgan
```

#### Morgan Journey - Technical Requirements

| Capability           | Requirement                           | Priority |
| -------------------- | ------------------------------------- | -------- |
| Batch Provisioning   | Add 50+ sensors in single operation   | P0       |
| Diagnostic Dashboard | Signal strength, packet loss, latency | P0       |
| Calibration Workflow | Compare against reference sensor      | P1       |
| Firmware Updates     | OTA updates with rollback             | P1       |
| API Documentation    | OpenAPI 3.0 spec with examples        | P0       |

---

## 4. Core User Flows

### 4.1 Flow 1: New User Onboarding

```mermaid
flowchart TD
    subgraph Entry["Entry Points"]
        A1[Website Signup]
        A2[App Store Download]
        A3[Referral Link]
    end

    A1 --> B[Account Creation]
    A2 --> B
    A3 --> B

    B --> B1{Email Verification}
    B1 -->|Verified| C[Welcome Screen]
    B1 -->|Not Verified| B2[Resend Email]
    B2 --> B1

    C --> D{User Type Selection}
    D -->|Grower/Farmer| E1[Simple Setup Path]
    D -->|Consultant| E2[Multi-tenant Setup Path]
    D -->|Facility Operator| E3[Integration Setup Path]
    D -->|IoT Integrator| E4[Technical Setup Path]

    subgraph SimpleSetup["Simple Setup - Growers"]
        E1 --> F1[Property Name & Location]
        F1 --> G1[Add First Sensor]
        G1 --> G1a{Sensor Kit Received?}
        G1a -->|Yes| H1[Scan QR Code]
        G1a -->|No| G1b[Order Sensor Kit]
        G1b --> G1c[Wait for Delivery]
        G1c --> H1
        H1 --> I1[Sensor Auto-Connects]
        I1 --> I1a{Connection Success?}
        I1a -->|Yes| J1[Set Alert Threshold]
        I1a -->|No| I1b[Troubleshooting Guide]
        I1b --> I1c[Contact Support]
        J1 --> K1[Configure SMS/Email]
        K1 --> L1[Send Test Alert]
        L1 --> M1[Setup Complete!]
    end

    subgraph ConsultantSetup["Consultant Setup"]
        E2 --> F2[Organization Details]
        F2 --> G2[Invite Team Members]
        G2 --> H2[Add Client Farms]
        H2 --> I2[Configure Permissions]
        I2 --> J2[Setup Unified Alerts]
        J2 --> M2[Setup Complete!]
    end

    subgraph FacilitySetup["Facility Setup"]
        E3 --> F3[Facility Information]
        F3 --> G3[Add Monitoring Zones]
        G3 --> H3[Configure Webhooks]
        H3 --> I3[Test Integration]
        I3 --> J3[Set Alert Thresholds]
        J3 --> M3[Setup Complete!]
    end

    subgraph TechnicalSetup["Technical Setup"]
        E4 --> F4[API Key Generation]
        F4 --> G4[Batch Sensor Import]
        G4 --> H4[Gateway Configuration]
        H4 --> I4[Calibration Workflow]
        I4 --> J4[Alert Rule Engine]
        J4 --> M4[Setup Complete!]
    end

    M1 --> N[Dashboard Tour]
    M2 --> N
    M3 --> N
    M4 --> N

    N --> O[First Data Visible]
    O --> P[Aha Moment: Real-time Updates!]

    style P fill:#90EE90,stroke:#228B22,stroke-width:3px
    style M1 fill:#87CEEB,stroke:#4682B4
    style M2 fill:#87CEEB,stroke:#4682B4
    style M3 fill:#87CEEB,stroke:#4682B4
    style M4 fill:#87CEEB,stroke:#4682B4
```

#### Flow 1 - Step Details

| Step                | Alex (Grower)     | Jordan (Consultant) | Sam (Facility) | Morgan (Integrator) |
| ------------------- | ----------------- | ------------------- | -------------- | ------------------- |
| Time to First Value | 15 minutes        | 30 minutes          | 45 minutes     | 60 minutes          |
| Key Friction Point  | Sensor connection | Permission setup    | Webhook config | Batch import        |
| Mitigation          | Auto-discovery    | Templates           | Test endpoint  | CSV upload          |

---

### 4.2 Flow 2: Real-Time Monitoring

```mermaid
flowchart TD
    subgraph Entry["Dashboard Entry"]
        A1[Open Mobile App]
        A2[Open Web Dashboard]
        A3[Click Alert Notification]
    end

    A1 --> B[Dashboard Home]
    A2 --> B
    A3 --> C[Alert Detail View]
    C --> B

    B --> D[Overview Cards]

    subgraph OverviewCards["Overview Section"]
        D --> D1[Current Temperature]
        D --> D2[Humidity Level]
        D --> D3[Frost Risk Score]
        D --> D4[Active Alerts Count]
    end

    D1 --> E{Data Fresh?}
    E -->|Yes, < 5 min| F[Green Status Indicator]
    E -->|Stale, 5-15 min| G[Yellow Warning]
    E -->|Offline, > 15 min| H[Red Alert + Notification]

    G --> G1[Check Sensor Health]
    H --> H1[Trigger Connectivity Alert]

    F --> I[Sensor List View]

    subgraph SensorList["Sensor List"]
        I --> I1[Sensor Card 1]
        I --> I2[Sensor Card 2]
        I --> I3[Sensor Card N...]
    end

    I1 --> J{Tap Sensor Card}
    J --> K[Sensor Detail View]

    subgraph SensorDetail["Sensor Detail View"]
        K --> K1[Live Reading Display]
        K --> K2[24-Hour Sparkline]
        K --> K3[Alert Threshold Lines]
        K --> K4[Last Updated Timestamp]
    end

    K2 --> L{Select Time Range}
    L -->|24 Hours| M1[Day View]
    L -->|7 Days| M2[Week View]
    L -->|30 Days| M3[Month View]
    L -->|Custom| M4[Date Picker]

    M1 --> N[Interactive Chart]
    M2 --> N
    M3 --> N
    M4 --> N

    subgraph ChartInteraction["Chart Interaction"]
        N --> N1[Pinch to Zoom]
        N --> N2[Pan Left/Right]
        N --> N3[Tap for Data Point]
        N --> N4[Long Press for Annotation]
    end

    N3 --> O[Tooltip with Details]
    O --> O1[Temperature Value]
    O --> O2[Humidity Value]
    O --> O3[Timestamp]
    O --> O4[Threshold Comparison]

    K --> P{More Actions}
    P --> P1[Edit Sensor Name]
    P --> P2[Adjust Thresholds]
    P --> P3[View Sensor Health]
    P --> P4[Export Data]

    style F fill:#90EE90,stroke:#228B22
    style G fill:#FFD700,stroke:#FFA500
    style H fill:#FF6347,stroke:#DC143C
    style D3 fill:#E6E6FA,stroke:#9370DB,stroke-width:2px
```

#### Flow 2 - Data Freshness Logic

| Status      | Condition             | Visual Indicator            | Action                    |
| ----------- | --------------------- | --------------------------- | ------------------------- |
| **Live**    | Data < 5 minutes old  | Green dot, "Live" badge     | None                      |
| **Delayed** | Data 5-15 minutes old | Yellow dot, timestamp shown | Check connectivity        |
| **Offline** | Data > 15 minutes old | Red dot, "Offline" badge    | Push notification + email |

---

### 4.3 Flow 3: Alert Management

```mermaid
flowchart TD
    subgraph AlertSetup["Alert Configuration Entry"]
        A[Settings Menu] --> B[Alert Rules]
        B --> C{Create or Edit}
        C -->|New Rule| D[Create Alert Rule]
        C -->|Edit Existing| E[Select Rule to Edit]
        E --> D
    end

    D --> F[Rule Configuration Form]

    subgraph RuleConfig["Rule Configuration"]
        F --> F1[Rule Name]
        F1 --> F2[Select Sensors]
        F2 --> F3{Sensor Selection}
        F3 -->|Individual| F3a[Pick Specific Sensors]
        F3 -->|Group| F3b[Select Sensor Group]
        F3 -->|All| F3c[Apply to All Sensors]

        F3a --> G[Threshold Configuration]
        F3b --> G
        F3c --> G
    end

    subgraph ThresholdConfig["Threshold Settings"]
        G --> G1[Metric Selection]
        G1 -->|Temperature| G1a[Temp Threshold]
        G1 -->|Humidity| G1b[Humidity Threshold]
        G1 -->|Soil Moisture| G1c[Moisture Threshold]

        G1a --> H[Condition Type]
        G1b --> H
        G1c --> H

        H -->|Below| H1[Set Lower Limit]
        H -->|Above| H2[Set Upper Limit]
        H -->|Range| H3[Set Min and Max]
        H -->|Rate of Change| H4[Set Change Rate]
    end

    H1 --> I[Notification Channels]
    H2 --> I
    H3 --> I
    H4 --> I

    subgraph Notifications["Notification Setup"]
        I --> I1{SMS?}
        I1 -->|Yes| I1a[Enter Phone Numbers]
        I1 -->|No| I2

        I1a --> I2{Email?}
        I2 -->|Yes| I2a[Enter Email Addresses]
        I2 -->|No| I3

        I2a --> I3{Webhook?}
        I3 -->|Yes| I3a[Configure Webhook URL]
        I3 -->|No| I4

        I3a --> I4{Push Notification?}
        I4 -->|Yes| I4a[Confirm App Permissions]
        I4 -->|No| J

        I4a --> J[Schedule Configuration]
    end

    subgraph Schedule["Alert Schedule"]
        J --> J1{Always Active?}
        J1 -->|Yes| K[Save Rule]
        J1 -->|No| J2[Set Active Hours]
        J2 --> J3[Select Days of Week]
        J3 --> J4[Set Date Range - Optional]
        J4 --> K
    end

    K --> L{Test Alert?}
    L -->|Yes| M[Send Test Notification]
    M --> M1{Received?}
    M1 -->|Yes| N[Rule Activated]
    M1 -->|No| M2[Troubleshoot Delivery]
    M2 --> I

    L -->|No| N

    N --> O[Rule List Updated]
    O --> P[Real-time Monitoring Active]

    style N fill:#90EE90,stroke:#228B22,stroke-width:2px
    style M1 fill:#FFD700,stroke:#FFA500
    style M2 fill:#FF6347,stroke:#DC143C
```

#### Flow 3 - Alert Rule Types

| Alert Type           | Use Case                | Example Configuration            |
| -------------------- | ----------------------- | -------------------------------- |
| **Simple Threshold** | Basic frost warning     | Temp < 32°F                      |
| **Rate of Change**   | Rapid cooling detection | Temp dropping > 5°F/hour         |
| **Duration-based**   | Sustained cold          | Temp < 35°F for > 30 min         |
| **Compound**         | Multi-factor risk       | Temp < 36°F AND Humidity > 90%   |
| **Predictive**       | Forecast-based          | Frost risk > 70% in next 6 hours |

---

### 4.4 Flow 4: FrostEvent Response

```mermaid
flowchart TD
    subgraph AlertReceived["Alert Received"]
        A1[SMS Alert] --> B[User Wakes/Notices]
        A2[Push Notification] --> B
        A3[Phone Call - Critical] --> B
        A4[Email Alert] --> B
    end

    B --> C{Alert Type}
    C -->|Frost Warning| D[Open StayFrosty App]
    C -->|Equipment Alert| E[Check System Status]
    C -->|Sensor Offline| F[Check Sensor Health]

    D --> G[Frost Alert Dashboard]

    subgraph AlertDashboard["Alert Dashboard View"]
        G --> G1[Alert Summary Banner]
        G --> G2[Affected Sensors Map]
        G --> G3[Current Readings Grid]
        G --> G4[Recommended Actions]
    end

    G1 --> H{Acknowledge Alert}
    H -->|Acknowledge| I[Alert Status: Acknowledged]
    H -->|Snooze 30 min| I1[Snooze Timer Set]
    I1 --> I1a[Reminder After 30 min]
    I1a --> H

    I --> J[View Detailed Data]

    subgraph DataReview["Data Review"]
        J --> J1[Temperature Trend Chart]
        J --> J2[Forecast Next 6 Hours]
        J --> J3[Historical Comparison]
        J --> J4[Nearby Sensor Readings]
    end

    J2 --> K{Assess Severity}
    K -->|Mild - 30-32°F| L1[Monitor Closely]
    K -->|Moderate - 28-30°F| L2[Activate Protection]
    K -->|Severe - Below 28°F| L3[Emergency Response]

    L1 --> M[Set Follow-up Reminder]

    subgraph ProtectionActivation["Protection Actions"]
        L2 --> N1[Activate Wind Machines]
        L2 --> N2[Start Irrigation]
        L2 --> N3[Deploy Covers]
        L2 --> N4[Custom Action]
    end

    subgraph EmergencyResponse["Emergency Response"]
        L3 --> O1[Full Protection Activation]
        L3 --> O2[Call Farm Manager]
        L3 --> O3[Document Conditions]
        L3 --> O4[Prepare Loss Assessment]
    end

    N1 --> P[Log Action Taken]
    N2 --> P
    N3 --> P
    N4 --> P
    O1 --> P
    O2 --> P
    O3 --> P
    O4 --> P

    P --> Q[Continue Monitoring]
    Q --> R{Temperature Rising?}
    R -->|Yes| S[Frost Event Ending]
    R -->|No| Q

    S --> T[Resolve Alert]
    T --> U[Post-Event Summary]

    subgraph PostEvent["Post-Event Analysis"]
        U --> U1[Event Duration]
        U --> U2[Min Temperature Reached]
        U --> U3[Actions Taken Log]
        U --> U4[Estimated Damage]
        U --> U5[Lessons Learned]
    end

    U5 --> V[Add Notes for Future]
    V --> W[Event Archived]
    W --> X[Generate Report - Optional]

    style I fill:#87CEEB,stroke:#4682B4
    style L3 fill:#FF6347,stroke:#DC143C,stroke-width:3px
    style S fill:#90EE90,stroke:#228B22
    style W fill:#E6E6FA,stroke:#9370DB
```

#### Flow 4 - Response Time Targets

| Severity     | Target Acknowledgment | Target Action | Escalation             |
| ------------ | --------------------- | ------------- | ---------------------- |
| **Low**      | 15 minutes            | 30 minutes    | None                   |
| **Medium**   | 5 minutes             | 15 minutes    | SMS if no ack          |
| **High**     | 2 minutes             | 5 minutes     | Phone call if no ack   |
| **Critical** | Immediate             | Immediate     | Auto-dial + team alert |

---

### 4.5 Flow 5: Predictive Forecasting

```mermaid
flowchart TD
    subgraph DataCollection["Data Ingestion"]
        A1[Sensor Data Stream] --> B[Data Aggregation]
        A2[Weather API Feeds] --> B
        A3[Historical Patterns] --> B
    end

    B --> C[Prediction Engine]

    subgraph PredictionEngine["ML Prediction Pipeline"]
        C --> C1[Feature Engineering]
        C1 --> C2[Temperature Trend Analysis]
        C1 --> C3[Humidity Correlation]
        C1 --> C4[Seasonal Patterns]
        C1 --> C5[Microclimate Factors]

        C2 --> D[Risk Score Calculation]
        C3 --> D
        C4 --> D
        C5 --> D
    end

    D --> E[Frost Risk Score: 0-100]

    E --> F{Risk Level}
    F -->|Low: 0-30| G1[Green Status - Safe]
    F -->|Medium: 31-60| G2[Yellow Status - Watch]
    F -->|High: 61-85| G3[Orange Status - Warning]
    F -->|Critical: 86-100| G4[Red Status - Alert]

    subgraph UserInterface["User Interface"]
        G1 --> H[Forecast Dashboard]
        G2 --> H
        G3 --> H
        G4 --> H

        H --> H1[Risk Score Gauge]
        H --> H2[6-Hour Timeline]
        H --> H3[24-Hour Chart]
        H --> H4[Contributing Factors]
    end

    H1 --> I{User Views Details}
    I --> J[Detailed Forecast View]

    subgraph ForecastDetails["Forecast Details"]
        J --> J1[Hour-by-Hour Predictions]
        J --> J2[Confidence Intervals]
        J --> J3[Factor Breakdown]
        J --> J4[Historical Accuracy]
    end

    J1 --> K{Risk Exceeds Threshold?}
    K -->|Yes| L[Proactive Alert Triggered]
    K -->|No| M[Continue Monitoring]

    L --> N[Alert: Frost Risk in X Hours]

    subgraph ProactiveAlert["Proactive Alert Content"]
        N --> N1[Predicted Risk Time]
        N --> N2[Expected Low Temperature]
        N --> N3[Confidence Level]
        N --> N4[Recommended Preparation]
    end

    N4 --> O{User Action}
    O -->|Prepare Now| P1[Protection Checklist]
    O -->|Set Reminder| P2[Schedule Pre-Event Alert]
    O -->|Dismiss| P3[Log Dismissed]

    P1 --> Q[Track Preparation Status]
    P2 --> Q

    Q --> R[Wait for Event Window]
    R --> S{Frost Occurred?}
    S -->|Yes - Predicted| T1[Prediction Validated]
    S -->|Yes - Not Predicted| T2[False Negative - Log]
    S -->|No - Was Predicted| T3[False Positive - Log]
    S -->|No - Not Predicted| T4[True Negative]

    T1 --> U[Model Accuracy Updated]
    T2 --> U
    T3 --> U
    T4 --> U

    U --> V[Historical Accuracy Display]
    V --> W[User Trust Building]

    style E fill:#E6E6FA,stroke:#9370DB,stroke-width:3px
    style G4 fill:#FF6347,stroke:#DC143C
    style L fill:#FFD700,stroke:#FFA500,stroke-width:2px
    style T1 fill:#90EE90,stroke:#228B22
```

#### Flow 5 - Prediction Accuracy Metrics

| Metric                     | Target     | Measurement                                |
| -------------------------- | ---------- | ------------------------------------------ |
| **Precision**              | > 85%      | True positives / All positive predictions  |
| **Recall**                 | > 90%      | True positives / All actual frost events   |
| **Lead Time**              | 6-24 hours | Time between alert and event               |
| **Confidence Calibration** | < 5% error | Predicted probability vs actual occurrence |

---

### 4.6 Flow 6: Device Management

```mermaid
flowchart TD
    subgraph DeviceEntry["Device Management Entry"]
        A[Settings Menu] --> B[Device Management]
        B --> C[Device List View]
    end

    C --> D{Select Action}
    D -->|Add Device| E[Provisioning Flow]
    D -->|View Device| F[Device Detail]
    D -->|Bulk Actions| G[Batch Operations]

    subgraph Provisioning["Device Provisioning"]
        E --> E1{Provisioning Method}
        E1 -->|QR Code| E2[Scan QR on Device]
        E1 -->|Manual| E3[Enter Device ID]
        E1 -->|Batch| E4[Upload CSV]
        E1 -->|API| E5[Use REST Endpoint]

        E2 --> E6[Device Discovery]
        E3 --> E6
        E4 --> E6
        E5 --> E6

        E6 --> E7{Device Found?}
        E7 -->|Yes| E8[Assign to Location]
        E7 -->|No| E9[Troubleshoot Connection]

        E8 --> E10[Name the Sensor]
        E10 --> E11[Set Initial Thresholds]
        E11 --> E12[Verify Data Transmission]
        E12 --> E13{Data Received?}
        E13 -->|Yes| E14[Provisioning Complete]
        E13 -->|No| E9

        E9 --> E9a[Check Power Supply]
        E9 --> E9b[Check WiFi/LoRa Signal]
        E9 --> E9c[Check Gateway Status]
        E9a --> E6
        E9b --> E6
        E9c --> E6
    end

    subgraph DeviceDetail["Device Detail View"]
        F --> F1[Device Information]
        F1 --> F1a[Device ID / Serial]
        F1 --> F1b[Firmware Version]
        F1 --> F1c[Last Seen Timestamp]
        F1 --> F1d[Battery Level]

        F --> F2[Health Metrics]
        F2 --> F2a[Signal Strength]
        F2 --> F2b[Packet Loss Rate]
        F2 --> F2c[Uptime Percentage]
        F2 --> F2d[Error Log]

        F --> F3[Device Actions]
        F3 --> F3a[Rename Device]
        F3 --> F3b[Update Firmware]
        F3 --> F3c[Calibrate Sensor]
        F3 --> F3d[Restart Device]
        F3 --> F3e[Remove Device]
    end

    F3c --> H[Calibration Workflow]

    subgraph Calibration["Calibration Process"]
        H --> H1[Place Reference Thermometer]
        H1 --> H2[Wait 15 Minutes for Stabilization]
        H2 --> H3[Enter Reference Reading]
        H3 --> H4[System Calculates Offset]
        H4 --> H5[Apply Calibration]
        H5 --> H6[Verify Calibrated Reading]
        H6 --> H7{Acceptable Accuracy?}
        H7 -->|Yes| H8[Calibration Saved]
        H7 -->|No| H1
    end

    subgraph BatchOperations["Batch Operations"]
        G --> G1[Select Multiple Devices]
        G1 --> G2{Batch Action}
        G2 -->|Firmware Update| G3[Queue OTA Updates]
        G2 -->|Threshold Change| G4[Apply to All Selected]
        G2 -->|Export Data| G5[Download CSV]
        G2 -->|Remove| G6[Confirm Bulk Delete]

        G3 --> G7[Update Progress Tracker]
        G7 --> G8{All Updates Complete?}
        G8 -->|Yes| G9[Summary Report]
        G8 -->|No - Failures| G10[Retry Failed Devices]
        G10 --> G7
    end

    F3e --> I[Remove Device Confirmation]
    I --> I1{Confirm Removal?}
    I1 -->|Yes| I2[Device Removed]
    I1 -->|No| F

    I2 --> I3[Historical Data Retained]
    I3 --> I4[Device Available for Re-provisioning]

    style E14 fill:#90EE90,stroke:#228B22
    style H8 fill:#90EE90,stroke:#228B22
    style F2d fill:#FFD700,stroke:#FFA500
    style E9 fill:#FF6347,stroke:#DC143C
```

#### Flow 6 - Device Health Indicators

| Indicator       | Healthy   | Warning        | Critical  |
| --------------- | --------- | -------------- | --------- |
| **Battery**     | > 50%     | 20-50%         | < 20%     |
| **Signal**      | > -70 dBm | -70 to -85 dBm | < -85 dBm |
| **Packet Loss** | < 1%      | 1-5%           | > 5%      |
| **Last Seen**   | < 5 min   | 5-15 min       | > 15 min  |

---

## 5. Information Architecture

### 5.1 Sitemap Overview

```mermaid
flowchart TD
    subgraph PublicPages["Public Pages"]
        P1[Landing Page]
        P2[Pricing]
        P3[Features]
        P4[Case Studies]
        P5[Blog]
        P6[Contact/Demo Request]
        P7[Login]
        P8[Sign Up]
    end

    subgraph AuthApp["Authenticated Application"]
        A[Dashboard Home]

        A --> B[Monitoring]
        A --> C[Alerts]
        A --> D[Forecasting]
        A --> E[Devices]
        A --> F[Reports]
        A --> G[Settings]
    end

    subgraph Monitoring["Monitoring Section"]
        B --> B1[Overview Dashboard]
        B --> B2[Sensor List]
        B --> B3[Map View]
        B --> B4[Live Feed]
        B2 --> B2a[Sensor Detail]
        B2a --> B2b[Historical Data]
        B2a --> B2c[Sensor Settings]
    end

    subgraph Alerts["Alerts Section"]
        C --> C1[Active Alerts]
        C --> C2[Alert History]
        C --> C3[Alert Rules]
        C3 --> C3a[Create Rule]
        C3 --> C3b[Edit Rule]
        C1 --> C1a[Alert Detail]
    end

    subgraph Forecasting["Forecasting Section"]
        D --> D1[Forecast Dashboard]
        D --> D2[Risk Timeline]
        D --> D3[Model Accuracy]
        D --> D4[Alert Settings]
    end

    subgraph Devices["Devices Section"]
        E --> E1[Device List]
        E --> E2[Add Device]
        E --> E3[Gateways]
        E --> E4[Firmware Updates]
        E1 --> E1a[Device Detail]
        E1a --> E1b[Calibration]
        E1a --> E1c[Diagnostics]
    end

    subgraph Reports["Reports Section"]
        F --> F1[Generate Report]
        F --> F2[Saved Reports]
        F --> F3[Scheduled Reports]
        F --> F4[Export Data]
    end

    subgraph Settings["Settings Section"]
        G --> G1[Profile]
        G --> G2[Organization]
        G --> G3[Team Members]
        G --> G4[Notifications]
        G --> G5[Integrations]
        G --> G6[API Keys]
        G --> G7[Billing]
    end

    P7 --> A
    P8 --> A

    style A fill:#87CEEB,stroke:#4682B4,stroke-width:3px
    style B1 fill:#90EE90,stroke:#228B22
    style C1 fill:#FFD700,stroke:#FFA500
    style D1 fill:#E6E6FA,stroke:#9370DB
```

### 5.2 Role-Based Access Matrix

| Page/Feature           | Grower (Alex)    | Consultant (Jordan)     | Facility Operator (Sam) | IoT Integrator (Morgan) | Admin |
| ---------------------- | ---------------- | ----------------------- | ----------------------- | ----------------------- | ----- |
| **Dashboard Home**     | Own data         | All clients             | Own facility            | Assigned devices        | All   |
| **Sensor List**        | View/Edit own    | View all, Edit assigned | View/Edit own           | Full access             | Full  |
| **Alert Rules**        | Create/Edit own  | Create for clients      | Create/Edit own         | View only               | Full  |
| **Forecast Dashboard** | View own         | View all clients        | View own                | View only               | Full  |
| **Device Management**  | View/Basic       | View assigned           | View/Edit own           | Full access             | Full  |
| **Reports**            | Own reports      | Client reports          | Own reports             | Device reports          | Full  |
| **Team Members**       | View only        | Manage own team         | Manage own team         | View only               | Full  |
| **API Keys**           | Limited          | Full                    | Full                    | Full                    | Full  |
| **Billing**            | Own subscription | Organization            | Organization            | View only               | Full  |
| **Integrations**       | Limited          | Full                    | Full                    | Full                    | Full  |

### 5.3 Navigation Structure

#### Primary Navigation (Top/Side Bar)

```
[Logo] StayFrosty
|
+-- Dashboard (Home icon)
|
+-- Monitoring
|   +-- Overview
|   +-- Sensors
|   +-- Map View
|
+-- Alerts
|   +-- Active (badge with count)
|   +-- History
|   +-- Rules
|
+-- Forecast
|   +-- Today's Risk
|   +-- 7-Day Outlook
|   +-- Accuracy Stats
|
+-- Devices
|   +-- Sensors
|   +-- Gateways
|   +-- Add New
|
+-- Reports
|
+-- Settings (gear icon)
```

#### Mobile Navigation (Bottom Tab Bar)

```
[ Home ] [ Alerts ] [ Forecast ] [ Sensors ] [ More ]
```

---

## 6. Key Experience Analysis

### 6.1 First Value Moments (Aha!)

| Persona    | Aha Moment                                        | Time to Achieve | Design Priority |
| ---------- | ------------------------------------------------- | --------------- | --------------- |
| **Alex**   | Sees real-time temperature from vineyard on phone | < 15 minutes    | P0              |
| **Jordan** | Views all client farms in single dashboard        | < 30 minutes    | P0              |
| **Sam**    | Receives first webhook notification in SCADA      | < 60 minutes    | P1              |
| **Morgan** | Successfully batch provisions 10+ sensors         | < 45 minutes    | P1              |

### 6.2 Critical Experience Nodes

```mermaid
flowchart LR
    subgraph Onboarding["Onboarding Phase"]
        A1[Account Creation]
        A2[First Sensor Connected]
        A3[First Data Visible]
        A4[First Alert Configured]
    end

    subgraph DailyUse["Daily Usage Phase"]
        B1[Morning Dashboard Check]
        B2[Forecast Review]
        B3[Historical Trend Analysis]
    end

    subgraph AlertPhase["Alert Phase"]
        C1[Alert Received]
        C2[Alert Acknowledged]
        C3[Action Taken]
        C4[Event Resolved]
    end

    subgraph ValuePhase["Value Realization"]
        D1[Frost Event Survived]
        D2[Report Generated]
        D3[ROI Demonstrated]
        D4[Recommendation Given]
    end

    A1 -->|2 min| A2
    A2 -->|10 min| A3
    A3 -->|5 min| A4

    A4 --> B1
    B1 --> B2
    B2 --> B3

    B1 --> C1
    C1 --> C2
    C2 --> C3
    C3 --> C4

    C4 --> D1
    D1 --> D2
    D2 --> D3
    D3 --> D4

    style A3 fill:#90EE90,stroke:#228B22,stroke-width:3px
    style D1 fill:#FFD700,stroke:#FFA500,stroke-width:3px
    style C1 fill:#FF6347,stroke:#DC143C
```

### 6.3 Points of Friction

| Friction Point                       | Persona Affected | Severity | Mitigation                             |
| ------------------------------------ | ---------------- | -------- | -------------------------------------- |
| **Sensor won't connect**             | All              | High     | Auto-discovery, troubleshooting wizard |
| **Too many alerts (alert fatigue)**  | Alex, Sam        | Medium   | Smart alert grouping, severity tiers   |
| **Webhook configuration complexity** | Sam              | Medium   | Pre-built templates, test endpoint     |
| **Permission confusion**             | Jordan           | Low      | Clear role descriptions, templates     |
| **Calibration tedious**              | Morgan           | Medium   | Batch calibration mode                 |
| **Data export limitations**          | Jordan           | Low      | Custom report builder                  |

### 6.4 Delight Opportunities

| Opportunity                     | Description                                                   | Impact               |
| ------------------------------- | ------------------------------------------------------------- | -------------------- |
| **Personalized greetings**      | "Good morning, Alex. Your vineyard is safe today."            | Emotional connection |
| **Saved the day notifications** | "Alert last night prevented estimated $15K damage"            | Value demonstration  |
| **Seasonal insights**           | "You had 12 frost events this spring, 8 fewer than last year" | Pattern recognition  |
| **Achievement badges**          | "First Season Complete", "100 Alerts Handled"                 | Gamification         |
| **Weather trivia**              | "Did you know? This is the coldest April night in 10 years"   | Engagement           |

---

## 7. Main Path vs Branch Paths

### 7.1 Main Path Definition (Happy Path)

The **Main Path** represents the shortest route for a user to achieve their core goal without encountering errors or edge cases.

#### Alex's Main Path (Grower)

```
1. Sign up (2 min)
2. Install sensor (10 min)
3. Configure frost alert for 32°F (3 min)
4. Receive overnight frost alert (passive - overnight)
5. Check temperature on app (1 min)
6. Activate wind machines (5 min)
7. Crop saved!
```

**Total Time to Value: 15-20 minutes active, overnight for first alert**

### 7.2 Branch Paths

```mermaid
flowchart TD
    A[Main Path: Happy Flow] --> B{Decision Point 1}

    B -->|Success| C[Continue Main Path]
    B -->|Sensor Won't Connect| D1[Branch: Troubleshooting]
    B -->|No Sensor Kit| D2[Branch: Order & Wait]

    D1 --> D1a[Check Power]
    D1a --> D1b[Check Signal]
    D1b --> D1c[Contact Support]
    D1c -->|Resolved| C
    D1c -->|Hardware Issue| D1d[RMA Process]

    D2 --> D2a[Order Sensor Kit]
    D2a --> D2b[Wait 3-5 Days]
    D2b --> C

    C --> E{Decision Point 2}
    E -->|Alert Received| F[Continue Main Path]
    E -->|No Alert - False Negative| E1[Branch: Miss Detection]
    E -->|Too Many Alerts| E2[Branch: Alert Fatigue]

    E1 --> E1a[Review Threshold Settings]
    E1a --> E1b[Adjust Sensitivity]
    E1b --> F

    E2 --> E2a[Implement Quiet Hours]
    E2a --> E2b[Group Similar Alerts]
    E2b --> F

    F --> G{Decision Point 3}
    G -->|Action Successful| H[Crop/Equipment Saved]
    G -->|Action Failed| G1[Branch: Incident Response]
    G -->|False Alarm| G2[Branch: Threshold Adjustment]

    G1 --> G1a[Document Damage]
    G1a --> G1b[Insurance Claim]
    G1b --> G1c[Post-Incident Review]
    G1c --> I[Learn & Improve]

    G2 --> G2a[Review Historical Data]
    G2a --> G2b[Refine Thresholds]
    G2b --> I

    H --> I

    style A fill:#90EE90,stroke:#228B22
    style H fill:#90EE90,stroke:#228B22
    style D1 fill:#FFD700,stroke:#FFA500
    style D2 fill:#FFD700,stroke:#FFA500
    style E1 fill:#FF6347,stroke:#DC143C
    style G1 fill:#FF6347,stroke:#DC143C
```

### 7.3 Error States and Recovery

| Error State               | User Impact       | Recovery Path             | Design Consideration                 |
| ------------------------- | ----------------- | ------------------------- | ------------------------------------ |
| **Sensor offline**        | No data           | Auto-retry + notification | Show last known value with timestamp |
| **Alert delivery failed** | Missed warning    | Retry with backup channel | Always have secondary notification   |
| **Gateway offline**       | All sensors down  | Push notification + email | Prioritize gateway health            |
| **API rate limit**        | Integration fails | Queue and retry           | Show clear error message             |
| **Subscription expired**  | Limited access    | Grace period + prompt     | Preserve data access for renewal     |

---

## 8. UI/UX Recommendations

### 8.1 Design Principles

1. **Glanceability First**
   - Critical information visible within 2 seconds
   - Color-coded status indicators (green/yellow/red)
   - Large, touch-friendly targets for mobile

2. **Progressive Disclosure**
   - Simple overview for casual users
   - Drill-down details for power users
   - Advanced settings hidden but accessible

3. **Anxiety Reduction**
   - Always show "last updated" timestamps
   - Confirmation for critical actions
   - Clear status indicators even when "nothing wrong"

4. **Mobile-First, Desktop-Enhanced**
   - Core monitoring works fully on mobile
   - Advanced configuration optimized for desktop
   - Responsive layouts, not separate apps

### 8.2 Component Recommendations

#### Dashboard Cards

```
+----------------------------------+
|  [Icon]  TEMPERATURE             |
|                                  |
|        34.2°F                    |
|       [Sparkline Graph]          |
|                                  |
|  [Green Dot] Live  |  Low: 32°F  |
+----------------------------------+
```

#### Alert Banner

```
+--------------------------------------------------+
| [!] FROST WARNING - Vineyard North Sensor        |
|     Temperature: 33°F (below 35°F threshold)     |
|     Time: 3:42 AM  |  [View] [Acknowledge]       |
+--------------------------------------------------+
```

#### Risk Score Gauge

```
        FROST RISK
    +---------------+
    |   [Gauge]     |
    |     72%       |
    |   HIGH RISK   |
    +---------------+
    Next 6 Hours
```

### 8.3 Mobile vs Desktop Considerations

| Feature    | Mobile                      | Desktop                  |
| ---------- | --------------------------- | ------------------------ |
| Dashboard  | Card stack, vertical scroll | Grid layout, widgets     |
| Charts     | Simplified, touch gestures  | Full detail, mouse hover |
| Alerts     | Full-screen takeover        | Sidebar notification     |
| Settings   | Bottom sheet                | Multi-column form        |
| Navigation | Bottom tab bar              | Side navigation          |
| Data Entry | Simplified forms            | Full forms with keyboard |

### 8.4 Accessibility Requirements

- **Color Contrast:** WCAG 2.1 AA minimum (4.5:1 for text)
- **Touch Targets:** Minimum 44x44 pixels
- **Screen Reader:** Full ARIA labels on interactive elements
- **Color Blindness:** Never use color alone for status (add icons/text)
- **Text Size:** Support system font scaling up to 200%

### 8.5 Performance Targets

| Metric                     | Target          | Measurement            |
| -------------------------- | --------------- | ---------------------- |
| **First Contentful Paint** | < 1.5s          | Mobile 4G              |
| **Time to Interactive**    | < 3.0s          | Mobile 4G              |
| **Dashboard Refresh**      | < 500ms         | After initial load     |
| **Alert Notification**     | < 30s           | From trigger to device |
| **Offline Support**        | Last 24h cached | Service worker         |

---

## Appendix A: Glossary

| Term             | Definition                                                   |
| ---------------- | ------------------------------------------------------------ |
| **Frost Event**  | Period when temperature drops below critical threshold       |
| **Gateway**      | Hub device that connects multiple sensors to the cloud       |
| **RBAC**         | Role-Based Access Control                                    |
| **OTA**          | Over-the-Air (firmware updates)                              |
| **LoRa**         | Long Range low-power wireless protocol                       |
| **Microclimate** | Local atmospheric conditions different from surrounding area |
| **Dew Point**    | Temperature at which water vapor condenses                   |
| **Wind Machine** | Equipment that circulates air to prevent frost formation     |

---

## Appendix B: Related Documents

- StayFrosty Background Research Report (v1.0)
- StayFrosty PRD (forthcoming)
- StayFrosty Technical Architecture (forthcoming)
- StayFrosty API Specification (forthcoming)

---

## Appendix C: Version History

| Version | Date       | Author       | Changes                           |
| ------- | ---------- | ------------ | --------------------------------- |
| 1.0     | 2026-01-24 | Matrix Agent | Initial process modeling document |

---

_End of Document_

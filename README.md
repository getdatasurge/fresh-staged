# FrostGuard - Refrigeration Monitoring & Food Safety Compliance Platform

> Real-time temperature monitoring for commercial food service, healthcare, and retail organizations

## Overview

FrostGuard is a comprehensive IoT-based refrigeration monitoring platform that provides:

- **Real-time Temperature Monitoring**: Automated sensor readings via LoRa/TTN IoT network with live dashboard updates
- **Multi-tier Alert System**: Email, SMS, and push notifications with configurable escalation policies
- **Hierarchical Organization Structure**: Organization → Sites → Areas → Units for enterprise-scale management
- **Offline-first Manual Logging**: IndexedDB-powered offline capability that syncs when connectivity is restored
- **HACCP Compliance**: Complete audit trails, corrective action tracking, and exportable compliance reports
- **Role-based Access Control**: Multi-tenant data isolation with viewer, manager, and admin roles
- **IoT Sensor Integration**: Native integration with The Things Network (TTN) for LoRa sensors
- **Equipment Health Tracking**: Battery life monitoring, connectivity status, and calibration reminders

## Tech Stack

| Category         | Technologies                                        |
| ---------------- | --------------------------------------------------- |
| Frontend         | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| State Management | TanStack Query, React Context                       |
| Backend          | Fastify 5, PostgreSQL, Drizzle ORM                  |
| Auth             | Stack Auth                                          |
| Database         | PostgreSQL (self-hosted or Supabase)                |
| IoT              | The Things Network (TTN), LoRaWAN                   |
| Notifications    | Email, Telnyx SMS, Push Notifications               |
| Payments         | Stripe                                              |

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Stack Auth and API configuration

# Start development server
npm run dev
```

The app will be available at `http://localhost:8080`

## Project Structure

```
freshtrack-pro/
├── src/                      # Frontend React application
│   ├── components/           # React components (UI, alerts, dashboard, settings)
│   ├── pages/                # Route-level page components
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Utilities and configuration
│   ├── contexts/             # React contexts (Auth, SuperAdmin, Debug)
│   └── integrations/         # External service clients
├── supabase/                 # Backend configuration
│   ├── functions/            # Edge functions (Deno)
│   │   ├── _shared/          # Shared utilities
│   │   ├── process-unit-states/  # Alert engine (SSOT)
│   │   ├── process-escalations/  # Notification dispatch
│   │   ├── ttn-webhook/      # TTN data ingestion
│   │   └── ...               # 35+ edge functions
│   └── migrations/           # Database migrations
├── docs/                     # Documentation
└── public/                   # Static assets
```

## Key Features

### Temperature Monitoring Dashboard

- Real-time temperature readings with status indicators
- Visual unit cards showing current temps, thresholds, and alerts
- Configurable refresh intervals
- Mobile-responsive design

### Alert System

- Automatic alert creation for temperature excursions
- Multi-tier escalation (immediate, 15min, 30min, etc.)
- Alert acknowledgment and resolution workflow
- Configurable notification channels per severity

### Organization Hierarchy

- Multi-tenant architecture with complete data isolation
- Site management for physical locations
- Area grouping within sites (walk-in coolers, display cases, etc.)
- Individual unit configuration and monitoring

### Offline Support

- Manual temperature logging works without internet
- Automatic sync when connectivity is restored
- Visual indicators for pending sync items

### HACCP Compliance

- Immutable audit trails for all temperature readings
- Corrective action documentation
- Exportable reports for health inspections
- Equipment calibration tracking

## Available Scripts

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run preview   # Preview production build
npm run lint      # Run ESLint
npm run test      # Run tests
```

## Documentation

Full documentation is available in the `/docs` directory:

- [Architecture Overview](./docs/architecture/ARCHITECTURE.md)
- [API Reference](./docs/engineering/API.md)
- [Data Model](./docs/engineering/DATA_MODEL.md)
- [User Flows](./docs/product/USER_FLOWS.md)
- [Glossary](./docs/GLOSSARY.md)
- [Knowledge Base](./KNOWLEDGE.md)

## Environment Variables

| Variable                                 | Description                                      |
| ---------------------------------------- | ------------------------------------------------ |
| `VITE_API_URL`                           | Backend API URL (default: http://localhost:3000) |
| `VITE_STACK_AUTH_PROJECT_ID`             | Stack Auth project ID                            |
| `VITE_STACK_AUTH_PUBLISHABLE_CLIENT_KEY` | Stack Auth client key                            |

> **Note:** Legacy Supabase variables are documented in `.env.example` for the ongoing database migration.

## Contributing

1. Review the coding conventions in `KNOWLEDGE.md`
2. Follow existing patterns for components and hooks
3. Ensure significant state changes are logged to `event_logs`
4. Run linter before committing: `npm run lint`

## License

Proprietary - All rights reserved.

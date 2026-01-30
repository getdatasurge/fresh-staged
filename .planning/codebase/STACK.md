# Technology Stack

**Analysis Date:** 2026-01-29

**Codebase Size:**
- Files analyzed: 910 files (742 frontend, 168 backend)
- Lines of code: 199,292 lines (169,190 frontend + 30,102 backend, excluding node_modules, build artifacts)

## Languages

**Primary:**
- TypeScript 5.8.3 - All source code (frontend and backend)
- TypeScript configuration: Relaxed mode with `noImplicitAny: false`, `strictNullChecks: false`

**Secondary:**
- JavaScript (ESM) - Configuration files only
- HTML - Entry point (`src/index.html`)
- CSS - Styling with Tailwind

## Runtime

**Environment:**
- Node.js v18.19.1+ (detected in environment, no `.nvmrc` specified)

**Package Manager:**
- npm (frontend uses `package.json`, lockfile status not checked)
- npm (backend uses `package.json`)

**Module System:**
- ESM (`"type": "module"` in both `package.json` files)

## Frameworks

**Core:**
- React 18.3.1 - Frontend UI framework
- Fastify 5.7.1 - Backend HTTP server
- tRPC 11.8.1 - Type-safe API layer (client and server)
- Drizzle ORM 0.38.0 - Database ORM with PostgreSQL

**Testing:**
- Vitest 2.1.8 (frontend) / 4.0.18 (backend) - Unit and integration testing
- Playwright - E2E testing (configured but version not in dependencies)
- @testing-library/react 16.3.1 - React component testing
- happy-dom 20.4.0 - DOM environment for tests

**Build/Dev:**
- Vite 5.4.19 - Frontend build tool and dev server
- tsx 4.21.0 (frontend) / 4.19.0 (backend) - TypeScript execution
- ESLint 9.32.0 - Linting with typescript-eslint 8.38.0
- Tailwind CSS 3.4.17 - Utility-first CSS framework
- PostCSS 8.5.6 - CSS processing
- drizzle-kit 0.30.0 - Database migrations

## Key Dependencies

**Critical:**
- @stackframe/react 2.8.60 - Authentication provider (Stack Auth SDK)
- @tanstack/react-query 5.83.0 - Data fetching and caching
- socket.io-client 4.8.3 (frontend) / socket.io 4.8.3 (backend) - Real-time WebSocket communication
- react-router-dom 6.30.1 - Frontend routing
- zod 3.25.76 (frontend) / 4.3.6 (backend) - Schema validation
- stripe 20.2.0 - Payment processing (backend)
- drizzle-orm 0.38.0 - Database ORM
- pg 8.13.0 - PostgreSQL client

**Infrastructure:**
- BullMQ 5.67.0 - Background job processing
- IORedis 5.9.2 - Redis client for caching and queues
- @bull-board/fastify 6.16.4 - Job queue UI
- jose 6.1.3 - JWT authentication
- @aws-sdk/client-s3 3.750.0 - S3-compatible storage (MinIO)
- resend 4.2.0 - Email delivery service
- telnyx 5.11.0 - SMS delivery service

**UI Components:**
- @radix-ui/* (20+ packages) - Headless UI components
- lucide-react 0.462.0 - Icon library
- recharts 2.15.4 - Data visualization
- react-hook-form 7.61.1 - Form management
- framer-motion 12.29.2 - Animation library
- sonner 1.7.4 - Toast notifications
- next-themes 0.3.0 - Theme management
- vite-plugin-pwa 1.2.0 - Progressive Web App support

## Configuration

**Environment:**
- Frontend: `.env` (local), `.env.production` (prod)
- Backend: `.env` (local), `.env.production` (prod)
- Secrets: File-based in `./secrets/` directory for production

**Critical Environment Variables:**
- `VITE_API_URL` - Backend API URL (default: http://localhost:3000)
- `VITE_STACK_AUTH_PROJECT_ID` - Stack Auth project ID
- `VITE_STACK_AUTH_PUBLISHABLE_CLIENT_KEY` - Stack Auth client key
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `STRIPE_SECRET_KEY` - Stripe API key
- `RESEND_API_KEY` - Resend email API key
- `TELNYX_API_KEY` - Telnyx SMS API key (optional)
- `TTN_API_KEY` - The Things Network API key

**Build:**
- Frontend: `vite.config.ts` - Vite configuration with React SWC plugin, PWA manifest
- Backend: `tsconfig.json` - TypeScript compiler configuration
- Database: `backend/drizzle.config.ts` - Database migrations config
- Linting: `eslint.config.js` - Flat config format
- Styling: `tailwind.config.ts`, `postcss.config.js`
- Tests: `vitest.config.ts` (frontend and backend), `playwright.config.ts` (E2E)

## Platform Requirements

**Development:**
- Node.js v18.19.1+ (no explicit requirement file, inferred from environment)
- PostgreSQL database
- Redis server
- MinIO or S3-compatible storage

**Production:**
- Node.js runtime (server-side)
- PostgreSQL (managed or self-hosted)
- Redis (managed or self-hosted)
- MinIO/S3 storage
- Deployment: Static frontend (Vite build) + Node.js backend (Fastify)
- Optional services: Stripe, Resend, Telnyx, TTN (The Things Network)

---

*Stack analysis: 2026-01-29*

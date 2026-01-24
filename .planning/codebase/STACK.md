# Technology Stack

**Analysis Date:** 2026-01-23

## Languages

**Primary:**
- TypeScript 5.8.3 - Frontend React application (`src/`)
- TypeScript (Deno) - Supabase Edge Functions (`supabase/functions/`)

**Secondary:**
- SQL - Database migrations (`supabase/migrations/`)
- JavaScript - Build configuration and scripts (`scripts/`)

## Runtime

**Environment:**
- Node.js (via Vite dev server for frontend)
- Deno (Supabase Edge Functions runtime)
- Browser (React SPA target)

**Package Manager:**
- npm (primary) - `package-lock.json` present
- bun (secondary) - `bun.lockb` present (198KB)

## Frameworks

**Core:**
- React 18.3.1 - UI framework
- Vite 5.4.19 - Build tool and dev server
- React Router DOM 6.30.1 - Client-side routing

**UI/Styling:**
- Tailwind CSS 3.4.17 - Utility-first CSS
- shadcn/ui (via Radix primitives) - Component library
- tailwindcss-animate 1.0.7 - Animation utilities
- Framer Motion 12.23.26 - Animation library

**State/Data:**
- TanStack React Query 5.83.0 - Server state management
- React Hook Form 7.61.1 - Form handling
- Zod 3.25.76 - Schema validation

**Testing:**
- Vitest 2.1.8 - Test runner
- Testing Library (React 16.3.1, jest-dom 6.9.1) - Component testing
- jsdom 27.4.0 - DOM simulation

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` 2.89.0 - Database, auth, realtime, edge functions
- `recharts` 2.15.4 - Temperature charts and data visualization
- `react-grid-layout` 1.5.3 - Customizable dashboard layouts
- `sonner` 1.7.4 - Toast notifications

**Infrastructure:**
- `vite-plugin-pwa` 1.2.0 - PWA manifest and service worker
- `date-fns` 3.6.0 - Date manipulation
- `lucide-react` 0.462.0 - Icon library
- `next-themes` 0.3.0 - Dark mode support

**Radix UI Primitives:**
- Full suite of accessible primitives: dialog, dropdown-menu, select, tabs, tooltip, toast, popover, etc.
- Located in `@radix-ui/react-*` packages

## Build Configuration

**Vite Config:** `vite.config.ts`
- React plugin via SWC (`@vitejs/plugin-react-swc`)
- Path alias: `@` maps to `./src`
- PWA plugin with workbox runtime caching
- Dev server: port 8080, host `::`
- Test environment: jsdom with globals enabled

**TypeScript Config:** `tsconfig.json` + `tsconfig.app.json`
- Target: ES2020
- Module: ESNext with bundler resolution
- JSX: react-jsx
- Strict mode: OFF (`"strict": false`)
- Path alias: `@/*` maps to `./src/*`

**Tailwind Config:** `tailwind.config.ts`
- Dark mode: class-based
- Custom colors: safe, warning, alarm, excursion, offline (status indicators)
- Custom fonts: Inter (sans), JetBrains Mono (mono)
- Animations: fade-in, slide-in, scale-in, pulse-glow

**ESLint Config:** `eslint.config.js`
- TypeScript-ESLint integration
- React Hooks and React Refresh plugins
- Relaxed rules for unused vars and explicit any (warnings)
- Special rules for Supabase functions (allow `any` types)

## Configuration

**Environment Variables:**
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon key
- `VITE_SUPABASE_PROJECT_ID` - Project identifier

**Edge Function Secrets (Supabase):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` - Internal auth
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Payment processing
- `TELNYX_API_KEY`, `TELNYX_PHONE_NUMBER`, `TELNYX_MESSAGING_PROFILE_ID` - SMS alerts
- `TTN_ENCRYPTION_SALT` - TTN credential encryption

**Build Commands:**
```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # ESLint check
```

**Test Commands:**
```bash
# Vitest configured in vite.config.ts
# Test files: src/**/*.{test,spec}.{ts,tsx}
# Setup file: src/test/setup.ts
```

## Platform Requirements

**Development:**
- Node.js (ES2020 target)
- npm or bun for package management
- Supabase CLI for edge function development
- Docker for local infrastructure (PostgreSQL, Redis, MinIO)

**Production:**
- Supabase hosted platform
- Static hosting for SPA (Vite build output in `dist/`)
- PWA-capable browsers (service worker support)

## Local Development Infrastructure

**Docker Compose:** `docker-compose.yml`
- PostgreSQL 15 Alpine - Primary database (port 5432)
- PgBouncer - Connection pooling (port 6432)
- Redis 7 Alpine - Caching, jobs, pubsub (port 6379)
- MinIO - S3-compatible object storage (ports 9000, 9001)
- Optional: PgAdmin, Redis Commander (via `admin` profile)

---

*Stack analysis: 2026-01-23*

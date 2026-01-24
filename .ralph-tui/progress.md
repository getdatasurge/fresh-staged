# FrostGuard Cross-Iteration Progress

This file tracks progress, patterns, and learnings across Ralph TUI iterations.
Content here is automatically injected into prompts via `{{recentProgress}}` and `{{codebasePatterns}}` variables.

---

## Codebase Patterns

### Architecture Patterns

1. **Backend Route Organization**
   - Routes are modular in `backend/src/routes/`
   - Each route file exports a Fastify plugin
   - Use Zod schemas from `backend/src/schemas/` for validation

2. **Frontend State Management**
   - TanStack Query for server state (API caching)
   - React Context for auth (`src/contexts/AuthContext.tsx`)
   - Custom hooks in `src/hooks/` for reusable logic

3. **Database Access**
   - Drizzle ORM for type-safe queries
   - Migrations in `backend/drizzle/`
   - Use `db:generate` after schema changes

4. **Testing Patterns**
   - Frontend tests use Vitest + jsdom
   - Backend tests use Vitest + node environment
   - Test helpers in `backend/tests/helpers/`

### Code Style Conventions

- TypeScript strict mode enabled
- Prefer named exports over default exports
- Use async/await over raw promises
- Error handling with custom error classes
- Zod for runtime validation

### Deployment Patterns

- Docker Compose for all environments
- Caddy for reverse proxy and auto-HTTPS
- Secrets stored as files, not environment variables
- PostgreSQL connection pooling recommended for production

---

## Recent Progress

### Current PRD: Code Review & Deployment Preparation

**Project:** FrostGuard (FreshTrack Pro)
**Branch:** feature/deployment-readiness
**Total Stories:** 11

| Story | Status | Notes |
|-------|--------|-------|
| US-001 | Pending | Security Audit - Auth |
| US-002 | Pending | Security Audit - API |
| US-003 | Pending | Code Quality |
| US-004 | Pending | Test Coverage |
| US-005 | Pending | Database Review |
| US-006 | Pending | Environment Config |
| US-007 | Pending | Docker Build |
| US-008 | Pending | Caddy Config |
| US-009 | Pending | Monitoring Stack |
| US-010 | Pending | Documentation |
| US-011 | Pending | Final Dry Run |

### Iteration Log

_Progress entries will be automatically appended below during task iterations._

---

## Learnings & Blockers

### Known Blockers

- None currently documented

### Learnings

1. **Drizzle Migrations:** Always run `npm run db:check` before deploying schema changes
2. **Stack Auth:** Ensure CORS is configured for the frontend domain
3. **MinIO:** Production should use TLS (set `MINIO_USE_SSL=true`)
4. **Caddy:** Auto-renews HTTPS certificates - ensure DNS is configured first

---

## Files Reference

### Critical Configuration Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local development services |
| `compose.production.yaml` | Production service overrides |
| `docker/caddy/Caddyfile` | Reverse proxy configuration |
| `.env.production.example` | Production environment template |
| `backend/drizzle/` | Database migrations |

### Key Documentation

| Document | Location |
|----------|----------|
| Production Deployment | `docs/PRODUCTION_DEPLOYMENT.md` |
| Architecture | `docs/architecture/ARCHITECTURE.md` |
| Security | `docs/security/` |

---

## Deployment Readiness Checklist

- [ ] All tests passing (US-004)
- [ ] Lint and typecheck clean (US-003)
- [ ] Security audit complete (US-001, US-002)
- [ ] Environment variables documented (US-006)
- [ ] Docker images build successfully (US-007)
- [ ] Caddy configuration validated (US-008)
- [ ] Monitoring stack configured (US-009)
- [ ] Documentation updated (US-010)
- [ ] Full dry run successful (US-011)

---

_Last updated: Auto-updated by Ralph TUI_

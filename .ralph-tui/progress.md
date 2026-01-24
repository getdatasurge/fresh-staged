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

- [ ] All tests passing
- [ ] Lint and typecheck clean
- [ ] Environment variables documented
- [ ] Secrets generation scripts tested
- [ ] Docker images build successfully
- [ ] Database migrations run cleanly
- [ ] Health checks responding
- [ ] Monitoring dashboards configured
- [ ] SSL certificates issuing correctly
- [ ] Backup procedures documented

---

_Last updated: {{currentDate}}_

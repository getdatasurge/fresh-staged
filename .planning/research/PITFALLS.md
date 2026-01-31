# Pitfalls Research: Production Deployment

**Domain:** Docker Compose → Production (AWS, DigitalOcean, Self-Hosted)
**Project:** FreshTrack Pro IoT Temperature Monitoring
**Researched:** 2026-01-23
**Overall Confidence:** HIGH

## Summary

Docker Compose deployments to production face critical pitfalls in five categories: **connection pooling misconfiguration**, **secrets exposure**, **deployment downtime**, **data persistence**, and **SSL/networking errors**. For FreshTrack Pro's 24/7 IoT monitoring requirement, the most dangerous pitfall is inadequate health checks causing sensor data loss during deployments. PgBouncer transaction pooling mode requires application code changes that are easy to miss. Secret exposure via .env files in Docker images is alarmingly common (one 2026 incident exposed credentials for 247 days in a public image).

## Critical Pitfalls

### CRIT-01: Health Checks Missing or Inadequate

**Risk:** Zero-downtime deployment impossible without proper health checks. `depends_on` only ensures containers start, not that services are ready. PostgreSQL takes 3-8 seconds to initialize while applications try to connect immediately, causing race conditions and connection failures. For FreshTrack Pro, this means **sensor readings lost during deployment**.

**Warning Signs:**

- Containers restart multiple times on deployment
- "Connection refused" errors in logs during startup
- Application crashes immediately after database restarts
- Intermittent 502 Bad Gateway from reverse proxy
- No `/health` endpoint implemented in API

**Prevention:**

1. **Add comprehensive healthchecks to all services** in docker-compose.yml:

   ```yaml
   postgres:
     healthcheck:
       test: ['CMD-SHELL', 'pg_isready -U frostguard -d frostguard']
       interval: 5s
       timeout: 5s
       retries: 5
       start_period: 10s
   ```

2. **Implement application health endpoint** (`/health` or `/healthz`):
   - Check database connectivity
   - Verify Redis connection
   - Test MinIO availability
   - Return 200 only when all dependencies ready

3. **Use `condition: service_healthy`** in depends_on:

   ```yaml
   api:
     depends_on:
       postgres:
         condition: service_healthy
       redis:
         condition: service_healthy
   ```

4. **For zero-downtime deployments**, use docker-rollout or similar:
   - Scales service to N+1 instances
   - Waits for health check on new instance
   - Removes old instance only after new one healthy
   - Requires `healthcheck.test` in compose file

**Phase:** Phase 1 (Local Dev Environment) - Add health checks to all services BEFORE production deployment

**Sources:**

- [Docker Compose production best practices](https://release.com/blog/6-docker-compose-best-practices-for-dev-and-prod)
- [Zero-downtime deployments with docker-rollout](https://github.com/wowu/docker-rollout)
- [Production deployment guide](https://medium.com/@dataquestio/5-docker-compose-mistakes-that-will-break-your-production-pipeline-and-how-to-fix-them-5afe2ee68927)

---

### CRIT-02: PgBouncer Pool Mode Misconfiguration

**Risk:** PgBouncer has three pool modes (session, transaction, statement) with **drastically different application compatibility**. Transaction pooling (recommended for production) breaks applications using session-level features like prepared statements, temporary tables, or SET commands. Session pooling can hang with high connection concurrency. Using the wrong mode causes production failures that are difficult to debug.

**Warning Signs:**

- "prepared statement does not exist" errors
- Temporary tables not found
- SET variables not persisting
- High CPU on PgBouncer container
- Connection pool exhaustion under load
- Session pooling hangs when many connections open simultaneously

**Prevention:**

1. **Choose transaction pooling for production** (best performance/resource usage):

   ```yaml
   environment:
     PGBOUNCER_POOL_MODE: transaction
     PGBOUNCER_MAX_CLIENT_CONN: 100
     PGBOUNCER_DEFAULT_POOL_SIZE: 20
   ```

2. **Audit application code for incompatible patterns**:
   - **NEVER use** `SET SESSION` or `SET` alone → Use `SET LOCAL` instead
   - **NEVER use** prepared statements directly → Use parameterized queries
   - **Temporary tables** must be created, used, and dropped in same transaction
   - **Advisory locks** don't work in transaction mode

3. **Calculate connection limits carefully**:

   ```
   max_server_connections = max_client_conn + (default_pool_size * num_databases * num_users)
   ```

   - FreshTrack Pro: 100 client + (20 pool _ 1 db _ 1 user) = 120 total
   - Set PostgreSQL `max_connections` to at least 120

4. **Set file descriptor limits** (PgBouncer needs more than max_client_conn):

   ```yaml
   ulimits:
     nofile:
       soft: 4096
       hard: 8192
   ```

5. **Configure appropriate timeouts** (defaults can cause unexpected errors):

   ```yaml
   PGBOUNCER_QUERY_TIMEOUT: 0 # Disabled (let app handle)
   PGBOUNCER_QUERY_WAIT_TIMEOUT: 120 # 2 minutes
   PGBOUNCER_CLIENT_IDLE_TIMEOUT: 0 # Disabled
   ```

6. **Avoid expensive `DISCARD ALL`** as server_reset_query (default):
   - Use `DEALLOCATE ALL` instead for better performance
   - Or configure `server_reset_query = ''` if app doesn't need cleanup

**Phase:** Phase 2 (PgBouncer Setup) - Must audit backend code BEFORE enabling PgBouncer

**Sources:**

- [PgBouncer official configuration](https://www.pgbouncer.org/config.html)
- [Django + PgBouncer pitfalls](https://dev.to/artemooon/django-pgbouncer-in-production-pitfalls-fixes-and-survival-tricks-3jib)
- [PgBouncer session pooling hangs](https://github.com/pgbouncer/pgbouncer/issues/384)
- [Heroku PgBouncer best practices](https://devcenter.heroku.com/articles/best-practices-pgbouncer-configuration)

---

### CRIT-03: Secrets Exposed in Docker Images

**Risk:** The `COPY . .` command doesn't care about secrets - it copies your entire directory including `.env` files, `config.json` with secrets, and SSH keys. **One 2026 incident exposed credentials for 247 days in a public Docker image**. Even with private registries, secrets in image layers persist forever and can be extracted with `docker history`.

**Warning Signs:**

- .env file exists in project root
- No .dockerignore file, or incomplete .dockerignore
- Build logs show "COPY . ." without exclusions
- Environment variables used for sensitive data (DATABASE_URL, API_KEY, etc.)
- Secrets visible in `docker inspect` output
- `docker history` shows secret values in layers

**Prevention:**

1. **Complete .dockerignore BEFORE first build**:

   ```dockerignore
   .env
   .env.*
   *.env
   .git
   secrets/
   credentials.json
   *.pem
   *.key
   node_modules
   .DS_Store
   ```

2. **Use Docker Secrets for production** (NOT environment variables):

   ```yaml
   # docker-compose.production.yml
   secrets:
     postgres_password:
       file: ./secrets/postgres_password.txt

   services:
     postgres:
       secrets:
         - postgres_password
       environment:
         POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
   ```

   - Secrets mounted as files in `/run/secrets/<secret_name>`
   - Not visible in `docker inspect` or process listings
   - Can customize target path with `target` option

3. **For build-time secrets**, use BuildKit secrets:

   ```dockerfile
   # syntax=docker/dockerfile:1
   RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
       npm install
   ```

   ```bash
   docker build --secret id=npmrc,src=.npmrc .
   ```

   - Secrets not persisted in image layers
   - Requires BuildKit (default in Docker 23.0+)

4. **Different strategies for different environments**:
   - **Development:** .env files acceptable (never committed to git)
   - **CI/CD:** GitHub Secrets, GitLab CI/CD Variables
   - **Production:** Docker Secrets, HashiCorp Vault, AWS Secrets Manager

5. **Audit images BEFORE pushing**:

   ```bash
   docker history <image> --no-trunc
   docker inspect <image>
   # Look for exposed secrets
   ```

6. **Scan images for secrets** in CI/CD:
   - GitGuardian, TruffleHog, or similar
   - Prevent images with secrets from reaching production

**Phase:** Phase 1 (Local Dev) - Set up .dockerignore and secrets strategy BEFORE building production images

**Sources:**

- [.env files ended up in Docker images (Jan 2026)](https://aws.plainenglish.io/we-used-env-files-they-ended-up-in-docker-images-1bbf020abbd6)
- [Docker Secrets official docs](https://docs.docker.com/compose/how-tos/use-secrets/)
- [4 Ways to manage secrets in Docker](https://blog.gitguardian.com/how-to-handle-secrets-in-docker/)
- [Docker Secrets guide](https://www.wiz.io/academy/container-security/docker-secrets)

---

### CRIT-04: Using Development Configuration in Production

**Risk:** Docker Compose designed for local development. Using the same docker-compose.yml in production causes **long-term issues difficult to unwind**: volume mounts for live code reloading, development ports exposed, verbose logging, missing restart policies, no resource limits (containers can consume all host resources).

**Warning Signs:**

- Single docker-compose.yml file for all environments
- Volume mounts for application code in production
- `restart: "no"` or missing restart policy
- No CPU/memory limits defined
- Debug logging enabled
- Development ports (5432, 6379, 9000) exposed on host
- `latest` tag used for images

**Prevention:**

1. **Separate compose files for dev/production**:

   ```
   docker-compose.yml              # Base (shared)
   docker-compose.dev.yml          # Development overrides
   docker-compose.production.yml   # Production overrides
   ```

   Usage:

   ```bash
   # Development
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up

   # Production
   docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
   ```

2. **Production-specific changes**:

   ```yaml
   # docker-compose.production.yml
   services:
     api:
       # Pin versions (never use :latest)
       image: frostguard/api:1.0.3

       # Remove volume mounts for code
       # volumes: [] - code baked into image

       # Add restart policy
       restart: unless-stopped

       # Add resource limits
       deploy:
         resources:
           limits:
             cpus: '2.0'
             memory: 2G
           reservations:
             cpus: '1.0'
             memory: 1G

       # Reduce logging verbosity
       environment:
         LOG_LEVEL: info # not debug
         NODE_ENV: production

       # Don't expose internal ports
       # ports: - removed, only via reverse proxy
   ```

3. **Never use `latest` tag**:
   - Unpredictable (points to different versions over time)
   - Breaks reproducibility
   - Always pin: `postgres:15.6-alpine`, `redis:7.2.4-alpine`

4. **Add monitoring/logging in production**:

   ```yaml
   services:
     loki:
       image: grafana/loki:2.9.4

     promtail:
       image: grafana/promtail:2.9.4
       volumes:
         - /var/lib/docker/containers:/var/lib/docker/containers:ro
   ```

5. **Build images for production** (don't build on production server):
   - CI/CD builds images, pushes to registry
   - Production server only pulls and runs
   - Never have git or build tools on production server

**Phase:** Phase 1 (Local Dev) - Create production compose overrides BEFORE any deployment

**Sources:**

- [Docker Compose for production (official docs)](https://docs.docker.com/compose/how-tos/production/)
- [Stop misusing Docker Compose in production](https://dflow.sh/blog/stop-misusing-docker-compose-in-production-what-most-teams-get-wrong)
- [Docker anti-patterns](https://codefresh.io/blog/docker-anti-patterns/)

---

### CRIT-05: Volume Data Loss or Corruption

**Risk:** Named volumes persist data but are **vulnerable to accidental deletion, backup failures, or permission issues**. Anonymous volumes created implicitly can persist even after container removal. PostgreSQL data corruption during unexpected container crashes. For FreshTrack Pro, losing sensor readings violates "zero data loss" constraint.

**Warning Signs:**

- Using anonymous volumes (no explicit `volumes:` section)
- No backup strategy for volumes
- Volumes deleted during `docker compose down -v`
- Permission errors accessing volume data
- Database crashes during container stops
- No volume snapshots/backups in disaster recovery plan

**Prevention:**

1. **Always use named volumes** (not anonymous):

   ```yaml
   volumes:
     postgres_data:
       name: frostguard_postgres_data
       # driver: local (default)
       # driver_opts: - for advanced options
   ```

2. **NEVER use `docker compose down -v` in production**:

   ```bash
   # DANGER - deletes all volumes
   docker compose down -v

   # SAFE - stops containers, keeps volumes
   docker compose down
   docker compose stop
   ```

3. **Implement automated volume backups**:

   ```yaml
   # Backup service
   backup:
     image: postgres:15-alpine
     volumes:
       - postgres_data:/var/lib/postgresql/data:ro
       - ./backups:/backups
     command: |
       sh -c 'while true; do
         pg_dump -U frostguard -F c -f /backups/backup_$(date +%Y%m%d_%H%M%S).dump frostguard
         sleep 86400
       done'
   ```

4. **Backup strategy for multi-target deployment**:
   - **AWS:** Use EBS snapshots, RDS automated backups
   - **DigitalOcean:** Volume snapshots, managed database backups
   - **Self-hosted:** Cron jobs with `pg_dump`, rsync to remote storage

5. **Test backup restoration regularly**:

   ```bash
   # Restore test
   docker compose exec -T postgres pg_restore -U frostguard -d frostguard_test /backups/backup.dump
   ```

6. **Set proper volume permissions**:
   - Volumes inherit permissions from first container
   - Set ownership explicitly in Dockerfile:
     ```dockerfile
     RUN chown -R postgres:postgres /var/lib/postgresql/data
     ```

7. **For PostgreSQL, use proper shutdown**:
   ```yaml
   postgres:
     stop_signal: SIGTERM
     stop_grace_period: 30s # Allow time for checkpoint
   ```

**Phase:** Phase 1 (Local Dev) - Implement backup strategy, Phase 3+ (Multi-target deployment) - Deploy backup automation

**Sources:**

- [Docker Compose volumes guide](https://compose-it.top/posts/docker-compose-volumes)
- [Docker Postgres backup/restore](https://simplebackups.com/blog/docker-postgres-backup-restore-guide-with-examples/)
- [PostgreSQL Docker upgrade guide](https://www.virendrachandak.com/techtalk/postgresql-18-docker-upgrade-dump-and-restore-method/)

---

### CRIT-06: SSL/TLS Certificate Failures

**Risk:** Self-signed certificates in production trigger browser warnings. Let's Encrypt certificates expire every 90 days - without automated renewal, production goes down. Certificate path misconfigurations in nginx prevent HTTPS. Docker TLS errors block container registry access. For FreshTrack Pro, failed SSL = users can't access monitoring dashboard.

**Warning Signs:**

- Browser "Your connection is not private" warnings
- Certificate expiration warnings in logs
- 502 Bad Gateway from nginx after certificate renewal
- `TLS handshake failed` errors
- Environment variables `DOCKER_TLS_VERIFY`, `DOCKER_CERT_PATH` causing issues
- nginx config references wrong certificate paths

**Prevention:**

1. **Use Let's Encrypt + Certbot for production**:

   ```yaml
   # docker-compose.production.yml
   certbot:
     image: certbot/certbot:latest
     volumes:
       - ./certbot/conf:/etc/letsencrypt
       - ./certbot/www:/var/www/certbot
     command: certonly --webroot -w /var/www/certbot --email admin@example.com -d example.com --agree-tos --no-eff-email

   nginx:
     image: nginx:alpine
     volumes:
       - ./nginx/conf.d:/etc/nginx/conf.d:ro
       - ./certbot/conf:/etc/letsencrypt:ro
       - ./certbot/www:/var/www/certbot:ro
     ports:
       - '80:80'
       - '443:443'
   ```

2. **Automate certificate renewal**:

   ```yaml
   certbot-renew:
     image: certbot/certbot:latest
     volumes:
       - ./certbot/conf:/etc/letsencrypt
       - ./certbot/www:/var/www/certbot
     entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
   ```

3. **Configure nginx for HTTPS with proper paths**:

   ```nginx
   server {
     listen 443 ssl;
     server_name example.com;

     ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
     ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

     # Modern SSL configuration
     ssl_protocols TLSv1.2 TLSv1.3;
     ssl_prefer_server_ciphers off;

     # HSTS
     add_header Strict-Transport-Security "max-age=31536000" always;
   ```

4. **HTTP to HTTPS redirect**:

   ```nginx
   server {
     listen 80;
     server_name example.com;

     location /.well-known/acme-challenge/ {
       root /var/www/certbot;
     }

     location / {
       return 301 https://$host$request_uri;
     }
   }
   ```

5. **Network configuration pitfalls**:
   - 90% of proxy failures are network misconfigurations
   - Ensure backend containers on same Docker network:
     ```yaml
     networks:
       default:
         name: frostguard_network
     ```
   - Use service names (not localhost) for inter-container communication

6. **Certificate file extensions matter**:
   - `.crt` files = CA certificates
   - `.cert` files = client certificates
   - Wrong extension causes Docker TLS errors

7. **For self-hosted, different SSL strategies**:
   - **Domain name:** Let's Encrypt (free, automated)
   - **IP address only:** Self-signed (accept browser warning) or internal CA
   - **Corporate network:** Use organization's CA certificates

**Phase:** Phase 4+ (Cloud/Self-hosted Deployment) - Must configure SSL before production cutover

**Sources:**

- [Nginx reverse proxy with Docker Compose](https://gcore.com/learning/reverse-proxy-with-docker-compose)
- [Secure reverse proxy with Certbot](https://medium.com/@dinusai05/setting-up-a-secure-reverse-proxy-with-https-using-docker-compose-nginx-and-certbot-lets-encrypt-cfd012c53ca0)
- [Docker certificate verification errors](https://github.com/docker/compose/issues/7675)
- [SSL with Docker images using nginx](https://gist.github.com/dahlsailrunner/679e6dec5fd769f30bce90447ae80081)

---

## Medium Priority Pitfalls

### MED-01: Inadequate Monitoring and Logging

**Risk:** Deploying without monitoring makes troubleshooting difficult. No visibility into container performance, database queries, or alert pipeline. For IoT monitoring system, **you can't monitor the monitors**.

**Warning Signs:**

- No centralized logging (searching logs across containers manually)
- No metrics collection (CPU, memory, disk usage unknown)
- No application performance monitoring (slow queries undetected)
- No uptime monitoring (only know system down when users complain)

**Prevention:**

- Add Prometheus + Grafana for metrics
- Add Loki + Promtail for log aggregation
- Add Uptime Kuma for external monitoring
- Instrument application with structured logging (Winston, Pino)
- FreshTrack Pro v1.0 already has this in docker/docker-compose.yml - ensure it's deployed

**Phase:** Phase 1 (Local Dev) - Set up monitoring stack early, Phase 4+ (Production) - Deploy to all targets

**Sources:**

- [Production deployment checklist (Azure IoT Edge)](https://medium.com/@QuarkAndCode/production-edge-deployment-checklist-azure-iot-edge-security-edge-ai-bca6352387a0)
- [IoT monitoring challenges](https://www.netdata.cloud/blog/iot-monitoring-challenges/)

---

### MED-02: Database Migration Downtime Not Tested

**Risk:** PostgreSQL migrations can take hours for large databases. Traditional dump/restore causes long downtime. For FreshTrack Pro, 4-hour freeze window target may be missed without testing.

**Warning Signs:**

- Migration never tested with production-sized dataset
- No migration time estimates
- No rollback plan
- pg_dump/pg_restore commands never benchmarked

**Prevention:**

- Test migration with production-sized data in staging
- Benchmark pg_dump and pg_restore times
- For near-zero downtime, use logical replication:
  - Physical replication (streaming) creates live clone
  - Sync in real-time
  - Quick cutover
- Have rollback plan ready (DNS switch back)

**Phase:** Phase 5 (Production Cutover Planning)

**Sources:**

- [100 GB PostgreSQL migration with near-zero downtime](https://medium.com/@sadam21x/how-i-migrated-a-100-gb-postgresql-database-with-near-zero-downtime-3fd99c6268e8)
- [PostgreSQL Docker backup/restore](https://simplebackups.com/blog/docker-postgres-backup-restore-guide-with-examples/)

---

### MED-03: Missing Resource Limits

**Risk:** Containers without CPU/memory limits can overconsume resources, causing host system instability. One container's memory leak crashes entire server.

**Warning Signs:**

- No `deploy.resources` limits in compose file
- Container using 100% CPU during normal operation
- OOM killer terminating containers
- Host system becoming unresponsive

**Prevention:**

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

**Phase:** Phase 1 (Local Dev) - Add limits to production compose file

**Sources:**

- [Docker anti-patterns](https://medium.com/@mehar.chand.cloud/docker-10-anti-patterns-what-to-avoid-980fa13d8951)

---

### MED-04: Running Containers as Root

**Risk:** Security vulnerability. If attacker escapes container, they have root on host system.

**Warning Signs:**

- No `USER` instruction in Dockerfile
- Container processes running as UID 0
- `docker inspect` shows User: ""

**Prevention:**

```dockerfile
# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
```

**Phase:** Phase 1 (Local Dev) - Update Dockerfiles before production

**Sources:**

- [Container anti-patterns](https://dev.to/idsulik/container-anti-patterns-common-docker-mistakes-and-how-to-avoid-them-4129)

---

### MED-05: No Deployment Testing in Staging

**Risk:** Production is first time full deployment tested. Networking issues, missing environment variables, or configuration errors discovered when users are watching.

**Warning Signs:**

- No staging environment
- Deployment steps not documented
- Different process for each deployment target (AWS, DigitalOcean, self-hosted)

**Prevention:**

- Create staging environment identical to production
- Test full deployment procedure in staging first
- Document every step in runbooks
- For IoT edge deployments, "just ship it" strategy fails - test in realistic conditions

**Phase:** Phase 4+ (Deployment) - Deploy to staging BEFORE production

**Sources:**

- [Production edge deployment checklist](https://medium.com/@QuarkAndCode/production-edge-deployment-checklist-azure-iot-edge-security-edge-ai-bca6352387a0)
- [IoT deployment challenges](https://www.itconvergence.com/blog/why-most-iot-deployments-fail-and-how-testing-fixes-it)

---

## Low Priority / Nice-to-Know

### LOW-01: Image Size Bloat

**Risk:** Large images slow deployments, increase storage costs, expand attack surface.

**Prevention:**

- Use Alpine base images where possible
- Multi-stage builds to exclude build tools
- .dockerignore to exclude unnecessary files

**Phase:** Phase 1 (optimization)

---

### LOW-02: Missing .dockerignore

**Risk:** Build context includes node_modules, .git, etc. Slows builds, increases image size.

**Prevention:**

```dockerignore
node_modules
.git
.env*
*.md
.DS_Store
```

**Phase:** Phase 1 (Local Dev)

---

### LOW-03: Not Using Docker BuildKit

**Risk:** Missing modern Docker features: build secrets, cache mounts, concurrent build stages.

**Prevention:**

```bash
export DOCKER_BUILDKIT=1
# Or in docker-compose.yml
export COMPOSE_DOCKER_CLI_BUILD=1
```

**Phase:** Phase 1 (optimization)

---

## Phase-Specific Warnings

| Phase Topic            | Likely Pitfall                        | Mitigation                                                    |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------- |
| Local Dev Environment  | CRIT-04: Using dev config in prod     | Create docker-compose.production.yml with overrides           |
| Local Dev Environment  | CRIT-03: Secrets in images            | Add .dockerignore, implement Docker Secrets                   |
| PgBouncer Setup        | CRIT-02: Transaction mode breaks app  | Audit backend code for prepared statements, SET commands      |
| PgBouncer Setup        | Connection exhaustion                 | Calculate limits: max*client + (pool * dbs \_ users)          |
| Cloud Deployment (AWS) | CRIT-06: SSL certificate expiry       | Use Let's Encrypt + Certbot with auto-renewal                 |
| Cloud Deployment (AWS) | CRIT-05: EBS volume backups missing   | Enable automated EBS snapshots                                |
| Cloud Deployment (DO)  | CRIT-06: SSL on managed database      | Use DigitalOcean certificates, update connection strings      |
| Self-Hosted Deployment | CRIT-05: No backup automation         | Implement cron jobs for pg_dump + rsync                       |
| Self-Hosted Deployment | MED-01: No monitoring                 | Deploy Prometheus/Grafana/Uptime Kuma                         |
| Production Cutover     | MED-02: Migration time exceeds window | Test with production-sized data, consider logical replication |
| All Phases             | CRIT-01: Zero downtime impossible     | Add health checks early, use docker-rollout for deployments   |

---

## Confidence Assessment

| Area                      | Confidence | Reason                                                   |
| ------------------------- | ---------- | -------------------------------------------------------- |
| Docker Compose Production | HIGH       | Official Docker docs + multiple recent (2026) articles   |
| PgBouncer Configuration   | HIGH       | Official pgbouncer.org docs + production war stories     |
| Secrets Management        | HIGH       | Official Docker docs + recent (Jan 2026) incident report |
| SSL/TLS Setup             | MEDIUM     | Multiple guides but nginx config varies by setup         |
| Volume Backups            | MEDIUM     | General strategies verified, but tool-specific           |
| IoT Monitoring Specifics  | MEDIUM     | Industry best practices, not FreshTrack-specific         |

---

## Sources

### Critical Pitfalls

- [Docker Compose Best Practices (2026)](https://release.com/blog/6-docker-compose-best-practices-for-dev-and-prod)
- [5 Docker Compose Mistakes That Break Production](https://dataquestio.medium.com/5-docker-compose-mistakes-that-will-break-your-production-pipeline-and-how-to-fix-them-5afe2ee68927)
- [Docker Compose Production Guide (Official)](https://docs.docker.com/compose/how-tos/production/)
- [Zero Downtime with docker-rollout](https://github.com/wowu/docker-rollout)
- [PgBouncer Configuration (Official)](https://www.pgbouncer.org/config.html)
- [Django + PgBouncer Pitfalls](https://dev.to/artemooon/django-pgbouncer-in-production-pitfalls-fixes-and-survival-tricks-3jib)
- [.env Files Ended Up in Docker Images (Jan 2026)](https://aws.plainenglish.io/we-used-env-files-they-ended-up-in-docker-images-1bbf020abbd6)
- [Docker Secrets (Official)](https://docs.docker.com/compose/how-tos/use-secrets/)
- [4 Ways to Manage Secrets in Docker](https://blog.gitguardian.com/how-to-handle-secrets-in-docker/)
- [Docker Compose Volumes Guide](https://compose-it.top/posts/docker-compose-volumes)
- [Postgres Backup/Restore in Docker](https://simplebackups.com/blog/docker-postgres-backup-restore-guide-with-examples/)
- [Nginx Reverse Proxy with Docker Compose](https://gcore.com/learning/reverse-proxy-with-docker-compose)
- [Certbot + Nginx HTTPS Setup](https://medium.com/@dinusai05/setting-up-a-secure-reverse-proxy-with-https-using-docker-compose-nginx-and-certbot-lets-encrypt-cfd012c53ca0)

### Medium Priority

- [Production Edge Deployment Checklist](https://medium.com/@QuarkAndCode/production-edge-deployment-checklist-azure-iot-edge-security-edge-ai-bca6352387a0)
- [IoT Monitoring Challenges](https://www.netdata.cloud/blog/iot-monitoring-challenges/)
- [100 GB PostgreSQL Migration Near-Zero Downtime](https://medium.com/@sadam21x/how-i-migrated-a-100-gb-postgresql-database-with-near-zero-downtime-3fd99c6268e8)
- [Docker Anti-Patterns](https://medium.com/@mehar.chand.cloud/docker-10-anti-patterns-what-to-avoid-980fa13d8951)
- [Container Anti-Patterns](https://dev.to/idsulik/container-anti-patterns-common-docker-mistakes-and-how-to-avoid-them-4129)
- [IoT Deployment Testing](https://www.itconvergence.com/blog/why-most-iot-deployments-fail-and-how-testing-fixes-it)

### Supporting References

- [Stop Misusing Docker Compose in Production](https://dflow.sh/blog/stop-misusing-docker-compose-in-production-what-most-teams-get-wrong)
- [Heroku PgBouncer Best Practices](https://devcenter.heroku.com/articles/best-practices-pgbouncer-configuration)
- [PgBouncer Session Pooling Hangs](https://github.com/pgbouncer/pgbouncer/issues/384)
- [Docker Secrets Guide](https://www.wiz.io/academy/container-security/docker-secrets)
- [PostgreSQL Docker Upgrade](https://www.virendrachandak.com/techtalk/postgresql-18-docker-upgrade-dump-and-restore-method/)
- [SSL with Docker + nginx](https://gist.github.com/dahlsailrunner/679e6dec5fd769f30bce90447ae80081)
- [Docker Certificate Errors](https://github.com/docker/compose/issues/7675)

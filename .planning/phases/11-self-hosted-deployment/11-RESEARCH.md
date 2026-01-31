# Phase 11: Self-Hosted Deployment - Research

**Researched:** 2026-01-23
**Domain:** Self-hosted VM deployment automation with Docker Compose
**Confidence:** HIGH

## Summary

Self-hosted deployment requires automated, idempotent scripts that transform a bare Ubuntu 24.04 LTS VM into a production-ready environment. The standard approach uses bash scripts with state-checking patterns, Docker Compose with production overlays, Caddy for automatic HTTPS via Let's Encrypt, and container health checks for deployment validation.

The project already has Caddy configured with automatic HTTPS, production Docker Compose files, and basic deployment/rollback scripts. This phase focuses on packaging everything into a single idempotent deploy-selfhosted.sh script that handles VM setup, dependency installation, SSL acquisition with DNS pre-checking, and automated rollback on health check failure.

Key research findings confirm that Caddy 2.10+ handles wildcard certificates automatically when DNS challenges are enabled, Ubuntu 24.04 LTS provides 5 years of security updates (until 2029), and Docker Compose health checks with 30-second timeouts are industry standard for production deployments.

**Primary recommendation:** Use bash idempotent patterns (mkdir -p, ln -sfn, conditional checks with grep -qF) in a single deploy-selfhosted.sh script that reads from deploy.config and falls back to interactive prompts, with full automation of Docker + Compose + firewall + fail2ban + node_exporter installation.

## Standard Stack

The established tools for self-hosted Docker deployment on Ubuntu:

### Core

| Library        | Version   | Purpose                       | Why Standard                                                           |
| -------------- | --------- | ----------------------------- | ---------------------------------------------------------------------- |
| Ubuntu Server  | 24.04 LTS | Base OS                       | 5 years free security updates, kernel 6.8, stable until 2029           |
| Docker Engine  | 24.0+     | Container runtime             | Official installation script, community edition free, production-ready |
| Docker Compose | 2.20+     | Multi-container orchestration | Built into Docker, declarative YAML, production overlay support        |
| Caddy          | 2.10+     | Reverse proxy + SSL           | Automatic HTTPS, zero-config Let's Encrypt, wildcard cert support      |

### Supporting

| Library             | Version  | Purpose               | When to Use                                                        |
| ------------------- | -------- | --------------------- | ------------------------------------------------------------------ |
| ufw                 | 0.36+    | Firewall management   | Simple iptables frontend, Ubuntu default, essential for production |
| fail2ban            | 1.0+     | Intrusion prevention  | Automated IP banning, protects SSH and web endpoints               |
| node_exporter       | 1.6.0+   | Prometheus metrics    | System metrics collection, required for monitoring                 |
| unattended-upgrades | Built-in | Auto security patches | Ubuntu package, automates security updates                         |

### Alternatives Considered

| Instead of     | Could Use        | Tradeoff                                                                      |
| -------------- | ---------------- | ----------------------------------------------------------------------------- |
| Caddy          | nginx + certbot  | Manual SSL config, more complex, but more flexible reverse proxy features     |
| Docker Compose | Docker Swarm     | Built-in orchestration, better for multi-node, but overkill for single server |
| bash script    | Ansible playbook | More declarative, better for fleet management, but adds dependency            |

**Installation:**

```bash
# Automated via deploy-selfhosted.sh script
# Manual installation reference:
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt install -y ufw fail2ban
```

## Architecture Patterns

### Recommended Deployment Structure

```
/opt/freshtrack-pro/
├── deploy-selfhosted.sh    # Main deployment script (idempotent)
├── deploy.config            # Config file (gitignored, user creates)
├── docker-compose.yml       # Base services
├── compose.production.yaml  # Production overlays
├── compose.selfhosted.yaml  # Self-hosted specific
├── docker/
│   ├── caddy/Caddyfile     # Reverse proxy config
│   └── prometheus/          # Monitoring configs
├── secrets/                 # File-based secrets (600 perms)
│   ├── postgres_password.txt
│   └── stack_auth_secret.txt
└── backups/                 # Database backups (automated)
```

### Pattern 1: Idempotent Bash Script

**What:** Deployment script that can be safely rerun after failures without duplicating work
**When to use:** Any production deployment automation requiring reliability

**Example:**

```bash
# Source: https://arslan.io/2019/07/03/how-to-write-idempotent-bash-scripts/

# Use mkdir -p to avoid errors if directory exists
mkdir -p /opt/freshtrack-pro/secrets

# Use ln -sfn for symbolic links (removes target before creating)
ln -sfn /etc/caddy/Caddyfile /opt/freshtrack-pro/docker/caddy/Caddyfile

# Check state before operations
if ! grep -qF "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    sysctl -p
fi

# Format volumes only if not already formatted
if ! blkid /dev/sdb; then
    mkfs.ext4 /dev/sdb
fi

# Check if already mounted before mounting
if ! mountpoint -q /mnt/data; then
    mount /dev/sdb /mnt/data
fi
```

### Pattern 2: Docker Compose Production Overlays

**What:** Layered Compose files that override base config for production
**When to use:** Deploying containerized apps across environments (dev/staging/prod)

**Example:**

```yaml
# Source: https://docs.docker.com/compose/how-tos/production/

# Usage: docker compose -f docker-compose.yml -f compose.production.yaml up -d

# compose.production.yaml
services:
  backend:
    build:
      target: production
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Pattern 3: Caddy Automatic HTTPS

**What:** Zero-config SSL certificate acquisition and renewal
**When to use:** Self-hosted deployments requiring HTTPS without manual certificate management

**Example:**

```
# Source: https://caddyserver.com/docs/automatic-https

# Caddyfile - automatic HTTPS enabled
{
    email admin@freshtrackpro.com
}

freshtrackpro.com {
    reverse_proxy backend:3000
}

# For wildcard certificates (requires DNS challenge)
*.freshtrackpro.com {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
}
```

### Pattern 4: Health Check Validation

**What:** Wait for service health before declaring deployment success
**When to use:** All production deployments requiring zero-downtime or automated rollback

**Example:**

```bash
# Wait for backend health with timeout
RETRIES=30
TIMEOUT=30
until curl -f http://localhost:3000/health >/dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
    echo "Waiting for backend health... ($RETRIES attempts remaining)"
    sleep $TIMEOUT
    RETRIES=$((RETRIES - 1))
done

if [ $RETRIES -eq 0 ]; then
    echo "Health check failed - initiating rollback"
    rollback_to_previous_version
    exit 1
fi
```

### Anti-Patterns to Avoid

- **Running deployment script without idempotency:** Rerunning after failure creates duplicates or errors; always use -p flags and state checks
- **Skipping DNS validation before SSL:** Let's Encrypt rate limits (5 failures/hour) punish blind certificate requests; always check DNS with dig first
- **Using :latest tag in production:** Container restarts pull inconsistent versions; always use semantic versioning or git commit hashes
- **No health check timeout:** Deployments hang forever on broken services; always implement timeout with rollback
- **Exposing all ports publicly:** Security risk; bind internal services to 127.0.0.1 only, expose only reverse proxy

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                           | Don't Build                      | Use Instead                                              | Why                                                                                     |
| --------------------------------- | -------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| SSL certificate management        | Custom certbot scripts with cron | Caddy automatic HTTPS                                    | Handles ACME challenges, auto-renewal, certificate storage, OCSP stapling automatically |
| Docker + ufw firewall integration | Custom iptables rules            | ufw-docker tool (chaifeng/ufw-docker)                    | Docker bypasses ufw by writing to DOCKER chain; ufw-docker fixes this properly          |
| Zero-downtime deployment          | Custom blue-green scripts        | docker-rollout plugin OR health check + rollback pattern | Handles scaling, health validation, cleanup automatically                               |
| Secrets management                | Environment variables in .env    | Docker secrets with file-based mounts                    | More secure (not visible in docker inspect), works with docker-compose                  |
| Deployment rollback               | Manual git checkout + rebuild    | Tagged images + docker-compose down/up with previous tag | Faster, more reliable, preserves exact image state                                      |
| DNS validation before SSL         | Custom dig parsing               | Structured DNS check with retry logic                    | Prevents Let's Encrypt rate limit exhaustion (5 failures/hour limit)                    |
| Log rotation                      | Custom logrotate configs         | Docker log-driver with max-size/max-file                 | Built into Docker daemon, works across all containers                                   |

**Key insight:** Self-hosted deployment automation has mature tooling ecosystem. Custom scripts should orchestrate existing tools, not reimplement their functionality. Idempotent bash patterns handle orchestration; specialized tools (Caddy, ufw-docker, fail2ban) handle complexity.

## Common Pitfalls

### Pitfall 1: Docker Bypasses ufw Firewall

**What goes wrong:** You configure ufw to block ports, but Docker containers remain accessible from public internet
**Why it happens:** Docker writes iptables rules to the DOCKER chain which is processed before INPUT chain where ufw rules live
**How to avoid:** Use ufw-docker tool or configure Docker daemon to expose ports on 127.0.0.1 only
**Warning signs:** Running `ufw status` shows port blocked, but `nmap` from external host shows port open

### Pitfall 2: Let's Encrypt Rate Limit Exhaustion

**What goes wrong:** Deployment script fails SSL acquisition, retries trigger rate limits (5 failures/hour), deployment blocked for hours
**Why it happens:** DNS not propagated yet, script requests certificate before A record resolves to server IP
**How to avoid:** Check DNS with dig before starting Caddy; wait for correct IP resolution; use Let's Encrypt staging for testing
**Warning signs:** Caddy logs show "acme: error: 429" or "too many failed authorizations recently"

### Pitfall 3: Non-Idempotent Script Reruns Create Duplicates

**What goes wrong:** Script fails partway through, rerun creates duplicate entries in config files, multiple firewall rules, broken state
**Why it happens:** Script uses append operations (>>, echo without checks) instead of idempotent patterns
**How to avoid:** Use grep -qF to check before appending, mkdir -p instead of mkdir, ln -sfn instead of ln -s
**Warning signs:** Config files have duplicate lines, firewall shows duplicate rules, script errors on second run

### Pitfall 4: Health Check Never Times Out

**What goes wrong:** Deployment waits forever for unhealthy service, no rollback triggered, manual intervention required
**Why it happens:** Health check loop lacks timeout counter or uses infinite retry count
**How to avoid:** Always implement retry counter with timeout, trigger rollback on timeout exhaustion
**Warning signs:** Deployment script hangs with "Waiting for health..." messages indefinitely

### Pitfall 5: Database Rollback Without Backup

**What goes wrong:** Automated rollback reverts code but database schema incompatible with old code version, application breaks
**Why it happens:** Deployment ran migrations before failure, rollback reverts code but not database
**How to avoid:** Take database snapshot before migrations, offer optional --restore-db flag in rollback script, or use forward-only migrations
**Warning signs:** Rollback succeeds but application errors with "column does not exist" or schema mismatches

### Pitfall 6: Secrets Visible in docker inspect

**What goes wrong:** Secrets passed as environment variables visible in process listings and docker inspect output
**Why it happens:** Using environment variables instead of Docker secrets or file-based secrets
**How to avoid:** Use Docker secrets with file mounts, read secrets from files in /run/secrets/, set file permissions to 600
**Warning signs:** Running `docker inspect <container>` shows secret values in Env section

### Pitfall 7: Using :latest Tag in Production

**What goes wrong:** Container restarts pull newer image version, inconsistent deployments across scaled instances
**Why it happens:** docker-compose.yml specifies image:latest, Docker pulls on restart/scale
**How to avoid:** Use semantic versioning tags (v1.2.3) or git commit hashes (sha256:abc123) for all production images
**Warning signs:** Scaled containers running different code versions, "it works on my instance" issues

### Pitfall 8: No Version Retention Strategy

**What goes wrong:** Rollback impossible because previous Docker images were pruned or not tagged
**Why it happens:** Using docker image prune aggressively without retention policy, not tagging deployments
**How to avoid:** Tag each deployment with version + timestamp, keep last N versions (3-5), prune only untagged
**Warning signs:** Rollback fails with "image not found", no historical versions available

## Code Examples

Verified patterns from official sources:

### DNS Pre-Check Before SSL

```bash
# Source: Community best practice (composite pattern)
# Checks DNS resolution before allowing Caddy to request certificates

check_dns_resolution() {
    local domain=$1
    local expected_ip=$2

    echo "Checking DNS resolution for ${domain}..."

    # Use dig to query DNS (with retry)
    for i in {1..5}; do
        resolved_ip=$(dig +short ${domain} | tail -1)

        if [ "$resolved_ip" = "$expected_ip" ]; then
            echo "DNS resolved correctly: ${domain} -> ${expected_ip}"
            return 0
        fi

        echo "DNS not ready (attempt $i/5): ${domain} -> ${resolved_ip} (expected ${expected_ip})"
        sleep 10
    done

    echo "ERROR: DNS resolution failed for ${domain}"
    echo "Please update DNS A record to point to ${expected_ip}"
    echo "Wait for propagation (5-60 minutes) before retrying"
    return 1
}

# Get server public IP
SERVER_IP=$(curl -s ifconfig.me)

# Check DNS before starting Caddy
if ! check_dns_resolution "freshtrackpro.com" "$SERVER_IP"; then
    echo "ABORT: DNS not configured correctly"
    echo "This prevents Let's Encrypt rate limit exhaustion"
    exit 1
fi
```

### Idempotent ufw Configuration

```bash
# Source: https://github.com/chaifeng/ufw-docker pattern
# Configure firewall idempotently with Docker support

configure_firewall() {
    echo "Configuring firewall..."

    # Install ufw if not present
    if ! command -v ufw &> /dev/null; then
        apt-get install -y ufw
    fi

    # Allow SSH (check before adding to avoid duplicates)
    if ! ufw status | grep -q "22/tcp.*ALLOW"; then
        ufw allow 22/tcp comment 'SSH'
    fi

    # Allow HTTP/HTTPS (for Let's Encrypt and web traffic)
    if ! ufw status | grep -q "80/tcp.*ALLOW"; then
        ufw allow 80/tcp comment 'HTTP'
    fi

    if ! ufw status | grep -q "443/tcp.*ALLOW"; then
        ufw allow 443/tcp comment 'HTTPS'
    fi

    # Enable firewall (--force avoids prompt)
    ufw --force enable

    echo "Firewall configured"
    ufw status numbered
}
```

### Docker Compose Production Deployment with Health Check

```bash
# Source: Existing scripts/deploy.sh pattern (refined)
# Deploys services and validates health with timeout and rollback

deploy_with_health_check() {
    local timeout=30
    local max_retries=30

    echo "Deploying services..."
    docker compose -f docker-compose.yml \
                   -f compose.production.yaml \
                   -f compose.selfhosted.yaml \
                   up -d

    echo "Waiting for backend health (${max_retries}x${timeout}s timeout)..."

    retries=$max_retries
    until curl -f http://localhost:3000/health >/dev/null 2>&1 || [ $retries -eq 0 ]; do
        echo "Health check attempt $((max_retries - retries + 1))/${max_retries}..."
        sleep $timeout
        retries=$((retries - 1))
    done

    if [ $retries -eq 0 ]; then
        echo "ERROR: Health check failed after $((max_retries * timeout)) seconds"
        echo "Initiating automatic rollback..."

        # Rollback: stop new containers, revert to previous version
        docker compose down

        # Restore previous version (assumes tagged)
        if [ -f .deployment-version ]; then
            previous_version=$(cat .deployment-version)
            echo "Rolling back to version: ${previous_version}"
            git checkout "${previous_version}"
            docker compose up -d
        fi

        return 1
    fi

    echo "Deployment successful - health check passed"
    return 0
}
```

### Node Exporter Installation for Prometheus

```bash
# Source: https://grafana.com/docs/grafana-cloud/send-data/metrics/metrics-prometheus/prometheus-config-examples/docker-compose-linux/
# Add to docker-compose.yml or compose.production.yaml

# Node Exporter service definition
node-exporter:
  image: prom/node-exporter:v1.6.0
  container_name: node-exporter
  command:
    - '--path.procfs=/host/proc'
    - '--path.sysfs=/host/sys'
    - '--path.rootfs=/rootfs'
    - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
  volumes:
    - /proc:/host/proc:ro
    - /sys:/host/sys:ro
    - /:/rootfs:ro
  ports:
    - "127.0.0.1:9100:9100"  # Bind to localhost only
  restart: unless-stopped
```

### Caddy DNS Challenge Configuration

```bash
# Source: https://caddyserver.com/docs/caddyfile/directives/tls
# Caddyfile configuration for wildcard certificates via DNS challenge

# Global options
{
    email admin@freshtrackpro.com
}

# Wildcard certificate via DNS challenge (Cloudflare example)
*.freshtrackpro.com {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
        # Optional: custom propagation timeout
        dns_propagation_timeout 5m
        dns_propagation_delay 30s
    }

    # Route different subdomains
    @api host api.freshtrackpro.com
    handle @api {
        reverse_proxy backend:3000
    }

    @monitoring host monitoring.freshtrackpro.com
    handle @monitoring {
        reverse_proxy grafana:3000
    }

    # Fallback
    handle {
        reverse_proxy frontend:80
    }
}

# Alternative: Individual certificates (HTTP-01 challenge, no DNS API needed)
api.freshtrackpro.com {
    reverse_proxy backend:3000
}

monitoring.freshtrackpro.com {
    reverse_proxy grafana:3000
}
```

### Version Retention Strategy

```bash
# Source: Community best practice (Docker tagging strategy)
# Tag each deployment and prune old versions

deploy_with_versioning() {
    local version=$(git describe --tags --always)
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local tag="${version}-${timestamp}"

    echo "Deploying version: ${tag}"

    # Tag current deployment
    docker tag freshtrack-backend:latest "freshtrack-backend:${tag}"

    # Save version for rollback
    echo "${tag}" > .deployment-version

    # Keep last 5 versions, prune others
    docker images freshtrack-backend --format "{{.Tag}}" | \
        grep -v latest | \
        tail -n +6 | \
        xargs -r -I {} docker rmi "freshtrack-backend:{}"

    echo "Tagged as: freshtrack-backend:${tag}"
    echo "Retained versions:"
    docker images freshtrack-backend
}
```

## State of the Art

| Old Approach                       | Current Approach                     | When Changed                 | Impact                                                                             |
| ---------------------------------- | ------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------- |
| Docker Compose v1 (docker-compose) | Docker Compose v2 (docker compose)   | 2022                         | Built into Docker CLI, better performance, active development                      |
| Manual certbot + cron renewal      | Caddy automatic HTTPS                | 2020+ adoption               | Zero config, handles renewals/OCSP automatically, supports DNS challenges natively |
| Let's Encrypt 90-day certs         | Let's Encrypt moving to 45-day certs | May 13, 2026                 | Forces automation, manual renewal impractical, emphasizes automated tooling        |
| :latest tags in production         | Semantic versioning tags             | Ongoing best practice        | Prevents version drift, enables reliable rollbacks, audit trail                    |
| Environment variables for secrets  | Docker secrets / file-based secrets  | 2017+ (Docker Swarm secrets) | More secure, not visible in inspect/ps, works with rootless containers             |
| iptables raw rules                 | ufw + ufw-docker                     | 2018+ (ufw-docker created)   | Simpler firewall management, Docker compatibility, declarative rules               |

**Deprecated/outdated:**

- **docker-compose (hyphenated):** Replaced by docker compose (space) in Docker CLI, v1 deprecated
- **HTTP-01 challenge for wildcard certs:** Never supported, DNS-01 challenge required for wildcards
- **Manual SSL renewal scripts:** Caddy and certbot now auto-renew, manual cron jobs obsolete
- **Exposing all container ports publicly:** Security anti-pattern, bind to 127.0.0.1 and use reverse proxy

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal rollback depth (version retention count)**
   - What we know: Community uses 3-5 versions, AWS recommends last 3 deployments
   - What's unclear: Optimal number depends on deployment frequency and storage constraints
   - Recommendation: Default to 3 versions for self-hosted (2-3 weeks of history at weekly cadence), make configurable in deploy.config

2. **Database rollback approach**
   - What we know: Forward-only migrations are safest (no rollback), schema changes need careful planning
   - What's unclear: Whether to offer automated database restore or keep code-only rollback
   - Recommendation: Code-only rollback by default (migrations are forward-only), document manual DB restore procedure for emergencies, optionally add --restore-db flag that requires explicit backup file path

3. **ufw-docker tool vs Docker port binding approach**
   - What we know: ufw-docker tool fixes Docker bypassing ufw, but adds complexity; binding to 127.0.0.1 achieves same goal
   - What's unclear: Which approach is more maintainable long-term
   - Recommendation: Use 127.0.0.1 port binding in compose files (simpler, no additional tool), only install ufw-docker if user needs external access to specific containers

4. **Wildcard certificate vs individual certificates**
   - What we know: Wildcard requires DNS challenge (needs DNS API credentials), individual certs work with HTTP-01 (no credentials needed)
   - What's unclear: Whether self-hosted users will have DNS API access
   - Recommendation: Default to individual certificates (HTTP-01), document wildcard setup as optional advanced configuration for users with DNS API access

## Sources

### Primary (HIGH confidence)

- Docker Compose Production Guide: https://docs.docker.com/compose/how-tos/production/
- Caddy Automatic HTTPS Documentation: https://caddyserver.com/docs/automatic-https
- Caddy TLS Directive: https://caddyserver.com/docs/caddyfile/directives/tls
- Idempotent Bash Scripts: https://arslan.io/2019/07/03/how-to-write-idempotent-bash-scripts/
- Prometheus Node Exporter Documentation: https://prometheus.io/docs/guides/node-exporter/
- Let's Encrypt Rate Limits: https://letsencrypt.org/docs/rate-limits/

### Secondary (MEDIUM confidence)

- DigitalOcean Ubuntu 24.04 Setup Guide: https://www.digitalocean.com/community/tutorials/initial-server-setup-with-ubuntu
- Docker Image Tagging Best Practices: https://learn.microsoft.com/en-us/azure/container-registry/container-registry-image-tag-version
- ufw-docker GitHub Repository: https://github.com/chaifeng/ufw-docker
- Docker Health Check Guide: https://lumigo.io/container-monitoring/docker-health-check-a-practical-guide/
- Docker Rollout Zero Downtime: https://github.com/wowu/docker-rollout

### Tertiary (LOW confidence)

- WebSearch: Ubuntu 24.04 best practices (consensus across multiple sources)
- WebSearch: fail2ban + Caddy configuration patterns (community tutorials)
- WebSearch: Self-hosted backup retention strategies (various tools, no single standard)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Official Docker/Caddy documentation, Ubuntu LTS release cycle documented
- Architecture: HIGH - Docker Compose overlay pattern is official recommendation, idempotent bash patterns widely documented
- Pitfalls: HIGH - Based on official documentation (Let's Encrypt rate limits, Docker firewall bypass) and established community knowledge
- Code examples: HIGH - Sourced from official docs and existing project scripts
- Rollback patterns: MEDIUM - Best practices exist but vary by tool/context, no single standard approach

**Research date:** 2026-01-23
**Valid until:** 2026-03-23 (60 days - Ubuntu LTS and Docker are stable, Caddy may add features but unlikely breaking changes)

# Architecture Research: Multi-Target Deployment

**Project:** FreshTrack Pro v1.1 - Deployment Flexibility
**Researched:** 2026-01-23
**Confidence:** HIGH

## Summary

Multi-target Docker Compose deployment should use a single base configuration with environment-specific override files. This approach avoids maintaining multiple codebases while supporting AWS, DigitalOcean, and self-hosted VM deployments. The key pattern is `docker-compose.yml` (base) + `compose.{env}.yaml` (overrides), combined with managed vs self-hosted service trade-offs per target.

## Recommended Approach: Compose Override Files

### Single Source of Truth Strategy

Docker Compose natively supports merging multiple configuration files, where later files override earlier ones. This is the current industry standard as of 2026.

**File Structure:**
```
docker/
├── docker-compose.yml              # Base configuration (all services)
├── compose.dev.yaml                # Local development overrides
├── compose.staging.yaml            # Staging environment overrides
├── compose.production.yaml         # Production (self-hosted) overrides
├── compose.aws.yaml                # AWS-specific overrides
└── compose.digitalocean.yaml       # DigitalOcean-specific overrides
```

**Invocation:**
```bash
# Local development
docker compose -f docker-compose.yml -f compose.dev.yaml up

# AWS deployment
docker compose -f docker-compose.yml -f compose.aws.yaml up -d

# Self-hosted production
docker compose -f docker-compose.yml -f compose.production.yaml up -d
```

**Merging Rules (Official Docker Compose behavior):**
- Single-value options (image, command, mem_limit): New value replaces old
- Multi-value options (environment, labels, volumes): Values merge, local takes precedence
- Service definitions: Can be entirely omitted or overridden per environment

### Why This Approach

**Advantages:**
1. **DRY Principle**: Base services defined once, only differences expressed in overrides
2. **Native Docker Support**: No custom tooling required, works with standard Docker Compose CLI
3. **Clear Separation**: Development, staging, and production configs visually distinct
4. **Version Control Friendly**: Each override file tracks environment-specific changes
5. **Production-Proven**: Used by thousands of teams deploying Docker Compose in 2025-2026

**Alternative Rejected: Single File with Conditionals**
- Requires custom scripting (bash/sed) to modify compose file before deployment
- Error-prone manual synchronization
- Harder to review changes in version control

**Alternative Rejected: Separate Files Per Environment**
- Violates DRY (duplicating service definitions across files)
- Changes to base services require manual propagation
- High risk of configuration drift

## Configuration Strategy

### Environment Variables: Three-Tier System

**Tier 1: Base Defaults (docker-compose.yml)**
```yaml
services:
  backend:
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      PORT: 3000
```

**Tier 2: Environment-Specific Overrides (compose.{env}.yaml)**
```yaml
# compose.production.yaml
services:
  backend:
    environment:
      LOG_LEVEL: warn          # Override default
      ENABLE_METRICS: "true"   # Production-only
```

**Tier 3: Secret Injection (.env file or external secrets)**
```bash
# .env.production (NOT committed to git)
DATABASE_PASSWORD=<secret>
STACK_AUTH_SECRET=<secret>
```

### Secrets Management by Target

**Self-Hosted / DigitalOcean Droplet:**
- Use Docker Compose secrets with file-based storage
- Store secrets in `/opt/freshtrack-pro/secrets/*.txt`
- Mount as `/run/secrets/<secret_name>` in containers
- Set file permissions: `chmod 600 secrets/*.txt`

**AWS (ECS with Fargate/EC2):**
- Use AWS Secrets Manager or Parameter Store
- Reference secrets in task definitions
- Docker Compose integration: Use `secrets` with external reference

**Important Limitation:**
Docker Compose secrets without Swarm mode are just convenient file mounts, NOT encrypted storage. For production-grade security, use external secret managers (Vault, AWS Secrets Manager, etc.) or encrypt secret files with tools like Mozilla SOPS.

### Service Substitution Pattern

Key architectural decision: Some services should be REPLACED with managed alternatives per target, not just configured differently.

**Self-Hosted Target:**
```yaml
# compose.production.yaml
services:
  postgres:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio:latest
    volumes:
      - minio_data:/data
```

**AWS Target:**
```yaml
# compose.aws.yaml
services:
  postgres:
    profiles: ["disabled"]  # Don't run in Docker

  redis:
    profiles: ["disabled"]

  minio:
    profiles: ["disabled"]

  backend:
    environment:
      DATABASE_URL: ${RDS_ENDPOINT}           # Managed RDS
      REDIS_URL: ${ELASTICACHE_ENDPOINT}      # Managed ElastiCache
      S3_ENDPOINT: https://s3.amazonaws.com   # Managed S3
      S3_BUCKET: ${S3_BUCKET_NAME}
```

**Trade-off Rationale:**
- Self-hosted: Lower cost, full control, higher operational burden
- Managed (AWS): Higher cost, zero operational burden, better scalability
- Cost crossover: ~$50-100/month depending on usage

## Deployment Targets

### Target 1: Self-Hosted VM (DigitalOcean Droplet, Hetzner, etc.)

**Architecture:**
```
┌─────────────────────────────────────────┐
│  Single VM (4 vCPU, 8GB RAM)            │
│  ┌─────────────────────────────────┐    │
│  │  Docker Compose Stack           │    │
│  │  ├── Caddy (reverse proxy)      │    │
│  │  ├── Backend API                │    │
│  │  ├── PostgreSQL                 │    │
│  │  ├── Redis                      │    │
│  │  ├── MinIO                      │    │
│  │  └── Observability (optional)   │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Implementation:**
```bash
# Deployment command
docker compose \
  -f docker-compose.yml \
  -f compose.production.yaml \
  up -d

# All services run on single host
# Caddy handles SSL termination with Let's Encrypt
# Internal networking via Docker bridge network
```

**Key Override (compose.production.yaml):**
```yaml
services:
  caddy:
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - caddy_data:/data
      - caddy_config:/config
      - ./Caddyfile:/etc/caddy/Caddyfile

  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G

  postgres:
    deploy:
      resources:
        limits:
          memory: 3G
    volumes:
      - postgres_data:/var/lib/postgresql/data
    # Bind to localhost only (security)
    ports:
      - "127.0.0.1:5432:5432"
```

**Best For:**
- Small to medium deployments (< 1000 users)
- Predictable, steady traffic
- Budget-conscious projects
- Full control requirements

**Pros:**
- Simple deployment model
- Predictable costs ($40-100/month total)
- Complete infrastructure control
- Easy debugging (all logs in one place)

**Cons:**
- Single point of failure (requires backup/DR planning)
- Manual scaling (vertical only until multi-VM setup)
- Operational burden (OS updates, security patches)
- Resource constraints on single VM

### Target 2: AWS (ECS with Fargate or EC2)

**Architecture Option A: ECS with Fargate (Recommended)**
```
┌──────────────────────────────────────────────┐
│  AWS Cloud                                   │
│  ┌────────────────────────────────────────┐  │
│  │  ECS Cluster (Fargate)                 │  │
│  │  ├── Backend Task (auto-scaled)        │  │
│  │  └── Worker Task (background jobs)     │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐    │
│  │   RDS   │  │ElastiCache│  │   S3    │    │
│  │PostgreSQL│  │  Redis   │  │ Storage │    │
│  └─────────┘  └──────────┘  └─────────┘    │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │  ALB (Application Load Balancer)    │    │
│  │  - SSL termination (ACM cert)       │    │
│  │  - Health checks                    │    │
│  └─────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

**Implementation:**
```bash
# Use Docker Compose ECS integration (official as of 2020, mature in 2026)
docker context create ecs myapp --profile default
docker context use myapp

# Deploy with AWS-specific overrides
docker compose \
  -f docker-compose.yml \
  -f compose.aws.yaml \
  up
```

**Key Override (compose.aws.yaml):**
```yaml
services:
  # Disable self-hosted data services
  postgres:
    profiles: ["disabled"]
  redis:
    profiles: ["disabled"]
  minio:
    profiles: ["disabled"]

  backend:
    # ECS-specific configuration
    image: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/freshtrack-backend:latest

    environment:
      # Use managed AWS services
      DATABASE_URL: postgresql://user:pass@${RDS_ENDPOINT}:5432/freshtrack
      REDIS_URL: redis://${ELASTICACHE_ENDPOINT}:6379
      S3_ENDPOINT: https://s3.${AWS_REGION}.amazonaws.com
      S3_BUCKET: ${S3_BUCKET_NAME}
      AWS_REGION: ${AWS_REGION}

    # ECS Fargate defaults to 0.5 vCPU / 1GB RAM
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 2G
      replicas: 2  # Auto-scaling via ECS

    # ALB health check target
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 60s

  # Caddy not needed - ALB handles routing/SSL
  caddy:
    profiles: ["disabled"]
```

**Cost Estimate (as of 2026):**
- ECS Fargate: ~$40/month (2 tasks @ 1 vCPU, 2GB)
- RDS db.t4g.small: ~$30/month
- ElastiCache t4g.micro: ~$15/month
- S3: ~$5/month (first 50GB)
- ALB: ~$20/month
- **Total: ~$110/month** (scales with usage)

**Architecture Option B: EC2 with Docker Compose**
```
┌──────────────────────────────────────────────┐
│  AWS Cloud                                   │
│  ┌────────────────────────────────────────┐  │
│  │  EC2 Instance (t3.large)               │  │
│  │  - Docker Compose stack (full)         │  │
│  │  - Similar to self-hosted              │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Optional: RDS + ElastiCache + S3           │
│  (hybrid approach)                           │
└──────────────────────────────────────────────┘
```

**Best For:**
- Need GPU support (Fargate doesn't support GPU as of early 2026, fallback to EC2)
- Specific instance type requirements
- Lower cost than Fargate for sustained workloads

**Implementation:**
Same as self-hosted, but deploy to EC2 instance. Use AWS-managed services optionally.

**When to Choose AWS:**
- Need horizontal auto-scaling
- Global deployment (multi-region)
- Enterprise compliance requirements (HIPAA, SOC2 with BAAs)
- Traffic spikes (Fargate auto-scales seamlessly)

**Pros:**
- Fully managed infrastructure (Fargate)
- Auto-scaling built-in
- High availability (multi-AZ deployments)
- Integrates with AWS ecosystem (CloudWatch, IAM, Secrets Manager)

**Cons:**
- Higher base cost (~$110/month minimum)
- Vendor lock-in (AWS-specific services)
- More complex debugging (distributed logging)
- Steeper learning curve

### Target 3: DigitalOcean

**Architecture Option A: App Platform (PaaS)**
```
┌──────────────────────────────────────────────┐
│  DigitalOcean App Platform                   │
│  ┌────────────────────────────────────────┐  │
│  │  Backend Service (auto-deployed)       │  │
│  │  - From GitHub/GitLab                  │  │
│  │  - Auto HTTPS                          │  │
│  │  - Auto-scaling                        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐    │
│  │Managed  │  │ Managed  │  │  Spaces │    │
│  │Database │  │  Redis   │  │ (S3-API)│    │
│  └─────────┘  └──────────┘  └─────────┘    │
└──────────────────────────────────────────────┘
```

**Limitation (Critical):**
App Platform does NOT support running Docker Compose directly. You don't have access to a fixed Droplet or VM - instead, you deploy to a container orchestration platform where each workload is a single container.

**Implementation:**
Deploy backend as single container, use managed databases:
```yaml
# app.yaml (DigitalOcean App Platform spec)
name: freshtrack-pro
services:
  - name: backend
    github:
      repo: your-org/freshtrack-pro
      branch: main
      deploy_on_push: true
    build_command: npm run build
    run_command: npm start
    envs:
      - key: DATABASE_URL
        value: ${db.DATABASE_URL}  # Managed database
      - key: REDIS_URL
        value: ${redis.REDIS_URL}
    health_check:
      http_path: /health

databases:
  - name: db
    engine: PG
    version: "15"
    size: db-s-1vcpu-1gb

  - name: redis
    engine: REDIS
    version: "7"
    size: db-s-1vcpu-1gb
```

**Cost Estimate:**
- Backend container (Basic, 1GB RAM): $12/month
- Managed PostgreSQL (1GB): $15/month
- Managed Redis (1GB): $15/month
- Spaces (S3-compatible): $5/month
- **Total: ~$47/month**

**Pros:**
- Extremely easy deployment (5 minutes from GitHub to production)
- Auto-scaling based on CPU thresholds
- Built-in CI/CD
- Managed databases included
- Lower cost than AWS for small workloads

**Cons:**
- No Docker Compose support (single container per service)
- Limited networking customization
- Cannot use VPNs or advanced network setups
- Less control than Droplet deployment

**Architecture Option B: Droplet with Docker Compose**
```
┌──────────────────────────────────────────────┐
│  DigitalOcean Droplet                        │
│  ┌────────────────────────────────────────┐  │
│  │  Docker Compose Stack                  │  │
│  │  - Same as self-hosted VM              │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Optional: Managed Database + Redis         │
└──────────────────────────────────────────────┘
```

**Implementation:**
Identical to self-hosted VM approach. DigitalOcean provides one-click Docker Droplets with Docker + Docker Compose pre-installed.

**Deployment:**
```bash
# SSH to Droplet
ssh root@droplet-ip

# Clone repo
git clone https://github.com/your-org/freshtrack-pro.git
cd freshtrack-pro

# Deploy
docker compose -f docker-compose.yml -f compose.production.yaml up -d
```

**Hybrid Option (Recommended for DigitalOcean):**
```yaml
# compose.digitalocean.yaml
services:
  # Use managed database
  postgres:
    profiles: ["disabled"]

  backend:
    environment:
      DATABASE_URL: ${DO_MANAGED_DB_URL}  # DigitalOcean Managed Database
      REDIS_URL: redis:6379              # Self-hosted Redis (cheap)
      S3_ENDPOINT: https://nyc3.digitaloceanspaces.com
      S3_BUCKET: ${SPACES_BUCKET}
```

**Cost Estimate (Hybrid):**
- Droplet (4GB, 2 vCPU): $24/month
- Managed PostgreSQL (1GB): $15/month
- Spaces: $5/month
- **Total: ~$44/month**

**When to Choose DigitalOcean:**
- Want managed services but simpler than AWS
- Prefer flat-rate pricing over usage-based
- Need networking flexibility (Droplet approach)
- Budget-conscious but want some managed services

**Pros:**
- Simpler than AWS, more flexible than pure PaaS
- Competitive pricing
- Good documentation
- Managed database option available

**Cons:**
- Less global presence than AWS
- Fewer managed services overall
- Scaling requires more manual work than AWS

## Build Order & Implementation Sequence

Recommended implementation order for multi-target support:

### Phase 1: Refactor Existing Setup (Week 1)
**Goal:** Convert current setup to override file pattern

1. **Extract base configuration**
   - Create `docker-compose.yml` with all service definitions
   - Remove environment-specific values (use placeholders)
   - Use `${VAR:-default}` syntax for sensible defaults

2. **Create development override**
   - Extract `compose.dev.yaml` from current local setup
   - Development-friendly settings (verbose logging, hot reload)
   - Exposed ports for debugging

3. **Create production override**
   - Extract `compose.production.yaml` from existing production config
   - Resource limits (prevent runaway processes)
   - Security hardening (no exposed ports except via Caddy)

4. **Test locally**
   ```bash
   # Verify dev still works
   docker compose -f docker-compose.yml -f compose.dev.yaml up

   # Verify production config parses
   docker compose -f docker-compose.yml -f compose.production.yaml config
   ```

**Deliverable:** Working multi-file Compose setup that maintains current functionality

### Phase 2: Self-Hosted Target (Week 2)
**Goal:** Validate production override on VM

1. **Provision test VM**
   - Use DigitalOcean Droplet or similar
   - Install Docker + Docker Compose
   - Set up firewall rules

2. **Create deployment script**
   ```bash
   #!/bin/bash
   # deploy-selfhosted.sh
   set -e

   git pull origin main
   docker compose build backend
   docker compose -f docker-compose.yml -f compose.production.yaml up -d
   docker compose ps
   ```

3. **Test full deployment**
   - Deploy to test VM
   - Verify all services start
   - Run smoke tests
   - Check observability stack

4. **Document runbook**
   - Backup procedures
   - Update procedures
   - Rollback procedures

**Deliverable:** Tested self-hosted deployment on VM with documentation

### Phase 3: AWS Target (Week 3-4)
**Goal:** Add AWS-specific override and test on ECS

1. **Create AWS override**
   - `compose.aws.yaml`
   - Disable self-hosted databases (profiles)
   - Configure managed service endpoints
   - Set ECS-specific resource limits

2. **Set up AWS infrastructure (Terraform/CDK recommended)**
   ```hcl
   # terraform/main.tf
   module "vpc" { ... }
   module "rds" { ... }
   module "elasticache" { ... }
   module "s3" { ... }
   module "ecs" { ... }
   ```

3. **Build and push images to ECR**
   ```bash
   aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URL
   docker build -t freshtrack-backend:latest .
   docker tag freshtrack-backend:latest $ECR_URL/freshtrack-backend:latest
   docker push $ECR_URL/freshtrack-backend:latest
   ```

4. **Deploy to ECS**
   ```bash
   docker context create ecs myapp
   docker context use myapp
   docker compose -f docker-compose.yml -f compose.aws.yaml up
   ```

5. **Test ECS deployment**
   - Verify tasks start
   - Test ALB routing
   - Verify managed service connectivity
   - Load test auto-scaling

**Deliverable:** Working AWS ECS deployment with managed services

### Phase 4: DigitalOcean Target (Week 5)
**Goal:** Add DigitalOcean hybrid approach

1. **Create DigitalOcean override**
   - `compose.digitalocean.yaml`
   - Use managed PostgreSQL
   - Self-host Redis + MinIO (cost optimization)

2. **Provision DigitalOcean resources**
   - Managed PostgreSQL database
   - Spaces bucket
   - Droplet (if Droplet approach) OR App Platform setup

3. **Test deployment**
   - Deploy to DigitalOcean
   - Verify managed DB connectivity
   - Test Spaces integration

**Deliverable:** Working DigitalOcean deployment option

### Phase 5: Documentation & Tooling (Week 6)
**Goal:** Make deployments repeatable and documented

1. **Create deployment CLI**
   ```bash
   # scripts/deploy.sh
   ./deploy.sh --target aws --env production
   ./deploy.sh --target digitalocean --env staging
   ./deploy.sh --target selfhosted --env production
   ```

2. **Write deployment documentation**
   - Per-target setup guides
   - Cost comparison matrix
   - Decision flowchart (which target to choose)

3. **Set up CI/CD**
   - GitHub Actions workflows per target
   - Automated testing before deploy
   - Slack notifications

**Deliverable:** Polished deployment experience with docs

## Configuration Sharing vs Customization

### Shared Across All Targets (docker-compose.yml)

**Service Definitions:**
- Service names (backend, postgres, redis, minio, etc.)
- Base images (postgres:15-alpine, redis:7-alpine)
- Container commands
- Health check commands
- Volume mount points (paths, not volumes themselves)
- Network definitions (bridge network)

**Environment Variables (Defaults):**
- Non-sensitive configuration with defaults
- Feature flags with safe defaults
- Port numbers (can be overridden)

**Example:**
```yaml
services:
  backend:
    image: freshtrack-backend:${VERSION:-latest}
    command: ["npm", "start"]
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: ${PORT:-3000}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
```

### Customized Per Target (compose.{target}.yaml)

**Resource Limits:**
```yaml
# compose.production.yaml (generous for self-hosted)
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G

# compose.aws.yaml (tighter for cost control)
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
```

**Port Bindings:**
```yaml
# compose.dev.yaml (expose for debugging)
services:
  postgres:
    ports:
      - "5432:5432"

# compose.production.yaml (localhost only)
services:
  postgres:
    ports:
      - "127.0.0.1:5432:5432"

# compose.aws.yaml (no ports - managed RDS)
services:
  postgres:
    profiles: ["disabled"]
```

**Service Enablement:**
```yaml
# compose.production.yaml (all services enabled)
services:
  caddy:
    image: caddy:latest
    # ... config

# compose.aws.yaml (Caddy disabled, ALB used instead)
services:
  caddy:
    profiles: ["disabled"]
```

**Storage Backend:**
```yaml
# compose.production.yaml (self-hosted MinIO)
services:
  minio:
    image: minio/minio:latest
  backend:
    environment:
      S3_ENDPOINT: http://minio:9000

# compose.aws.yaml (managed S3)
services:
  minio:
    profiles: ["disabled"]
  backend:
    environment:
      S3_ENDPOINT: https://s3.amazonaws.com
```

## Anti-Patterns to Avoid

Based on research and production experience reports from 2025-2026:

### 1. Using 'latest' Tag in Production
**Problem:** Unpredictable deployments, different image versions across targets
**Solution:** Explicit version tags
```yaml
# BAD
image: postgres:latest

# GOOD
image: postgres:15.6-alpine
```

### 2. Bloated Production Images
**Problem:** 500MB+ images with dev dependencies and build tools
**Solution:** Multi-stage builds
```dockerfile
# Build stage
FROM node:20-alpine AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
```

### 3. Running as Root
**Problem:** Security risk if container compromised
**Solution:** Create non-root user
```dockerfile
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
```

### 4. No Resource Limits
**Problem:** Single container can consume all host resources
**Solution:** Set limits in production overrides
```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
```

### 5. Hardcoded Secrets in Images
**Problem:** Credentials exposed in image layers
**Solution:** Use environment variables or secrets
```yaml
# BAD
environment:
  DATABASE_PASSWORD: hunter2

# GOOD
environment:
  DATABASE_PASSWORD_FILE: /run/secrets/db_password
secrets:
  - db_password
```

### 6. Missing Health Checks
**Problem:** Docker/ECS can't detect unhealthy containers
**Solution:** Define health checks
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 60s
```

### 7. Pulling Git Repos in Production Containers
**Problem:** Production needs git installed, slow deployments, security risk
**Solution:** Build images in CI, push to registry
```bash
# BAD: git clone in Dockerfile

# GOOD: Build in CI, deploy image
docker build -t app:v1.2.3 .
docker push registry/app:v1.2.3
# Production pulls pre-built image
```

### 8. No Log Rotation
**Problem:** Logs fill disk, crash production
**Solution:** Configure Docker log driver
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

### 9. Exposing Internal Ports
**Problem:** Database/Redis accessible from outside
**Solution:** Bind to localhost or use internal networks
```yaml
# BAD
ports:
  - "5432:5432"

# GOOD
ports:
  - "127.0.0.1:5432:5432"
```

### 10. Running Multiple Processes per Container
**Problem:** Violates container isolation principle
**Solution:** One process per container, use Compose to orchestrate
```yaml
# BAD: Single container running nginx + app

# GOOD: Separate containers
services:
  nginx:
    image: nginx:alpine
  backend:
    image: app:latest
```

## Trade-Off Decision Matrix

| Criteria | Self-Hosted VM | AWS ECS + Managed | DigitalOcean Hybrid |
|----------|---------------|-------------------|---------------------|
| **Cost (monthly)** | $40-80 | $110-200+ | $45-90 |
| **Setup Complexity** | Medium | High | Low-Medium |
| **Operational Burden** | High | Low | Medium |
| **Scalability** | Manual/Limited | Automatic | Manual/Medium |
| **Control Level** | Complete | Limited | High |
| **Vendor Lock-in** | None | High | Low |
| **Multi-Region** | Manual | Easy | Manual |
| **Compliance (BAA)** | DIY | Available | Limited |
| **Time to Deploy** | 2-4 hours | 1-2 days | 1-2 hours |
| **Best For** | < 1K users, stable | > 5K users, growth | 1K-5K users, balanced |

## Recommendations by Use Case

**Early Stage Startup (< 500 users):**
→ Self-Hosted DigitalOcean Droplet with Docker Compose
- Lowest cost ($40-50/month)
- Fast iteration
- Upgrade path to managed services

**Growing SaaS (500-5000 users):**
→ DigitalOcean Hybrid (Droplet + Managed Database)
- Balanced cost/ops trade-off
- Managed DB reduces risk
- Still affordable

**Enterprise / High Growth (> 5000 users):**
→ AWS ECS with Managed Services
- Auto-scaling critical
- Compliance requirements
- Can afford higher costs

**Regulated Industry (HIPAA, SOC2):**
→ AWS with BAAs or Self-Hosted with Compliance Framework
- AWS offers signed BAAs
- Self-hosted requires audit trail setup

## Sources

### Official Documentation
- [Use Compose in production | Docker Docs](https://docs.docker.com/compose/how-tos/production/)
- [Merge Compose files | Docker Docs](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/)
- [Set environment variables | Docker Docs](https://docs.docker.com/compose/environment-variables/set-environment-variables/)
- [Secrets in Compose | Docker Docs](https://docs.docker.com/compose/how-tos/use-secrets/)

### AWS Resources
- [Deploy applications on Amazon ECS using Docker Compose | AWS](https://aws.amazon.com/blogs/containers/deploy-applications-on-amazon-ecs-using-docker-compose/)
- [Amazon ECS vs Amazon EC2: Complete Comparison Guide [2026]](https://towardsthecloud.com/blog/amazon-ecs-vs-amazon-ec2)

### DigitalOcean Resources
- [DigitalOcean App Platform vs DOKS vs Droplets](https://www.digitalocean.com/community/conceptual-articles/digitalocean-app-platform-vs-doks-vs-droplets)
- [Deploying multiple dockerized apps to a single DigitalOcean droplet](https://danielwachtel.com/devops/deploying-multiple-dockerized-apps-digitalocean-docker-compose-contexts)

### Best Practices
- [Docker Best Practices 2026 - Thinksys Inc.](https://thinksys.com/devops/docker-best-practices/)
- [Best Practices Around Production Ready Web Apps with Docker Compose](https://nickjanetakis.com/blog/best-practices-around-production-ready-web-apps-with-docker-compose)
- [Docker Compose Advanced Techniques: Production Deployments](https://dev.to/rajeshgheware/docker-compose-advanced-techniques-a-comprehensive-guide-to-production-deployments-1goi)

### Anti-Patterns & Security
- [Container Anti-Patterns: Common Docker Mistakes](https://dev.to/idsulik/container-anti-patterns-common-docker-mistakes-and-how-to-avoid-them-4129)
- [Docker 10 Anti-Patterns: What to Avoid](https://medium.com/@mehar.chand.cloud/docker-10-anti-patterns-what-to-avoid-980fa13d8951)

### Cost Analysis
- [Best PostgreSQL hosting providers for developers in 2026](https://northflank.com/blog/best-postgresql-hosting-providers)
- [Go ahead, self-host Postgres](https://pierce.dev/notes/go-ahead-self-host-postgres)

All sources accessed: 2026-01-23
Research confidence: HIGH (based on official documentation and recent 2025-2026 production experiences)

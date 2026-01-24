# FreshTrack Pro - Deployment Decision Guide

Choose the right deployment approach for your needs.

## Overview

FreshTrack Pro supports two primary deployment paths:

1. **Self-Hosted** - Deploy to any Linux VM (AWS EC2, GCP Compute Engine, Azure VM, bare metal)
2. **DigitalOcean** - Optimized deployment for DigitalOcean with optional managed services

Both approaches use the same application stack (Docker Compose, Caddy, PostgreSQL, MinIO). The difference lies in infrastructure management, automation, and operational complexity.

This guide helps you choose the best option based on your specific needs.

---

## Quick Decision Matrix

Use this table for a quick decision:

| Your Situation | Recommended Deployment | Monthly Cost | Setup Time |
|----------------|----------------------|--------------|------------|
| First-time setup, want simplest path | DigitalOcean Droplet + Managed DB | $37-54 | 30 min |
| Have existing server/VM | Self-hosted | $0 (infra only) | 1-2 hours |
| Need data sovereignty/compliance | Self-hosted | $0 (infra only) | 1-2 hours |
| Budget-conscious, comfortable with Linux | Self-hosted or DO Droplet | $25+ | 1 hour |
| Enterprise, IT team available | Self-hosted | Existing infra | 2-4 hours |
| Development/testing | Local Docker Compose | $0 | 5 minutes |

Still unsure? Read the detailed scenarios below.

---

## Detailed Scenarios

### Scenario 1: Small Restaurant/Cafe (1-10 sensors)

**Profile:**
- Single location
- Limited IT skills or budget for dedicated IT staff
- Want it to "just work" with minimal maintenance
- Focus on food service, not technology

**Scale:**
- 10-20 temperature sensors
- Less than 1,000 readings per day
- 1-5 concurrent users (staff checking dashboards)

**Budget:** $30-50/month

**Recommendation:** DigitalOcean Droplet ($25/mo) + Managed PostgreSQL ($12/mo)

**Why this works:**
- **Managed database** eliminates backup complexity (automatic daily backups with 7-day retention)
- **Point-in-time recovery** if something goes wrong
- **Easy scaling** as you add locations - just upgrade Droplet tier in console
- **Minimal ops burden** - DigitalOcean handles DB updates, backups, monitoring
- **Fast deployment** - automated script provisions everything in 30 minutes

**Cost breakdown:**
- Droplet (Basic, 2 vCPU, 4GB RAM): $24/month
- Managed PostgreSQL (DB-s-1vcpu-1gb): $12/month
- **Total: $36/month**

**Technical requirements:**
- DigitalOcean account (free to create)
- Domain name ($10-15/year)
- SSH key configured in DO console

**Get started:** [DigitalOcean Deployment Guide](./DIGITALOCEAN_DEPLOYMENT.md)

---

### Scenario 2: Multi-Location Food Service (10-50 sensors)

**Profile:**
- 2-5 locations
- Some technical staff or contracted IT support
- Moderate data volume
- Growth expected over next 12-24 months

**Scale:**
- 50-100 temperature sensors
- 5,000-10,000 readings per day
- 10-20 concurrent users
- Multiple alerts per day

**Budget:** $50-100/month

**Recommendation:** DigitalOcean Droplet ($48/mo) + Managed PostgreSQL ($15/mo) + Spaces ($5/mo)

**Why this works:**
- **Managed database** with connection pooling handles higher concurrent load
- **DigitalOcean Spaces** for automated backup storage (CDN-backed, durable)
- **Vertical scaling** - upgrade Droplet tier as data volume grows
- **Monitoring included** - built-in metrics and alerting from DigitalOcean
- **Operational time savings** - no manual backup management, no database tuning

**Cost breakdown:**
- Droplet (General Purpose, 2 vCPU, 8GB RAM): $48/month
- Managed PostgreSQL (DB-s-2vcpu-4gb): $15/month
- Spaces (250GB storage, 1TB transfer): $5/month
- **Total: $68/month**

**Scaling path:**
- Start with $36/mo tier (Scenario 1)
- Upgrade to $68/mo when you hit 30+ sensors or 3+ locations
- Further upgrade to $120+/mo for 100+ sensors

**Get started:** [DigitalOcean Deployment Guide](./DIGITALOCEAN_DEPLOYMENT.md) (see "Managed PostgreSQL Setup" section)

---

### Scenario 3: Healthcare/Compliance-Heavy (any size)

**Profile:**
- Operates in regulated industry (healthcare, pharmaceuticals, food manufacturing)
- Strict data residency requirements (data must stay in specific country/region)
- Audit trail and compliance documentation required
- May require air-gapped or private network deployment

**Scale:** Varies (1 to 1000+ sensors)

**Budget:** N/A (compliance requirements trump cost optimization)

**Recommendation:** Self-hosted on controlled infrastructure

**Why this works:**
- **Full control** over data location (choose specific data center, region, or on-premises)
- **Audit compliance** - easier to document and prove data never leaves your infrastructure
- **Network isolation** - can deploy to private networks without internet access (air-gapped)
- **Custom security** - integrate with existing security infrastructure (LDAP, SAML, HSM)
- **Data sovereignty** - meet GDPR, HIPAA, or local regulations requiring data to stay in specific jurisdictions

**Considerations:**
- Requires dedicated IT support or contracted infrastructure management
- You're responsible for backups, disaster recovery, and uptime
- May need separate staging/production environments for validation

**Infrastructure requirements:**
- VM with 4 vCPU, 8GB RAM, 100GB storage minimum
- Ubuntu 24.04 LTS or Debian 12+ (for long-term support)
- Static IP address
- SSH access for deployment
- Firewall allowing ports 22, 80, 443

**Compliance benefits:**
- All data stored in PostgreSQL container on your infrastructure
- MinIO object storage also containerized (no external storage dependencies)
- Full audit logs via Loki (centralized logging)
- Role-based access control (RBAC) via Stack Auth
- Secrets managed via Infisical (optional) or file-based secrets

**Get started:** [Self-Hosted Deployment Guide](./SELFHOSTED_DEPLOYMENT.md)

---

### Scenario 4: Existing Infrastructure (IT team available)

**Profile:**
- Enterprise with existing servers, VMs, or private cloud
- Dedicated IT department or managed services contract
- Existing monitoring, backup, and disaster recovery processes
- Want to avoid recurring cloud subscription costs

**Scale:**
- 100+ temperature sensors
- High data volume (10,000+ readings per day)
- 50+ concurrent users
- Integration with existing enterprise systems (SSO, monitoring, alerting)

**Budget:** No new cloud costs preferred (leverage existing infrastructure)

**Recommendation:** Self-hosted on existing infrastructure

**Why this works:**
- **Leverage existing investment** - use spare capacity on existing VMs/servers
- **No recurring cloud fees** - zero marginal cost if infrastructure already exists
- **Integrate with existing systems** - Prometheus/Grafana for monitoring, existing backup solutions
- **Enterprise SSO integration** - can integrate Stack Auth with existing identity providers
- **Network security** - deploy behind existing firewalls, VPNs, and security controls

**Infrastructure requirements:**
- VM or server with:
  - 4+ vCPU cores
  - 16GB RAM (recommended for high volume)
  - 200GB SSD storage
  - Ubuntu 24.04 LTS or Debian 12+
- Static IP or internal DNS entry
- SSH access for deployment and management
- Firewall rules allowing ports 80, 443 (and 22 for SSH)

**Integration points:**
- **Prometheus metrics** - backend, database, and infrastructure metrics exported
- **Grafana dashboards** - pre-built dashboards for system monitoring
- **Loki logs** - centralized logging (can forward to existing log aggregation)
- **Webhook alerts** - deployment notifications to Slack, Discord, or custom webhooks
- **Backup automation** - daily PostgreSQL backups to MinIO (can copy to existing backup storage)

**Operational considerations:**
- Your IT team is responsible for:
  - VM/server provisioning and maintenance
  - OS updates and security patches
  - Backup storage and disaster recovery
  - SSL certificate renewal (automated via Let's Encrypt)
  - Monitoring and alerting setup
- FreshTrack Pro handles:
  - Application updates (via Docker image pulls)
  - Database migrations (automated via Drizzle ORM)
  - Container orchestration (via Docker Compose)

**Get started:** [Self-Hosted Deployment Guide](./SELFHOSTED_DEPLOYMENT.md)

---

### Scenario 5: Development/Testing

**Profile:**
- Developers evaluating FreshTrack Pro
- Testing integrations or custom modifications
- Need full functionality without production infrastructure
- Want easy reset/cleanup

**Scale:** N/A (development only)

**Budget:** $0 (local development)

**Recommendation:** Local Docker Compose

**Why this works:**
- **Zero cost** - runs entirely on your laptop/workstation
- **Full functionality** - same stack as production (PostgreSQL, MinIO, backend, frontend)
- **Easy reset** - `docker compose down -v` wipes everything clean
- **Fast iteration** - hot reload for code changes
- **Offline development** - no internet required after initial setup

**Requirements:**
- Docker Desktop or Docker Engine + Docker Compose
- 8GB RAM minimum (16GB recommended)
- 20GB free disk space

**Get started:**

```bash
git clone https://github.com/your-org/freshtrack-pro.git
cd freshtrack-pro
cp .env.example .env
docker compose up
```

Access the application at `http://localhost:5173` (frontend) and `http://localhost:3000` (backend API).

**Note:** Local development uses self-signed certificates or HTTP. For production SSL testing, use self-hosted or DigitalOcean deployment.

**Documentation:** See `README.md` in the repository root for detailed local development setup.

---

## Cost Comparison

Full cost breakdown for each deployment approach:

| Component | Self-Hosted | DO Droplet (Self-Hosted DB) | DO + Managed DB | DO Full Managed |
|-----------|-------------|----------------------------|-----------------|-----------------|
| **Compute** | Your server | $24-48/mo (Droplet) | $24-48/mo | $24-48/mo |
| **Database** | Included (container) | Included (container) | $12-30/mo (Managed PG) | $12-30/mo |
| **Object Storage** | Included (MinIO) | Included (MinIO) | Included (MinIO) | $5/mo (Spaces) |
| **SSL Certificates** | Free (Let's Encrypt) | Free (Let's Encrypt) | Free | Free |
| **Backups** | DIY (automated script) | DIY (automated script) | Included (7-day) | Included |
| **Monitoring** | Prometheus/Grafana | Prometheus/Grafana | DO Metrics + Prometheus | DO Metrics |
| **Support** | Community | Community + DO Support | Community + DO Support | Community + DO Support |
| **Total Monthly** | $0* (infra only) | $24-48/mo | $36-78/mo | $41-83/mo |

**Self-hosted note:** Your existing infrastructure costs apply. For net-new infrastructure, budget $50-100/mo for a comparable VM from major cloud providers (AWS EC2, GCP Compute Engine, Azure VM).

---

## Requirements by Deployment Type

### Self-Hosted Requirements

**Infrastructure:**
- VM or bare-metal server with:
  - 4 vCPU cores (minimum 2 for small deployments)
  - 8GB RAM (minimum 4GB for small deployments)
  - 100GB SSD storage (minimum 50GB for small deployments)
- Ubuntu 24.04 LTS or Debian 12+ (recommended for long-term support)
- Static public IP address (or dynamic DNS)
- SSH access with sudo privileges

**Network:**
- Firewall allowing inbound traffic on ports 80 (HTTP), 443 (HTTPS), 22 (SSH)
- Domain name with DNS control (A record pointing to server IP)
- Outbound internet access for Docker image pulls, Let's Encrypt validation

**Skills:**
- Basic Linux command-line proficiency
- SSH and file transfer (SCP/SFTP)
- Basic Docker/Docker Compose understanding (helpful but not required)
- DNS configuration (A records, CNAME records)

**Time commitment:**
- Initial deployment: 1-2 hours
- Ongoing maintenance: 1-2 hours per month (updates, monitoring)

---

### DigitalOcean Requirements

**Account setup:**
- DigitalOcean account (free to create, requires payment method)
- SSH key uploaded to DO console (or create during deployment)
- Personal access token (generated in API section) for doctl CLI

**DNS:**
- Domain name with DNS control (A record pointing to Droplet IP)
- Can use DigitalOcean DNS (free) or external DNS provider

**Local environment:**
- doctl CLI installed on your local machine ([installation guide](https://docs.digitalocean.com/reference/doctl/how-to/install/))
- SSH client (ssh command or PuTTY on Windows)
- Git for cloning the repository

**Skills:**
- Basic command-line proficiency (less than self-hosted)
- SSH key generation
- DNS configuration (same as self-hosted)

**Time commitment:**
- Initial deployment: 30-45 minutes (automated provisioning)
- Ongoing maintenance: 1 hour per month (DigitalOcean handles some tasks)

---

## Decision FAQ

### Can I migrate between deployment types?

**Yes.** All deployment types use the same data format and Docker images.

**Migration paths:**
- **Local to production:** Export PostgreSQL database, import to production instance
- **Self-hosted to DigitalOcean:** Use database backup/restore scripts
- **DigitalOcean to self-hosted:** Export from managed DB, import to self-hosted
- **Between cloud providers:** Standard PostgreSQL dump/restore process

**Tools provided:**
- `scripts/backup-database.sh` - Automated backups to MinIO
- `scripts/restore-database.sh` - Restore from backup (with test mode)

**Data portability:** FreshTrack Pro uses standard PostgreSQL and S3-compatible storage, ensuring no vendor lock-in.

---

### Which deployment is more reliable?

**Both can achieve 99.9%+ uptime** with proper configuration.

**Self-hosted reliability depends on:**
- Infrastructure quality (VM uptime, network stability)
- Your backup and disaster recovery processes
- Monitoring and alerting setup

**DigitalOcean reliability benefits:**
- Managed PostgreSQL has automated failover (higher-tier plans)
- Droplets have 99.99% uptime SLA (on higher-tier plans)
- Built-in monitoring and alerting

**Recommendation:** For mission-critical deployments, use managed PostgreSQL (DigitalOcean or AWS RDS) for database high availability.

---

### What about AWS, GCP, or Azure?

**Self-hosted approach works on all cloud providers.**

The `deploy-selfhosted.sh` script is cloud-agnostic and works on:
- AWS EC2 instances (Ubuntu 24.04 AMI)
- GCP Compute Engine instances (Ubuntu 24.04 image)
- Azure Virtual Machines (Ubuntu 24.04 image)
- Hetzner Cloud
- Linode
- Vultr
- Any other provider with Ubuntu 24.04 VMs

**Cloud-specific features not currently supported:**
- AWS-specific: RDS integration, ALB/NLB, ECS/EKS deployment
- GCP-specific: Cloud SQL integration, GKE deployment
- Azure-specific: Azure Database for PostgreSQL integration

**Future roadmap:** AWS ECS deployment planned for future milestone.

---

### Do I need technical skills?

**It depends on your deployment choice:**

**DigitalOcean (easiest):**
- Basic command-line skills (copy/paste commands)
- SSH key generation (one-time setup)
- DNS configuration (point A record to IP)
- **Estimated learning time:** 1-2 hours if new to these concepts

**Self-hosted (moderate):**
- All DigitalOcean skills, plus:
- Basic Linux system administration (users, permissions, services)
- Docker and Docker Compose concepts (containers, volumes, networks)
- Firewall configuration (UFW or iptables)
- **Estimated learning time:** 4-8 hours if new to Linux/Docker

**Local development (easiest for developers):**
- Docker Desktop installation
- Git clone and basic Docker Compose commands
- **Estimated learning time:** 30 minutes

**Support options:**
- Community documentation (this guide and deployment guides)
- GitHub issues for bug reports and feature requests
- Commercial support available (contact for pricing)

---

### How do I handle scaling?

**Vertical scaling (increase VM size):**

**Self-hosted:**
1. Stop the application: `docker compose down`
2. Resize the VM (via cloud provider console or contact hosting provider)
3. Restart the application: `docker compose up -d`

**DigitalOcean:**
1. Resize Droplet in console (takes 1-2 minutes, may require reboot)
2. Application automatically restarts after reboot

**Horizontal scaling (multiple instances):**

**Current limitation:** FreshTrack Pro is designed for single-instance deployment. Horizontal scaling (load balancers, multiple backend instances) is not currently supported.

**Future roadmap:** Multi-instance deployment with Redis session store and database read replicas planned for future milestone.

**Current scale limits:**
- Tested up to 500 sensors, 50,000 readings/day on 4 vCPU / 8GB RAM
- Database can handle 10x higher volume with proper indexing
- Vertical scaling recommended for current version

---

## Next Steps

Ready to deploy? Choose your path:

### I chose Self-Hosted
Read the complete deployment guide: [Self-Hosted Deployment Guide](./SELFHOSTED_DEPLOYMENT.md)

**Quick start:**
1. Provision Ubuntu 24.04 VM (4 vCPU, 8GB RAM, 100GB storage)
2. Point domain A record to VM IP
3. SSH to server
4. Clone repository and run `deploy-selfhosted.sh`
5. Follow prompts for configuration

**Estimated time:** 1-2 hours

---

### I chose DigitalOcean
Read the complete deployment guide: [DigitalOcean Deployment Guide](./DIGITALOCEAN_DEPLOYMENT.md)

**Quick start:**
1. Create DigitalOcean account and generate API token
2. Install doctl CLI on your local machine
3. Clone repository and create `deploy.config` file
4. Run `./scripts/deploy-digitalocean.sh`
5. Script provisions Droplet, configures DNS, deploys application

**Estimated time:** 30-45 minutes

---

### I'm still not sure
Try local development first to evaluate FreshTrack Pro:

1. Install Docker Desktop
2. Clone repository: `git clone https://github.com/your-org/freshtrack-pro.git`
3. Run: `docker compose up`
4. Access at `http://localhost:5173`

**Zero cost, zero commitment.** Explore the full application locally before making deployment decisions.

For questions or help choosing, contact support or open a GitHub issue.

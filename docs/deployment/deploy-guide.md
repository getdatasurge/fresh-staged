# Deployment Guide: FreshTrack Pro v2.1

## Overview

This guide covers the automated deployment of FreshTrack Pro on a fresh Ubuntu server.
The automated script handles:
- System verification (RAM, Disk, OS)
- Dependency installation (Docker, fail2ban)
- Interactive configuration (Domain, Secrets)
- SSL provisioning (Caddy)
- Service orchestration

## Prerequisites

- **OS:** Ubuntu 22.04 LTS or 24.04 LTS
- **Hardware:**
  - CPU: 2+ cores highly recommended
  - RAM: 2GB (4GB recommended)
  - Disk: 10GB free
- **Network:**
  - Ports 80 (HTTP) and 443 (HTTPS) open
  - Port 22 (SSH) open
- **Domain:** A valid domain name pointing to your server's IP (A Record)

## Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/freshtrack-pro.git
   cd freshtrack-pro
   ```

2. **Run the deployment script:**
   ```bash
   chmod +x scripts/deploy-automated.sh
   sudo ./scripts/deploy-automated.sh
   ```

3. **Follow the prompts:**
   - Enter your domain name (e.g., `app.freshtrack.io`)
   - Enter admin email (for SSL)
   - Configure Stack Auth credentials (if not already set)

## The Deployment Process

1. **Pre-flight Checks:** Validates your system meets requirements.
2. **Prerequisites:** Installs Docker Engine, UFW firewall, and utilities.
3. **Configuration:** Generates secure passwords and `.env.production`.
4. **Deployment:** Pulls images, builds containers, and starts services.
5. **Verification:** Waits for all services to be healthy.

## Post-Deployment

Once complete, access your dashboard at: `https://your-domain.com`

**Verify Installation:**
```bash
./scripts/verify-deployment.sh your-domain.com
```

**Seed Demo Data (Optional):**
```bash
./scripts/seed-demo-data.sh
```

## Troubleshooting

If the script fails, it will output a clear error message and categorization.

**Resume Deployment:**
Running the script again will resume from the last successful step.
```bash
sudo ./scripts/deploy-automated.sh
```

**Reset and Start Over:**
To clear all progress and start fresh:
```bash
sudo ./scripts/deploy-automated.sh --reset
```

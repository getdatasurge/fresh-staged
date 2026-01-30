# Deployment Quick Reference

Quick start guide for deploying FreshTrack Pro. For detailed documentation, see [SELFHOSTED_DEPLOYMENT.md](../SELFHOSTED_DEPLOYMENT.md).

## Prerequisites

Before deploying, complete the full prerequisites checklist:
**[See SELFHOSTED_DEPLOYMENT.md Prerequisites](../SELFHOSTED_DEPLOYMENT.md#prerequisites)**

**Quick requirements:**

- Ubuntu 22.04/24.04 LTS
- 4+ vCPU, 8+ GB RAM, 100+ GB SSD
- Domain with DNS pointing to server
- Stack Auth account credentials

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
   - Enter admin email (for SSL certificates)
   - Configure Stack Auth credentials

> **Note:** The script is checkpoint-based and will resume from the last successful step if interrupted.

## Post-Deployment

After deployment completes:

1. **Verify installation:**

   ```bash
   ./scripts/verify-deployment.sh your-domain.com
   ```

2. **Complete setup:**

   ```bash
   ./scripts/post-deploy.sh your-domain.com
   ```

3. **Access dashboard:** `https://your-domain.com`

**Optional - Seed Demo Data:**

```bash
./scripts/seed-demo-data.sh
```

## Troubleshooting

For detailed troubleshooting, see:
**[SELFHOSTED_DEPLOYMENT.md Troubleshooting](../SELFHOSTED_DEPLOYMENT.md#troubleshooting)**

**Quick fixes:**

| Issue                | Solution                                            |
| -------------------- | --------------------------------------------------- |
| Resume after failure | `sudo ./scripts/deploy-automated.sh` (auto-resumes) |
| Start fresh          | `sudo ./scripts/deploy-automated.sh --reset`        |
| Verify health        | `./scripts/verify-deployment.sh your-domain.com`    |
| View logs            | `docker compose logs -f`                            |

## Related Documentation

- [Full Deployment Guide](../SELFHOSTED_DEPLOYMENT.md) - Complete self-hosted deployment documentation
- [Database Operations](../DATABASE.md) - Backup, restore, and disaster recovery
- [SSL Certificates](../SSL_CERTIFICATES.md) - Certificate configuration and troubleshooting

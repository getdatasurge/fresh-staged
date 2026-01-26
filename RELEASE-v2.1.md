# Release v2.1: Streamlined Deployment

**Date:** 2026-01-25
**Status:** Stable

## Overview
FreshTrack Pro v2.1 introduces a fully automated deployment experience for self-hosted environments. The new "One-Script Deployment" replaces manual configuration steps with an intelligent, idempotent orchestration system.

## Key Features

### 🚀 Automated Deployment Script
- **Single Command:** `sudo ./scripts/deploy-automated.sh` handles end-to-end setup.
- **Idempotent:** Safe to run multiple times; resumes where it left off.
- **Pre-flight Checks:** Validates System (RAM, Disk), OS, and Network before changing anything.

### 🛡️ Security by Default
- **Firewall:** Automatically configures UFW (ports 22, 80, 443).
- **Intrusion Prevention:** Installs and configures fail2ban for SSH.
- **SSL:** Automatic HTTPS provisioning via Caddy.
- **Secrets:** Auto-generates strong credentials for DB, Grafana, and JWT.

### 🛠️ Verification Tooling
- **Deployment Verification:** `scripts/verify-deployment.sh` confirms system health.
- **E2E Smoke Tests:** `scripts/test-e2e-live.sh` validates API validation.
- **Demo Data:** `scripts/seed-demo-data.sh` populates a sample organization.

## Technical Improvements
- **Standardized Error Handling:** Consistent exit codes and recovery guidance.
- **Checkpoint System:** State persistence allows resume-after-failure.
- **Modular Library Architecture:** 
  - `preflight-lib.sh`: Core checks & error handling
  - `prereq-lib.sh`: Dependency installation
  - `config-lib.sh`: Interactive prompts
  - `verify-lib.sh`: Health checks

## Known Limitations / Technical Debt
- **Supabase Dependency:** `@supabase/supabase-js` is still present in dependencies (AUTH-02).
- **TTN Integration:** TTN SDK integration is deferred; some LoRaWAN hooks use placeholders.
- **Data Migration:** Production data migration tools require Supabase access (pending).

## Quick Start
```bash
git clone https://github.com/your-org/freshtrack-pro.git
cd freshtrack-pro
sudo ./scripts/deploy-automated.sh
```

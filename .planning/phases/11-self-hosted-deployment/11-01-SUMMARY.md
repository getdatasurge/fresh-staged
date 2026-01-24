---
phase: 11
plan: 01
subsystem: deployment
tags: [bash, docker, ubuntu, automation, idempotent, self-hosted]
requires: [10]
provides:
  - Deployment configuration template
  - Idempotent VM setup script
  - Automated dependency installation
affects: [11-02, 11-03]
tech-stack:
  added: []
  patterns:
    - Idempotent bash scripting (mkdir -p, grep -qF, command -v)
    - Interactive fallback for missing config values
    - File-based secrets with restrictive permissions
key-files:
  created:
    - scripts/deploy.config.example
    - scripts/deploy-selfhosted.sh
  modified: []
key-decisions:
  - Use bash scripting with idempotent patterns for deployment automation
  - Config file with interactive fallback for missing required values
  - Auto-generate optional passwords (Grafana, MinIO) if not provided
  - File-based secrets in /opt/freshtrack-pro/secrets/ with 600 permissions
  - Docker official installation script instead of manual apt setup
  - ufw firewall configuration (ports 22, 80, 443 only)
  - node_exporter runs as Docker container on localhost:9100
  - Application directory at /opt/freshtrack-pro
duration: 2 min
completed: 2026-01-24
---

# Phase 11 Plan 01: Deployment Script Foundation Summary

**One-liner:** Idempotent self-hosted deployment script with comprehensive config template and automated dependency installation for Ubuntu 24.04

## What Was Built

Created the foundation for one-command FreshTrack Pro deployment on bare Ubuntu 24.04 VMs.

### Configuration Template (scripts/deploy.config.example)

Comprehensive configuration template with 110 lines covering:
- **Domain configuration:** DOMAIN, ADMIN_EMAIL for Let's Encrypt
- **Database credentials:** POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_USER
- **Stack Auth integration:** PROJECT_ID, PUBLISHABLE_KEY, SECRET_KEY
- **Optional services:** Grafana, MinIO credentials (auto-generated if omitted)
- **Deployment settings:** VERSION_RETENTION, HEALTH_CHECK_TIMEOUT, HEALTH_CHECK_RETRIES
- **Git repository:** URL and branch for initial clone

75+ comment lines with detailed explanations and examples for each variable.

### Deployment Script (scripts/deploy-selfhosted.sh)

444-line idempotent deployment script with 7 installation functions:

**Core functions:**
1. `load_config()`: Source config file with interactive prompts for missing required values
2. `ensure_package()`: Idempotent apt package installation with state checking
3. `ensure_line_in_file()`: Append to file only if line doesn't exist

**Installation functions (all idempotent):**
1. `install_docker()`: Official Docker installation script, user group management
2. `install_docker_compose()`: Verify Docker Compose v2 built into Docker CLI
3. `configure_firewall()`: ufw with ports 22 (SSH), 80 (HTTP), 443 (HTTPS)
4. `install_fail2ban()`: SSH protection with basic jail.local configuration
5. `install_node_exporter()`: Prometheus metrics as Docker container on localhost:9100
6. `setup_app_directory()`: Clone/update git repo to /opt/freshtrack-pro
7. `create_secrets()`: File-based secrets with 600 permissions in secrets/ directory

**Idempotent patterns used (11 instances):**
- `mkdir -p` instead of `mkdir`
- `command -v` to check before installing
- `grep -qF` to check before appending to files
- `dpkg -s` to verify package installation status
- `docker ps -a --filter` to check container existence

**Features:**
- Color-coded output (blue steps, green success, red errors, yellow warnings)
- Configuration summary display before execution
- Auto-generated passwords for optional services
- Root check with sudo user detection
- Comprehensive success messaging with next steps

## Files Created/Modified

### Created
- `scripts/deploy.config.example` (110 lines) - Configuration template
- `scripts/deploy-selfhosted.sh` (444 lines, executable) - Main deployment script

### Modified
None - new files only

## Decisions Made

1. **Config file with interactive fallback**
   - **Decision:** Source config file, prompt for missing required values
   - **Rationale:** Supports both automated and manual deployment workflows
   - **Impact:** Can run with partial config or no config file at all

2. **Auto-generate optional passwords**
   - **Decision:** Use `openssl rand -base64` to generate passwords if not in config
   - **Rationale:** Reduces configuration burden, ensures strong defaults
   - **Applied to:** GRAFANA_ADMIN_PASSWORD, MINIO_SECRET_KEY

3. **File-based secrets with 600 permissions**
   - **Decision:** Write secrets to files in secrets/ directory with mode 600
   - **Rationale:** More secure than environment variables (not visible in docker inspect)
   - **Impact:** Docker Compose will mount these as secrets

4. **Docker official installation script**
   - **Decision:** Use `curl -fsSL https://get.docker.com | sh` instead of manual apt
   - **Rationale:** Official installation method, handles repository setup automatically
   - **Impact:** Simpler, always uses latest stable Docker version

5. **ufw firewall with minimal ports**
   - **Decision:** Allow only 22 (SSH), 80 (HTTP), 443 (HTTPS)
   - **Rationale:** Internal services bound to localhost, only reverse proxy exposed
   - **Impact:** Follows security best practice, prevents direct database access

6. **node_exporter as Docker container**
   - **Decision:** Run as Docker container instead of system service
   - **Rationale:** Consistent with infrastructure-as-containers approach
   - **Impact:** Easier to manage, update, and monitor

7. **Application directory at /opt/freshtrack-pro**
   - **Decision:** Use /opt instead of /home or /var
   - **Rationale:** Standard location for third-party applications on Linux
   - **Impact:** Clear separation from system and user files

## Deviations from Plan

None - plan executed exactly as written.

## Challenges Encountered

None - straightforward implementation following RESEARCH.md patterns.

## Performance

- **Duration:** 2 minutes
- **Tasks completed:** 2/2
- **Files created:** 2
- **Lines of code:** 554 (110 config + 444 script)
- **Idempotent patterns:** 11 instances
- **Install functions:** 7

## Testing Notes

**Verification completed:**
- ✓ deploy.config.example exists with all required variables
- ✓ deploy-selfhosted.sh is executable
- ✓ Script uses 11 idempotent patterns (requirement: 10+)
- ✓ Script sources config file with interactive fallback
- ✓ All install functions present

**Not yet tested:**
- Actual execution on Ubuntu 24.04 VM (requires VM environment)
- Docker installation flow (requires clean system)
- Config loading and prompting logic (requires interactive session)
- Secrets file creation and permissions (requires deployment run)

Testing will occur in Plan 11-03 during full deployment validation.

## Next Phase Readiness

**Ready for Plan 11-02** - Docker Compose integration and Caddy configuration.

**Provides:**
- Configuration template for all required variables
- Base VM setup script ready to integrate with Docker Compose deployment
- Secrets infrastructure for secure credential management

**Blockers:** None

**Concerns:** None

## Documentation

**Configuration:**
- `scripts/deploy.config.example` - Comprehensive template with usage instructions
- Script includes inline comments explaining each function

**Usage:**
```bash
# Copy and configure
cp scripts/deploy.config.example scripts/deploy.config
# Edit deploy.config with your values

# Run base setup
sudo ./scripts/deploy-selfhosted.sh

# Or with custom config path
sudo ./scripts/deploy-selfhosted.sh --config /path/to/config
```

**Next steps noted in script output:**
1. Configure DNS to point domain to server IP
2. Wait for DNS propagation (5-60 minutes)
3. Run deployment with --deploy flag (to be implemented in Plan 11-03)

## Lessons Learned

1. **Idempotent patterns are simple but powerful** - Using `grep -qF` before append, `mkdir -p`, and state checking prevents duplicate work on reruns
2. **Interactive fallback adds flexibility** - Supports both automated CI/CD and manual deployment scenarios
3. **Auto-generation reduces configuration burden** - Optional passwords can be auto-generated securely
4. **Docker official script simplifies installation** - Handles all repository setup and versioning automatically

## Tags

`bash` `docker` `ubuntu` `automation` `idempotent` `self-hosted` `deployment` `infrastructure` `security` `secrets`

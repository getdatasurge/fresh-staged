# Phase 23: Prerequisites Installation - Research

**Researched:** 2026-01-25
**Domain:** System prerequisites - Docker Engine, Docker Compose, UFW firewall, fail2ban, jq
**Confidence:** HIGH

## Summary

Phase 23 installs all system prerequisites required for FreshTrack Pro deployment: Docker Engine 29.x with Compose v2, UFW firewall rules, fail2ban SSH protection, and jq for JSON parsing. All installations must be idempotent (safe to re-run) and integrate with Phase 22's error handling infrastructure (`preflight-lib.sh`).

The key architectural decision is **not to use the convenience script (`get.docker.com`) for idempotency**. While the existing `deploy-selfhosted.sh` uses it, the Docker documentation explicitly states it's "not designed to upgrade an existing Docker installation" and "can cause trouble if Docker is already installed." Instead, Phase 23 should use the official apt repository method with version pinning for predictable, idempotent behavior.

All installation functions should:

1. Check if the tool is already installed with correct version before attempting install
2. Use `run_step()` from preflight-lib.sh for checkpoint-based resume
3. Return success (0) if already installed (idempotent)
4. Use apt package manager commands that are naturally idempotent

**Primary recommendation:** Create `install_docker()`, `install_firewall()`, `install_fail2ban()`, and `install_jq()` functions in a new `prereq-lib.sh` that sources `preflight-lib.sh` and uses its checkpoint system.

## Standard Stack

### Core

| Tool              | Version           | Purpose                       | Why Standard                                |
| ----------------- | ----------------- | ----------------------------- | ------------------------------------------- |
| Docker Engine     | 29.x              | Container runtime             | Required for all FreshTrack services        |
| Docker Compose v2 | 2.x+ (via plugin) | Multi-container orchestration | Bundled with Docker Engine, replaces v1     |
| UFW               | System default    | Firewall management           | Ubuntu's default firewall, simple interface |
| fail2ban          | System default    | SSH brute-force protection    | Standard Linux security hardening           |
| jq                | 1.6+              | JSON parsing                  | Required for health check JSON responses    |

### Supporting

| Tool         | Version | Purpose              | When to Use                                |
| ------------ | ------- | -------------------- | ------------------------------------------ |
| `dpkg-query` | System  | Package status check | Verify if package installed before install |
| `systemctl`  | System  | Service management   | Enable/start Docker, fail2ban services     |
| `apt-get`    | System  | Package installation | Install all prerequisites                  |
| `curl`       | System  | HTTP client          | Download Docker GPG key                    |

### Alternatives Considered

| Instead of            | Could Use          | Tradeoff                                                                       |
| --------------------- | ------------------ | ------------------------------------------------------------------------------ |
| get.docker.com script | apt repository     | Script is simpler but NOT idempotent; apt method is reliable for re-runs       |
| UFW                   | iptables directly  | UFW is higher-level, easier to audit; iptables more flexible but complex       |
| fail2ban              | firewalld/nftables | fail2ban is purpose-built for intrusion prevention; others are general-purpose |

## Architecture Patterns

### Recommended Project Structure

```
scripts/
├── lib/
│   ├── preflight-lib.sh   # Error handling, validation (Phase 22)
│   └── prereq-lib.sh      # Prerequisites installation (Phase 23 - NEW)
└── deploy-automated.sh    # Main entry point
```

### Pattern 1: Idempotent Package Check

**What:** Check if package is installed before attempting installation
**When to use:** Every package installation
**Example:**

```bash
# Source: https://www.baeldung.com/linux/check-how-package-installed
is_package_installed() {
    local package="$1"
    dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q "install ok installed"
}

ensure_package() {
    local package="$1"

    if is_package_installed "$package"; then
        success "$package is already installed"
        return 0
    fi

    step "Installing $package..."
    apt-get update -qq
    apt-get install -y "$package"
    success "$package installed"
}
```

### Pattern 2: Docker Installation via APT Repository (Idempotent)

**What:** Install Docker using official apt repository instead of convenience script
**When to use:** Fresh installation or ensuring Docker is installed
**Example:**

```bash
# Source: https://docs.docker.com/engine/install/ubuntu/
install_docker() {
    # Check if Docker already installed and working
    if command -v docker &>/dev/null && docker compose version &>/dev/null; then
        local version
        version=$(docker --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)
        success "Docker $version with Compose v2 already installed"
        return 0
    fi

    step "Installing Docker Engine..."

    # Remove conflicting packages (idempotent - doesn't fail if not present)
    for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do
        apt-get remove -y "$pkg" 2>/dev/null || true
    done

    # Install prerequisites
    apt-get update -qq
    apt-get install -y ca-certificates curl

    # Add Docker's official GPG key (idempotent - overwrites existing)
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    # Add repository (idempotent - overwrites existing)
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
        https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list

    # Install Docker packages
    apt-get update -qq
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Enable and start Docker service
    systemctl enable docker
    systemctl start docker

    success "Docker Engine installed"
}
```

### Pattern 3: UFW Firewall Configuration (Idempotent)

**What:** Configure firewall rules that can be safely re-applied
**When to use:** Firewall setup
**Example:**

```bash
# Source: https://www.digitalocean.com/community/tutorials/ufw-essentials-common-firewall-rules-and-commands
configure_firewall() {
    step "Configuring UFW firewall..."

    # Ensure UFW is installed
    ensure_package ufw

    # Reset to default (optional - for clean slate)
    # ufw --force reset

    # Set default policies
    ufw default deny incoming
    ufw default allow outgoing

    # Allow SSH (port 22) - idempotent, won't create duplicates
    ufw allow 22/tcp comment 'SSH'

    # Allow HTTP (port 80) for Let's Encrypt ACME challenges
    ufw allow 80/tcp comment 'HTTP'

    # Allow HTTPS (port 443) for production traffic
    ufw allow 443/tcp comment 'HTTPS'

    # Enable firewall (--force avoids interactive prompt)
    ufw --force enable

    success "UFW firewall configured (ports 22, 80, 443)"
}
```

### Pattern 4: fail2ban SSH Protection (Idempotent)

**What:** Configure fail2ban to protect SSH from brute-force attacks
**When to use:** After UFW is configured
**Example:**

```bash
# Source: https://www.digitalocean.com/community/tutorials/how-to-protect-ssh-with-fail2ban-on-ubuntu-22-04
install_fail2ban() {
    step "Installing fail2ban..."

    # Install package (idempotent via ensure_package)
    ensure_package fail2ban

    # Create jail.local only if it doesn't exist (idempotent)
    if [[ ! -f /etc/fail2ban/jail.local ]]; then
        cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
logpath = %(sshd_log)s
backend = %(sshd_backend)s
EOF
        success "Created /etc/fail2ban/jail.local"
    else
        success "fail2ban jail.local already exists"
    fi

    # Enable and start service (idempotent)
    systemctl enable fail2ban
    systemctl start fail2ban

    success "fail2ban installed and protecting SSH"
}
```

### Pattern 5: jq Installation (Idempotent)

**What:** Install jq JSON processor
**When to use:** Required for JSON health check parsing
**Example:**

```bash
# Source: https://www.cyberithub.com/how-to-install-jq-json-processor-on-ubuntu-22-04/
install_jq() {
    step "Installing jq..."

    if command -v jq &>/dev/null; then
        success "jq is already installed ($(jq --version))"
        return 0
    fi

    apt-get update -qq
    apt-get install -y jq

    success "jq installed ($(jq --version))"
}
```

### Anti-Patterns to Avoid

- **Using get.docker.com for idempotent installs:** The convenience script is "not designed to upgrade an existing Docker installation" and "can cause trouble." Use apt repository method.
- **Re-running apt-get update before every package:** Consolidate updates to reduce network calls.
- **Not checking if already installed:** Wastes time and bandwidth on re-runs.
- **Interactive prompts in UFW:** Always use `--force` flag for non-interactive execution.
- **Modifying jail.conf directly:** Changes to fail2ban's main config are overwritten on package update. Use jail.local.
- **Checking UFW status with grep for rule existence:** UFW handles duplicates gracefully; just apply rules.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem             | Don't Build            | Use Instead               | Why                                             |
| ------------------- | ---------------------- | ------------------------- | ----------------------------------------------- |
| Docker installation | Custom download script | apt repository method     | Docker's official method with version control   |
| Version checking    | Parsing docker output  | `dpkg-query` for packages | Standard package manager queries                |
| Service management  | Manual process control | `systemctl enable/start`  | Handles boot persistence, dependencies          |
| Firewall rules      | Direct iptables        | UFW commands              | Simpler, more auditable, handles IPv4/IPv6      |
| SSH protection      | Custom log parsing     | fail2ban                  | Battle-tested, handles log rotation, edge cases |

**Key insight:** The get.docker.com script, while convenient for first-time installs, is explicitly not recommended for production or for idempotent scripts. The apt repository method takes more lines but behaves predictably on re-runs.

## Common Pitfalls

### Pitfall 1: get.docker.com Not Idempotent

**What goes wrong:** Script warns "If you already have Docker installed, this script can cause trouble"
**Why it happens:** Script resets repository configuration and may not handle existing installations gracefully
**How to avoid:** Use apt repository method with explicit version pinning
**Warning signs:** Docker documentation explicitly warns against using convenience script for production

### Pitfall 2: Docker Compose v1 vs v2 Confusion

**What goes wrong:** Script uses `docker-compose` (v1 syntax) instead of `docker compose` (v2 syntax)
**Why it happens:** v1 was standalone Python app, v2 is Docker CLI plugin
**How to avoid:** Always use `docker compose` (space, not hyphen); check with `docker compose version`
**Warning signs:** "Command 'docker-compose' not found" errors

### Pitfall 3: UFW Blocking Docker Traffic

**What goes wrong:** Docker containers can't communicate through UFW
**Why it happens:** Docker manages iptables directly, can conflict with UFW
**How to avoid:** Ensure Docker is configured to use iptables-nft or iptables-legacy; UFW rules are applied before Docker starts
**Warning signs:** Containers unable to reach external services despite UFW allowing outbound

### Pitfall 4: fail2ban Backend Issues

**What goes wrong:** fail2ban doesn't detect SSH login attempts
**Why it happens:** Wrong backend configured (systemd vs polling) or incorrect log path
**How to avoid:** Use `%(sshd_log)s` and `%(sshd_backend)s` placeholders which auto-detect
**Warning signs:** `fail2ban-client status sshd` shows 0 failed attempts despite brute-force activity

### Pitfall 5: apt-get update Race Condition

**What goes wrong:** "Could not get lock /var/lib/apt/lists/lock"
**Why it happens:** Multiple apt processes running simultaneously (e.g., unattended-upgrades)
**How to avoid:** Check for lock before running, or use `apt-get -o DPkg::Lock::Timeout=60`
**Warning signs:** Script fails intermittently on fresh VMs

### Pitfall 6: Docker User Group Not Taking Effect

**What goes wrong:** Non-root user can't run docker commands after adding to docker group
**Why it happens:** Group membership only takes effect after re-login
**How to avoid:** Document that user must logout/login, or use `newgrp docker` in interactive sessions
**Warning signs:** "permission denied while trying to connect to Docker daemon socket"

## Code Examples

Verified patterns from official sources:

### Complete Docker Installation (Idempotent)

```bash
# Source: https://docs.docker.com/engine/install/ubuntu/
install_docker() {
    # Early return if already installed and functional
    if command -v docker &>/dev/null; then
        if docker compose version &>/dev/null; then
            local docker_version
            docker_version=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
            success "Docker $docker_version with Compose v2 is already installed"
            return 0
        fi
    fi

    step "Installing Docker Engine via official repository..."

    # Remove old/conflicting packages (safe if not installed)
    local old_packages="docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc"
    for pkg in $old_packages; do
        apt-get remove -y "$pkg" 2>/dev/null || true
    done

    # Install prerequisites
    apt-get update -qq
    apt-get install -y ca-certificates curl

    # Set up Docker's official GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    # Set up repository
    local codename
    codename=$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $codename stable" > /etc/apt/sources.list.d/docker.list

    # Install Docker packages
    apt-get update -qq
    apt-get install -y \
        docker-ce \
        docker-ce-cli \
        containerd.io \
        docker-buildx-plugin \
        docker-compose-plugin

    # Enable and start Docker
    systemctl enable docker
    systemctl start docker

    # Verify installation
    if docker run --rm hello-world &>/dev/null; then
        success "Docker Engine installed and verified"
    else
        error "Docker installed but verification failed"
        return 1
    fi
}
```

### Verify Docker Compose v2

```bash
# Source: https://docs.docker.com/reference/cli/docker/compose/version/
verify_docker_compose() {
    if ! docker compose version &>/dev/null; then
        error "Docker Compose v2 not available"
        echo "  Expected: docker compose version"
        echo "  Note: Compose v2 is a Docker CLI plugin (docker compose, not docker-compose)"
        return 1
    fi

    local compose_version
    compose_version=$(docker compose version --short 2>/dev/null)
    success "Docker Compose $compose_version available"
    return 0
}
```

### Integration with preflight-lib.sh

```bash
# Source: Phase 22 preflight-lib.sh patterns
#!/usr/bin/env bash
# prereq-lib.sh - Prerequisites installation functions for FreshTrack Pro

# Source the preflight library for error handling and checkpoints
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/preflight-lib.sh"

# Install all prerequisites using checkpoint system
install_all_prerequisites() {
    step "Installing prerequisites..."

    run_step "docker" install_docker
    run_step "firewall" configure_firewall
    run_step "fail2ban" install_fail2ban
    run_step "jq" install_jq

    success "All prerequisites installed"
}
```

## State of the Art

| Old Approach          | Current Approach      | When Changed               | Impact                         |
| --------------------- | --------------------- | -------------------------- | ------------------------------ |
| get.docker.com script | apt repository method | Always for production      | Idempotent, version-controlled |
| docker-compose (v1)   | docker compose (v2)   | July 2023 (v1 EOL)         | Faster, Go-based, integrated   |
| Manual iptables       | UFW                   | Ubuntu default since ~2008 | Simpler, portable rules        |
| Custom log monitoring | fail2ban              | Standard practice          | Battle-tested, configurable    |

**Deprecated/outdated:**

- **Docker Compose v1 (docker-compose):** End-of-life July 2023. Use v2 (`docker compose`)
- **get.docker.com for production:** Docker docs explicitly state "not recommended for production"
- **Standalone docker-compose binary:** Replaced by docker-compose-plugin package

## Open Questions

Things that couldn't be fully resolved:

1. **Specific Docker version pinning**
   - What we know: Docker 29.x is current; apt can pin versions
   - What's unclear: Should we pin to exact version or allow minor updates?
   - Recommendation: Allow minor updates within 29.x; don't pin to patch version

2. **fail2ban default settings**
   - What we know: bantime=3600, maxretry=5 are reasonable defaults
   - What's unclear: Should we make these configurable via environment variables?
   - Recommendation: Use sensible defaults; advanced users can modify jail.local manually

3. **Handling Debian vs Ubuntu**
   - What we know: Both use apt, but repository URLs differ
   - What's unclear: Phase 23 focuses on Ubuntu; what about Debian support?
   - Recommendation: Ubuntu 22.04+ primary target; Debian support as stretch goal (same patterns work)

## Sources

### Primary (HIGH confidence)

- [Docker Engine Install Ubuntu](https://docs.docker.com/engine/install/ubuntu/) - Official apt repository method
- [Docker Compose Version](https://docs.docker.com/reference/cli/docker/compose/version/) - v2 verification
- [UFW Essentials](https://www.digitalocean.com/community/tutorials/ufw-essentials-common-firewall-rules-and-commands) - Firewall configuration
- [Protect SSH with Fail2Ban Ubuntu 22.04](https://www.digitalocean.com/community/tutorials/how-to-protect-ssh-with-fail2ban-on-ubuntu-22-04) - fail2ban setup
- [Install jq on Ubuntu 22.04](https://www.cyberithub.com/how-to-install-jq-json-processor-on-ubuntu-22-04/) - jq installation

### Secondary (MEDIUM confidence)

- [Docker Install Script (get.docker.com)](https://get.docker.com/) - Convenience script documentation (reviewed to understand limitations)
- [Baeldung: Check Package Installed](https://www.baeldung.com/linux/check-how-package-installed) - dpkg-query patterns
- [Hostinger: Configure UFW](https://www.hostinger.com/tutorials/how-to-configure-firewall-on-ubuntu-using-ufw) - UFW configuration

### Tertiary (LOW confidence)

- Docker forums discussions on get.docker.com issues (community reports, not official)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Official Docker documentation, DigitalOcean guides verified
- Architecture: HIGH - Patterns align with Phase 22 and existing deploy-selfhosted.sh
- Pitfalls: HIGH - Documented in official sources and community reports

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (30 days - Docker stable, UFW/fail2ban mature tools)

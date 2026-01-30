# Stack Research: One-Script Deployment Automation (v2.1)

**Domain:** Infrastructure deployment automation (Bash scripting)
**Researched:** 2026-01-25
**Confidence:** HIGH

## Executive Summary

The existing v1.1 deployment scripts (`deploy-selfhosted.sh`, `deploy-digitalocean.sh`) already use solid patterns. The one-script automation milestone requires **refinement**, not reinvention. The recommended approach is pure Bash with targeted enhancements for error handling, interactive configuration, and verification -- no additional runtime dependencies.

**Key insight:** Your existing scripts already implement 80% of the patterns needed. This research identifies the missing 20% for one-script automation.

---

## Recommended Stack

### Core Technologies

| Technology            | Version                    | Purpose                                         | Why Recommended                                                                                                           |
| --------------------- | -------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Bash**              | 5.x (Ubuntu 24.04 default) | Script execution runtime                        | Pre-installed on all target systems. Existing scripts already use Bash. No additional runtime dependencies.               |
| **curl**              | System default             | HTTP requests for health checks, Docker install | Pre-installed on Ubuntu/Debian. More feature-rich than wget for health check responses. Already used in existing scripts. |
| **Docker Engine**     | 5:29.x via get.docker.com  | Container runtime                               | Official convenience script handles Ubuntu 24.04/22.04 and Debian. Includes Docker Compose v2 plugin automatically.       |
| **Docker Compose v2** | 2.x plugin (bundled)       | Multi-container orchestration                   | Bundled with Docker Engine install. No separate installation needed. `docker compose` syntax (not `docker-compose`).      |

### Supporting Tools (Already Available on Target)

| Tool        | Purpose                        | Installation            | Notes                                                                                  |
| ----------- | ------------------------------ | ----------------------- | -------------------------------------------------------------------------------------- |
| **openssl** | Password/secret generation     | Pre-installed           | `openssl rand -base64 32` for secure random strings. Already used in existing scripts. |
| **dig**     | DNS resolution verification    | `apt install dnsutils`  | Existing scripts already install this.                                                 |
| **ufw**     | Firewall configuration         | Pre-installed on Ubuntu | Existing scripts already configure this.                                               |
| **jq**      | JSON parsing for health checks | `apt install jq`        | Optional but useful. ~1MB. Enables reliable JSON parsing in health checks.             |
| **lsof**    | Port availability checking     | Pre-installed           | Used in existing health-check.sh for port validation.                                  |

### Development/Quality Tools (For Script Authors)

| Tool           | Purpose                 | Installation                      | Notes                                                  |
| -------------- | ----------------------- | --------------------------------- | ------------------------------------------------------ |
| **ShellCheck** | Static analysis/linting | `apt install shellcheck`          | Catches common Bash errors. Use in CI and pre-commit.  |
| **shfmt**      | Script formatting       | Go binary or `snap install shfmt` | Optional. Consistent code style.                       |
| **bats-core**  | Test framework          | `apt install bats`                | Optional. For testing script functions. TAP-compliant. |

## Installation Commands

```bash
# No npm/node installation needed - pure Bash approach

# Development machine (for script quality)
sudo apt install shellcheck  # Static analysis

# Target VM prerequisites installed by the deployment script itself
# The script installs: Docker, curl, dig (dnsutils), ufw, fail2ban, jq
```

---

## Error Handling Patterns

### Current State (Existing Scripts)

Your `deploy-selfhosted.sh` uses:

```bash
set -e  # Exit on error
```

This is correct but incomplete. Errors exit without diagnostics or rollback decisions.

### Recommended Enhancement: trap ERR with Context

```bash
#!/bin/bash
set -euo pipefail

# Track deployment state for intelligent rollback
DEPLOYMENT_STARTED=false
DEPLOYMENT_COMPLETE=false
SERVICES_RUNNING=false

# Error handler with context
handle_error() {
    local exit_code=$?
    local line_number=${BASH_LINENO[0]}
    local command="$BASH_COMMAND"

    echo ""
    echo -e "${RED}=======================================${NC}"
    echo -e "${RED}ERROR DETECTED${NC}"
    echo -e "${RED}=======================================${NC}"
    echo "Exit code:   $exit_code"
    echo "Line:        $line_number"
    echo "Command:     $command"
    echo ""

    # Decide: rollback vs diagnostic mode
    if [[ "$SERVICES_RUNNING" == "true" ]]; then
        warning "Services were started. Attempting automatic rollback..."
        rollback_deployment
    elif [[ "$DEPLOYMENT_STARTED" == "true" ]]; then
        warning "Deployment was in progress. Partial state may exist."
        echo "Review errors above. Manual cleanup may be needed."
        show_diagnostic_commands
    else
        echo "Deployment had not started. No rollback needed."
        echo "Fix the issue above and rerun the script."
    fi

    exit "$exit_code"
}

trap handle_error ERR

# Cleanup on any exit (success or failure)
cleanup() {
    rm -f /tmp/freshtrack-*.tmp 2>/dev/null || true
}

trap cleanup EXIT
```

**Why this pattern:**

- Works with existing `set -e` approach
- `$BASH_LINENO` and `$BASH_COMMAND` provide diagnostic context
- State tracking allows intelligent rollback decisions
- EXIT trap ensures cleanup regardless of exit reason

### Diagnostic Helper Function

```bash
show_diagnostic_commands() {
    echo ""
    echo "Diagnostic commands:"
    echo "  docker compose ps              # Check container status"
    echo "  docker compose logs backend    # View backend logs"
    echo "  docker compose logs postgres   # View database logs"
    echo "  curl http://localhost:3000/health  # Check API health"
    echo ""
}
```

---

## Interactive Configuration Patterns

### Current State (Existing Scripts)

Your scripts already use `read -rp` for prompts. This is correct and portable:

```bash
if [ -z "$DOMAIN" ]; then
    read -rp "Enter your domain name (e.g., freshtrackpro.com): " DOMAIN
fi
```

### Enhancement: Validation and Defaults

```bash
# Domain with validation
prompt_domain() {
    local default="${1:-}"

    while true; do
        if [[ -n "$default" ]]; then
            read -rp "Enter domain name [$default]: " input
            DOMAIN="${input:-$default}"
        else
            read -rp "Enter domain name: " DOMAIN
        fi

        # Basic domain validation
        if [[ "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
            break
        else
            warning "Invalid domain format. Please try again."
        fi
    done
}

# Password with auto-generate option
prompt_password() {
    local var_name="$1"
    local prompt_text="$2"

    read -rsp "$prompt_text (or press Enter to auto-generate): " input
    echo ""

    if [[ -z "$input" ]]; then
        input=$(openssl rand -base64 32)
        success "Generated secure random password"
    fi

    eval "$var_name='$input'"
}

# Yes/No confirmation
confirm() {
    local prompt="$1"
    local default="${2:-n}"

    if [[ "$AUTO_YES" == "true" ]]; then
        return 0
    fi

    local yn_prompt
    if [[ "$default" == "y" ]]; then
        yn_prompt="[Y/n]"
    else
        yn_prompt="[y/N]"
    fi

    read -rp "$prompt $yn_prompt: " response
    response="${response:-$default}"

    [[ "$response" =~ ^[Yy] ]]
}
```

### Why NOT whiptail/dialog

| Factor         | whiptail/dialog           | Native read         |
| -------------- | ------------------------- | ------------------- |
| Dependencies   | Must install              | Pre-installed       |
| UX             | Prettier dialogs          | Simple text prompts |
| Scriptability  | Complex fd redirection    | Straightforward     |
| Automation     | Harder with `--yes` flags | Simple skipping     |
| Error handling | Exit codes need care      | Direct              |

**Verdict:** For a one-time deployment script, native `read` is simpler and sufficient. whiptail adds complexity without proportional value.

---

## Verification Tools and Patterns

### Health Check Enhancements

Your existing `validate_deployment_health()` is solid. Enhance with jq for reliable JSON:

```bash
# Install jq if not present (small footprint)
ensure_jq() {
    if ! command -v jq &> /dev/null; then
        step "Installing jq for JSON parsing..."
        apt-get install -y -qq jq
        success "jq installed"
    fi
}

# Enhanced health check with JSON validation
check_backend_health() {
    local url="${1:-http://localhost:3000/health}"
    local timeout="${2:-10}"

    local response
    response=$(curl -sf --max-time "$timeout" "$url" 2>/dev/null) || return 1

    # Validate JSON and check status
    local status
    status=$(echo "$response" | jq -r '.status' 2>/dev/null) || return 1

    if [[ "$status" == "healthy" ]]; then
        return 0
    else
        warning "Health check returned status: $status"
        return 1
    fi
}

# Full readiness check (database, redis, etc.)
check_backend_ready() {
    local url="${1:-http://localhost:3000/health/ready}"
    local timeout="${2:-10}"

    local response
    response=$(curl -sf --max-time "$timeout" "$url" 2>/dev/null) || return 1

    local db_status
    db_status=$(echo "$response" | jq -r '.database' 2>/dev/null) || return 1

    if [[ "$db_status" == "connected" ]]; then
        return 0
    else
        warning "Database status: $db_status"
        return 1
    fi
}
```

### Comprehensive Verification Checklist

| Verification       | Command                                                     | What It Checks           |
| ------------------ | ----------------------------------------------------------- | ------------------------ |
| Docker running     | `docker info > /dev/null 2>&1`                              | Docker daemon accessible |
| Compose v2         | `docker compose version > /dev/null 2>&1`                   | Plugin installed         |
| Backend health     | `curl -sf localhost:3000/health \| jq -r '.status'`         | API responding           |
| Database connected | `curl -sf localhost:3000/health/ready \| jq -r '.database'` | PostgreSQL accessible    |
| DNS resolution     | `dig +short $DOMAIN \| tail -1`                             | DNS points to server     |
| SSL certificate    | `curl -sI https://$DOMAIN \| grep "HTTP.*200"`              | HTTPS working            |
| All containers     | `docker compose ps --format json \| jq -r '.[].State'`      | No exited containers     |

### E2E Smoke Test Pattern

```bash
run_smoke_test() {
    step "Running E2E smoke test..."

    local base_url="https://${DOMAIN}"
    local failures=0

    # Test 1: Frontend loads
    if curl -sf --max-time 10 "$base_url" > /dev/null; then
        success "Frontend accessible"
    else
        error "Frontend not accessible"
        ((failures++))
    fi

    # Test 2: API health
    if check_backend_health "${base_url}/api/health"; then
        success "API healthy"
    else
        error "API not healthy"
        ((failures++))
    fi

    # Test 3: WebSocket connection (if applicable)
    # Skip for basic deployment verification

    if [[ $failures -eq 0 ]]; then
        success "All smoke tests passed"
        return 0
    else
        error "$failures smoke test(s) failed"
        return 1
    fi
}
```

---

## OS Detection Pattern

```bash
detect_os() {
    if [[ ! -f /etc/os-release ]]; then
        error "Cannot detect OS. /etc/os-release not found."
        error "This script requires Ubuntu or Debian."
        exit 1
    fi

    # shellcheck source=/dev/null
    source /etc/os-release

    OS_ID="$ID"
    OS_VERSION="${VERSION_ID:-unknown}"
    OS_CODENAME="${VERSION_CODENAME:-unknown}"

    case "$OS_ID" in
        ubuntu)
            case "$OS_VERSION" in
                22.04|24.04)
                    success "Detected: Ubuntu $OS_VERSION LTS ($OS_CODENAME)"
                    ;;
                *)
                    warning "Ubuntu $OS_VERSION detected. Tested with 22.04 and 24.04 LTS."
                    ;;
            esac
            ;;
        debian)
            case "$OS_VERSION" in
                11|12)
                    success "Detected: Debian $OS_VERSION ($OS_CODENAME)"
                    ;;
                *)
                    warning "Debian $OS_VERSION detected. Tested with 11 (bullseye) and 12 (bookworm)."
                    ;;
            esac
            ;;
        *)
            error "Unsupported OS: $OS_ID"
            error "This script requires Ubuntu (22.04/24.04) or Debian (11/12)."
            exit 1
            ;;
    esac
}
```

---

## Docker Installation Pattern

Your existing `install_docker()` is correct. Minor enhancement for idempotency:

```bash
install_docker() {
    step "Installing Docker..."

    # Already installed check
    if command -v docker &> /dev/null; then
        local version
        version=$(docker --version | awk '{print $3}' | tr -d ',')
        success "Docker already installed: v$version"

        # Verify Docker Compose v2 plugin
        if docker compose version &> /dev/null; then
            local compose_version
            compose_version=$(docker compose version --short)
            success "Docker Compose v2 available: v$compose_version"
            return 0
        else
            warning "Docker Compose v2 plugin missing. Installing..."
        fi
    fi

    # Install using official convenience script
    step "Downloading Docker installation script..."
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh

    step "Running Docker installation (this may take 2-3 minutes)..."
    sh /tmp/get-docker.sh
    rm /tmp/get-docker.sh

    # Enable and start
    systemctl enable docker
    systemctl start docker

    # Add user to docker group if running via sudo
    if [[ -n "${SUDO_USER:-}" ]]; then
        usermod -aG docker "$SUDO_USER"
        success "Added $SUDO_USER to docker group"
        warning "User must log out and back in for docker group to take effect"
    fi

    # Verify installation
    local version
    version=$(docker --version | awk '{print $3}' | tr -d ',')
    success "Docker installed: v$version"

    local compose_version
    compose_version=$(docker compose version --short)
    success "Docker Compose v2 available: v$compose_version"
}
```

---

## Alternatives Considered

| Recommended            | Alternative                          | When to Use Alternative                                   |
| ---------------------- | ------------------------------------ | --------------------------------------------------------- |
| Bash native `read`     | whiptail/dialog                      | Only if UX polish is critical and team accepts dependency |
| `set -e` + `trap ERR`  | Manual `\|\| exit 1` on each command | Never -- trap is more maintainable                        |
| curl for health checks | wget                                 | Only if curl unavailable (rare on Ubuntu)                 |
| get.docker.com script  | Manual apt repo setup                | Only if reproducibility concerns outweigh convenience     |
| Pure Bash              | Ansible/Terraform                    | Only if managing multiple servers at scale                |
| ShellCheck             | No linting                           | Never -- ShellCheck catches real bugs                     |

## What NOT to Use

| Avoid                                           | Why                                                                                                          | Use Instead           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------- |
| **Ansible**                                     | Over-engineering for single-server deployment. Adds Python dependency. Existing Bash scripts work well.      | Bash scripts          |
| **Terraform for deployment**                    | Wrong tool -- Terraform provisions infrastructure, not applications. Already have doctl for DO provisioning. | Bash + Docker Compose |
| **Configuration management (Puppet/Chef/Salt)** | Massive overhead for Docker Compose deployment. Learning curve not justified.                                | Bash scripts          |
| **docker-compose (v1)**                         | Deprecated since July 2023. Uses `docker-compose` binary instead of `docker compose` plugin.                 | `docker compose` (v2) |
| **Node.js/Python deployment scripts**           | Adds runtime dependency. Bash is simpler, portable, and what the existing scripts use.                       | Bash                  |
| **whiptail/dialog**                             | Adds dependency for marginal UX improvement. Deployment runs once, not daily.                                | Native `read`         |

---

## Version Compatibility

| Component      | Minimum Version | Recommended        | Notes                                  |
| -------------- | --------------- | ------------------ | -------------------------------------- |
| Ubuntu         | 22.04 LTS       | 24.04 LTS          | Both fully supported by get.docker.com |
| Debian         | 11 (bullseye)   | 12 (bookworm)      | Same Docker installation script works  |
| Docker Engine  | 24.x            | 29.x (latest)      | get.docker.com installs latest stable  |
| Docker Compose | v2.20+          | v2.29+             | Bundled with Docker Engine             |
| Bash           | 5.0+            | 5.2 (Ubuntu 24.04) | Standard on Ubuntu 22.04+              |

---

## Integration with Existing Scripts

### Files to Enhance (Not Replace)

| File                     | Current State           | Enhancement Needed                         |
| ------------------------ | ----------------------- | ------------------------------------------ |
| `deploy-selfhosted.sh`   | Good foundation         | Add trap ERR handler, enhance verification |
| `deploy-digitalocean.sh` | Delegates to selfhosted | Integrate one-script flow                  |
| `health-check.sh`        | Pre-flight checks       | Add post-deployment verification           |
| `rollback.sh`            | Manual rollback         | Integrate with auto-rollback               |
| `lib/doctl-helpers.sh`   | DO provisioning         | No changes needed                          |

### New Files to Create

| File                    | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `install.sh`            | One-script entry point (sources others, orchestrates flow) |
| `lib/error-handlers.sh` | Shared error handling functions                            |
| `lib/verification.sh`   | Health check and verification functions                    |
| `lib/config-prompts.sh` | Interactive configuration prompts                          |

---

## Sources

### HIGH Confidence (Official Documentation)

- [Docker Engine Install - Ubuntu](https://docs.docker.com/engine/install/ubuntu/) -- Docker 29.x packages, Compose v2 bundled
- [Docker Compose v2 Migration](https://docs.docker.com/compose/releases/migrate/) -- V1 deprecated July 2023
- [docker-install GitHub](https://github.com/docker/docker-install) -- get.docker.com source
- [ShellCheck GitHub](https://github.com/koalaman/shellcheck) -- Static analysis for Bash

### MEDIUM Confidence (Verified Community Patterns)

- [Red Hat: Bash Error Handling](https://www.redhat.com/en/blog/bash-error-handling) -- trap ERR patterns
- [Red Hat: Error Handling in Bash Scripting](https://www.redhat.com/en/blog/error-handling-bash-scripting) -- Best practices
- [citizen428.net: Bash Error Handling with Trap](https://citizen428.net/blog/bash-error-handling-with-trap/) -- Practical examples
- [nixCraft: Detect OS in Bash](https://www.cyberciti.biz/faq/how-to-check-os-version-in-linux-command-line/) -- /etc/os-release patterns
- [Red Hat: Whiptail Interactive Scripts](https://www.redhat.com/sysadmin/use-whiptail) -- Why we chose NOT to use it

### LOW Confidence (Reference Only)

- [bats-core GitHub](https://github.com/bats-core/bats-core) -- Bash testing framework

---

## Confidence Assessment

| Area                  | Confidence | Rationale                                                       |
| --------------------- | ---------- | --------------------------------------------------------------- |
| Bash error handling   | HIGH       | trap ERR is standard POSIX pattern, verified with official docs |
| Docker installation   | HIGH       | get.docker.com is official, verified against Docker docs        |
| OS detection          | HIGH       | /etc/os-release is standardized across Ubuntu/Debian            |
| Health checks         | HIGH       | curl + jq pattern is production-standard                        |
| Interactive prompts   | HIGH       | Native read is POSIX, no dependencies                           |
| ShellCheck            | HIGH       | Official tool, actively maintained                              |
| Verification patterns | MEDIUM     | Based on existing working scripts + enhancements                |

**Overall Research Confidence:** HIGH

All recommendations build on existing working scripts with targeted enhancements. No unverified technologies or experimental patterns.

---

_Stack research for: FreshTrack Pro v2.1 One-Script Deployment Automation_
_Researched: 2026-01-25_
_Builds on: v1.1 Multi-Target Deployment infrastructure_

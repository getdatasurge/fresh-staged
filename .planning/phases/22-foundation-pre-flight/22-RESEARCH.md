# Phase 22: Foundation & Pre-Flight - Research

**Researched:** 2026-01-25
**Domain:** Bash scripting - error handling, system validation, credential safety
**Confidence:** HIGH

## Summary

Phase 22 establishes the foundational infrastructure for automated deployment: robust error handling with diagnostic context, pre-flight system validation (RAM/disk/CPU/OS/network), and checkpoint-based resume capability. The existing v1.1 scripts use basic `set -e` error handling but lack the advanced trap-based diagnostics, error categorization, and state persistence required by v2.1.

The standard approach combines:
1. `trap ERR` with comprehensive error handler capturing line number, command, and exit code
2. Checkpoint files for idempotent resume (flag-based state tracking)
3. Structured validation functions for each system resource
4. Credential filtering in all log output

**Primary recommendation:** Create a `scripts/lib/preflight-lib.sh` sourced library containing all error handling infrastructure and validation functions, keeping the main deployment script clean and focused on orchestration.

## Standard Stack

### Core

| Pattern | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `set -euo pipefail` | Bash 4+ | Strict mode | Standard production-grade bash; catches errors, unset vars, pipe failures |
| `trap error_handler ERR` | POSIX | Error capture | Only reliable way to capture failures with diagnostic context |
| `set -o errtrace` | Bash 4+ | Inherit trap | Required for traps to work inside functions |
| `/proc/meminfo` | Linux | System info | Universal Linux mechanism for memory/resource info |
| `/etc/os-release` | Linux | OS detection | Standard LSB-compliant OS identification file |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `curl` | Any | Network validation | Check connectivity to Docker Hub, GitHub |
| `dig` / `nslookup` | Any | DNS validation | Verify domain resolution to server IP |
| `free -m` | Any | Memory check | Human-readable RAM validation |
| `df -BG` | Any | Disk check | Human-readable disk space validation |
| `nproc` | Any | CPU check | CPU core count validation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `/proc/meminfo` | `free -m` | `free` is human-readable but requires parsing; `/proc/meminfo` is machine-friendly |
| `dig` | `host` or `nslookup` | `dig` provides most detailed output; `host` simpler but less info |
| File-based checkpoints | SQLite | File flags are simpler, no dependencies; SQLite overkill for linear steps |

## Architecture Patterns

### Recommended Project Structure

```
scripts/
├── deploy-automated.sh    # Main entry point (thin orchestrator)
├── lib/
│   ├── preflight-lib.sh   # Error handling, validation functions (NEW)
│   ├── doctl-helpers.sh   # DigitalOcean helpers (existing)
│   └── managed-db-helpers.sh # Database helpers (existing)
└── state/                 # Runtime checkpoint directory
    └── .checkpoint-*      # Phase completion markers
```

### Pattern 1: Strict Mode Header

**What:** Standard bash header for production scripts
**When to use:** Every bash script in deployment system
**Example:**
```bash
#!/usr/bin/env bash
# Source: https://www.redhat.com/en/blog/bash-error-handling
set -o errexit   # Exit on error (-e)
set -o errtrace  # Inherit ERR trap in functions (-E)
set -o nounset   # Error on unset variables (-u)
set -o pipefail  # Pipe fails on first error

# Script directory (portable)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
```

### Pattern 2: Comprehensive Error Handler

**What:** Trap handler that captures full diagnostic context
**When to use:** Main deployment script entry point
**Example:**
```bash
# Source: https://linuxsimply.com/bash-scripting-tutorial/error-handling-and-debugging/error-handling/trap-err/
error_handler() {
    local exit_code=$?
    local line_number=${BASH_LINENO[0]}
    local command="${BASH_COMMAND}"
    local script="${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}"

    # Never expose credentials in error output
    local sanitized_cmd
    sanitized_cmd=$(echo "$command" | sed -E 's/(password|secret|key|token)=[^ ]*/\1=[REDACTED]/gi')

    echo ""
    echo "ERROR: Deployment failed"
    echo "  Script:  $script"
    echo "  Line:    $line_number"
    echo "  Command: $sanitized_cmd"
    echo "  Exit:    $exit_code"
    echo "  Category: $(categorize_error $exit_code)"
    echo ""

    # Save error state for resume
    save_error_state "$script" "$line_number" "$exit_code"

    exit "$exit_code"
}

trap error_handler ERR
```

### Pattern 3: Checkpoint-Based Resume (Flag Pattern)

**What:** File-based checkpoints marking completed steps
**When to use:** Multi-step deployment where resume is needed
**Example:**
```bash
# Source: http://www.bashbooster.net/
STATE_DIR="${STATE_DIR:-/var/lib/freshtrack-deploy}"

checkpoint_done() {
    local checkpoint="$1"
    [[ -f "${STATE_DIR}/.checkpoint-${checkpoint}" ]]
}

checkpoint_set() {
    local checkpoint="$1"
    mkdir -p "$STATE_DIR"
    touch "${STATE_DIR}/.checkpoint-${checkpoint}"
    echo "$(date -Iseconds)" > "${STATE_DIR}/.checkpoint-${checkpoint}"
}

checkpoint_clear() {
    local checkpoint="$1"
    rm -f "${STATE_DIR}/.checkpoint-${checkpoint}"
}

# Usage in deployment
run_step() {
    local step_name="$1"
    local step_func="$2"

    if checkpoint_done "$step_name"; then
        echo "[SKIP] $step_name (already completed)"
        return 0
    fi

    echo "[RUN] $step_name"
    "$step_func"
    checkpoint_set "$step_name"
}
```

### Pattern 4: Error Categorization

**What:** Classify errors for appropriate recovery action
**When to use:** Error handler and recovery guidance
**Example:**
```bash
# Source: journalofcloudcomputing.springeropen.com/articles/10.1186/s13677-018-0112-9
categorize_error() {
    local exit_code=$1

    case $exit_code in
        # Network-related (transient, retry)
        6|7|28|35|52|56)
            echo "transient:network"
            ;;
        # Permission-related (recoverable with user action)
        1|126|127)
            echo "recoverable:permission"
            ;;
        # Resource exhaustion (recoverable with cleanup)
        137|139)
            echo "recoverable:resource"
            ;;
        # Fatal signals
        128|129|130|131)
            echo "fatal:signal"
            ;;
        *)
            echo "critical:unknown"
            ;;
    esac
}

recovery_guidance() {
    local category="$1"

    case $category in
        transient:*)
            echo "Retry: This appears to be a temporary network issue."
            echo "Run the script again to resume from the failed step."
            ;;
        recoverable:permission)
            echo "Check permissions: Ensure you have sudo access."
            echo "Verify file ownership in /opt/freshtrack-pro/"
            ;;
        recoverable:resource)
            echo "Resource issue: Free up memory or disk space."
            echo "Run: docker system prune -f"
            ;;
        fatal:*)
            echo "Fatal error: Manual intervention required."
            echo "Check system logs: journalctl -xe"
            ;;
        *)
            echo "Unknown error: Review the command that failed."
            echo "Check Docker logs: docker compose logs"
            ;;
    esac
}
```

### Pattern 5: Resource Validation Functions

**What:** Idempotent system requirement validation
**When to use:** Pre-flight checks before any modifications
**Example:**
```bash
# Source: https://www.baeldung.com/linux/total-physical-memory
validate_ram() {
    local min_mb=$1
    local available_kb
    available_kb=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
    local available_mb=$((available_kb / 1024))

    if [[ $available_mb -lt $min_mb ]]; then
        echo "ERROR: Insufficient RAM"
        echo "  Required: ${min_mb}MB"
        echo "  Available: ${available_mb}MB"
        echo ""
        echo "FreshTrack requires at least 2GB RAM for Docker services."
        return 1
    fi

    echo "OK: RAM ${available_mb}MB available (minimum: ${min_mb}MB)"
    return 0
}

validate_disk() {
    local min_gb=$1
    local mount_point="${2:-/}"
    local available_gb
    available_gb=$(df -BG "$mount_point" | awk 'NR==2 {gsub("G",""); print $4}')

    if [[ $available_gb -lt $min_gb ]]; then
        echo "ERROR: Insufficient disk space"
        echo "  Required: ${min_gb}GB"
        echo "  Available: ${available_gb}GB on $mount_point"
        return 1
    fi

    echo "OK: Disk ${available_gb}GB available (minimum: ${min_gb}GB)"
    return 0
}

validate_cpu() {
    local min_cores=$1
    local available_cores
    available_cores=$(nproc)

    if [[ $available_cores -lt $min_cores ]]; then
        echo "WARNING: Low CPU count"
        echo "  Recommended: ${min_cores} cores"
        echo "  Available: ${available_cores} cores"
        echo "  Deployment will continue but may be slow."
        return 0  # Warning only, not blocking
    fi

    echo "OK: CPU ${available_cores} cores (recommended: ${min_cores}+)"
    return 0
}
```

### Pattern 6: OS Detection and Validation

**What:** Validate supported OS versions
**When to use:** Before attempting package installation
**Example:**
```bash
# Source: https://www.cyberciti.biz/faq/how-to-check-os-version-in-linux-command-line/
validate_os() {
    if [[ ! -f /etc/os-release ]]; then
        echo "ERROR: Cannot detect OS version"
        echo "  /etc/os-release not found"
        echo "  Supported: Ubuntu 20.04+, Debian 11+"
        return 1
    fi

    source /etc/os-release

    local supported=false

    case "$ID" in
        ubuntu)
            if [[ "${VERSION_ID%%.*}" -ge 20 ]]; then
                supported=true
            fi
            ;;
        debian)
            if [[ "${VERSION_ID%%.*}" -ge 11 ]]; then
                supported=true
            fi
            ;;
    esac

    if [[ "$supported" != "true" ]]; then
        echo "ERROR: Unsupported OS"
        echo "  Detected: $PRETTY_NAME"
        echo "  Supported operating systems:"
        echo "    - Ubuntu 20.04 LTS or newer"
        echo "    - Debian 11 (Bullseye) or newer"
        return 1
    fi

    echo "OK: OS $PRETTY_NAME is supported"
    return 0
}
```

### Pattern 7: Network Connectivity Validation

**What:** Check reachability of required external services
**When to use:** Before attempting downloads or API calls
**Example:**
```bash
# Source: https://www.baeldung.com/linux/internet-connection-bash-test
validate_network() {
    local urls=(
        "https://registry-1.docker.io/v2/"
        "https://github.com"
        "https://get.docker.com"
    )

    local failed=0

    for url in "${urls[@]}"; do
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 15 "$url" || echo "000")

        if [[ "$http_code" == "000" ]]; then
            echo "ERROR: Cannot reach $url"
            echo "  Check your network connectivity and firewall rules."
            failed=1
        elif [[ "$http_code" -ge 400 && "$http_code" != "401" ]]; then
            echo "WARNING: $url returned HTTP $http_code"
        else
            echo "OK: $url reachable"
        fi
    done

    if [[ $failed -eq 1 ]]; then
        echo ""
        echo "Required URLs that must be reachable:"
        echo "  - registry-1.docker.io (Docker Hub)"
        echo "  - github.com (Source code)"
        echo "  - get.docker.com (Docker installer)"
        return 1
    fi

    return 0
}
```

### Pattern 8: DNS Resolution Validation

**What:** Verify domain resolves to server IP
**When to use:** Before attempting SSL certificate provisioning
**Example:**
```bash
# Source: https://www.baeldung.com/linux/bash-script-resolve-hostname
validate_dns() {
    local domain="$1"

    # Get server's public IP
    local server_ip
    server_ip=$(curl -s --max-time 10 ifconfig.me || curl -s --max-time 10 icanhazip.com)

    if [[ -z "$server_ip" ]]; then
        echo "ERROR: Could not determine server public IP"
        return 1
    fi

    # Resolve domain
    local resolved_ip
    resolved_ip=$(dig +short "$domain" | head -1)

    if [[ -z "$resolved_ip" ]]; then
        echo "ERROR: DNS lookup failed for $domain"
        echo "  No DNS record found."
        echo ""
        echo "Configure DNS:"
        echo "  Record Type: A"
        echo "  Name: $domain"
        echo "  Value: $server_ip"
        return 1
    fi

    if [[ "$resolved_ip" != "$server_ip" ]]; then
        echo "ERROR: DNS mismatch for $domain"
        echo "  Domain resolves to: $resolved_ip"
        echo "  Server IP is: $server_ip"
        echo ""
        echo "Update your DNS record to point to $server_ip"
        return 1
    fi

    echo "OK: $domain correctly resolves to $server_ip"
    return 0
}
```

### Anti-Patterns to Avoid

- **Bare `set -e` without trap:** Provides no diagnostic context on failure. Always pair with `trap ERR`.
- **Hardcoded credentials in scripts:** Use environment variables or secret files with restricted permissions.
- **Echo credentials in logs:** Filter all output through credential-sanitizing function.
- **Non-idempotent checks:** Validation functions should produce same result on repeated runs.
- **Global state modification in validation:** Pre-flight checks must not change system state.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RAM/disk/CPU detection | Custom parsing | Standard tools (`free`, `df`, `nproc`) | Parsing varies across distros |
| OS detection | uname parsing | `/etc/os-release` sourcing | Standard LSB file across all modern Linux |
| Network timeout | Background processes | `curl --connect-timeout` | Built-in timeout handling |
| Credential masking | Regex per-secret | Generic sed pattern | Catches any secret=value pattern |
| Process exit codes | Custom numbering | Standard Unix codes | Tools expect standard codes |

**Key insight:** Bash error handling is surprisingly complex. The combination of `set -e`, `set -o errtrace`, `set -o pipefail`, and `trap ERR` must all be used together. Missing any one creates subtle failure modes.

## Common Pitfalls

### Pitfall 1: Trap Not Inherited in Functions

**What goes wrong:** Error trap only fires in main script, not inside functions
**Why it happens:** By default, Bash doesn't propagate traps to subshells and functions
**How to avoid:** Always use `set -o errtrace` (or `set -E`) at script start
**Warning signs:** Errors inside functions don't show diagnostic output

### Pitfall 2: Pipefail Not Set

**What goes wrong:** `command1 | command2` succeeds even if command1 fails
**Why it happens:** Default Bash only checks exit code of last pipeline command
**How to avoid:** Always use `set -o pipefail`
**Warning signs:** Silent failures in piped commands

### Pitfall 3: Credentials Exposed in Error Output

**What goes wrong:** Password or API key appears in error message
**Why it happens:** `$BASH_COMMAND` captures full command including arguments
**How to avoid:** Sanitize command before displaying: `sed -E 's/(password|secret|key|token)=[^ ]*/\1=[REDACTED]/gi'`
**Warning signs:** Review error handler output for any credential patterns

### Pitfall 4: Checkpoint Files Not Atomic

**What goes wrong:** Interrupted checkpoint write leaves corrupt state
**Why it happens:** Writing file content then moving isn't atomic
**How to avoid:** Write to temp file, then `mv` (atomic on same filesystem)
**Warning signs:** Partial checkpoint files after interrupt

### Pitfall 5: DNS Check Before IP Detection

**What goes wrong:** DNS validation fails because server IP unknown
**Why it happens:** Calling `validate_dns` before determining server's public IP
**How to avoid:** Always detect server IP first using `ifconfig.me` or similar
**Warning signs:** "Cannot determine server IP" errors

### Pitfall 6: RAM Check Uses Total Instead of Available

**What goes wrong:** System passes RAM check but deployment OOMs
**Why it happens:** Checking `MemTotal` instead of `MemAvailable`
**How to avoid:** Use `MemAvailable` from `/proc/meminfo` for actual usable memory
**Warning signs:** Deployment fails with out-of-memory despite passing preflight

## Code Examples

Verified patterns from official sources and codebase analysis:

### Complete Error Handler with Credential Safety

```bash
# Source: Adapted from https://citizen428.net/blog/bash-error-handling-with-trap/
# Enhanced with credential filtering (ERROR-07)

# Patterns to redact from output
SENSITIVE_PATTERNS='password|secret|key|token|credential|api_key|auth'

sanitize_output() {
    sed -E "s/(${SENSITIVE_PATTERNS})=[^ '\"]*/\1=[REDACTED]/gi"
}

error_handler() {
    local exit_code=$?
    local line_number=${BASH_LINENO[0]}
    local command="${BASH_COMMAND}"
    local func_name="${FUNCNAME[1]:-main}"

    # Sanitize command before display
    local safe_command
    safe_command=$(echo "$command" | sanitize_output)

    echo "" >&2
    echo "========================================" >&2
    echo "DEPLOYMENT ERROR" >&2
    echo "========================================" >&2
    echo "Line:     $line_number" >&2
    echo "Function: $func_name" >&2
    echo "Command:  $safe_command" >&2
    echo "Exit:     $exit_code" >&2
    echo "Category: $(categorize_error $exit_code)" >&2
    echo "========================================" >&2
    echo "" >&2

    recovery_guidance "$(categorize_error $exit_code)" >&2

    # Save state for resume
    echo "$line_number" > "${STATE_DIR}/.last-error-line"
    echo "$(date -Iseconds)" > "${STATE_DIR}/.last-error-time"

    exit "$exit_code"
}
```

### Full Pre-Flight Validation Suite

```bash
# Source: Adapted from existing scripts/health-check.sh

run_preflight_checks() {
    echo "========================================"
    echo "Pre-Flight System Validation"
    echo "========================================"
    echo ""

    local failed=0

    # PREFLIGHT-01: RAM (2GB minimum)
    echo "Checking RAM..."
    if ! validate_ram 2048; then
        failed=1
    fi

    # PREFLIGHT-02: Disk (10GB minimum)
    echo "Checking disk space..."
    if ! validate_disk 10; then
        failed=1
    fi

    # PREFLIGHT-03: CPU (2 cores recommended)
    echo "Checking CPU..."
    validate_cpu 2  # Warning only

    # PREFLIGHT-04: OS version
    echo "Checking OS..."
    if ! validate_os; then
        failed=1
    fi

    # PREFLIGHT-05: Network connectivity
    echo "Checking network..."
    if ! validate_network; then
        failed=1
    fi

    echo ""
    if [[ $failed -eq 1 ]]; then
        echo "Pre-flight checks FAILED"
        echo "Resolve the issues above before proceeding."
        return 1
    fi

    echo "All pre-flight checks PASSED"
    return 0
}
```

### Existing Codebase Integration Points

The existing codebase provides patterns to follow:

1. **Color output helpers** (from `deploy-selfhosted.sh` lines 9-31):
   - `step()`, `success()`, `error()`, `warning()` functions
   - Consistent color scheme across scripts

2. **Idempotent package installation** (from `deploy-selfhosted.sh` lines 136-146):
   - `ensure_package()` function checks before install
   - Pattern to reuse for idempotent operations

3. **DNS validation** (from `deploy-selfhosted.sh` lines 172-229):
   - `check_dns_resolution()` already exists
   - Can be adapted for preflight (currently called during deployment)

4. **Health check patterns** (from `health-check.sh`):
   - Check counter pattern with `CHECKS_PASSED` / `CHECKS_FAILED`
   - Exit codes based on failure count

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `set -e` alone | `set -euo pipefail` + trap | Best practice since ~2019 | Catches more failure modes |
| Parse `uname` for OS | Source `/etc/os-release` | systemd adoption | Standardized OS info |
| `grep MemTotal` | `grep MemAvailable` | Linux 3.14+ | Accurate usable memory |
| External state DB | File-based checkpoints | Always preferred for bash | Zero dependencies |

**Deprecated/outdated:**
- `lsb_release`: Not installed by default on minimal systems; prefer `/etc/os-release`
- `ifconfig`: Deprecated in favor of `ip` command, though fine for simple IP detection

## Open Questions

Things that couldn't be fully resolved:

1. **Checkpoint storage location**
   - What we know: `/var/lib/freshtrack-deploy/` follows FHS standards
   - What's unclear: Should this be configurable? Root-owned or user-owned?
   - Recommendation: Default to `/var/lib/freshtrack-deploy/` but allow `STATE_DIR` override

2. **Error retry counts**
   - What we know: Transient network errors should retry
   - What's unclear: How many retries? What backoff strategy?
   - Recommendation: Start with 3 retries, 5-second delays; tune based on testing

3. **Rollback granularity**
   - What we know: ERROR-04 requires automatic rollback on critical failures
   - What's unclear: What constitutes "critical" vs "recoverable"?
   - Recommendation: Define critical as Docker service failures, recoverable as config errors

## Sources

### Primary (HIGH confidence)

- [Red Hat: Bash Error Handling](https://www.redhat.com/en/blog/bash-error-handling) - Comprehensive trap ERR guide
- [Baeldung: Linux Total Physical Memory](https://www.baeldung.com/linux/total-physical-memory) - RAM detection methods
- [nixCraft: Check OS Version](https://www.cyberciti.biz/faq/how-to-check-os-version-in-linux-command-line/) - OS detection reference
- [Baeldung: Internet Connection Bash Test](https://www.baeldung.com/linux/internet-connection-bash-test) - Network validation patterns
- Existing codebase: `scripts/deploy-selfhosted.sh`, `scripts/health-check.sh`, `scripts/test/e2e-sensor-pipeline.sh`

### Secondary (MEDIUM confidence)

- [How to write idempotent Bash scripts](https://arslan.io/2019/07/03/how-to-write-idempotent-bash-scripts/) - Idempotency patterns
- [Bash Booster](http://www.bashbooster.net/) - Flag-based checkpoint pattern
- [GitGuardian: Secrets at Command Line](https://blog.gitguardian.com/secrets-at-the-command-line/) - Credential safety

### Tertiary (LOW confidence)

- [Journal of Cloud Computing: Transient Failure Recovery](https://journalofcloudcomputing.springeropen.com/articles/10.1186/s13677-018-0112-9) - Error categorization theory

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Well-established bash patterns, verified against official documentation
- Architecture: HIGH - Patterns observed in existing codebase and production scripts
- Pitfalls: HIGH - Verified through multiple official sources and common failure modes

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (30 days - stable domain, bash practices don't change rapidly)

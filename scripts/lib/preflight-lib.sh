#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Pre-Flight Library
# Error handling infrastructure for deployment scripts
# ===========================================
# Usage: source this file at the start of deployment scripts
#   source "$(dirname "$0")/lib/preflight-lib.sh"
# ===========================================

set -o errexit   # Exit on error
set -o errtrace  # Inherit ERR trap in functions
set -o nounset   # Error on unset variables
set -o pipefail  # Pipe fails on first error

# Script directory detection for portable paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_VERSION="1.0.0"

# ===========================================
# Colors and Output Helpers
# Matches pattern from deploy-selfhosted.sh
# ===========================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

step() {
    echo ""
    echo -e "${BLUE}==>${NC} $1"
}

success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# ===========================================
# Checkpoint State Management
# ===========================================
# STATE_DIR can be overridden for testing
STATE_DIR="${STATE_DIR:-/var/lib/freshtrack-deploy}"

# Ensure state directory exists (called during checkpoint operations)
ensure_state_dir() {
    if [[ ! -d "$STATE_DIR" ]]; then
        mkdir -p "$STATE_DIR" 2>/dev/null || {
            # If can't create in /var/lib, fall back to local directory
            STATE_DIR="${SCRIPT_DIR:-.}/.deploy-state"
            mkdir -p "$STATE_DIR"
        }
    fi
}

# Check if a checkpoint has been completed
# Args: $1 = checkpoint name
# Returns: 0 if done, 1 if not done
checkpoint_done() {
    local checkpoint="$1"
    [[ -f "${STATE_DIR}/.checkpoint-${checkpoint}" ]]
}

# Get timestamp of when checkpoint was completed
# Args: $1 = checkpoint name
# Returns: timestamp or empty string
checkpoint_time() {
    local checkpoint="$1"
    local file="${STATE_DIR}/.checkpoint-${checkpoint}"
    if [[ -f "$file" ]]; then
        cat "$file"
    fi
}

# Mark a checkpoint as complete
# Args: $1 = checkpoint name
checkpoint_set() {
    local checkpoint="$1"
    ensure_state_dir
    date -Iseconds > "${STATE_DIR}/.checkpoint-${checkpoint}"
}

# Clear a checkpoint (mark as incomplete)
# Args: $1 = checkpoint name
checkpoint_clear() {
    local checkpoint="$1"
    rm -f "${STATE_DIR}/.checkpoint-${checkpoint}"
}

# Clear all checkpoints (full reset)
checkpoint_clear_all() {
    ensure_state_dir
    rm -f "${STATE_DIR}"/.checkpoint-*
    rm -f "${STATE_DIR}"/.last-error
    success "All checkpoints cleared"
}

# Run a deployment step with checkpoint tracking
# Args: $1 = step name (used as checkpoint)
#       $2 = function to run
#       $3+ = arguments to function
# Returns: 0 on success (including skip), function's exit code on failure
run_step() {
    local step_name="$1"
    local step_func="$2"
    shift 2

    if checkpoint_done "$step_name"; then
        local completed_at
        completed_at=$(checkpoint_time "$step_name")
        echo "[SKIP] $step_name (completed at: $completed_at)"
        return 0
    fi

    step "[RUN] $step_name"

    # Run the function
    if "$step_func" "$@"; then
        checkpoint_set "$step_name"
        success "$step_name completed"
        return 0
    else
        local exit_code=$?
        error "$step_name failed (exit code: $exit_code)"
        return $exit_code
    fi
}

# ===========================================
# Credential Sanitization
# Prevents sensitive data from appearing in logs
# ===========================================
SENSITIVE_PATTERNS='password|secret|key|token|credential|api_key|auth'

sanitize_output() {
    # Replace pattern=value with pattern=[REDACTED]
    # Handles both =value and ='value' and ="value" formats
    sed -E "s/(${SENSITIVE_PATTERNS})=['\"]?[^[:space:]'\"]+['\"]?/\1=[REDACTED]/gi"
}

# ===========================================
# Error Categorization
# Maps exit codes to actionable categories
# ===========================================
categorize_error() {
    local exit_code="${1:-1}"

    case "$exit_code" in
        # curl/wget network errors
        6|7|28|35|52|56)
            echo "transient:network"
            ;;
        # Permission/command not found
        1|126|127)
            echo "recoverable:permission"
            ;;
        # OOM, segfault
        137|139)
            echo "recoverable:resource"
            ;;
        # Signals: SIGHUP, SIGINT, SIGQUIT, SIGKILL
        128|129|130|131)
            echo "fatal:signal"
            ;;
        # Default: unknown
        *)
            echo "critical:unknown"
            ;;
    esac
}

# ===========================================
# Recovery Guidance
# Provides actionable advice based on error category
# ===========================================
recovery_guidance() {
    local category="${1:-critical:unknown}"

    echo ""
    echo -e "${YELLOW}Recovery Guidance:${NC}"

    case "$category" in
        transient:*)
            echo "  Retry: temporary network issue, run script again"
            echo "  If persistent, check network connectivity and DNS"
            ;;
        recoverable:permission)
            echo "  Check sudo access and verify file permissions"
            echo "  Ensure required commands are installed"
            ;;
        recoverable:resource)
            echo "  Free up memory/disk space"
            echo "  Run: docker system prune -f"
            echo "  Check: free -h && df -h"
            ;;
        fatal:*)
            echo "  Manual intervention required"
            echo "  Check system logs: journalctl -xe"
            echo "  Script was terminated by signal"
            ;;
        critical:*)
            echo "  Review the failed command above"
            echo "  Check Docker logs: docker compose logs"
            echo "  Verify environment variables are set correctly"
            ;;
    esac

    echo ""
}

# ===========================================
# Error State Persistence
# Saves error details for diagnostics and resume
# ===========================================

# Save error state for diagnostic purposes
# Args: $1 = script name
#       $2 = line number
#       $3 = exit code
save_error_state() {
    local script="$1"
    local line="$2"
    local exit_code="$3"

    ensure_state_dir

    {
        echo "timestamp=$(date -Iseconds)"
        echo "script=$script"
        echo "line=$line"
        echo "exit_code=$exit_code"
        echo "category=$(categorize_error "$exit_code")"
    } > "${STATE_DIR}/.last-error"
}

# Load last error state
# Returns: 0 if error state exists, 1 if not
load_error_state() {
    local file="${STATE_DIR}/.last-error"
    if [[ -f "$file" ]]; then
        # shellcheck source=/dev/null
        source "$file"
        return 0
    fi
    return 1
}

# ===========================================
# Interactive Recovery Handler
# Prompts user based on error category
# ===========================================

# Handle recovery based on error category
# Called by error_handler after displaying diagnostics
# Args: $1 = error category
# Returns: 0 if user chooses to retry, 1 to abort
handle_recovery() {
    local category="$1"

    case "$category" in
        transient:*)
            echo ""
            echo "This appears to be a temporary issue."
            echo "You can safely re-run the script to resume from the last checkpoint."
            echo ""
            read -rp "Retry now? [Y/n]: " retry
            if [[ "${retry,,}" != "n" ]]; then
                return 0  # Retry
            fi
            return 1  # Abort
            ;;

        recoverable:permission)
            echo ""
            echo "Permission issue detected."
            echo ""
            echo "Suggestions:"
            echo "  1. Ensure you're running with sudo: sudo ./deploy.sh"
            echo "  2. Check file ownership: ls -la /opt/freshtrack-pro/"
            echo "  3. Verify docker group membership: groups \$USER"
            echo ""
            read -rp "Fix the issue and retry? [Y/n]: " retry
            if [[ "${retry,,}" != "n" ]]; then
                return 0  # Retry
            fi
            return 1  # Abort
            ;;

        recoverable:resource)
            echo ""
            echo "Resource exhaustion detected (memory or disk)."
            echo ""
            echo "Quick fixes:"
            echo "  1. Free Docker resources: docker system prune -af"
            echo "  2. Check memory: free -h"
            echo "  3. Check disk: df -h"
            echo ""
            read -rp "Fix the issue and retry? [Y/n]: " retry
            if [[ "${retry,,}" != "n" ]]; then
                return 0  # Retry
            fi
            return 1  # Abort
            ;;

        critical:*)
            echo ""
            warning "CRITICAL FAILURE - Automatic rollback may be needed"
            echo ""
            echo "The deployment encountered a critical error."
            echo "Data has been preserved, but services may be in an inconsistent state."
            echo ""
            echo "Options:"
            echo "  1. Review logs: docker compose logs"
            echo "  2. Check system: journalctl -xe"
            echo "  3. Rollback: ./scripts/rollback.sh"
            echo ""
            return 1  # Always abort on critical
            ;;

        fatal:*)
            echo ""
            error "FATAL ERROR - Manual intervention required"
            echo ""
            echo "The deployment was interrupted by a signal."
            echo "This usually means:"
            echo "  - Process was killed (OOM, admin, etc.)"
            echo "  - User pressed Ctrl+C"
            echo ""
            echo "Check system status before retrying."
            return 1  # Always abort on fatal
            ;;

        *)
            echo ""
            warning "Unknown error category: $category"
            echo ""
            echo "Review the error above and determine if it's safe to retry."
            read -rp "Retry? [y/N]: " retry
            if [[ "${retry,,}" == "y" ]]; then
                return 0  # Retry only if explicit yes
            fi
            return 1  # Default to abort
            ;;
    esac
}

# ===========================================
# Comprehensive Error Handler
# Captures and displays diagnostic information
# ===========================================
error_handler() {
    local exit_code=$?
    local line_number=${BASH_LINENO[0]}
    local command="${BASH_COMMAND}"
    local func_name="${FUNCNAME[1]:-main}"

    # Sanitize command before display
    local sanitized_command
    sanitized_command=$(echo "$command" | sanitize_output)

    # Get error category
    local category
    category=$(categorize_error "$exit_code")

    # Print structured error block to stderr
    echo "" >&2
    echo -e "${RED}========================================${NC}" >&2
    echo -e "${RED}DEPLOYMENT ERROR${NC}" >&2
    echo -e "${RED}========================================${NC}" >&2
    echo -e "Line:     ${line_number}" >&2
    echo -e "Function: ${func_name}" >&2
    echo -e "Command:  ${sanitized_command}" >&2
    echo -e "Exit:     ${exit_code}" >&2
    echo -e "Category: ${category}" >&2
    echo -e "${RED}========================================${NC}" >&2

    # Display recovery guidance
    recovery_guidance "$category" >&2

    # Save error state for resume
    save_error_state "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}" "$line_number" "$exit_code"

    # Call recovery handler (prompts user based on error category)
    # Only in interactive mode (when stdin is a terminal)
    if [[ -t 0 ]]; then
        if handle_recovery "$category"; then
            # User chose to retry - re-execute the script
            exec "$0" "$@"
        fi
    fi

    # Exit with original exit code
    exit "$exit_code"
}

# ===========================================
# Trap Registration
# NOTE: This trap is registered when this library is sourced
# Scripts sourcing this library will inherit the error handler
# ===========================================
trap error_handler ERR

# ===========================================
# System Validation Functions
# Pre-flight checks for system resources
# ===========================================

# PREFLIGHT-01: Validate minimum RAM available
# Args: $1 = minimum MB required (default: 2048 for FreshTrack)
# Returns: 0 if sufficient, 1 if insufficient
validate_ram() {
    local min_mb="${1:-2048}"

    if [[ ! -f /proc/meminfo ]]; then
        error "Cannot read /proc/meminfo - is this Linux?"
        return 1
    fi

    local available_kb
    available_kb=$(grep MemAvailable /proc/meminfo | awk '{print $2}')

    if [[ -z "$available_kb" ]]; then
        # Fallback for older kernels without MemAvailable
        local free_kb buffers_kb cached_kb
        free_kb=$(grep "^MemFree:" /proc/meminfo | awk '{print $2}')
        buffers_kb=$(grep "^Buffers:" /proc/meminfo | awk '{print $2}')
        cached_kb=$(grep "^Cached:" /proc/meminfo | awk '{print $2}')
        available_kb=$((free_kb + buffers_kb + cached_kb))
    fi

    local available_mb=$((available_kb / 1024))

    if [[ $available_mb -lt $min_mb ]]; then
        error "Insufficient RAM"
        echo "  Required:  ${min_mb}MB"
        echo "  Available: ${available_mb}MB"
        echo ""
        echo "FreshTrack requires at least 2GB RAM for Docker services:"
        echo "  - PostgreSQL: ~256MB"
        echo "  - Redis: ~128MB"
        echo "  - Backend API: ~512MB"
        echo "  - Frontend: ~256MB"
        echo "  - Monitoring stack: ~512MB"
        return 1
    fi

    success "RAM: ${available_mb}MB available (minimum: ${min_mb}MB)"
    return 0
}

# PREFLIGHT-02: Validate minimum disk space available
# Args: $1 = minimum GB required (default: 10 for Docker images + data)
#       $2 = mount point to check (default: /)
# Returns: 0 if sufficient, 1 if insufficient
validate_disk() {
    local min_gb="${1:-10}"
    local mount_point="${2:-/}"

    local available_gb
    available_gb=$(df -BG "$mount_point" 2>/dev/null | awk 'NR==2 {gsub("G",""); print $4}')

    if [[ -z "$available_gb" ]]; then
        error "Cannot determine disk space for $mount_point"
        return 1
    fi

    if [[ $available_gb -lt $min_gb ]]; then
        error "Insufficient disk space"
        echo "  Required:  ${min_gb}GB"
        echo "  Available: ${available_gb}GB on $mount_point"
        echo ""
        echo "FreshTrack requires at least 10GB for:"
        echo "  - Docker images: ~4GB"
        echo "  - PostgreSQL data: ~2GB"
        echo "  - Monitoring data: ~2GB"
        echo "  - Application logs: ~1GB"
        echo "  - Buffer: ~1GB"
        echo ""
        echo "Free up space with: docker system prune -af"
        return 1
    fi

    success "Disk: ${available_gb}GB available on $mount_point (minimum: ${min_gb}GB)"
    return 0
}

# PREFLIGHT-03: Validate CPU cores (warning only, not blocking)
# Args: $1 = recommended cores (default: 2)
# Returns: 0 always (warning only)
validate_cpu() {
    local recommended="${1:-2}"

    local cores
    cores=$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo "1")

    if [[ $cores -lt $recommended ]]; then
        warning "Low CPU count"
        echo "  Recommended: ${recommended}+ cores"
        echo "  Available:   ${cores} cores"
        echo ""
        echo "Deployment will continue but may be slow."
        echo "Consider upgrading to a larger VM for production use."
    else
        success "CPU: ${cores} cores (recommended: ${recommended}+)"
    fi

    return 0
}

# PREFLIGHT-04: Validate OS version (Ubuntu 20.04+ or Debian 11+)
# Returns: 0 if supported, 1 if unsupported
validate_os() {
    if [[ ! -f /etc/os-release ]]; then
        error "Cannot detect OS version"
        echo "  /etc/os-release not found"
        echo ""
        echo "Supported operating systems:"
        echo "  - Ubuntu 20.04 LTS (Focal) or newer"
        echo "  - Ubuntu 22.04 LTS (Jammy) or newer"
        echo "  - Ubuntu 24.04 LTS (Noble) or newer"
        echo "  - Debian 11 (Bullseye) or newer"
        echo "  - Debian 12 (Bookworm) or newer"
        return 1
    fi

    # shellcheck source=/dev/null
    source /etc/os-release

    local supported=false
    local min_version=""

    case "$ID" in
        ubuntu)
            min_version="20.04"
            if [[ "${VERSION_ID%%.*}" -ge 20 ]]; then
                supported=true
            fi
            ;;
        debian)
            min_version="11"
            if [[ "${VERSION_ID%%.*}" -ge 11 ]]; then
                supported=true
            fi
            ;;
        *)
            # Unsupported OS
            ;;
    esac

    if [[ "$supported" != "true" ]]; then
        error "Unsupported operating system"
        echo "  Detected: $PRETTY_NAME"
        echo ""
        echo "Supported operating systems:"
        echo "  - Ubuntu 20.04 LTS (Focal) or newer"
        echo "  - Ubuntu 22.04 LTS (Jammy) or newer"
        echo "  - Ubuntu 24.04 LTS (Noble) or newer"
        echo "  - Debian 11 (Bullseye) or newer"
        echo "  - Debian 12 (Bookworm) or newer"
        echo ""
        echo "CentOS, RHEL, Fedora, Alpine, and Windows are not supported."
        return 1
    fi

    success "OS: $PRETTY_NAME (minimum: $ID $min_version)"
    return 0
}

# PREFLIGHT-05: Validate network connectivity to required URLs
# Returns: 0 if all reachable, 1 if any unreachable
validate_network() {
    local urls=(
        "https://registry-1.docker.io/v2/"
        "https://github.com"
        "https://get.docker.com"
    )

    local failed=0
    local timeout=10

    for url in "${urls[@]}"; do
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$timeout" --max-time 15 "$url" 2>/dev/null || echo "000")

        if [[ "$http_code" == "000" ]]; then
            error "Cannot reach: $url"
            failed=1
        elif [[ "$http_code" -ge 400 && "$http_code" != "401" ]]; then
            # 401 is expected for Docker registry (requires auth for pulls)
            warning "$url returned HTTP $http_code"
        else
            success "Reachable: $url (HTTP $http_code)"
        fi
    done

    if [[ $failed -eq 1 ]]; then
        echo ""
        echo "Required URLs that must be reachable:"
        echo "  - registry-1.docker.io (Docker Hub for images)"
        echo "  - github.com (Source code repository)"
        echo "  - get.docker.com (Docker installer script)"
        echo ""
        echo "Check your network connectivity and firewall rules."
        echo "Ensure outbound HTTPS (port 443) is allowed."
        return 1
    fi

    return 0
}

# PREFLIGHT-06: Validate DNS resolution for domain points to server IP
# Args: $1 = domain name to validate
# Returns: 0 if DNS matches server IP, 1 if not
# Note: This check is optional during preflight (domain may not be configured yet)
#       Use this when ready to deploy (before SSL provisioning)
validate_dns() {
    local domain="$1"

    if [[ -z "$domain" ]]; then
        error "validate_dns requires domain argument"
        return 1
    fi

    # Determine which DNS tool to use (dig preferred, getent fallback)
    local dns_tool=""
    if command -v dig &>/dev/null; then
        dns_tool="dig"
    elif command -v getent &>/dev/null; then
        dns_tool="getent"
    else
        # Try to install dnsutils if neither is available
        warning "No DNS lookup tool found, attempting to install dnsutils..."
        if command -v apt-get &>/dev/null; then
            # Use subshell to prevent ERR trap from firing on install failure
            if (set +e; apt-get update -qq && apt-get install -y dnsutils >/dev/null 2>&1); then
                dns_tool="dig"
            else
                error "Could not install dnsutils"
                echo "Install manually: sudo apt-get install dnsutils"
                return 1
            fi
        else
            error "Cannot install dig - apt-get not available"
            return 1
        fi
    fi

    # Get server's public IP
    step "Detecting server public IP..."
    local server_ip
    server_ip=$(curl -s --max-time 10 ifconfig.me 2>/dev/null) || \
    server_ip=$(curl -s --max-time 10 icanhazip.com 2>/dev/null) || \
    server_ip=$(curl -s --max-time 10 ipinfo.io/ip 2>/dev/null) || \
    server_ip=""

    if [[ -z "$server_ip" ]]; then
        error "Could not determine server public IP"
        echo "  Check internet connectivity"
        return 1
    fi

    echo "  Server IP: $server_ip"

    # Resolve domain using available tool
    step "Resolving DNS for $domain..."
    local resolved_ip=""
    if [[ "$dns_tool" == "dig" ]]; then
        resolved_ip=$(dig +short "$domain" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
    elif [[ "$dns_tool" == "getent" ]]; then
        resolved_ip=$(getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1}' | head -1)
    fi

    if [[ -z "$resolved_ip" ]]; then
        error "DNS lookup failed for $domain"
        echo "  No A record found."
        echo ""
        echo "Configure DNS at your domain registrar:"
        echo ""
        echo "  Record Type: A"
        echo "  Name:        $domain (or @ for root domain)"
        echo "  Value:       $server_ip"
        echo "  TTL:         300 (5 minutes)"
        echo ""
        echo "Wait for DNS propagation (typically 5-60 minutes) before retrying."
        echo ""
        echo "Verify with: dig $domain"
        return 1
    fi

    echo "  Domain resolves to: $resolved_ip"

    # Compare IPs
    if [[ "$resolved_ip" != "$server_ip" ]]; then
        error "DNS mismatch for $domain"
        echo "  Domain resolves to: $resolved_ip"
        echo "  Server IP is:       $server_ip"
        echo ""
        echo "Update your DNS A record to point to $server_ip"
        echo ""
        echo "If you recently updated DNS, wait for propagation (5-60 minutes)."
        echo "Check propagation status: dig $domain +trace"
        return 1
    fi

    success "DNS: $domain correctly resolves to $server_ip"
    return 0
}

# Run all pre-flight validation checks
# Args: $1 = domain (optional, for DNS validation)
# Returns: 0 if all pass, 1 if any critical check fails
run_preflight_checks() {
    local domain="${1:-}"

    echo "========================================"
    echo "Pre-Flight System Validation"
    echo "========================================"
    echo ""

    local failed=0

    step "Checking RAM..."
    if ! validate_ram 2048; then
        failed=1
    fi
    echo ""

    step "Checking disk space..."
    if ! validate_disk 10; then
        failed=1
    fi
    echo ""

    step "Checking CPU..."
    validate_cpu 2  # Warning only, doesn't fail
    echo ""

    step "Checking OS..."
    if ! validate_os; then
        failed=1
    fi
    echo ""

    step "Checking network connectivity..."
    if ! validate_network; then
        failed=1
    fi
    echo ""

    # DNS validation is optional (only if domain provided)
    if [[ -n "$domain" ]]; then
        step "Checking DNS resolution for $domain..."
        if ! validate_dns "$domain"; then
            failed=1
        fi
        echo ""
    else
        echo "[INFO] DNS validation skipped (no domain provided)"
        echo "       Run with domain argument for full validation:"
        echo "       run_preflight_checks \"yourdomain.com\""
        echo ""
    fi

    echo "========================================"
    if [[ $failed -eq 1 ]]; then
        error "Pre-flight checks FAILED"
        echo "Resolve the issues above before proceeding."
        echo ""
        return 1
    fi

    success "All pre-flight checks PASSED"
    echo ""
    return 0
}

# Run DNS validation only (useful for checking after DNS changes)
# Args: $1 = domain name
run_dns_check() {
    local domain="${1:-}"

    if [[ -z "$domain" ]]; then
        error "Usage: run_dns_check <domain>"
        return 1
    fi

    echo "========================================"
    echo "DNS Validation"
    echo "========================================"
    echo ""

    if validate_dns "$domain"; then
        echo ""
        success "DNS is correctly configured!"
        echo "You can proceed with deployment."
        return 0
    else
        echo ""
        error "DNS validation failed"
        echo "Fix the DNS configuration before proceeding."
        return 1
    fi
}

# ===========================================
# Self-test when run directly
# ===========================================
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Testing preflight-lib.sh v${LIB_VERSION}..."
    echo ""

    # Test sanitize_output
    echo "1. Testing credential sanitization..."
    test_cmd='curl -u user:password=secret123 https://api.example.com --header "Authorization: Bearer token=abc123"'
    sanitized=$(echo "$test_cmd" | sanitize_output)

    if echo "$sanitized" | grep -q "secret123"; then
        echo "FAIL: password not redacted"
        exit 1
    fi
    if echo "$sanitized" | grep -q "abc123"; then
        echo "FAIL: token not redacted"
        exit 1
    fi
    echo "PASS: Credential sanitization working"
    echo ""

    # Test categorize_error
    echo "2. Testing error categorization..."
    if [[ "$(categorize_error 28)" != "transient:network" ]]; then
        echo "FAIL: Exit code 28 should be transient:network"
        exit 1
    fi
    if [[ "$(categorize_error 127)" != "recoverable:permission" ]]; then
        echo "FAIL: Exit code 127 should be recoverable:permission"
        exit 1
    fi
    if [[ "$(categorize_error 137)" != "recoverable:resource" ]]; then
        echo "FAIL: Exit code 137 should be recoverable:resource"
        exit 1
    fi
    if [[ "$(categorize_error 130)" != "fatal:signal" ]]; then
        echo "FAIL: Exit code 130 should be fatal:signal"
        exit 1
    fi
    echo "PASS: Error categorization working"
    echo ""

    # Test validation functions (with low thresholds to ensure pass)
    echo "3. Testing validation functions..."

    # RAM validation with very low threshold
    if ! validate_ram 1 >/dev/null 2>&1; then
        echo "FAIL: validate_ram should pass with 1MB threshold"
        exit 1
    fi
    echo "PASS: validate_ram function working"

    # Disk validation with very low threshold
    if ! validate_disk 1 >/dev/null 2>&1; then
        echo "FAIL: validate_disk should pass with 1GB threshold"
        exit 1
    fi
    echo "PASS: validate_disk function working"

    # CPU validation (always returns 0)
    if ! validate_cpu 1 >/dev/null 2>&1; then
        echo "FAIL: validate_cpu should always return 0"
        exit 1
    fi
    echo "PASS: validate_cpu function working"

    # OS validation (should pass on Ubuntu/Debian CI)
    # Skip if not on supported OS (for development on macOS)
    if [[ -f /etc/os-release ]]; then
        source /etc/os-release
        if [[ "$ID" == "ubuntu" || "$ID" == "debian" ]]; then
            if ! validate_os >/dev/null 2>&1; then
                echo "FAIL: validate_os should pass on Ubuntu/Debian"
                exit 1
            fi
            echo "PASS: validate_os function working"
        else
            echo "SKIP: validate_os (not on Ubuntu/Debian)"
        fi
    else
        echo "SKIP: validate_os (no /etc/os-release)"
    fi

    # Test checkpoint functions
    echo ""
    echo "4. Testing checkpoint functions..."

    # Use temp state dir for tests
    original_state_dir="$STATE_DIR"
    export STATE_DIR=$(mktemp -d)

    # Test checkpoint_done (should be false initially)
    if checkpoint_done "test-checkpoint"; then
        echo "FAIL: checkpoint_done should return false for non-existent checkpoint"
        rm -rf "$STATE_DIR"
        exit 1
    fi

    # Test checkpoint_set
    checkpoint_set "test-checkpoint"

    # Test checkpoint_done (should be true after set)
    if ! checkpoint_done "test-checkpoint"; then
        echo "FAIL: checkpoint_done should return true after checkpoint_set"
        rm -rf "$STATE_DIR"
        exit 1
    fi

    # Test checkpoint_time
    ts=$(checkpoint_time "test-checkpoint")
    if [[ -z "$ts" ]]; then
        echo "FAIL: checkpoint_time should return timestamp"
        rm -rf "$STATE_DIR"
        exit 1
    fi

    # Test checkpoint_clear
    checkpoint_clear "test-checkpoint"
    if checkpoint_done "test-checkpoint"; then
        echo "FAIL: checkpoint_done should return false after checkpoint_clear"
        rm -rf "$STATE_DIR"
        exit 1
    fi

    echo "PASS: Checkpoint functions working"
    echo ""

    # Test error state functions
    echo "5. Testing error state functions..."

    save_error_state "test-script.sh" "99" "42"

    if ! load_error_state; then
        echo "FAIL: load_error_state should succeed after save_error_state"
        rm -rf "$STATE_DIR"
        exit 1
    fi

    if [[ "$script" != "test-script.sh" ]]; then
        echo "FAIL: script should be 'test-script.sh', got '$script'"
        rm -rf "$STATE_DIR"
        exit 1
    fi

    if [[ "$line" != "99" ]]; then
        echo "FAIL: line should be '99', got '$line'"
        rm -rf "$STATE_DIR"
        exit 1
    fi

    echo "PASS: Error state functions working"
    echo ""

    # Cleanup
    rm -rf "$STATE_DIR"
    export STATE_DIR="$original_state_dir"

    echo "========================================"
    echo "All tests passed!"
    echo "========================================"
fi

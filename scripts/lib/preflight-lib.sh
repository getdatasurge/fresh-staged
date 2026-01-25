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
# Self-test when run directly
# ===========================================
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Testing preflight-lib.sh v${LIB_VERSION}..."
    echo ""

    # Test sanitize_output
    echo "Test 1: Credential sanitization"
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
    echo "Test 2: Error categorization"
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
    if [[ "$(categorize_error 99)" != "critical:unknown" ]]; then
        echo "FAIL: Exit code 99 should be critical:unknown"
        exit 1
    fi
    echo "PASS: Error categorization working"
    echo ""

    echo "========================================="
    echo "All tests passed!"
    echo "========================================="
fi

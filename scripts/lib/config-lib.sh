#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Configuration Library
# Interactive input collection and validation
# ===========================================
# Usage: source this file in deployment scripts
#   source "$(dirname "$0")/lib/config-lib.sh"
#
# Functions provided:
#   - validate_fqdn()            Validate fully qualified domain name
#   - validate_email()           Validate email address format
#   - prompt_domain()            Interactive domain input with validation
#   - prompt_email()             Interactive email input with validation
#   - prompt_stack_auth()        Interactive Stack Auth credential collection
#   - collect_configuration()    Master function to collect all config
# ===========================================

# Source preflight-lib.sh for error handling and output helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/preflight-lib.sh"

LIB_VERSION="1.0.0"

# ===========================================
# Configuration
# ===========================================

# Maximum attempts for user input (prevents infinite loops)
MAX_INPUT_ATTEMPTS="${MAX_INPUT_ATTEMPTS:-5}"

# ===========================================
# Global Variables (set by prompt functions)
# ===========================================
DOMAIN=""
ADMIN_EMAIL=""
STACK_AUTH_PROJECT_ID=""
STACK_AUTH_PUBLISHABLE_KEY=""
STACK_AUTH_SECRET_KEY=""

# ===========================================
# Validation Functions
# ===========================================

# Validate a fully qualified domain name (FQDN)
# Args: $1 = domain to validate
# Returns: 0 if valid, 1 if invalid
# Validates per RFC 1123:
#   - Max 253 characters total
#   - Labels separated by dots
#   - Each label 1-63 characters
#   - Only alphanumeric and hyphens (no leading/trailing hyphens)
#   - TLD must be at least 2 characters
validate_fqdn() {
    local domain="$1"

    # Empty check
    if [[ -z "$domain" ]]; then
        return 1
    fi

    # Max length check (253 characters)
    if [[ ${#domain} -gt 253 ]]; then
        return 1
    fi

    # Must contain at least one dot
    if [[ "$domain" != *"."* ]]; then
        return 1
    fi

    # RFC 1123 compliant FQDN regex
    # Pattern breakdown:
    #   ^                                   Start of string
    #   ([a-zA-Z0-9]                        Label starts with alphanumeric
    #     ([a-zA-Z0-9-]{0,61}               0-61 alphanumeric or hyphens
    #       [a-zA-Z0-9])?                   Ends with alphanumeric (optional for single-char labels)
    #     \.)+                              Followed by dot, one or more labels
    #   [a-zA-Z]{2,}                        TLD: at least 2 letters
    #   $                                   End of string
    local fqdn_regex='^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'

    if [[ "$domain" =~ $fqdn_regex ]]; then
        return 0
    else
        return 1
    fi
}

# Validate an email address format
# Args: $1 = email to validate
# Returns: 0 if valid, 1 if invalid
validate_email() {
    local email="$1"

    # Empty check
    if [[ -z "$email" ]]; then
        return 1
    fi

    # Email regex
    # Pattern breakdown:
    #   ^                                   Start of string
    #   [a-zA-Z0-9._%+-]+                   Local part (before @)
    #   @                                   Required @ symbol
    #   [a-zA-Z0-9.-]+                      Domain part (after @)
    #   \.                                  Required dot before TLD
    #   [a-zA-Z]{2,}                        TLD: at least 2 letters
    #   $                                   End of string
    local email_regex='^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

    if [[ "$email" =~ $email_regex ]]; then
        return 0
    else
        return 1
    fi
}

# ===========================================
# Interactive Prompt Functions
# ===========================================

# Prompt for domain with validation
# Sets global variable: DOMAIN
# Returns: 0 on success, 1 if max attempts exceeded
prompt_domain() {
    local attempts=0
    local input

    echo ""
    echo -e "${BLUE}Domain Configuration${NC}"
    echo "----------------------------------------"
    echo "Enter your domain name (e.g., freshtrack.example.com)"
    echo ""
    echo "This domain will be used for:"
    echo "  - Main application: https://<domain>"
    echo "  - Monitoring:       https://monitoring.<domain>"
    echo "  - Status page:      https://status.<domain>"
    echo ""

    while [[ $attempts -lt $MAX_INPUT_ATTEMPTS ]]; do
        attempts=$((attempts + 1))

        read -rp "Domain: " input

        if validate_fqdn "$input"; then
            DOMAIN="$input"
            success "Domain accepted: $DOMAIN"
            return 0
        else
            echo ""
            error "Invalid domain format: '$input'"
            echo ""
            echo "Domain must be a valid FQDN (Fully Qualified Domain Name):"
            echo "  - Contains at least one dot (e.g., app.example.com)"
            echo "  - Only letters, numbers, and hyphens allowed"
            echo "  - Cannot start or end with a hyphen"
            echo "  - Maximum 253 characters"
            echo ""

            if [[ $attempts -lt $MAX_INPUT_ATTEMPTS ]]; then
                echo "Attempt $attempts of $MAX_INPUT_ATTEMPTS"
                echo ""
            fi
        fi
    done

    error "Maximum attempts ($MAX_INPUT_ATTEMPTS) exceeded"
    echo "Unable to collect valid domain input."
    return 1
}

# Prompt for admin email with validation
# Sets global variable: ADMIN_EMAIL
# Returns: 0 on success, 1 if max attempts exceeded
prompt_email() {
    local attempts=0
    local input

    echo ""
    echo -e "${BLUE}Admin Email Configuration${NC}"
    echo "----------------------------------------"
    echo "Enter the administrator email address."
    echo ""
    echo "This email will be used for:"
    echo "  - Let's Encrypt SSL certificate notifications"
    echo "  - System alerts and monitoring notifications"
    echo "  - Important deployment announcements"
    echo ""

    while [[ $attempts -lt $MAX_INPUT_ATTEMPTS ]]; do
        attempts=$((attempts + 1))

        read -rp "Admin Email: " input

        if validate_email "$input"; then
            ADMIN_EMAIL="$input"
            success "Email accepted: $ADMIN_EMAIL"
            return 0
        else
            echo ""
            error "Invalid email format: '$input'"
            echo ""
            echo "Please enter a valid email address (e.g., admin@example.com)"
            echo ""

            if [[ $attempts -lt $MAX_INPUT_ATTEMPTS ]]; then
                echo "Attempt $attempts of $MAX_INPUT_ATTEMPTS"
                echo ""
            fi
        fi
    done

    error "Maximum attempts ($MAX_INPUT_ATTEMPTS) exceeded"
    echo "Unable to collect valid email input."
    return 1
}

# Prompt for Stack Auth credentials
# Sets global variables: STACK_AUTH_PROJECT_ID, STACK_AUTH_PUBLISHABLE_KEY, STACK_AUTH_SECRET_KEY
# Returns: 0 on success, 1 if any required field is empty
prompt_stack_auth() {
    local input

    echo ""
    echo -e "${BLUE}Stack Auth Configuration${NC}"
    echo "----------------------------------------"
    echo "FreshTrack uses Stack Auth for authentication."
    echo ""
    echo "Get your credentials from:"
    echo "  https://app.stack-auth.com/projects"
    echo ""
    echo "Create a project if you don't have one, then copy the credentials."
    echo ""

    # Project ID
    read -rp "Stack Auth Project ID: " input
    if [[ -z "$input" ]]; then
        error "Project ID is required"
        return 1
    fi
    STACK_AUTH_PROJECT_ID="$input"

    # Publishable Key
    read -rp "Stack Auth Publishable Key: " input
    if [[ -z "$input" ]]; then
        error "Publishable Key is required"
        return 1
    fi
    STACK_AUTH_PUBLISHABLE_KEY="$input"

    # Secret Key (hidden input)
    read -rsp "Stack Auth Secret Key: " input
    echo ""  # Newline after hidden input
    if [[ -z "$input" ]]; then
        error "Secret Key is required"
        return 1
    fi
    STACK_AUTH_SECRET_KEY="$input"

    success "Stack Auth credentials collected"
    return 0
}

# ===========================================
# Master Configuration Collection
# ===========================================

# Collect all configuration interactively
# Returns: 0 when all inputs collected successfully, 1 on failure
collect_configuration() {
    echo ""
    echo "========================================"
    echo "FreshTrack Configuration"
    echo "========================================"

    # Collect domain
    if ! prompt_domain; then
        return 1
    fi

    # Collect email
    if ! prompt_email; then
        return 1
    fi

    # Collect Stack Auth credentials
    if ! prompt_stack_auth; then
        return 1
    fi

    echo ""
    echo "========================================"
    success "Configuration collected successfully!"
    echo "========================================"
    echo ""
    echo "Configuration summary:"
    echo "  Domain:         $DOMAIN"
    echo "  Admin Email:    $ADMIN_EMAIL"
    echo "  Stack Auth ID:  $STACK_AUTH_PROJECT_ID"
    echo "  Publishable:    ${STACK_AUTH_PUBLISHABLE_KEY:0:10}..."
    echo "  Secret Key:     [REDACTED]"
    echo ""

    return 0
}

# ===========================================
# Self-test when run directly
# ===========================================
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Testing config-lib.sh v${LIB_VERSION}..."
    echo ""

    # Test validate_fqdn with valid domains
    echo "1. Testing validate_fqdn with valid domains..."
    valid_domains=(
        "app.example.com"
        "sub.domain.co.uk"
        "my-app.freshtrack.io"
        "a.b.c.d.example.com"
        "x1.test.org"
    )
    for domain in "${valid_domains[@]}"; do
        if validate_fqdn "$domain"; then
            echo "PASS: validate_fqdn accepts '$domain'"
        else
            echo "FAIL: validate_fqdn should accept '$domain'"
            exit 1
        fi
    done
    echo ""

    # Test validate_fqdn with invalid domains
    echo "2. Testing validate_fqdn with invalid domains..."
    invalid_domains=(
        "localhost"
        "no-dot"
        ".leading-dot.com"
        "-leading-hyphen.com"
        "trailing-hyphen-.com"
        ""
        "x"
        "a.b"
    )
    for domain in "${invalid_domains[@]}"; do
        if ! validate_fqdn "$domain"; then
            echo "PASS: validate_fqdn rejects '$domain'"
        else
            echo "FAIL: validate_fqdn should reject '$domain'"
            exit 1
        fi
    done
    echo ""

    # Test validate_email with valid emails
    echo "3. Testing validate_email with valid emails..."
    valid_emails=(
        "test@example.com"
        "admin@example.com"
        "user.name@domain.org"
        "user+tag@example.io"
        "admin123@my-company.com"
    )
    for email in "${valid_emails[@]}"; do
        if validate_email "$email"; then
            echo "PASS: validate_email accepts '$email'"
        else
            echo "FAIL: validate_email should accept '$email'"
            exit 1
        fi
    done
    echo ""

    # Test validate_email with invalid emails
    echo "4. Testing validate_email with invalid emails..."
    invalid_emails=(
        "notanemail"
        "missing@tld"
        "@nolocal.com"
        "nodoamin@"
        ""
        "spaces in@email.com"
    )
    for email in "${invalid_emails[@]}"; do
        if ! validate_email "$email"; then
            echo "PASS: validate_email rejects '$email'"
        else
            echo "FAIL: validate_email should reject '$email'"
            exit 1
        fi
    done
    echo ""

    # Test function existence
    echo "5. Testing function existence..."
    functions_to_check=(
        "validate_fqdn"
        "validate_email"
        "prompt_domain"
        "prompt_email"
        "prompt_stack_auth"
        "collect_configuration"
    )
    for func in "${functions_to_check[@]}"; do
        if type -t "$func" &>/dev/null; then
            echo "PASS: $func is defined"
        else
            echo "FAIL: $func is not defined"
            exit 1
        fi
    done
    echo ""

    # Verify sourcing works
    echo "6. Testing preflight-lib.sh sourcing..."
    if [[ -n "${LIB_VERSION:-}" ]] && type -t step &>/dev/null; then
        echo "PASS: preflight-lib.sh functions available (step, success, error)"
    else
        echo "FAIL: preflight-lib.sh not properly sourced"
        exit 1
    fi
    echo ""

    echo "========================================"
    echo "All config-lib tests passed!"
    echo "========================================"
fi

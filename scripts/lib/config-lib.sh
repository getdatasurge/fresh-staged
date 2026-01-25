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
# Secret Generation Functions
# ===========================================

# Generate a cryptographically secure random alphanumeric string
# Args: $1 = desired length (default: 32)
# Returns: Alphanumeric string of specified length (no special chars)
generate_secret() {
    local length="${1:-32}"

    # Generate extra bytes to account for character removal (base64 includes +/=)
    # We need ~4/3 ratio due to base64 encoding, plus margin for removal
    local extra_bytes=$((length * 2))

    # Generate random bytes, base64 encode, remove special chars, truncate
    openssl rand -base64 "$extra_bytes" 2>/dev/null | tr -d '/+=\n' | head -c "$length"
}

# Generate all required secret files
# Args: $1 = secrets directory (default: "secrets")
# Returns: 0 on success, 1 on failure
generate_secrets_files() {
    local secrets_dir="${1:-secrets}"

    # Create secrets directory with restrictive permissions
    if ! mkdir -p "$secrets_dir"; then
        error "Failed to create secrets directory: $secrets_dir"
        return 1
    fi
    chmod 700 "$secrets_dir"

    # Generate secrets if not already set (allows override for testing)
    local postgres_password="${POSTGRES_PASSWORD:-$(generate_secret 32)}"
    local jwt_secret="${JWT_SECRET:-$(generate_secret 48)}"
    local grafana_password="${GRAFANA_PASSWORD:-$(generate_secret 32)}"
    local minio_password="${MINIO_PASSWORD:-$(generate_secret 32)}"
    local minio_user="${MINIO_USER:-freshtrack-minio-admin}"

    # Write secrets to files (using echo -n to avoid trailing newline)
    echo -n "$postgres_password" > "$secrets_dir/postgres_password.txt"
    echo -n "$jwt_secret" > "$secrets_dir/jwt_secret.txt"
    echo -n "$grafana_password" > "$secrets_dir/grafana_password.txt"
    echo -n "$minio_password" > "$secrets_dir/minio_password.txt"
    echo -n "$minio_user" > "$secrets_dir/minio_user.txt"

    # Write Stack Auth secret if provided
    if [[ -n "${STACK_AUTH_SECRET_KEY:-}" ]]; then
        echo -n "$STACK_AUTH_SECRET_KEY" > "$secrets_dir/stack_auth_secret.txt"
    fi

    # Set restrictive permissions on all secret files
    chmod 600 "$secrets_dir"/*.txt

    # Display success message (do NOT show actual secret values)
    success "Generated secrets files in $secrets_dir/"
    echo "  - postgres_password.txt"
    echo "  - jwt_secret.txt"
    echo "  - grafana_password.txt"
    echo "  - minio_password.txt"
    echo "  - minio_user.txt"
    if [[ -n "${STACK_AUTH_SECRET_KEY:-}" ]]; then
        echo "  - stack_auth_secret.txt"
    fi

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

    # Test generate_secret function
    echo "5. Testing generate_secret..."
    test_secret=$(generate_secret 32)
    if [[ ${#test_secret} -eq 32 ]]; then
        echo "PASS: generate_secret produces correct length (32)"
    else
        echo "FAIL: generate_secret should produce 32 chars, got ${#test_secret}"
        exit 1
    fi

    if echo "$test_secret" | grep -qE '^[A-Za-z0-9]+$'; then
        echo "PASS: generate_secret output is alphanumeric only"
    else
        echo "FAIL: generate_secret should produce alphanumeric only"
        exit 1
    fi

    # Test different lengths
    test_secret_48=$(generate_secret 48)
    if [[ ${#test_secret_48} -eq 48 ]]; then
        echo "PASS: generate_secret produces correct length (48)"
    else
        echo "FAIL: generate_secret should produce 48 chars, got ${#test_secret_48}"
        exit 1
    fi
    echo ""

    # Test generate_secrets_files
    echo "6. Testing generate_secrets_files..."
    test_secrets_dir=$(mktemp -d)
    if generate_secrets_files "$test_secrets_dir/secrets" 2>/dev/null; then
        # Check all expected files exist
        expected_files=(
            "postgres_password.txt"
            "jwt_secret.txt"
            "grafana_password.txt"
            "minio_password.txt"
            "minio_user.txt"
        )
        all_files_exist=true
        for f in "${expected_files[@]}"; do
            if [[ ! -f "$test_secrets_dir/secrets/$f" ]]; then
                echo "FAIL: Expected file $f not created"
                all_files_exist=false
            fi
        done

        if $all_files_exist; then
            echo "PASS: All secret files created"
        fi

        # Check permissions (600)
        file_perms=$(stat -c "%a" "$test_secrets_dir/secrets/postgres_password.txt" 2>/dev/null)
        if [[ "$file_perms" == "600" ]]; then
            echo "PASS: Secret files have 600 permissions"
        else
            echo "FAIL: Secret files should have 600 permissions, got $file_perms"
            rm -rf "$test_secrets_dir"
            exit 1
        fi

        # Check directory permissions (700)
        dir_perms=$(stat -c "%a" "$test_secrets_dir/secrets" 2>/dev/null)
        if [[ "$dir_perms" == "700" ]]; then
            echo "PASS: Secrets directory has 700 permissions"
        else
            echo "FAIL: Secrets directory should have 700 permissions, got $dir_perms"
            rm -rf "$test_secrets_dir"
            exit 1
        fi

        # Check postgres password length
        postgres_pw=$(cat "$test_secrets_dir/secrets/postgres_password.txt")
        if [[ ${#postgres_pw} -eq 32 ]]; then
            echo "PASS: postgres_password is 32 characters"
        else
            echo "FAIL: postgres_password should be 32 chars, got ${#postgres_pw}"
            rm -rf "$test_secrets_dir"
            exit 1
        fi

        # Check jwt secret length
        jwt_sec=$(cat "$test_secrets_dir/secrets/jwt_secret.txt")
        if [[ ${#jwt_sec} -eq 48 ]]; then
            echo "PASS: jwt_secret is 48 characters"
        else
            echo "FAIL: jwt_secret should be 48 chars, got ${#jwt_sec}"
            rm -rf "$test_secrets_dir"
            exit 1
        fi

        # Check minio_user
        minio_usr=$(cat "$test_secrets_dir/secrets/minio_user.txt")
        if [[ "$minio_usr" == "freshtrack-minio-admin" ]]; then
            echo "PASS: minio_user is 'freshtrack-minio-admin'"
        else
            echo "FAIL: minio_user should be 'freshtrack-minio-admin', got '$minio_usr'"
            rm -rf "$test_secrets_dir"
            exit 1
        fi
    else
        echo "FAIL: generate_secrets_files failed"
        rm -rf "$test_secrets_dir"
        exit 1
    fi
    rm -rf "$test_secrets_dir"
    echo ""

    # Test function existence
    echo "7. Testing function existence..."
    functions_to_check=(
        "validate_fqdn"
        "validate_email"
        "prompt_domain"
        "prompt_email"
        "prompt_stack_auth"
        "collect_configuration"
        "generate_secret"
        "generate_secrets_files"
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
    echo "8. Testing preflight-lib.sh sourcing..."
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

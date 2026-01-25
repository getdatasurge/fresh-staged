#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Configuration Library
# Interactive configuration collection, validation, and summary display
# ===========================================
#
# Usage: source this file in deployment scripts
#   source "$(dirname "$0")/lib/config-lib.sh"
#
# Standalone usage:
#   ./config-lib.sh test    Run self-tests
#   ./config-lib.sh         Show usage
#
# Required Environment Variables (set by prompts or externally):
#   DOMAIN                      Fully qualified domain name
#   ADMIN_EMAIL                 Administrator email address
#   STACK_AUTH_PROJECT_ID       Stack Auth project identifier
#   STACK_AUTH_PUBLISHABLE_KEY  Stack Auth client-side key
#   STACK_AUTH_SECRET_KEY       Stack Auth server-side secret
#
# Optional Environment Variables:
#   MAX_INPUT_ATTEMPTS          Max retries for user input (default: 5)
#   SECRETS_DIR                 Directory for secret files (default: secrets)
#   ENV_FILE                    Environment file path (default: .env.production)
#
# Exported Functions:
#   Input Collection:
#     validate_fqdn()                 Validate fully qualified domain name
#     validate_email()                Validate email address format
#     prompt_domain()                 Interactive domain input with validation
#     prompt_email()                  Interactive email input with validation
#     prompt_stack_auth()             Interactive Stack Auth credential collection
#     collect_configuration()         Master function to collect all config
#
#   Secret Generation:
#     generate_secret()               Generate cryptographically secure random string
#     generate_secrets_files()        Generate all required secret files
#     generate_env_file()             Generate .env.production file
#     create_configuration()          Generate secrets and env file
#
#   Summary & Validation:
#     display_configuration_summary() Display config summary for user review (CONFIG-07)
#     validate_dns_before_deploy()    Validate DNS resolves to server IP (CONFIG-04)
#     run_interactive_configuration() Master orchestration function
#
# ===========================================

# Source preflight-lib.sh for error handling and output helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/preflight-lib.sh"

LIB_VERSION="1.1.0"

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
# Environment File Generation
# ===========================================

# Generate .env.production file with all required configuration
# Args: $1 = output file path (default: ".env.production")
# Requires: DOMAIN, ADMIN_EMAIL, STACK_AUTH_PROJECT_ID, STACK_AUTH_PUBLISHABLE_KEY
# Returns: 0 on success, 1 on failure
generate_env_file() {
    local output_file="${1:-.env.production}"
    local backup_file

    # Check required variables
    if [[ -z "${DOMAIN:-}" ]]; then
        error "DOMAIN is required for env file generation"
        return 1
    fi
    if [[ -z "${ADMIN_EMAIL:-}" ]]; then
        error "ADMIN_EMAIL is required for env file generation"
        return 1
    fi

    # Backup existing file if it exists
    if [[ -f "$output_file" ]]; then
        backup_file="${output_file}.backup.$(date +%Y%m%d-%H%M%S)"
        cp "$output_file" "$backup_file"
        warn "Existing file backed up to: $backup_file"
    fi

    # Generate the .env.production file using heredoc
    cat > "$output_file" << EOF
# ===========================================
# FreshTrack Pro Production Environment
# ===========================================
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# WARNING: Do not edit manually - regenerate with deploy script
# ===========================================

# ===========================================
# Application
# ===========================================
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
HOST=0.0.0.0

# ===========================================
# Domain Configuration
# ===========================================
DOMAIN=${DOMAIN}
ADMIN_EMAIL=${ADMIN_EMAIL}
FRONTEND_URL=https://${DOMAIN}
API_URL=https://${DOMAIN}/api
APP_URL=https://${DOMAIN}
MONITORING_URL=https://monitoring.${DOMAIN}
STATUS_URL=https://status.${DOMAIN}
CORS_ORIGINS=https://${DOMAIN}

# ===========================================
# Database (PostgreSQL)
# ===========================================
# Password loaded from secrets/postgres_password.txt via Docker secrets
DATABASE_URL=postgresql://frostguard:\${POSTGRES_PASSWORD}@postgres:5432/frostguard
DB_POOL_MIN=5
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=5000

# ===========================================
# Redis (Cache & Jobs)
# ===========================================
REDIS_URL=redis://redis:6379

# ===========================================
# MinIO / S3 (Object Storage)
# ===========================================
MINIO_ENDPOINT=http://minio:9000
MINIO_BUCKET_ASSETS=assets
MINIO_USE_SSL=false
# Credentials loaded from secrets/minio_user.txt and secrets/minio_password.txt

# ===========================================
# Stack Auth (Authentication Service)
# ===========================================
STACK_AUTH_PROJECT_ID=${STACK_AUTH_PROJECT_ID:-}
STACK_AUTH_API_URL=https://api.stack-auth.com
STACK_AUTH_PUBLISHABLE_KEY=${STACK_AUTH_PUBLISHABLE_KEY:-}

# ===========================================
# Feature Flags
# ===========================================
FEATURE_DEVICE_PROVISIONING=true
FEATURE_SMS_NOTIFICATIONS=true
FEATURE_EMAIL_NOTIFICATIONS=true
FEATURE_WEBHOOK_INTEGRATIONS=true

# ===========================================
# Security
# ===========================================
# Rate limiting (requests per minute)
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# Session configuration
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=strict
SESSION_COOKIE_DOMAIN=.${DOMAIN}

# ===========================================
# Secrets (Loaded from files)
# ===========================================
# These are loaded by Docker from the secrets/ directory:
#   - secrets/postgres_password.txt  -> POSTGRES_PASSWORD
#   - secrets/jwt_secret.txt         -> JWT_SECRET
#   - secrets/stack_auth_secret.txt  -> STACK_AUTH_SECRET_KEY
#   - secrets/minio_user.txt         -> MINIO_ROOT_USER
#   - secrets/minio_password.txt     -> MINIO_ROOT_PASSWORD
#   - secrets/grafana_password.txt   -> GRAFANA_ADMIN_PASSWORD
EOF

    # Set restrictive permissions
    chmod 600 "$output_file"

    success "Generated $output_file"
    return 0
}

# Master function to create all configuration
# Returns: 0 on success, 1 on failure
create_configuration() {
    local secrets_dir="${1:-secrets}"
    local env_file="${2:-.env.production}"

    echo ""
    echo "========================================"
    echo "Creating FreshTrack Configuration"
    echo "========================================"
    echo ""

    # Generate secrets files
    if ! generate_secrets_files "$secrets_dir"; then
        error "Failed to generate secrets files"
        return 1
    fi
    echo ""

    # Generate environment file
    if ! generate_env_file "$env_file"; then
        error "Failed to generate environment file"
        return 1
    fi
    echo ""

    # Display summary
    echo "========================================"
    success "Configuration created successfully!"
    echo "========================================"
    echo ""
    echo "Files created:"
    echo "  - $env_file (environment configuration)"
    echo "  - $secrets_dir/ (secret files)"
    echo ""
    echo "Next steps:"
    echo "  1. Verify configuration: cat $env_file"
    echo "  2. Run deployment: ./deploy.sh"
    echo ""

    return 0
}

# ===========================================
# Configuration Summary Display
# ===========================================

# Display configuration summary for user review
# Requires: DOMAIN, ADMIN_EMAIL, STACK_AUTH_* variables to be set
# Args: None (uses global variables)
# Returns: 0 if user confirms, 1 if user cancels
# Satisfies: CONFIG-07 (configuration summary)
display_configuration_summary() {
    local secrets_dir="${SECRETS_DIR:-secrets}"
    local env_file="${ENV_FILE:-.env.production}"

    echo ""
    echo -e "${BLUE}========================================"
    echo "       Configuration Summary"
    echo "========================================${NC}"
    echo ""

    # Domain Configuration section
    echo -e "${BLUE}Domain Configuration${NC}"
    echo "----------------------------------------"
    echo -e "  Main Domain:  ${GREEN}https://${DOMAIN}${NC}"
    echo -e "  API Endpoint: ${GREEN}https://${DOMAIN}/api${NC}"
    echo -e "  Monitoring:   ${GREEN}https://monitoring.${DOMAIN}${NC}"
    echo -e "  Status Page:  ${GREEN}https://status.${DOMAIN}${NC}"
    echo "  Admin Email:  ${ADMIN_EMAIL}"
    echo ""

    # Generated Secrets section
    echo -e "${BLUE}Generated Secrets${NC}"
    echo "----------------------------------------"
    echo -e "  ${YELLOW}(Secrets are auto-generated and stored securely)${NC}"
    echo "  PostgreSQL:     [GENERATED - 32 chars]"
    echo "  JWT Secret:     [GENERATED - 48 chars]"
    echo "  Grafana Admin:  [GENERATED - 32 chars]"
    echo "  MinIO Password: [GENERATED - 32 chars]"
    echo ""

    # Stack Auth section
    echo -e "${BLUE}Stack Auth Configuration${NC}"
    echo "----------------------------------------"
    if [[ -n "${STACK_AUTH_PROJECT_ID:-}" ]]; then
        echo "  Project ID:      ${STACK_AUTH_PROJECT_ID:0:20}..."
    else
        echo "  Project ID:      [NOT SET]"
    fi
    if [[ -n "${STACK_AUTH_PUBLISHABLE_KEY:-}" ]]; then
        echo "  Publishable Key: ${STACK_AUTH_PUBLISHABLE_KEY:0:20}..."
    else
        echo "  Publishable Key: [NOT SET]"
    fi
    echo "  Secret Key:      [PROVIDED - hidden]"
    echo ""

    # File locations
    echo -e "${BLUE}File Locations${NC}"
    echo "----------------------------------------"
    echo "  Environment:   ${env_file}"
    echo "  Secrets Dir:   ${secrets_dir}/"
    echo ""

    echo -e "${BLUE}========================================${NC}"
    echo ""

    # Prompt for confirmation
    local response
    read -rp "Proceed with this configuration? [Y/n]: " response

    case "${response,,}" in
        n|no)
            echo ""
            warning "Configuration cancelled by user"
            return 1
            ;;
        *)
            echo ""
            success "Configuration confirmed"
            return 0
            ;;
    esac
}

# ===========================================
# DNS Validation Before Deployment
# ===========================================

# Validate DNS resolves to server IP before deployment
# Requires: DOMAIN to be set
# Args: None (uses global DOMAIN variable)
# Returns: 0 if DNS is valid, 1 if DNS validation fails
# Satisfies: CONFIG-04 (DNS validation)
validate_dns_before_deploy() {
    # Check DOMAIN is set
    if [[ -z "${DOMAIN:-}" ]]; then
        error "DOMAIN must be set before DNS validation"
        return 1
    fi

    step "Validating DNS configuration for $DOMAIN..."

    # Call validate_dns from preflight-lib.sh
    # validate_dns already provides detailed guidance on failure
    if ! validate_dns "$DOMAIN"; then
        echo ""
        error "DNS validation failed"
        echo "Please configure your DNS before proceeding with deployment."
        echo "SSL certificate provisioning will fail without correct DNS."
        return 1
    fi

    echo ""
    success "DNS validation passed - ready for deployment"
    return 0
}

# ===========================================
# Master Orchestration
# ===========================================

# Run the complete interactive configuration flow
# Orchestrates: collect -> create -> summary -> DNS validation
# Args: None
# Returns: 0 on success, 1 on any failure or user cancellation
run_interactive_configuration() {
    echo ""
    echo -e "${BLUE}========================================"
    echo "  FreshTrack Pro Interactive Configuration"
    echo "========================================${NC}"
    echo ""
    echo "This wizard will guide you through configuring FreshTrack Pro."
    echo "You will need:"
    echo "  - A domain name pointing to this server"
    echo "  - An administrator email address"
    echo "  - Stack Auth credentials (from https://app.stack-auth.com)"
    echo ""

    # Step 1: Collect configuration from user
    step "Step 1/4: Collecting configuration..."
    if ! collect_configuration; then
        error "Configuration collection failed"
        return 1
    fi

    # Step 2: Generate secrets and .env.production
    step "Step 2/4: Creating configuration files..."
    if ! create_configuration; then
        error "Configuration file creation failed"
        return 1
    fi

    # Step 3: Display summary for user review
    step "Step 3/4: Review configuration..."
    if ! display_configuration_summary; then
        error "Configuration cancelled by user"
        return 1
    fi

    # Step 4: Validate DNS
    step "Step 4/4: Validating DNS..."
    if ! validate_dns_before_deploy; then
        error "DNS validation failed"
        echo ""
        echo "You can run this configuration again after fixing DNS:"
        echo "  ./config-lib.sh"
        return 1
    fi

    echo ""
    echo -e "${GREEN}========================================"
    echo "  Configuration Complete!"
    echo "========================================${NC}"
    echo ""
    success "Configuration complete! Ready for deployment."
    echo ""
    echo "Next steps:"
    echo "  1. Run the deployment script: ./deploy.sh"
    echo "  2. Wait for services to start (~2-5 minutes)"
    echo "  3. Visit https://${DOMAIN} to access FreshTrack Pro"
    echo ""

    return 0
}

# ===========================================
# Self-test Functions
# ===========================================

# Run comprehensive self-tests
# Args: None
# Returns: 0 if all tests pass, 1 if any test fails
run_self_tests() {
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

    # Test generate_env_file
    echo "7. Testing generate_env_file..."
    test_env_dir=$(mktemp -d)
    export DOMAIN="test.example.com"
    export ADMIN_EMAIL="admin@test.example.com"
    export STACK_AUTH_PROJECT_ID="test-project-id"
    export STACK_AUTH_PUBLISHABLE_KEY="pk_test_12345"

    if generate_env_file "$test_env_dir/.env.production" 2>/dev/null; then
        # Check file exists
        if [[ -f "$test_env_dir/.env.production" ]]; then
            echo "PASS: .env.production file created"
        else
            echo "FAIL: .env.production file not created"
            rm -rf "$test_env_dir"
            exit 1
        fi

        # Check permissions
        env_perms=$(stat -c "%a" "$test_env_dir/.env.production" 2>/dev/null)
        if [[ "$env_perms" == "600" ]]; then
            echo "PASS: .env.production has 600 permissions"
        else
            echo "FAIL: .env.production should have 600 permissions, got $env_perms"
            rm -rf "$test_env_dir"
            exit 1
        fi

        # Check file contains expected variables
        if grep -q "DOMAIN=test.example.com" "$test_env_dir/.env.production"; then
            echo "PASS: .env.production contains DOMAIN"
        else
            echo "FAIL: .env.production should contain DOMAIN=test.example.com"
            rm -rf "$test_env_dir"
            exit 1
        fi

        if grep -q "ADMIN_EMAIL=admin@test.example.com" "$test_env_dir/.env.production"; then
            echo "PASS: .env.production contains ADMIN_EMAIL"
        else
            echo "FAIL: .env.production should contain ADMIN_EMAIL"
            rm -rf "$test_env_dir"
            exit 1
        fi

        if grep -q 'DATABASE_URL=postgresql://frostguard:\${POSTGRES_PASSWORD}@postgres:5432/frostguard' "$test_env_dir/.env.production"; then
            echo "PASS: DATABASE_URL uses variable reference (not interpolated)"
        else
            echo "FAIL: DATABASE_URL should use \${POSTGRES_PASSWORD} variable reference"
            rm -rf "$test_env_dir"
            exit 1
        fi

        if grep -q "SESSION_COOKIE_DOMAIN=.test.example.com" "$test_env_dir/.env.production"; then
            echo "PASS: SESSION_COOKIE_DOMAIN uses domain"
        else
            echo "FAIL: SESSION_COOKIE_DOMAIN should be .test.example.com"
            rm -rf "$test_env_dir"
            exit 1
        fi
    else
        echo "FAIL: generate_env_file failed"
        rm -rf "$test_env_dir"
        exit 1
    fi
    echo ""

    # Test backup on second run
    echo "8. Testing backup on existing file..."
    if generate_env_file "$test_env_dir/.env.production" 2>/dev/null; then
        # Check backup was created
        backup_count=$(ls "$test_env_dir/.env.production.backup."* 2>/dev/null | wc -l)
        if [[ "$backup_count" -ge 1 ]]; then
            echo "PASS: Backup file created on second run"
        else
            echo "FAIL: Backup should be created when file exists"
            rm -rf "$test_env_dir"
            exit 1
        fi
    else
        echo "FAIL: generate_env_file failed on second run"
        rm -rf "$test_env_dir"
        exit 1
    fi
    rm -rf "$test_env_dir"
    unset DOMAIN ADMIN_EMAIL STACK_AUTH_PROJECT_ID STACK_AUTH_PUBLISHABLE_KEY
    echo ""

    # Test function existence (including new functions from 24-03)
    echo "9. Testing function existence..."
    functions_to_check=(
        "validate_fqdn"
        "validate_email"
        "prompt_domain"
        "prompt_email"
        "prompt_stack_auth"
        "collect_configuration"
        "generate_secret"
        "generate_secrets_files"
        "generate_env_file"
        "create_configuration"
        "display_configuration_summary"
        "validate_dns_before_deploy"
        "run_interactive_configuration"
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
    echo "10. Testing preflight-lib.sh sourcing..."
    if [[ -n "${LIB_VERSION:-}" ]] && type -t step &>/dev/null; then
        echo "PASS: preflight-lib.sh functions available (step, success, error)"
    else
        echo "FAIL: preflight-lib.sh not properly sourced"
        exit 1
    fi
    echo ""

    # Test display_configuration_summary with mock data (non-interactive)
    echo "11. Testing display_configuration_summary with mock data..."
    export DOMAIN="mock.example.com"
    export ADMIN_EMAIL="mock@example.com"
    export STACK_AUTH_PROJECT_ID="proj_mock123456789012"
    export STACK_AUTH_PUBLISHABLE_KEY="pk_mock_abcdefghijklmnop"
    export STACK_AUTH_SECRET_KEY="sk_mock_secret"
    export SECRETS_DIR="/tmp/mock-secrets"
    export ENV_FILE="/tmp/mock.env"

    # Capture output to verify it runs without error (provide 'y' to confirm)
    if echo "y" | display_configuration_summary &>/dev/null; then
        echo "PASS: display_configuration_summary runs with mock data"
    else
        echo "FAIL: display_configuration_summary should run with mock data"
        exit 1
    fi

    # Test cancellation
    if echo "n" | display_configuration_summary &>/dev/null; then
        echo "FAIL: display_configuration_summary should return 1 on 'n'"
        exit 1
    else
        echo "PASS: display_configuration_summary returns 1 on cancel"
    fi
    unset DOMAIN ADMIN_EMAIL STACK_AUTH_PROJECT_ID STACK_AUTH_PUBLISHABLE_KEY STACK_AUTH_SECRET_KEY SECRETS_DIR ENV_FILE
    echo ""

    # Test validate_dns_before_deploy requires DOMAIN
    echo "12. Testing validate_dns_before_deploy requires DOMAIN..."
    unset DOMAIN
    if validate_dns_before_deploy 2>/dev/null; then
        echo "FAIL: validate_dns_before_deploy should fail without DOMAIN"
        exit 1
    else
        echo "PASS: validate_dns_before_deploy fails without DOMAIN"
    fi
    echo ""

    echo "========================================"
    echo "All config-lib tests passed!"
    echo "========================================"
}

# ===========================================
# Entry point when run directly
# ===========================================
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        test)
            run_self_tests
            exit $?
            ;;
        "")
            echo "FreshTrack Pro Configuration Library v${LIB_VERSION}"
            echo ""
            echo "Usage:"
            echo "  $0 test     Run self-tests"
            echo "  $0          Show this help"
            echo ""
            echo "As a library (source this file):"
            echo "  source config-lib.sh"
            echo "  run_interactive_configuration"
            echo ""
            echo "Or call individual functions:"
            echo "  collect_configuration          # Collect user input"
            echo "  create_configuration           # Generate secrets & .env"
            echo "  display_configuration_summary  # Show summary"
            echo "  validate_dns_before_deploy     # Check DNS"
            ;;
        *)
            echo "Unknown command: $1"
            echo "Run '$0' for usage information"
            exit 1
            ;;
    esac
fi

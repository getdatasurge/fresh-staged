# Phase 24: Interactive Configuration - Research

**Researched:** 2026-01-25
**Domain:** Bash interactive prompts, input validation, secure credential generation
**Confidence:** HIGH

## Summary

Phase 24 implements interactive configuration for FreshTrack deployment, enabling users to configure their deployment through guided prompts without manually editing files. The research examines the existing codebase infrastructure, bash best practices for user input handling, and secure credential generation patterns.

The project already has substantial infrastructure in place:

- `preflight-lib.sh` provides error handling, checkpoint tracking, and DNS validation
- `deploy-selfhosted.sh` has working patterns for configuration loading and secret generation
- `.env.production.example` defines all required environment variables
- `secrets/` directory structure and documentation exists

**Primary recommendation:** Build on existing patterns in `deploy-selfhosted.sh` and `preflight-lib.sh`, enhancing with stricter input validation loops, FQDN/email regex patterns, and a comprehensive configuration summary display.

## Standard Stack

The established tools and patterns for this domain:

### Core

| Tool            | Version  | Purpose                  | Why Standard                           |
| --------------- | -------- | ------------------------ | -------------------------------------- |
| bash `read`     | Built-in | Interactive prompts      | Universal availability, -r/-p/-s flags |
| `openssl rand`  | System   | Secure random generation | Cryptographically secure PRNG          |
| bash `[[ =~ ]]` | Built-in | Regex validation         | Native bash regex matching             |
| `printf`        | Built-in | Formatted output         | More portable than echo for escapes    |

### Supporting

| Tool           | Purpose             | When to Use                         |
| -------------- | ------------------- | ----------------------------------- |
| `curl`         | Network validation  | Already in preflight-lib.sh         |
| `dig`/`getent` | DNS resolution      | Already in preflight-lib.sh         |
| `tr`           | Character filtering | Removing unwanted chars from base64 |

### Already Available in Codebase

| Pattern                           | Location                                | Can Reuse                    |
| --------------------------------- | --------------------------------------- | ---------------------------- |
| Error handler + trap ERR          | `preflight-lib.sh`                      | YES - source it              |
| DNS validation                    | `preflight-lib.sh:validate_dns()`       | YES - call directly          |
| Color output (step/success/error) | `preflight-lib.sh`                      | YES - source it              |
| Checkpoint tracking               | `preflight-lib.sh:checkpoint_*`         | YES - call directly          |
| Secret generation                 | `deploy-selfhosted.sh:create_secrets()` | PARTIAL - adapt pattern      |
| Config loading                    | `deploy-selfhosted.sh:load_config()`    | PARTIAL - enhance validation |

## Architecture Patterns

### Recommended Project Structure

The interactive configuration should be implemented as a **new file** that sources existing infrastructure:

```
scripts/
├── lib/
│   ├── preflight-lib.sh      # Existing - error handling, validation
│   └── config-lib.sh         # NEW - input prompts, validation functions
├── deploy-selfhosted.sh      # Existing - will source config-lib.sh
└── configure-deployment.sh   # NEW - standalone interactive config (optional)
```

### Pattern 1: Input Validation Loop

**What:** Re-prompt user until valid input received
**When to use:** All required inputs (domain, email)
**Example:**

```bash
# Pattern: validate until success with retry limit
prompt_domain() {
    local max_attempts=5
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        read -rp "Enter your domain (e.g., app.example.com): " DOMAIN

        if validate_fqdn "$DOMAIN"; then
            success "Domain validated: $DOMAIN"
            return 0
        fi

        error "Invalid domain format. Must be a valid FQDN (e.g., app.example.com)"
        ((attempt++))
    done

    error "Too many invalid attempts. Aborting."
    return 1
}
```

### Pattern 2: FQDN Validation Regex

**What:** Validate fully qualified domain name format
**When to use:** CONFIG-01 domain prompt
**Example:**

```bash
# Source: RFC 1123, verified via regextester.com
# Rules: 1-63 char labels, alphanumeric + hyphen, no leading/trailing hyphen
validate_fqdn() {
    local domain="$1"

    # Must have at least one dot (FQDN requirement)
    if [[ ! "$domain" =~ \. ]]; then
        return 1
    fi

    # Regex: hostname labels with dots, TLD at least 2 chars
    local fqdn_regex='^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'

    if [[ "$domain" =~ $fqdn_regex ]]; then
        # Additional length check (max 253 chars total)
        if [[ ${#domain} -le 253 ]]; then
            return 0
        fi
    fi

    return 1
}
```

### Pattern 3: Email Validation Regex

**What:** Validate email address format
**When to use:** CONFIG-02 admin email prompt
**Example:**

```bash
# Source: Simplified RFC 5322 pattern, covers 99%+ real addresses
# Avoids overly complex patterns that are hard to maintain
validate_email() {
    local email="$1"

    # Pattern: local@domain.tld
    # - Local part: alphanumeric + common special chars
    # - Domain: alphanumeric + hyphen + dots
    # - TLD: 2+ letters (accommodate new TLDs like .technology)
    local email_regex='^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

    if [[ "$email" =~ $email_regex ]]; then
        return 0
    fi

    return 1
}
```

### Pattern 4: Secure Secret Generation

**What:** Generate cryptographically secure random secrets
**When to use:** CONFIG-06 auto-generated credentials
**Example:**

```bash
# Source: OpenSSL documentation, Linux Audit best practices
generate_secret() {
    local length="${1:-32}"

    # Generate random bytes, base64 encode, remove special chars
    # Request extra bytes to account for character removal
    local extra=$((length / 3 + 4))
    openssl rand -base64 $((length + extra)) | tr -d '/+=\n' | head -c "$length"
}

# Generate different secret types
generate_password() {
    generate_secret 32  # 256-bit equivalent
}

generate_jwt_secret() {
    generate_secret 48  # Extra entropy for JWT
}
```

### Pattern 5: .env File Generation

**What:** Programmatically generate .env.production from template + user input
**When to use:** CONFIG-05 env file creation
**Example:**

```bash
# Source: bashup/dotenv patterns
generate_env_file() {
    local output_file="$1"

    # Backup existing if present
    if [[ -f "$output_file" ]]; then
        local backup="${output_file}.backup.$(date +%Y%m%d-%H%M%S)"
        warning "Existing $output_file found"
        cp "$output_file" "$backup"
        success "Backed up to: $backup"
    fi

    # Generate from template with variable substitution
    cat > "$output_file" <<EOF
# FreshTrack Pro Production Environment
# Generated: $(date -Iseconds)
# DO NOT EDIT MANUALLY - regenerate with configure script

NODE_ENV=production
LOG_LEVEL=info

# Domain Configuration
DOMAIN=${DOMAIN}
ADMIN_EMAIL=${ADMIN_EMAIL}
FRONTEND_URL=https://${DOMAIN}
API_URL=https://${DOMAIN}/api
APP_URL=https://${DOMAIN}
CORS_ORIGINS=https://${DOMAIN}

# Database
DATABASE_URL=postgresql://frostguard:\${POSTGRES_PASSWORD}@postgres:5432/frostguard
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# Grafana
GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
MONITORING_URL=https://monitoring.${DOMAIN}
STATUS_URL=https://status.${DOMAIN}

# Stack Auth (user-provided)
STACK_AUTH_PROJECT_ID=${STACK_AUTH_PROJECT_ID}
STACK_AUTH_PUBLISHABLE_KEY=${STACK_AUTH_PUBLISHABLE_KEY}
EOF

    chmod 600 "$output_file"
    success "Generated $output_file"
}
```

### Pattern 6: Configuration Summary Display

**What:** Display all configuration for user review before proceeding
**When to use:** CONFIG-07 before deployment
**Example:**

```bash
display_configuration_summary() {
    echo ""
    echo "========================================"
    echo "Configuration Summary"
    echo "========================================"
    echo ""
    echo "Domain Configuration:"
    echo "  Main Domain:    https://${DOMAIN}"
    echo "  Monitoring:     https://monitoring.${DOMAIN}"
    echo "  Status Page:    https://status.${DOMAIN}"
    echo "  Admin Email:    ${ADMIN_EMAIL}"
    echo ""
    echo "Generated Secrets:"
    echo "  PostgreSQL:     [GENERATED - 32 chars]"
    echo "  JWT Secret:     [GENERATED - 48 chars]"
    echo "  Grafana Admin:  [GENERATED - 32 chars]"
    echo "  MinIO Password: [GENERATED - 32 chars]"
    echo ""
    echo "Stack Auth:"
    echo "  Project ID:     ${STACK_AUTH_PROJECT_ID:0:20}..."
    echo "  Publishable:    ${STACK_AUTH_PUBLISHABLE_KEY:0:20}..."
    echo ""
    echo "========================================"
    echo ""

    read -rp "Proceed with this configuration? [Y/n]: " confirm
    if [[ "${confirm,,}" == "n" ]]; then
        warning "Configuration cancelled by user"
        return 1
    fi

    return 0
}
```

### Anti-Patterns to Avoid

- **Plain echo for passwords:** Use `read -s` to hide password input
- **Hardcoded validation limits:** Use configurable `MAX_ATTEMPTS` variable
- **Silent failures:** Always explain why validation failed
- **Overwriting without backup:** Always backup existing .env files
- **Exposing secrets in logs:** Never echo actual secret values

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem             | Don't Build        | Use Instead                         | Why                                              |
| ------------------- | ------------------ | ----------------------------------- | ------------------------------------------------ |
| Error handling      | Custom try/catch   | `preflight-lib.sh` trap ERR         | Already tested, credential sanitization built-in |
| DNS validation      | New dig wrapper    | `validate_dns()` from preflight-lib | Already handles dig/getent fallback              |
| Checkpoint tracking | State file logic   | `checkpoint_*` functions            | Already handles state dir, timestamps            |
| Color output        | echo with escapes  | `step()/success()/error()`          | Consistent UI across scripts                     |
| Recovery prompts    | Custom prompt code | `handle_recovery()`                 | Error category-aware prompts                     |

**Key insight:** Phase 22 already built robust infrastructure. Phase 24 should ADD validation functions and configuration logic, not rebuild foundational patterns.

## Common Pitfalls

### Pitfall 1: Regex Too Permissive or Too Strict

**What goes wrong:** FQDN regex allows invalid domains OR rejects valid ones
**Why it happens:** Testing only happy path, not edge cases
**How to avoid:** Test these specific cases:

```bash
# Should PASS
"app.example.com"
"sub.domain.example.co.uk"
"my-app.freshtrack.io"
"a.b.com"  # Single-char labels are valid

# Should FAIL
"localhost"           # No TLD (not FQDN)
"example"             # No dots
".example.com"        # Leading dot
"example.com."        # Trailing dot
"-bad.com"            # Leading hyphen
"bad-.com"            # Trailing hyphen
"too-long-label-..."  # 64+ char label
```

**Warning signs:** Users report valid domains rejected

### Pitfall 2: read Without -r Flag

**What goes wrong:** Backslashes interpreted as escapes
**Why it happens:** Default read behavior
**How to avoid:** ALWAYS use `read -r` for user input

```bash
# WRONG - backslashes will be interpreted
read -p "Enter path: " path

# RIGHT - literal backslash handling
read -rp "Enter path: " path
```

**Warning signs:** File paths with backslashes cause issues

### Pitfall 3: Password Confirmation Logic Error

**What goes wrong:** Password mismatch not detected correctly
**Why it happens:** String comparison edge cases
**How to avoid:**

```bash
# WRONG - whitespace issues
if [ "$pass1" = "$pass2" ]; then

# RIGHT - proper quoting and test
if [[ "$pass1" == "$pass2" ]]; then
```

**Note:** CONFIG-03 asks for "passwords with confirmation" but success criteria says "user never types passwords". Recommend: AUTO-GENERATE all passwords (no user typing), show summary for review.

### Pitfall 4: Existing .env Clobbered

**What goes wrong:** User's custom configuration lost
**Why it happens:** Simple file overwrite without check
**How to avoid:** Always check and backup:

```bash
if [[ -f .env.production ]]; then
    warning "Existing configuration found!"
    echo "  - Backup will be created automatically"
    echo "  - Custom values will need to be re-applied"
    read -rp "Continue? [y/N]: " confirm
fi
```

**Warning signs:** Users complain about lost settings

### Pitfall 5: DNS Validation Before User Ready

**What goes wrong:** Script fails because DNS not propagated yet
**Why it happens:** Validating DNS immediately after domain prompt
**How to avoid:** Validate DNS at appropriate time:

1. Domain prompt: Validate FORMAT only (regex)
2. Before SSL/deployment: Validate DNS RESOLUTION (Phase 25)

CONFIG-04 says "validates DNS resolution before attempting SSL certificate" - this implies DNS validation happens AFTER configuration is complete but BEFORE deployment starts.

## Code Examples

Verified patterns from official sources and existing codebase:

### Complete Input Validation Module

```bash
#!/usr/bin/env bash
# config-lib.sh - Interactive configuration library for FreshTrack deployment
# Source: patterns from deploy-selfhosted.sh + bash best practices

# Source preflight library for error handling
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/preflight-lib.sh"

# ===========================================
# Validation Functions
# ===========================================

# Validate FQDN format (RFC 1123)
# Returns: 0 if valid, 1 if invalid
validate_fqdn() {
    local domain="$1"

    # Empty check
    [[ -z "$domain" ]] && return 1

    # Must contain at least one dot
    [[ ! "$domain" =~ \. ]] && return 1

    # Max length 253 chars
    [[ ${#domain} -gt 253 ]] && return 1

    # FQDN regex pattern
    local fqdn_regex='^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
    [[ "$domain" =~ $fqdn_regex ]]
}

# Validate email format (simplified RFC 5322)
# Returns: 0 if valid, 1 if invalid
validate_email() {
    local email="$1"

    # Empty check
    [[ -z "$email" ]] && return 1

    # Email regex pattern
    local email_regex='^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    [[ "$email" =~ $email_regex ]]
}

# ===========================================
# Secret Generation
# ===========================================

# Generate secure random string
# Args: $1 = desired length (default: 32)
generate_secret() {
    local length="${1:-32}"
    local extra=$((length / 3 + 4))
    openssl rand -base64 $((length + extra)) 2>/dev/null | tr -d '/+=\n' | head -c "$length"
}

# ===========================================
# Prompt Functions
# ===========================================

# Prompt for domain with validation loop
# Sets: DOMAIN
prompt_domain() {
    local max_attempts="${MAX_INPUT_ATTEMPTS:-5}"
    local attempt=1

    step "Domain Configuration"
    echo "Your domain will be used for:"
    echo "  - Main application: https://your-domain.com"
    echo "  - Monitoring:       https://monitoring.your-domain.com"
    echo "  - Status page:      https://status.your-domain.com"
    echo ""

    while [[ $attempt -le $max_attempts ]]; do
        read -rp "Enter your domain (e.g., app.example.com): " DOMAIN

        if validate_fqdn "$DOMAIN"; then
            success "Domain validated: $DOMAIN"
            return 0
        fi

        error "Invalid domain format"
        echo "  - Must be a fully qualified domain name"
        echo "  - Example: app.example.com, freshtrack.yourcompany.io"
        echo "  - Cannot be just 'localhost' or an IP address"
        echo ""

        ((attempt++))
        [[ $attempt -le $max_attempts ]] && warning "Attempt $attempt of $max_attempts"
    done

    error "Maximum attempts reached. Please verify your domain and try again."
    return 1
}

# Prompt for admin email with validation loop
# Sets: ADMIN_EMAIL
prompt_email() {
    local max_attempts="${MAX_INPUT_ATTEMPTS:-5}"
    local attempt=1

    step "Admin Email Configuration"
    echo "This email will be used for:"
    echo "  - Let's Encrypt SSL certificate notifications"
    echo "  - System alerts and warnings"
    echo ""

    while [[ $attempt -le $max_attempts ]]; do
        read -rp "Enter admin email address: " ADMIN_EMAIL

        if validate_email "$ADMIN_EMAIL"; then
            success "Email validated: $ADMIN_EMAIL"
            return 0
        fi

        error "Invalid email format"
        echo "  - Must be a valid email address"
        echo "  - Example: [email protected]"
        echo ""

        ((attempt++))
        [[ $attempt -le $max_attempts ]] && warning "Attempt $attempt of $max_attempts"
    done

    error "Maximum attempts reached. Please verify your email and try again."
    return 1
}

# Prompt for Stack Auth credentials
# Sets: STACK_AUTH_PROJECT_ID, STACK_AUTH_PUBLISHABLE_KEY, STACK_AUTH_SECRET_KEY
prompt_stack_auth() {
    step "Stack Auth Configuration"
    echo "FreshTrack uses Stack Auth for user authentication."
    echo "Get your credentials from: https://app.stack-auth.com/projects"
    echo ""

    read -rp "Enter Stack Auth Project ID: " STACK_AUTH_PROJECT_ID

    if [[ -z "$STACK_AUTH_PROJECT_ID" ]]; then
        error "Project ID is required"
        return 1
    fi

    read -rp "Enter Stack Auth Publishable Key: " STACK_AUTH_PUBLISHABLE_KEY

    if [[ -z "$STACK_AUTH_PUBLISHABLE_KEY" ]]; then
        error "Publishable Key is required"
        return 1
    fi

    read -rsp "Enter Stack Auth Secret Key (hidden): " STACK_AUTH_SECRET_KEY
    echo ""

    if [[ -z "$STACK_AUTH_SECRET_KEY" ]]; then
        error "Secret Key is required"
        return 1
    fi

    success "Stack Auth credentials configured"
    return 0
}
```

### Secrets File Generation

```bash
# Generate all secret files in secrets/ directory
# Uses: POSTGRES_PASSWORD, GRAFANA_PASSWORD, etc (generates if not set)
generate_secrets_files() {
    local secrets_dir="${1:-secrets}"

    step "Generating Secrets"

    # Create directory with restrictive permissions
    mkdir -p "$secrets_dir"
    chmod 700 "$secrets_dir"

    # Generate secrets if not already set
    POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(generate_secret 32)}"
    JWT_SECRET="${JWT_SECRET:-$(generate_secret 48)}"
    GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-$(generate_secret 32)}"
    MINIO_PASSWORD="${MINIO_PASSWORD:-$(generate_secret 32)}"
    MINIO_USER="${MINIO_USER:-freshtrack-minio-admin}"

    # Write secret files
    echo -n "$POSTGRES_PASSWORD" > "$secrets_dir/postgres_password.txt"
    echo -n "$JWT_SECRET" > "$secrets_dir/jwt_secret.txt"
    echo -n "$GRAFANA_PASSWORD" > "$secrets_dir/grafana_password.txt"
    echo -n "$MINIO_PASSWORD" > "$secrets_dir/minio_password.txt"
    echo -n "$MINIO_USER" > "$secrets_dir/minio_user.txt"

    # Stack Auth secret (user-provided)
    if [[ -n "$STACK_AUTH_SECRET_KEY" ]]; then
        echo -n "$STACK_AUTH_SECRET_KEY" > "$secrets_dir/stack_auth_secret.txt"
    fi

    # Set file permissions
    chmod 600 "$secrets_dir"/*.txt

    success "Generated secret files in $secrets_dir/"
    echo "  - postgres_password.txt (32 chars)"
    echo "  - jwt_secret.txt (48 chars)"
    echo "  - grafana_password.txt (32 chars)"
    echo "  - minio_password.txt (32 chars)"
    echo "  - minio_user.txt"
    [[ -n "$STACK_AUTH_SECRET_KEY" ]] && echo "  - stack_auth_secret.txt"
}
```

## State of the Art

| Old Approach              | Current Approach                      | When Changed  | Impact                      |
| ------------------------- | ------------------------------------- | ------------- | --------------------------- |
| Manual .env editing       | Interactive prompts + auto-generation | This phase    | User experience improvement |
| User types passwords      | Auto-generated secure secrets         | Best practice | Eliminates weak passwords   |
| Single validation         | Retry loops with max attempts         | Best practice | Better UX on typos          |
| Overwrite existing config | Backup + confirm                      | Best practice | Data protection             |

**Current best practices confirmed:**

- Use `openssl rand -base64` for cryptographic randomness (32+ bytes)
- Always `read -r` to prevent backslash interpretation
- Use `read -s` for sensitive input (passwords, secrets)
- Validate with bash `[[ =~ ]]` regex operator
- Provide clear error messages explaining what's wrong
- Limit retry attempts to prevent infinite loops

## Open Questions

Things that need clarification during planning:

1. **CONFIG-03 Clarification**
   - What we know: Requirement says "prompts for database passwords with confirmation"
   - What's unclear: Success criteria says "user never types passwords"
   - Recommendation: Interpret as "auto-generate all passwords" since success criteria #3 explicitly states user never types passwords. CONFIG-03 confirmation could mean "display for confirmation/copying" not "type twice to confirm".

2. **Existing .env.production Handling**
   - What we know: A `.env.production` file already exists in the repo
   - What's unclear: Should script preserve user customizations? Merge? Overwrite with backup?
   - Recommendation: Backup existing, generate fresh, warn user to manually merge custom values if needed.

3. **Stack Auth Integration**
   - What we know: Stack Auth requires 3 values (project ID, publishable key, secret key)
   - What's unclear: Can these be validated via API? Or just format validation?
   - Recommendation: Accept without API validation (user responsible for correctness), validate non-empty only.

4. **Optional vs Required External Services**
   - What we know: compose.production.yaml shows Stripe, Resend, Telnyx, Sentry as optional
   - What's unclear: Should config script prompt for these or leave them empty?
   - Recommendation: Prompt only for REQUIRED values (domain, email, Stack Auth). Optional services can be configured later via direct .env editing.

## Sources

### Primary (HIGH confidence)

- Existing codebase: `scripts/lib/preflight-lib.sh` - Error handling, validation infrastructure
- Existing codebase: `scripts/deploy-selfhosted.sh` - Configuration loading patterns
- Existing codebase: `compose.production.yaml` - Required environment variables
- Existing codebase: `secrets/README.md` - Secret file structure and generation

### Secondary (MEDIUM confidence)

- [Linux Config: Handling User Input](https://linuxconfig.org/handling-user-input-in-bash-scripts) - read command best practices
- [RegEx Tester: FQDN Validation](https://www.regextester.com/103452) - FQDN regex patterns
- [Linux Audit: OpenSSL Passwords](https://linux-audit.com/create-random-passwords-with-openssl-libressl/) - Secure generation
- [Email List Validation: Shell Regex](https://emaillistvalidation.com/blog/mastering-email-validation-with-regex-in-shell-scripting-an-expert-guide/) - Email validation patterns
- [LabEx: Bash Regex](https://labex.io/tutorials/shell-how-to-use-regex-in-bash-scripting-392579) - Bash =~ operator usage

### Tertiary (LOW confidence)

- WebSearch results for "bash best practices 2026" - General guidance, cross-verified with official docs

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - bash built-ins and openssl are universal, well-documented
- Architecture: HIGH - patterns derived from existing codebase that already works
- Validation patterns: HIGH - regex patterns verified via multiple sources
- Pitfalls: HIGH - based on common bash scripting issues well-documented online

**Research date:** 2026-01-25
**Valid until:** 90 days (stable bash/openssl patterns, unlikely to change)

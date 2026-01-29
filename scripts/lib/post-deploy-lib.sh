#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Post-Deployment Library
# Functions for credential display and next steps
# ===========================================
# Usage: source this file
#   source "$(dirname "$0")/lib/post-deploy-lib.sh"
# ===========================================

# Ensure we have preflight-lib for colors/helpers
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${LIB_DIR}/preflight-lib.sh" ]]; then
    source "${LIB_DIR}/preflight-lib.sh"
else
    echo "Error: preflight-lib.sh not found" >&2
    return 1
fi

LIB_VERSION="1.0.0"

# ===========================================
# Helper Functions
# ===========================================

# Mask a secret value showing first 4 and last 4 characters
# Args: $1 = secret value
# Returns: masked string like "abcd...wxyz"
mask_secret() {
    local secret="$1"
    local length=${#secret}

    if [[ $length -le 8 ]]; then
        # If secret is 8 chars or less, just show asterisks
        echo "********"
    else
        local first="${secret:0:4}"
        local last="${secret: -4}"
        echo "${first}...${last}"
    fi
}

# ===========================================
# Credential Display Functions
# ===========================================

# Display credential summary with masked values
# CRITICAL: Outputs to /dev/tty to prevent log capture
# Uses SECRETS_DIR environment variable (default: ${PROJECT_ROOT}/secrets)
# Returns: 0 on success, 1 if secrets directory not found
display_credential_summary() {
    local secrets_dir="${SECRETS_DIR:-${PROJECT_ROOT:-$(pwd)}/secrets}"

    # Check if secrets directory exists
    if [[ ! -d "$secrets_dir" ]]; then
        warning "Secrets directory not found: $secrets_dir" > /dev/tty
        return 1
    fi

    # Display warning about terminal-only output
    echo "" > /dev/tty
    echo -e "${YELLOW}========================================${NC}" > /dev/tty
    echo -e "${YELLOW}  CREDENTIAL SUMMARY (Terminal Only)    ${NC}" > /dev/tty
    echo -e "${YELLOW}========================================${NC}" > /dev/tty
    echo -e "${YELLOW}NOTE: Credentials displayed to terminal only.${NC}" > /dev/tty
    echo -e "${YELLOW}      Not captured in logs for security.${NC}" > /dev/tty
    echo "" > /dev/tty

    # PostgreSQL password
    if [[ -f "$secrets_dir/postgres_password.txt" ]]; then
        local pg_pass
        pg_pass=$(cat "$secrets_dir/postgres_password.txt")
        echo -e "PostgreSQL: ${GREEN}$(mask_secret "$pg_pass")${NC}" > /dev/tty
    else
        echo -e "PostgreSQL: ${RED}[NOT FOUND]${NC}" > /dev/tty
    fi

    # JWT Secret - show length only for security
    if [[ -f "$secrets_dir/jwt_secret.txt" ]]; then
        local jwt_secret
        jwt_secret=$(cat "$secrets_dir/jwt_secret.txt")
        local jwt_len=${#jwt_secret}
        echo -e "JWT Secret: ${GREEN}[${jwt_len} chars - stored in secrets/jwt_secret.txt]${NC}" > /dev/tty
    else
        echo -e "JWT Secret: ${RED}[NOT FOUND]${NC}" > /dev/tty
    fi

    # Grafana password
    if [[ -f "$secrets_dir/grafana_password.txt" ]]; then
        local grafana_pass
        grafana_pass=$(cat "$secrets_dir/grafana_password.txt")
        echo -e "Grafana:    ${GREEN}$(mask_secret "$grafana_pass")${NC}" > /dev/tty
    else
        echo -e "Grafana:    ${RED}[NOT FOUND]${NC}" > /dev/tty
    fi

    # MinIO credentials
    if [[ -f "$secrets_dir/minio_user.txt" ]]; then
        local minio_user
        minio_user=$(cat "$secrets_dir/minio_user.txt")
        echo -e "MinIO User: ${GREEN}${minio_user}${NC}" > /dev/tty
    else
        echo -e "MinIO User: ${RED}[NOT FOUND]${NC}" > /dev/tty
    fi

    if [[ -f "$secrets_dir/minio_password.txt" ]]; then
        local minio_pass
        minio_pass=$(cat "$secrets_dir/minio_password.txt")
        echo -e "MinIO Pass: ${GREEN}$(mask_secret "$minio_pass")${NC}" > /dev/tty
    else
        echo -e "MinIO Pass: ${RED}[NOT FOUND]${NC}" > /dev/tty
    fi

    # Stack Auth keys from .env.production if present
    local env_file="${ENV_FILE:-${PROJECT_ROOT:-$(pwd)}/.env.production}"
    if [[ -f "$env_file" ]]; then
        local stack_project_id
        local stack_pub_key
        stack_project_id=$(grep "^STACK_AUTH_PROJECT_ID=" "$env_file" | cut -d'=' -f2)
        stack_pub_key=$(grep "^STACK_AUTH_PUBLISHABLE_KEY=" "$env_file" | cut -d'=' -f2)

        if [[ -n "$stack_project_id" ]]; then
            echo "" > /dev/tty
            echo -e "Stack Auth Project: ${GREEN}$(mask_secret "$stack_project_id")${NC}" > /dev/tty
        fi
        if [[ -n "$stack_pub_key" ]]; then
            echo -e "Stack Auth Key:     ${GREEN}$(mask_secret "$stack_pub_key")${NC}" > /dev/tty
        fi
    fi

    echo "" > /dev/tty
    echo -e "${YELLOW}========================================${NC}" > /dev/tty
    echo -e "${YELLOW}Credentials stored in: ${secrets_dir}/${NC}" > /dev/tty
    echo -e "${YELLOW}========================================${NC}" > /dev/tty
    echo "" > /dev/tty

    return 0
}

# ===========================================
# Next Steps Display
# ===========================================

# Display next steps for user after deployment
# Args: $1 = domain name
# Returns: 0 always
display_next_steps() {
    local domain="$1"

    if [[ -z "$domain" ]]; then
        domain="your-domain.com"
    fi

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}       NEXT STEPS                       ${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Complete these steps to start using FreshTrack Pro:"
    echo ""
    echo -e "  ${BLUE}1.${NC} Sign up at https://${domain}/signup to create first admin"
    echo ""
    echo -e "  ${BLUE}2.${NC} Create organization in dashboard"
    echo "     Navigate to Settings > Organization to set up your company"
    echo ""
    echo -e "  ${BLUE}3.${NC} Invite team members"
    echo "     Settings > Team > Invite to add users to your organization"
    echo ""
    echo -e "  ${BLUE}4.${NC} Configure TTN integration"
    echo "     Docs: https://${domain}/docs/ttn-setup"
    echo "     Connect your Things Network application for sensor data"
    echo ""
    echo -e "  ${BLUE}5.${NC} Set up alerting rules"
    echo "     Settings > Alerts to configure temperature thresholds"
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Need help? Visit:"
    echo "  - Documentation: https://${domain}/docs"
    echo "  - Support:       admin@${domain}"
    echo ""

    return 0
}

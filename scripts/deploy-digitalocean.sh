#!/bin/bash
# FreshTrack Pro DigitalOcean Deployment Script
# Provisions Droplet via doctl, then delegates to deploy-selfhosted.sh
# Usage: ./scripts/deploy-digitalocean.sh [--config path/to/config] [--provision-only]
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ===========================================
# Colors and Output Helpers
# ===========================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

step() { echo -e "\n${BLUE}==>${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
info() { echo -e "${CYAN}ℹ${NC} $1"; }

# ===========================================
# Configuration Loading
# ===========================================
CONFIG_FILE="${SCRIPT_DIR}/deploy.config"
PROVISION_ONLY=false
DROPLET_NAME="freshtrack-prod"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        --provision-only)
            PROVISION_ONLY=true
            shift
            ;;
        --setup-managed-db)
            SETUP_MANAGED_DB_ONLY=true
            USE_MANAGED_DB=true
            shift
            ;;
        --name)
            DROPLET_NAME="$2"
            shift 2
            ;;
        --help|-h)
            echo "FreshTrack Pro DigitalOcean Deployment"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --config PATH         Path to configuration file (default: scripts/deploy.config)"
            echo "  --provision-only      Only provision Droplet, skip application deployment"
            echo "  --setup-managed-db    Setup managed PostgreSQL database only"
            echo "  --name NAME           Droplet name (default: freshtrack-prod)"
            echo "  --help, -h            Show this help message"
            echo ""
            echo "Environment variables (or set in deploy.config):"
            echo "  DO_API_TOKEN       DigitalOcean API token (required)"
            echo "  DO_SSH_KEY_NAME    SSH key name in DigitalOcean (required)"
            echo "  DO_REGION          Droplet region (default: nyc3)"
            echo "  DO_DROPLET_SIZE    Droplet size (default: s-2vcpu-4gb)"
            echo "  USE_MANAGED_DB     Use managed PostgreSQL (default: false)"
            echo "  USE_DO_SPACES      Use DigitalOcean Spaces (default: false)"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

load_config() {
    step "Loading configuration..."

    # Source config file if exists
    if [ -f "$CONFIG_FILE" ]; then
        # shellcheck source=/dev/null
        source "$CONFIG_FILE"
        success "Loaded configuration from $CONFIG_FILE"
    else
        warning "Configuration file not found: $CONFIG_FILE"
        echo "Will use environment variables or prompt for required values"
    fi

    # Set defaults for DigitalOcean-specific options
    DO_REGION="${DO_REGION:-nyc3}"
    DO_DROPLET_SIZE="${DO_DROPLET_SIZE:-s-2vcpu-4gb}"
    USE_MANAGED_DB="${USE_MANAGED_DB:-false}"
    USE_DO_SPACES="${USE_DO_SPACES:-false}"
    DO_SPACES_REGION="${DO_SPACES_REGION:-$DO_REGION}"
    DO_SPACES_BUCKET="${DO_SPACES_BUCKET:-freshtrack-media}"
    DO_DB_SIZE="${DO_DB_SIZE:-db-s-1vcpu-2gb}"

    # Display configuration summary
    echo ""
    echo "DigitalOcean Configuration:"
    echo "  Region:           $DO_REGION"
    echo "  Droplet Size:     $DO_DROPLET_SIZE"
    echo "  Droplet Name:     $DROPLET_NAME"
    echo "  Managed Database: $USE_MANAGED_DB"
    echo "  DO Spaces:        $USE_DO_SPACES"
    if [ "$USE_MANAGED_DB" = "true" ]; then
        echo "  Database Size:    $DO_DB_SIZE"
    fi
    echo ""
}

# Source helper functions
source "${SCRIPT_DIR}/lib/doctl-helpers.sh" 2>/dev/null || {
    error "doctl-helpers.sh not found. Run Plan 12-01 first."
    exit 1
}

# Source managed database helpers if using managed DB
if [ "${USE_MANAGED_DB:-false}" = "true" ]; then
    source "${SCRIPT_DIR}/lib/managed-db-helpers.sh" 2>/dev/null || {
        error "managed-db-helpers.sh not found. Required when USE_MANAGED_DB=true."
        exit 1
    }
fi

# ===========================================
# Droplet Provisioning
# ===========================================

# Check if Droplet already exists
check_existing_droplet() {
    local name="$1"

    step "Checking for existing Droplet: ${name}..."

    local droplet_info
    droplet_info=$(doctl compute droplet list --format Name,ID,PublicIPv4,Status --no-header | grep "^${name}" || true)

    if [ -n "$droplet_info" ]; then
        local droplet_id droplet_ip droplet_status
        droplet_id=$(echo "$droplet_info" | awk '{print $2}')
        droplet_ip=$(echo "$droplet_info" | awk '{print $3}')
        droplet_status=$(echo "$droplet_info" | awk '{print $4}')

        success "Found existing Droplet: ${name}"
        echo "  ID:     ${droplet_id}"
        echo "  IP:     ${droplet_ip}"
        echo "  Status: ${droplet_status}"

        # Export for later use
        DROPLET_ID="$droplet_id"
        DROPLET_IP="$droplet_ip"

        return 0
    fi

    return 1
}

# Provision new Droplet with cloud-init
provision_droplet() {
    local name="$1"
    local region="${2:-$DO_REGION}"
    local size="${3:-$DO_DROPLET_SIZE}"

    # Check for existing Droplet
    if check_existing_droplet "$name"; then
        warning "Droplet already exists. Skipping provisioning."
        return 0
    fi

    step "Provisioning new Droplet: ${name}..."

    # Validate requirements
    validate_doctl_auth || return 1

    local ssh_fingerprint
    ssh_fingerprint=$(get_ssh_key_fingerprint "$DO_SSH_KEY_NAME") || return 1

    validate_region "$region" > /dev/null || return 1

    # Create cloud-init configuration
    local cloud_init_file
    cloud_init_file=$(create_cloud_init "/tmp/freshtrack-cloud-init.yaml")

    # Get or create VPC
    local vpc_uuid
    vpc_uuid=$(ensure_vpc "freshtrack-vpc" "$region")

    # Provision Droplet
    step "Creating Droplet (this takes 60-90 seconds)..."
    echo "  Name:     ${name}"
    echo "  Region:   ${region}"
    echo "  Size:     ${size}"
    echo "  SSH Key:  ${DO_SSH_KEY_NAME}"

    local droplet_info
    droplet_info=$(doctl compute droplet create "$name" \
        --image ubuntu-24-04-x64 \
        --size "$size" \
        --region "$region" \
        --ssh-keys "$ssh_fingerprint" \
        --vpc-uuid "$vpc_uuid" \
        --user-data-file "$cloud_init_file" \
        --tag-names "freshtrack,production" \
        --wait \
        --format ID,Name,PublicIPv4,PrivateIPv4 \
        --no-header)

    if [ -z "$droplet_info" ]; then
        error "Failed to create Droplet"
        return 1
    fi

    DROPLET_ID=$(echo "$droplet_info" | awk '{print $1}')
    DROPLET_IP=$(echo "$droplet_info" | awk '{print $3}')
    local private_ip
    private_ip=$(echo "$droplet_info" | awk '{print $4}')

    success "Droplet created!"
    echo "  ID:         ${DROPLET_ID}"
    echo "  Public IP:  ${DROPLET_IP}"
    echo "  Private IP: ${private_ip}"

    # Create or attach Cloud Firewall
    ensure_cloud_firewall "freshtrack-firewall" "$DROPLET_ID" > /dev/null

    # Clean up cloud-init file
    rm -f "$cloud_init_file"

    # Save Droplet IP for DNS configuration
    echo "$DROPLET_IP" > "${SCRIPT_DIR}/.droplet-ip"
    success "Droplet IP saved to ${SCRIPT_DIR}/.droplet-ip"
}

# Wait for cloud-init to complete
wait_for_cloud_init() {
    local ip="$1"
    local max_wait="${2:-600}"  # 10 minutes default

    step "Waiting for cloud-init to complete..."
    echo "This may take 3-5 minutes for Docker installation"

    local elapsed=0
    local interval=15

    while [ $elapsed -lt $max_wait ]; do
        if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes \
            "root@${ip}" "test -f /var/lib/cloud/instance/boot-finished" 2>/dev/null; then
            success "Cloud-init complete after ${elapsed} seconds"

            # Verify Docker is running
            if ssh -o BatchMode=yes "root@${ip}" "docker --version" 2>/dev/null; then
                success "Docker is available on Droplet"
                return 0
            else
                warning "Docker not yet ready, waiting..."
            fi
        fi

        echo "  Cloud-init running... (${elapsed}s / ${max_wait}s)"
        sleep $interval
        elapsed=$((elapsed + interval))
    done

    error "Cloud-init did not complete within ${max_wait} seconds"
    echo "Check Droplet console for errors: https://cloud.digitalocean.com/droplets/${DROPLET_ID}/console"
    return 1
}

# ===========================================
# Managed Database Setup
# ===========================================

setup_managed_database() {
    if [ "${USE_MANAGED_DB:-false}" != "true" ]; then
        info "Using self-hosted PostgreSQL (containerized)"
        return 0
    fi

    step "Setting up DigitalOcean Managed PostgreSQL..."

    # Get VPC UUID for private networking
    local vpc_uuid
    vpc_uuid=$(ensure_vpc "freshtrack-vpc" "$DO_REGION")

    # Create or get existing database cluster
    create_managed_database "freshtrack-db" "$DO_REGION" "$DO_DB_SIZE" "$vpc_uuid" || {
        error "Failed to create managed database"
        return 1
    }

    # Configure firewall to allow Droplet access
    if [ -n "$DROPLET_ID" ]; then
        configure_trusted_sources "$DB_CLUSTER_ID" "$DROPLET_ID"
    fi

    # Save connection string to secrets
    save_connection_string "$DB_CLUSTER_ID" "/opt/freshtrack-pro/secrets/database_url"

    # Display database info
    show_database_info "$DB_CLUSTER_ID"

    success "Managed PostgreSQL configured"
}

# ===========================================
# Remote Deployment
# ===========================================

# Copy configuration and run deployment on Droplet
deploy_to_droplet() {
    local ip="$1"

    step "Preparing remote deployment..."

    # Copy config file to Droplet
    if [ -f "$CONFIG_FILE" ]; then
        scp -o StrictHostKeyChecking=no "$CONFIG_FILE" "root@${ip}:/opt/freshtrack-pro/scripts/deploy.config"
        success "Configuration copied to Droplet"
    fi

    # Copy secrets if they exist locally
    if [ -d "${SCRIPT_DIR}/../secrets" ]; then
        scp -r -o StrictHostKeyChecking=no "${SCRIPT_DIR}/../secrets" "root@${ip}:/opt/freshtrack-pro/"
        success "Secrets copied to Droplet"
    fi

    # Determine which compose overlay to use
    local compose_overlay="compose.digitalocean.yaml"
    if [ "$USE_MANAGED_DB" = "true" ]; then
        info "Using managed PostgreSQL configuration"
    fi

    # Run deployment on Droplet
    step "Running deployment on Droplet..."
    ssh -o StrictHostKeyChecking=no "root@${ip}" "cd /opt/freshtrack-pro && ./scripts/deploy-selfhosted.sh --config scripts/deploy.config"

    success "Deployment complete!"
}

# Display post-deployment information
show_next_steps() {
    local ip="$1"

    echo ""
    echo "========================================"
    echo -e "${GREEN}DigitalOcean Deployment Complete${NC}"
    echo "========================================"
    echo ""
    echo "Droplet Information:"
    echo "  Name:      ${DROPLET_NAME}"
    echo "  IP:        ${ip}"
    echo "  Region:    ${DO_REGION}"
    echo "  Dashboard: https://cloud.digitalocean.com/droplets/${DROPLET_ID}"
    echo ""
    echo "Next Steps:"
    echo ""
    echo "  1. Configure DNS:"
    echo "     Add A record: ${DOMAIN:-your-domain.com} -> ${ip}"
    echo ""
    echo "  2. Wait for DNS propagation (5-60 minutes)"
    echo "     Check: dig ${DOMAIN:-your-domain.com}"
    echo ""
    echo "  3. Access your application:"
    echo "     https://${DOMAIN:-your-domain.com}"
    echo ""
    if [ "$USE_MANAGED_DB" = "true" ]; then
        echo "  4. Configure Managed PostgreSQL:"
        echo "     Run: ./scripts/deploy-digitalocean.sh --setup-managed-db"
        echo ""
    fi
    echo "SSH Access:"
    echo "  ssh root@${ip}"
    echo ""
    echo "View Logs:"
    echo "  ssh root@${ip} 'cd /opt/freshtrack-pro && docker compose logs -f'"
    echo ""
}

# ===========================================
# Main Execution Flow
# ===========================================

main() {
    echo "========================================"
    echo "FreshTrack Pro DigitalOcean Deployment"
    echo "========================================"
    echo ""
    echo "Start time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # Load configuration
    load_config

    # Handle standalone managed DB setup
    if [ "${SETUP_MANAGED_DB_ONLY:-false}" = "true" ]; then
        validate_doctl_auth || exit 1
        setup_managed_database || exit 1
        echo ""
        echo "Managed database setup complete."
        echo "Update DATABASE_URL in your application to use the managed database."
        exit 0
    fi

    # Validate doctl authentication
    validate_doctl_auth || exit 1

    # Provision Droplet
    provision_droplet "$DROPLET_NAME" "$DO_REGION" "$DO_DROPLET_SIZE" || {
        error "Droplet provisioning failed"
        exit 1
    }

    # Wait for cloud-init if this is a new Droplet
    if [ -z "$DROPLET_IP" ] || ! ssh -o BatchMode=yes -o ConnectTimeout=5 "root@${DROPLET_IP}" "test -f /var/lib/cloud/instance/boot-finished" 2>/dev/null; then
        wait_for_cloud_init "$DROPLET_IP" || exit 1
    else
        success "Droplet already initialized"
    fi

    # Setup managed database if enabled
    setup_managed_database || {
        warning "Managed database setup failed, continuing with self-hosted mode"
    }

    # Show info and exit if provision-only mode
    if [ "$PROVISION_ONLY" = true ]; then
        echo ""
        echo "========================================"
        echo -e "${GREEN}Droplet Provisioned Successfully${NC}"
        echo "========================================"
        echo ""
        echo "Droplet IP: ${DROPLET_IP}"
        echo ""
        echo "To continue deployment manually:"
        echo "  ssh root@${DROPLET_IP}"
        echo "  cd /opt/freshtrack-pro"
        echo "  ./scripts/deploy-selfhosted.sh"
        echo ""
        exit 0
    fi

    # Deploy application to Droplet
    deploy_to_droplet "$DROPLET_IP" || {
        error "Deployment failed"
        exit 1
    }

    # Show next steps
    show_next_steps "$DROPLET_IP"

    echo ""
    echo "End time: $(date '+%Y-%m-%d %H:%M:%S')"
}

# Run main function
main "$@"

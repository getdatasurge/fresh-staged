#!/bin/bash
# FreshTrack Pro - DigitalOcean CLI Helper Functions
#
# This file is meant to be sourced (not executed directly)
# Source this file in deploy-digitalocean.sh
#
# Requirements:
#   - doctl CLI installed and authenticated
#   - Color helper functions from parent script: step, success, error, warning
#
# Usage:
#   source scripts/lib/doctl-helpers.sh
#   validate_doctl_auth
#   fingerprint=$(get_ssh_key_fingerprint "my-key")

# ===========================================
# Authentication and Validation
# ===========================================

# Validate doctl is installed and authenticated
validate_doctl_auth() {
    step "Validating DigitalOcean CLI..."

    # Check if doctl is installed
    if ! command -v doctl &> /dev/null; then
        error "doctl CLI not found"
        echo ""
        echo "Install doctl:"
        echo "  macOS:  brew install doctl"
        echo "  Linux:  snap install doctl"
        echo "  Manual: https://docs.digitalocean.com/reference/doctl/how-to/install/"
        echo ""
        return 1
    fi

    success "doctl installed: $(doctl version | head -1)"

    # Authenticate with token if provided
    if [ -n "$DO_API_TOKEN" ]; then
        echo "$DO_API_TOKEN" | doctl auth init --context freshtrack 2>/dev/null
        doctl auth switch --context freshtrack 2>/dev/null
        success "Authenticated with provided API token"
    fi

    # Validate authentication by attempting API call
    if ! doctl account get --format Email --no-header 2>/dev/null; then
        error "doctl not authenticated"
        echo ""
        echo "Authenticate doctl:"
        echo "  Option 1: Set DO_API_TOKEN in deploy.config"
        echo "  Option 2: Run: doctl auth init"
        echo ""
        echo "Create API token at: https://cloud.digitalocean.com/account/api/tokens"
        return 1
    fi

    local account_email
    account_email=$(doctl account get --format Email --no-header)
    success "Authenticated as: ${account_email}"

    return 0
}

# Get SSH key fingerprint by name
get_ssh_key_fingerprint() {
    local key_name="$1"

    if [ -z "$key_name" ]; then
        error "SSH key name required"
        echo "Set DO_SSH_KEY_NAME in deploy.config"
        return 1
    fi

    step "Looking up SSH key: ${key_name}..."

    local fingerprint
    fingerprint=$(doctl compute ssh-key list --format Name,FingerPrint --no-header | grep "^${key_name}" | awk '{print $2}')

    if [ -z "$fingerprint" ]; then
        error "SSH key not found: ${key_name}"
        echo ""
        echo "Available SSH keys:"
        doctl compute ssh-key list --format Name,FingerPrint
        echo ""
        echo "Add SSH key at: https://cloud.digitalocean.com/account/security"
        return 1
    fi

    success "SSH key fingerprint: ${fingerprint}"
    echo "$fingerprint"
}

# Validate region exists
validate_region() {
    local region="$1"

    if [ -z "$region" ]; then
        warning "No region specified, using default: nyc3"
        echo "nyc3"
        return 0
    fi

    if ! doctl compute region list --format Slug --no-header | grep -qx "$region"; then
        error "Invalid region: ${region}"
        echo ""
        echo "Available regions:"
        doctl compute region list --format Slug,Name,Available
        return 1
    fi

    success "Region validated: ${region}"
    echo "$region"
}

# ===========================================
# Cloud-Init User Data
# ===========================================

# Create cloud-init configuration for Droplet first boot
create_cloud_init() {
    local output_file="${1:-/tmp/cloud-init.yaml}"
    local git_repo="${GIT_REPO_URL:-https://github.com/yourusername/freshtrack-pro.git}"
    local git_branch="${GIT_BRANCH:-main}"

    step "Creating cloud-init configuration..."

    cat > "$output_file" <<EOFINNER
#cloud-config
package_update: true
package_upgrade: true

packages:
  - apt-transport-https
  - ca-certificates
  - curl
  - gnupg
  - ufw
  - fail2ban
  - git
  - jq

runcmd:
  # Install Docker using official script
  - curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  - sh /tmp/get-docker.sh
  - systemctl enable docker
  - systemctl start docker
  - rm /tmp/get-docker.sh

  # Configure firewall
  - ufw allow 22/tcp comment 'SSH'
  - ufw allow 80/tcp comment 'HTTP'
  - ufw allow 443/tcp comment 'HTTPS'
  - ufw --force enable

  # Configure fail2ban for SSH protection
  - systemctl enable fail2ban
  - systemctl start fail2ban

  # Clone application repository
  - git clone --branch ${git_branch} ${git_repo} /opt/freshtrack-pro

  # Create secrets directory
  - mkdir -p /opt/freshtrack-pro/secrets
  - chmod 700 /opt/freshtrack-pro/secrets

  # Signal boot completion
  - touch /var/lib/cloud/instance/boot-finished

final_message: "FreshTrack Pro base setup complete after \$UPTIME seconds"
EOFINNER

    success "Cloud-init configuration created: ${output_file}"
    echo "$output_file"
}

# ===========================================
# VPC and Networking
# ===========================================

# Get or create VPC for deployment
ensure_vpc() {
    local vpc_name="${1:-freshtrack-vpc}"
    local region="${2:-nyc3}"

    step "Checking for existing VPC: ${vpc_name}..."

    # Check if VPC exists
    local vpc_uuid
    vpc_uuid=$(doctl vpcs list --format Name,ID --no-header | grep "^${vpc_name}" | awk '{print $2}')

    if [ -n "$vpc_uuid" ]; then
        success "Using existing VPC: ${vpc_uuid}"
        echo "$vpc_uuid"
        return 0
    fi

    step "Creating VPC: ${vpc_name}..."

    vpc_uuid=$(doctl vpcs create \
        --name "${vpc_name}" \
        --region "${region}" \
        --ip-range "10.116.0.0/20" \
        --format ID \
        --no-header)

    if [ -z "$vpc_uuid" ]; then
        error "Failed to create VPC"
        return 1
    fi

    success "Created VPC: ${vpc_uuid}"
    echo "$vpc_uuid"
}

# Create Cloud Firewall for Droplet
ensure_cloud_firewall() {
    local firewall_name="${1:-freshtrack-firewall}"
    local droplet_id="$2"

    step "Checking for existing Cloud Firewall: ${firewall_name}..."

    # Check if firewall exists
    local firewall_id
    firewall_id=$(doctl compute firewall list --format Name,ID --no-header | grep "^${firewall_name}" | awk '{print $2}')

    if [ -n "$firewall_id" ]; then
        success "Using existing firewall: ${firewall_id}"

        # Add Droplet to firewall if specified
        if [ -n "$droplet_id" ]; then
            doctl compute firewall add-droplets "$firewall_id" --droplet-ids "$droplet_id" 2>/dev/null || true
            success "Droplet added to firewall"
        fi

        echo "$firewall_id"
        return 0
    fi

    step "Creating Cloud Firewall: ${firewall_name}..."

    local inbound="protocol:tcp,ports:22,sources:addresses:0.0.0.0/0,::/0"
    inbound="${inbound} protocol:tcp,ports:80,sources:addresses:0.0.0.0/0,::/0"
    inbound="${inbound} protocol:tcp,ports:443,sources:addresses:0.0.0.0/0,::/0"

    local outbound="protocol:tcp,ports:all,destinations:addresses:0.0.0.0/0,::/0"
    outbound="${outbound} protocol:udp,ports:all,destinations:addresses:0.0.0.0/0,::/0"
    outbound="${outbound} protocol:icmp,destinations:addresses:0.0.0.0/0,::/0"

    local create_args=(
        --name "${firewall_name}"
        --inbound-rules "$inbound"
        --outbound-rules "$outbound"
    )

    if [ -n "$droplet_id" ]; then
        create_args+=(--droplet-ids "$droplet_id")
    fi

    firewall_id=$(doctl compute firewall create "${create_args[@]}" --format ID --no-header)

    if [ -z "$firewall_id" ]; then
        error "Failed to create Cloud Firewall"
        return 1
    fi

    success "Created Cloud Firewall: ${firewall_id}"
    echo "$firewall_id"
}

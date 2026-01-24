#!/bin/bash
# FreshTrack Pro Self-Hosted Deployment Script
# Transforms bare Ubuntu 24.04 VM into production environment
# Usage: ./scripts/deploy-selfhosted.sh [--config path/to/config]
set -e

# ===========================================
# Colors and Output Helpers
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
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# ===========================================
# Configuration Loading
# ===========================================
CONFIG_FILE="scripts/deploy.config"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        *)
            error "Unknown option: $1"
            echo "Usage: $0 [--config path/to/config]"
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
        echo "Will prompt for required values interactively"
    fi

    # Prompt for missing required values
    if [ -z "$DOMAIN" ]; then
        read -rp "Enter your domain name (e.g., freshtrackpro.com): " DOMAIN
    fi

    if [ -z "$ADMIN_EMAIL" ]; then
        read -rp "Enter admin email for SSL certificates: " ADMIN_EMAIL
    fi

    if [ -z "$POSTGRES_PASSWORD" ]; then
        read -rsp "Enter PostgreSQL password (or press Enter to auto-generate): " POSTGRES_PASSWORD
        echo ""
        if [ -z "$POSTGRES_PASSWORD" ]; then
            POSTGRES_PASSWORD=$(openssl rand -base64 32)
            success "Generated random PostgreSQL password"
        fi
    fi

    if [ -z "$STACK_AUTH_PROJECT_ID" ]; then
        read -rp "Enter Stack Auth Project ID: " STACK_AUTH_PROJECT_ID
    fi

    if [ -z "$STACK_AUTH_PUBLISHABLE_KEY" ]; then
        read -rp "Enter Stack Auth Publishable Key: " STACK_AUTH_PUBLISHABLE_KEY
    fi

    if [ -z "$STACK_AUTH_SECRET_KEY" ]; then
        read -rsp "Enter Stack Auth Secret Key: " STACK_AUTH_SECRET_KEY
        echo ""
    fi

    # Set defaults for optional values
    POSTGRES_DB="${POSTGRES_DB:-freshtrack}"
    POSTGRES_USER="${POSTGRES_USER:-freshtrack_user}"
    VERSION_RETENTION="${VERSION_RETENTION:-3}"
    HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-30}"
    HEALTH_CHECK_RETRIES="${HEALTH_CHECK_RETRIES:-30}"
    GIT_REPO_URL="${GIT_REPO_URL:-https://github.com/yourusername/freshtrack-pro.git}"
    GIT_BRANCH="${GIT_BRANCH:-main}"

    # Auto-generate optional passwords if not set
    if [ -z "$GRAFANA_ADMIN_PASSWORD" ]; then
        GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 16)
        success "Generated random Grafana admin password"
    fi

    if [ -z "$MINIO_ACCESS_KEY" ]; then
        MINIO_ACCESS_KEY="minioadmin"
    fi

    if [ -z "$MINIO_SECRET_KEY" ]; then
        MINIO_SECRET_KEY=$(openssl rand -base64 16)
        success "Generated random MinIO secret key"
    fi

    # Display configuration summary
    echo ""
    echo "Configuration Summary:"
    echo "  Domain: $DOMAIN"
    echo "  Admin Email: $ADMIN_EMAIL"
    echo "  Database: $POSTGRES_DB (user: $POSTGRES_USER)"
    echo "  Stack Auth Project: $STACK_AUTH_PROJECT_ID"
    echo "  Version Retention: $VERSION_RETENTION"
    echo "  Health Check: ${HEALTH_CHECK_RETRIES}x${HEALTH_CHECK_TIMEOUT}s timeout"
    echo ""
}

# ===========================================
# Idempotent Helper Functions
# ===========================================
ensure_package() {
    local pkg=$1
    if dpkg -s "$pkg" 2>/dev/null | grep -q "Status: install ok installed"; then
        success "$pkg is already installed"
    else
        step "Installing $pkg..."
        apt-get update -qq
        apt-get install -y "$pkg"
        success "$pkg installed"
    fi
}

ensure_line_in_file() {
    local line=$1
    local file=$2

    if grep -qF "$line" "$file" 2>/dev/null; then
        return 0
    else
        echo "$line" >> "$file"
        return 1
    fi
}

ensure_dig() {
    if ! command -v dig &> /dev/null; then
        step "Installing dnsutils for DNS checks..."
        apt-get update -qq
        apt-get install -y dnsutils
        success "dnsutils installed"
    fi
}

# ===========================================
# DNS and Health Check Functions
# ===========================================
# Check DNS resolution before requesting SSL certificates
# Prevents Let's Encrypt rate limit exhaustion (5 failures/hour limit)
check_dns_resolution() {
    local domain=$1
    local max_retries=5
    local retry_delay=10

    step "Checking DNS resolution for ${domain}..."

    # Ensure dig is available
    ensure_dig

    # Get server's public IP
    local server_ip
    server_ip=$(curl -s --max-time 10 ifconfig.me || curl -s --max-time 10 icanhazip.com)

    if [ -z "$server_ip" ]; then
        error "Could not determine server public IP"
        return 1
    fi

    echo "Server public IP: ${server_ip}"

    # Check DNS resolution with retries
    local attempt=1
    while [ $attempt -le $max_retries ]; do
        local resolved_ip
        resolved_ip=$(dig +short "$domain" | tail -1)

        if [ "$resolved_ip" = "$server_ip" ]; then
            success "DNS resolved correctly: ${domain} -> ${server_ip}"
            return 0
        fi

        if [ $attempt -lt $max_retries ]; then
            warning "DNS not ready (attempt ${attempt}/${max_retries}): ${domain} -> ${resolved_ip:-<no result>}"
            echo "Expected: ${server_ip}"
            echo "Retrying in ${retry_delay} seconds..."
            sleep $retry_delay
        fi

        attempt=$((attempt + 1))
    done

    error "DNS resolution failed for ${domain}"
    echo ""
    echo "Please update your DNS records:"
    echo "  Record Type: A"
    echo "  Name: ${domain}"
    echo "  Value: ${server_ip}"
    echo ""
    echo "Wait for DNS propagation (typically 5-60 minutes) before retrying."
    echo "Check propagation: dig ${domain}"
    echo ""
    echo "This check prevents Let's Encrypt rate limit exhaustion."
    echo "Let's Encrypt limits: 5 failed authorizations per account per hour."
    return 1
}

# ===========================================
# Version Tagging and Deployment Tracking
# ===========================================
# Tag deployment for version tracking
tag_deployment() {
    local version
    version=$(git describe --tags --always 2>/dev/null || echo "unknown")
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local tag="${version}-${timestamp}"

    echo "Tagging deployment: ${tag}"

    # Save current version
    echo "$tag" > /opt/freshtrack-pro/.deployment-version

    # Save version history (most recent first)
    local history_file="/opt/freshtrack-pro/.deployment-history"
    if [ -f "$history_file" ]; then
        # Prepend new version
        echo "$tag" | cat - "$history_file" > temp && mv temp "$history_file"
    else
        echo "$tag" > "$history_file"
    fi

    # Prune old versions beyond retention limit
    local retention="${VERSION_RETENTION:-3}"
    if [ -f "$history_file" ]; then
        head -n "$retention" "$history_file" > temp && mv temp "$history_file"
    fi

    # Tag Docker images for rollback
    local images=("freshtrack-backend" "freshtrack-frontend")
    for image in "${images[@]}"; do
        if docker images "$image:latest" --format "{{.ID}}" | grep -q .; then
            docker tag "$image:latest" "$image:$tag" 2>/dev/null || true
        fi
    done

    success "Deployment tagged: ${tag}"
}

# Get previous deployment version for rollback
get_previous_version() {
    local history_file="/opt/freshtrack-pro/.deployment-history"
    if [ -f "$history_file" ] && [ "$(wc -l < "$history_file")" -gt 1 ]; then
        # Return second line (previous version)
        sed -n '2p' "$history_file"
    else
        echo ""
    fi
}

# Prune old Docker images beyond retention
prune_old_images() {
    local retention="${VERSION_RETENTION:-3}"

    for image in freshtrack-backend freshtrack-frontend; do
        # Get all tags except latest, sorted by creation time
        docker images "$image" --format "{{.Tag}}" | \
            grep -v "^latest$" | \
            tail -n +$((retention + 1)) | \
            xargs -r -I {} docker rmi "$image:{}" 2>/dev/null || true
    done

    success "Pruned old images (keeping last ${retention} versions)"
}

# ===========================================
# Health Check and Automatic Rollback
# ===========================================
# Validate deployment health with timeout
validate_deployment_health() {
    local timeout="${HEALTH_CHECK_TIMEOUT:-30}"
    local max_retries="${HEALTH_CHECK_RETRIES:-30}"
    local health_url="http://localhost:3000/health"

    step "Validating deployment health..."
    echo "Timeout: ${timeout}s per attempt, ${max_retries} attempts max"
    echo "Total timeout: $((timeout * max_retries / 60)) minutes"

    local attempt=1
    while [ $attempt -le $max_retries ]; do
        if curl -sf --max-time 10 "$health_url" > /dev/null 2>&1; then
            success "Health check passed on attempt ${attempt}"

            # Verify response content
            local response
            response=$(curl -s --max-time 10 "$health_url")
            if echo "$response" | grep -q '"status":"healthy"'; then
                success "Backend reports healthy status"
                return 0
            else
                warning "Unexpected health response: ${response}"
            fi
        fi

        if [ $attempt -lt $max_retries ]; then
            echo "Health check attempt ${attempt}/${max_retries} failed, retrying in ${timeout}s..."
            sleep "$timeout"
        fi

        attempt=$((attempt + 1))
    done

    error "Health check failed after ${max_retries} attempts"
    return 1
}

# Automatic rollback on deployment failure
rollback_deployment() {
    local previous_version
    previous_version=$(get_previous_version)

    if [ -z "$previous_version" ]; then
        error "No previous version available for rollback"
        echo "This appears to be the first deployment."
        echo "Manual intervention required."
        return 1
    fi

    warning "Initiating automatic rollback to: ${previous_version}"

    # Stop current deployment
    step "Stopping failed deployment..."
    docker compose -f /opt/freshtrack-pro/docker-compose.yml \
                   -f /opt/freshtrack-pro/docker/compose.prod.yaml \
                   -f /opt/freshtrack-pro/docker/compose.selfhosted.yaml \
                   down --timeout 30

    # Restore previous version's images
    step "Restoring previous images..."
    for image in freshtrack-backend freshtrack-frontend; do
        if docker images "$image:$previous_version" --format "{{.ID}}" | grep -q .; then
            docker tag "$image:$previous_version" "$image:latest"
            success "Restored ${image}:${previous_version}"
        else
            warning "Previous image not found: ${image}:${previous_version}"
        fi
    done

    # Start services with restored images
    step "Starting restored services..."
    docker compose -f /opt/freshtrack-pro/docker-compose.yml \
                   -f /opt/freshtrack-pro/docker/compose.prod.yaml \
                   -f /opt/freshtrack-pro/docker/compose.selfhosted.yaml \
                   up -d

    # Verify rollback
    step "Verifying rollback..."
    sleep 10
    if curl -sf --max-time 10 "http://localhost:3000/health" > /dev/null 2>&1; then
        success "Rollback successful - previous version is healthy"

        # Update version tracking
        echo "$previous_version" > /opt/freshtrack-pro/.deployment-version
        return 0
    else
        error "Rollback also failed - manual intervention required"
        echo "Check logs: docker compose logs"
        return 1
    fi
}

# ===========================================
# Installation Functions (Idempotent)
# ===========================================
install_docker() {
    step "Installing Docker..."

    if command -v docker &> /dev/null; then
        success "Docker is already installed ($(docker --version))"
        return 0
    fi

    echo "Downloading and running Docker installation script..."
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sh /tmp/get-docker.sh
    rm /tmp/get-docker.sh

    # Add current user to docker group
    if [ -n "$SUDO_USER" ]; then
        usermod -aG docker "$SUDO_USER"
        success "Added $SUDO_USER to docker group (logout required)"
    fi

    # Enable and start docker service
    systemctl enable docker
    systemctl start docker

    success "Docker installed successfully"
}

install_docker_compose() {
    step "Verifying Docker Compose..."

    if docker compose version &> /dev/null; then
        success "Docker Compose is available ($(docker compose version))"
    else
        error "Docker Compose v2 should be included with Docker Engine"
        error "Please ensure Docker is properly installed"
        exit 1
    fi
}

configure_firewall() {
    step "Configuring firewall..."

    # Install ufw if missing
    ensure_package ufw

    # Allow SSH (check before adding to avoid duplicates)
    if ufw status | grep -q "22/tcp.*ALLOW"; then
        success "SSH port 22 already allowed"
    else
        ufw allow 22/tcp comment 'SSH'
        success "Allowed SSH port 22"
    fi

    # Allow HTTP (for Let's Encrypt ACME challenge)
    if ufw status | grep -q "80/tcp.*ALLOW"; then
        success "HTTP port 80 already allowed"
    else
        ufw allow 80/tcp comment 'HTTP'
        success "Allowed HTTP port 80"
    fi

    # Allow HTTPS (for production traffic)
    if ufw status | grep -q "443/tcp.*ALLOW"; then
        success "HTTPS port 443 already allowed"
    else
        ufw allow 443/tcp comment 'HTTPS'
        success "Allowed HTTPS port 443"
    fi

    # Enable firewall (--force avoids interactive prompt)
    ufw --force enable

    success "Firewall configured"
    echo "Current firewall status:"
    ufw status numbered
}

install_fail2ban() {
    step "Installing fail2ban..."

    if command -v fail2ban-client &> /dev/null; then
        success "fail2ban is already installed"
        systemctl enable fail2ban 2>/dev/null || true
        systemctl start fail2ban 2>/dev/null || true
        return 0
    fi

    ensure_package fail2ban

    # Create basic jail.local for SSH protection if doesn't exist
    if [ ! -f /etc/fail2ban/jail.local ]; then
        cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
logpath = %(sshd_log)s
backend = %(sshd_backend)s
EOF
        success "Created /etc/fail2ban/jail.local"
    else
        success "fail2ban configuration already exists"
    fi

    # Enable and start service
    systemctl enable fail2ban
    systemctl start fail2ban

    success "fail2ban installed and configured"
}

install_node_exporter() {
    step "Installing node_exporter..."

    # Check if container already exists
    if docker ps -a --filter name=node-exporter --format "{{.Names}}" | grep -q "^node-exporter$"; then
        success "node_exporter container already exists"

        # Ensure it's running
        if ! docker ps --filter name=node-exporter --format "{{.Names}}" | grep -q "^node-exporter$"; then
            docker start node-exporter
            success "Started existing node_exporter container"
        fi

        return 0
    fi

    # Run node_exporter as Docker container
    docker run -d \
        --name node-exporter \
        --restart unless-stopped \
        --net="host" \
        --pid="host" \
        -v "/:/host:ro,rslave" \
        prom/node-exporter:v1.6.0 \
        --path.rootfs=/host

    success "node_exporter installed and running on 127.0.0.1:9100"
}

setup_app_directory() {
    step "Setting up application directory..."

    # Create /opt/freshtrack-pro with proper permissions
    if [ ! -d /opt/freshtrack-pro ]; then
        mkdir -p /opt/freshtrack-pro
        success "Created /opt/freshtrack-pro directory"
    else
        success "Application directory already exists"
    fi

    # Change to app directory
    cd /opt/freshtrack-pro

    # Clone or update git repo
    if [ ! -d .git ]; then
        step "Cloning repository..."
        echo "Repository: $GIT_REPO_URL"
        echo "Branch: $GIT_BRANCH"

        # Clone repository
        git clone --branch "$GIT_BRANCH" "$GIT_REPO_URL" /tmp/freshtrack-clone

        # Move contents to /opt/freshtrack-pro
        mv /tmp/freshtrack-clone/.git .
        mv /tmp/freshtrack-clone/* . 2>/dev/null || true
        mv /tmp/freshtrack-clone/.* . 2>/dev/null || true
        rm -rf /tmp/freshtrack-clone

        success "Repository cloned"
    else
        step "Updating repository..."
        git fetch origin
        git checkout "$GIT_BRANCH"
        git pull origin "$GIT_BRANCH"
        success "Repository updated"
    fi

    # Set ownership (if running as root)
    if [ "$EUID" -eq 0 ] && [ -n "$SUDO_USER" ]; then
        chown -R "$SUDO_USER:$SUDO_USER" /opt/freshtrack-pro
        success "Set ownership to $SUDO_USER"
    fi
}

create_secrets() {
    step "Creating secrets..."

    # Create secrets directory with restrictive permissions
    local secrets_dir="/opt/freshtrack-pro/secrets"

    if [ ! -d "$secrets_dir" ]; then
        mkdir -p "$secrets_dir"
        chmod 700 "$secrets_dir"
        success "Created secrets directory"
    else
        success "Secrets directory already exists"
    fi

    # Write secrets to files with restrictive permissions
    echo -n "$POSTGRES_PASSWORD" > "$secrets_dir/postgres_password.txt"
    chmod 600 "$secrets_dir/postgres_password.txt"

    # Construct database URL
    local database_url="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
    echo -n "$database_url" > "$secrets_dir/database_url.txt"
    chmod 600 "$secrets_dir/database_url.txt"

    # Stack Auth secret
    echo -n "$STACK_AUTH_SECRET_KEY" > "$secrets_dir/stack_auth_secret.txt"
    chmod 600 "$secrets_dir/stack_auth_secret.txt"

    # Grafana password
    echo -n "$GRAFANA_ADMIN_PASSWORD" > "$secrets_dir/grafana_admin_password.txt"
    chmod 600 "$secrets_dir/grafana_admin_password.txt"

    # MinIO credentials
    echo -n "$MINIO_ACCESS_KEY" > "$secrets_dir/minio_access_key.txt"
    chmod 600 "$secrets_dir/minio_access_key.txt"
    echo -n "$MINIO_SECRET_KEY" > "$secrets_dir/minio_secret_key.txt"
    chmod 600 "$secrets_dir/minio_secret_key.txt"

    success "Secrets created in $secrets_dir"
    echo "Secret files created:"
    ls -lh "$secrets_dir"
}

# ===========================================
# Deployment Functions
# ===========================================
deploy_services() {
    step "Starting deployment process..."

    # DNS check first
    if ! check_dns_resolution "$DOMAIN"; then
        error "ABORT: DNS not configured correctly"
        echo "Fix DNS and rerun deployment script."
        exit 1
    fi

    # Tag this deployment attempt
    tag_deployment

    # Start services
    step "Starting services..."
    docker compose -f /opt/freshtrack-pro/docker-compose.yml \
                   -f /opt/freshtrack-pro/docker/compose.prod.yaml \
                   -f /opt/freshtrack-pro/docker/compose.selfhosted.yaml \
                   up -d

    # Validate health
    if ! validate_deployment_health; then
        warning "Deployment failed health checks"

        if ! rollback_deployment; then
            error "CRITICAL: Both deployment and rollback failed"
            echo "Manual intervention required."
            exit 1
        fi

        echo ""
        echo "Deployment rolled back to previous version."
        echo "Review logs and fix issues before retrying."
        exit 1
    fi

    # Cleanup old images
    prune_old_images

    success "Deployment complete and healthy!"
}

# ===========================================
# Main Execution Flow
# ===========================================
main() {
    echo "========================================"
    echo "FreshTrack Pro Self-Hosted Deployment"
    echo "========================================"
    echo ""
    echo "Start time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        error "This script must be run as root"
        echo "Please run: sudo ./scripts/deploy-selfhosted.sh"
        exit 1
    fi

    # Load configuration
    load_config

    # Install dependencies
    install_docker
    install_docker_compose
    configure_firewall
    install_fail2ban
    install_node_exporter

    # Setup application
    setup_app_directory
    create_secrets

    # Deployment complete
    echo ""
    echo "========================================"
    echo -e "${GREEN}Base Setup Complete${NC}"
    echo "========================================"
    echo ""
    echo "Next steps:"
    echo "  1. Configure DNS: Point $DOMAIN to this server's IP"
    echo "  2. Wait for DNS propagation (5-60 minutes)"
    echo "  3. Run deployment with: ./scripts/deploy-selfhosted.sh --deploy"
    echo ""
    echo "Secrets stored in: /opt/freshtrack-pro/secrets/"
    echo "Grafana password: $GRAFANA_ADMIN_PASSWORD"
    echo ""
    echo "IMPORTANT: Save these credentials in a secure password manager"
    echo ""
}

# Run main function
main

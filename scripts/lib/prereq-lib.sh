#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Prerequisites Library
# Docker Engine and utilities installation
# ===========================================
# Usage: source this file in deployment scripts
#   source "$(dirname "$0")/lib/prereq-lib.sh"
#
# Functions provided:
#   - install_docker()            Install Docker Engine via apt repository
#   - verify_docker_compose()     Verify Docker Compose v2 is available
#   - configure_firewall()        Configure UFW firewall (22, 80, 443)
#   - install_fail2ban()          Install and configure fail2ban SSH protection
#   - install_jq()                Install jq JSON processor
#   - install_all_prerequisites() Master function to install all prerequisites
#   - is_package_installed()      Check if apt package is installed
#   - ensure_package()            Install package if not present (idempotent)
#   - wait_for_apt_lock()         Wait for apt locks to be released
#   - apt_update()                Run apt-get update with lock handling
# ===========================================

# Source preflight-lib.sh for error handling and checkpoint system
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/preflight-lib.sh"

LIB_VERSION="1.0.0"

# ===========================================
# APT Lock Handling
# Prevents race conditions with unattended-upgrades
# ===========================================

# Maximum wait time for apt lock (seconds)
APT_LOCK_TIMEOUT="${APT_LOCK_TIMEOUT:-300}"

# Wait for apt locks to be released
# Args: $1 = timeout in seconds (default: APT_LOCK_TIMEOUT)
# Returns: 0 if lock acquired, 1 if timeout
wait_for_apt_lock() {
    local timeout="${1:-$APT_LOCK_TIMEOUT}"
    local waited=0
    local interval=5

    # Lock files to check
    local lock_files=(
        "/var/lib/dpkg/lock"
        "/var/lib/dpkg/lock-frontend"
        "/var/lib/apt/lists/lock"
        "/var/cache/apt/archives/lock"
    )

    while [[ $waited -lt $timeout ]]; do
        local locked=false

        for lock_file in "${lock_files[@]}"; do
            if [[ -f "$lock_file" ]] && fuser "$lock_file" &>/dev/null; then
                locked=true
                break
            fi
        done

        if [[ "$locked" == "false" ]]; then
            return 0
        fi

        if [[ $waited -eq 0 ]]; then
            warning "Waiting for apt lock (another process is using apt)..."
            echo "  This is common during automatic updates"
            echo "  Will wait up to ${timeout}s for lock to be released"
        fi

        sleep "$interval"
        waited=$((waited + interval))

        if [[ $((waited % 30)) -eq 0 ]]; then
            echo "  Still waiting... (${waited}s / ${timeout}s)"
        fi
    done

    error "Timeout waiting for apt lock after ${timeout}s"
    echo "  Another process is holding the apt lock."
    echo "  You can check what's running with: ps aux | grep -E 'apt|dpkg'"
    echo "  If safe, you can kill the process or wait for it to complete."
    return 1
}

# Update apt package lists with lock handling
# Returns: 0 on success, 1 on failure
apt_update() {
    wait_for_apt_lock || return 1

    step "Updating apt package lists..."
    if apt-get update -qq; then
        success "Package lists updated"
        return 0
    else
        error "Failed to update package lists"
        return 1
    fi
}

# ===========================================
# Package Management Helpers
# ===========================================

# Check if an apt package is installed
# Args: $1 = package name
# Returns: 0 if installed, 1 if not
is_package_installed() {
    local package="$1"
    dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q "install ok installed"
}

# Install a package if not already present (idempotent)
# Args: $1 = package name
# Returns: 0 on success, 1 on failure
ensure_package() {
    local package="$1"

    if is_package_installed "$package"; then
        success "$package is already installed"
        return 0
    fi

    # Wait for apt lock before installing
    wait_for_apt_lock || return 1

    step "Installing $package..."
    if apt-get install -y "$package" >/dev/null 2>&1; then
        success "$package installed"
        return 0
    else
        error "Failed to install $package"
        return 1
    fi
}

# ===========================================
# Docker Installation (apt repository method)
# Follows: https://docs.docker.com/engine/install/ubuntu/
# ===========================================

# Install Docker Engine via official apt repository
# Returns: 0 on success, 1 on failure
# Note: Uses apt repository method, NOT get.docker.com
install_docker() {
    step "Checking Docker installation status..."

    # Early return if Docker and Compose v2 are already properly installed
    if command -v docker &>/dev/null && docker compose version &>/dev/null; then
        local docker_version compose_version
        docker_version=$(docker --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)
        compose_version=$(docker compose version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)

        success "Docker Engine ${docker_version} is already installed"
        success "Docker Compose ${compose_version} is already installed"

        # Verify Docker daemon is running
        if docker info &>/dev/null; then
            success "Docker daemon is running"
            return 0
        else
            warning "Docker is installed but daemon is not running"
            step "Starting Docker daemon..."
            systemctl start docker
            systemctl enable docker

            if docker info &>/dev/null; then
                success "Docker daemon started"
                return 0
            fi
        fi
    fi

    # Remove conflicting packages (safe if not present)
    step "Removing conflicting packages..."
    local conflicting_packages=(
        docker.io
        docker-doc
        docker-compose
        docker-compose-v2
        podman-docker
        containerd
        runc
    )

    for pkg in "${conflicting_packages[@]}"; do
        if is_package_installed "$pkg"; then
            warning "Removing conflicting package: $pkg"
            apt-get remove -y "$pkg" >/dev/null 2>&1 || true
        fi
    done
    success "Conflicting packages removed"

    # Install prerequisites (with lock handling)
    step "Installing prerequisites..."
    apt_update || return 1
    wait_for_apt_lock || return 1
    apt-get install -y ca-certificates curl >/dev/null 2>&1
    success "Prerequisites installed"

    # Set up Docker's official GPG key
    step "Adding Docker GPG key..."
    install -m 0755 -d /etc/apt/keyrings

    local keyring_file="/etc/apt/keyrings/docker.asc"
    if [[ -f "$keyring_file" ]]; then
        warning "Docker GPG key already exists, refreshing..."
        rm -f "$keyring_file"
    fi

    if curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o "$keyring_file"; then
        chmod a+r "$keyring_file"
        success "Docker GPG key added"
    else
        error "Failed to download Docker GPG key"
        return 1
    fi

    # Add Docker repository
    step "Adding Docker apt repository..."

    # Handle VERSION_CODENAME vs UBUNTU_CODENAME
    # shellcheck source=/dev/null
    source /etc/os-release
    local codename="${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}"

    if [[ -z "$codename" ]]; then
        error "Could not determine OS codename from /etc/os-release"
        echo "  VERSION_CODENAME and UBUNTU_CODENAME are both empty"
        return 1
    fi

    local repo_arch
    repo_arch=$(dpkg --print-architecture)

    echo "deb [arch=${repo_arch} signed-by=${keyring_file}] https://download.docker.com/linux/ubuntu ${codename} stable" > /etc/apt/sources.list.d/docker.list

    success "Docker repository added for Ubuntu ${codename} (${repo_arch})"

    # Update apt and install Docker packages (with lock handling)
    step "Installing Docker Engine packages..."
    apt_update || return 1
    wait_for_apt_lock || return 1

    local docker_packages=(
        docker-ce
        docker-ce-cli
        containerd.io
        docker-buildx-plugin
        docker-compose-plugin
    )

    if apt-get install -y "${docker_packages[@]}"; then
        success "Docker packages installed"
    else
        error "Failed to install Docker packages"
        return 1
    fi

    # Enable and start Docker service
    step "Enabling and starting Docker service..."
    systemctl enable docker
    systemctl start docker

    # Wait a moment for Docker to be ready
    sleep 2

    if systemctl is-active --quiet docker; then
        success "Docker service is running"
    else
        error "Docker service failed to start"
        echo "  Check: journalctl -xe -u docker"
        return 1
    fi

    # Verify installation with hello-world
    step "Verifying Docker installation..."
    if docker run --rm hello-world &>/dev/null; then
        success "Docker installation verified (hello-world ran successfully)"
    else
        error "Docker verification failed"
        echo "  'docker run hello-world' did not succeed"
        echo "  Check: docker info"
        return 1
    fi

    # Report installed versions
    local docker_version compose_version
    docker_version=$(docker --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)
    compose_version=$(docker compose version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)

    success "Docker Engine ${docker_version} installed and verified"
    success "Docker Compose ${compose_version} installed and verified"

    return 0
}

# ===========================================
# Docker Compose Verification
# ===========================================

# Verify Docker Compose v2 is available
# Returns: 0 if available, 1 if not
verify_docker_compose() {
    step "Verifying Docker Compose v2..."

    if ! command -v docker &>/dev/null; then
        error "Docker is not installed"
        echo "  Run install_docker() first"
        return 1
    fi

    if docker compose version &>/dev/null; then
        local compose_version
        compose_version=$(docker compose version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)
        success "Docker Compose v${compose_version} is available"
        return 0
    else
        error "Docker Compose v2 is not available"
        echo ""
        echo "Docker Compose v2 should be installed as a Docker plugin."
        echo "The 'docker compose' command (without hyphen) should work."
        echo ""
        echo "Try reinstalling Docker:"
        echo "  apt-get install -y docker-compose-plugin"
        echo ""
        echo "Note: The standalone 'docker-compose' command is deprecated."
        echo "      Use 'docker compose' (space) instead."
        return 1
    fi
}

# ===========================================
# Firewall Configuration (UFW)
# ===========================================

# Configure UFW firewall with required ports
# Allows: 22/tcp (SSH), 80/tcp (HTTP), 443/tcp (HTTPS)
# Denies: all other incoming traffic
# Returns: 0 on success, 1 on failure
configure_firewall() {
    step "Configuring UFW firewall..."

    # Check if UFW is already properly configured
    if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
        if ufw status 2>/dev/null | grep -qE "22/tcp.*ALLOW" && \
           ufw status 2>/dev/null | grep -qE "80/tcp.*ALLOW" && \
           ufw status 2>/dev/null | grep -qE "443/tcp.*ALLOW"; then
            success "UFW firewall already configured (ports 22, 80, 443)"
            return 0
        fi
    fi

    # Install UFW if not present
    ensure_package ufw

    # Set default policies
    step "Setting default firewall policies..."
    ufw default deny incoming
    ufw default allow outgoing

    # Allow required ports (idempotent - ufw handles duplicates gracefully)
    step "Opening required ports..."
    ufw allow 22/tcp comment 'SSH'
    ufw allow 80/tcp comment 'HTTP - Lets Encrypt ACME'
    ufw allow 443/tcp comment 'HTTPS - Production traffic'

    # Enable firewall non-interactively
    step "Enabling firewall..."
    ufw --force enable

    # Verify configuration
    if ufw status | grep -q "Status: active"; then
        success "UFW firewall configured (ports 22, 80, 443 allowed)"
        echo ""
        echo "Firewall status:"
        ufw status verbose | head -15
        return 0
    else
        error "UFW failed to enable"
        return 1
    fi
}

# ===========================================
# fail2ban SSH Protection
# ===========================================

# Install and configure fail2ban for SSH protection
# Creates jail.local with sshd jail enabled
# Returns: 0 on success, 1 on failure
install_fail2ban() {
    step "Configuring fail2ban SSH protection..."

    # Install fail2ban package
    ensure_package fail2ban

    # Create jail.local only if it doesn't exist (idempotent)
    if [[ ! -f /etc/fail2ban/jail.local ]]; then
        step "Creating fail2ban SSH jail configuration..."
        cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
# Ban for 1 hour (3600 seconds)
bantime = 3600
# Check window of 10 minutes (600 seconds)
findtime = 600
# Ban after 5 failed attempts
maxretry = 5

[sshd]
enabled = true
port = 22
# Use auto-detected log path and backend for portability
logpath = %(sshd_log)s
backend = %(sshd_backend)s
EOF
        success "Created /etc/fail2ban/jail.local"
    else
        success "fail2ban jail.local already exists"
    fi

    # Enable and start fail2ban service
    step "Enabling fail2ban service..."
    systemctl enable fail2ban
    systemctl restart fail2ban  # Use restart to apply any config changes

    # Verify fail2ban is running
    if systemctl is-active --quiet fail2ban; then
        success "fail2ban is active and protecting SSH"
        echo ""
        echo "fail2ban status:"
        fail2ban-client status sshd 2>/dev/null || echo "  (sshd jail status not yet available)"
        return 0
    else
        error "fail2ban failed to start"
        echo "  Check: systemctl status fail2ban"
        return 1
    fi
}

# ===========================================
# jq Installation
# ===========================================

# Install jq JSON processor
# Returns: 0 on success, 1 on failure
install_jq() {
    if command -v jq &>/dev/null; then
        success "jq is already installed ($(jq --version 2>/dev/null || echo 'version unknown'))"
        return 0
    fi

    step "Installing jq..."
    wait_for_apt_lock || return 1
    apt-get install -y jq >/dev/null 2>&1

    if command -v jq &>/dev/null; then
        success "jq installed ($(jq --version))"
        return 0
    else
        error "jq installation failed"
        return 1
    fi
}

# ===========================================
# Master Prerequisites Installation
# ===========================================

# Install all prerequisites with checkpoint tracking
# Uses run_step() from preflight-lib.sh for resume capability
# Returns: 0 on success, 1 on failure
install_all_prerequisites() {
    echo "========================================"
    echo "Prerequisites Installation"
    echo "========================================"
    echo ""

    # Run apt-get update once at the beginning
    step "Updating package lists..."
    apt_update || return 1

    # Install each prerequisite with checkpoint tracking
    run_step "docker" install_docker || return 1
    run_step "firewall" configure_firewall || return 1
    run_step "fail2ban" install_fail2ban || return 1
    run_step "jq" install_jq || return 1

    echo ""
    echo "========================================"
    success "All prerequisites installed successfully!"
    echo "========================================"

    # Summary
    echo ""
    echo "Installed components:"
    echo "  - Docker Engine: $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo 'N/A')"
    echo "  - Docker Compose: $(docker compose version --short 2>/dev/null || echo 'N/A')"
    echo "  - UFW Firewall: $(ufw status | head -1)"
    echo "  - fail2ban: $(systemctl is-active fail2ban 2>/dev/null || echo 'N/A')"
    echo "  - jq: $(jq --version 2>/dev/null || echo 'N/A')"
    echo ""

    return 0
}

# ===========================================
# Self-test when run directly
# ===========================================
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Testing prereq-lib.sh v${LIB_VERSION}..."
    echo ""

    # Test is_package_installed with a package that's always installed
    echo "1. Testing is_package_installed..."
    if is_package_installed "coreutils"; then
        echo "PASS: is_package_installed detects coreutils"
    else
        echo "FAIL: is_package_installed should detect coreutils"
        exit 1
    fi

    # Test with a package that's definitely not installed
    if ! is_package_installed "this-package-definitely-does-not-exist-xyz123"; then
        echo "PASS: is_package_installed returns false for non-existent package"
    else
        echo "FAIL: is_package_installed should return false for non-existent package"
        exit 1
    fi
    echo ""

    # Test ensure_package (dry-run style, just verify it would detect existing)
    echo "2. Testing ensure_package detection..."
    # We can't actually install packages without sudo, but we can test the detection
    if is_package_installed "coreutils"; then
        echo "PASS: Would skip coreutils installation (already installed)"
    fi
    echo ""

    # Verify we're using apt repository method (check install_docker function only)
    echo "3. Verifying apt repository method..."
    # Extract install_docker function and verify it uses download.docker.com
    install_func=$(sed -n '/^install_docker()/,/^[a-z_]*() {$/p' "${BASH_SOURCE[0]}" | head -n -1)
    if echo "$install_func" | grep -q "download.docker.com"; then
        echo "PASS: install_docker uses apt repository method (download.docker.com)"
    else
        echo "FAIL: install_docker should use download.docker.com"
        exit 1
    fi
    # Verify curl command in install_docker doesn't fetch get.docker.com
    if ! echo "$install_func" | grep -E "curl.*get\.docker\.com" | grep -qv "^#"; then
        echo "PASS: install_docker does not curl get.docker.com"
    else
        echo "FAIL: install_docker should not curl get.docker.com"
        exit 1
    fi
    echo ""

    # Verify sourcing works
    echo "4. Testing preflight-lib.sh sourcing..."
    if [[ -n "${LIB_VERSION:-}" ]] && type -t step &>/dev/null; then
        echo "PASS: preflight-lib.sh functions available (step, success, error)"
    else
        echo "FAIL: preflight-lib.sh not properly sourced"
        exit 1
    fi
    echo ""

    # Test apt lock functions exist
    echo "5. Testing apt lock handling functions..."
    if type -t wait_for_apt_lock &>/dev/null; then
        echo "PASS: wait_for_apt_lock function exists"
    else
        echo "FAIL: wait_for_apt_lock function should exist"
        exit 1
    fi
    if type -t apt_update &>/dev/null; then
        echo "PASS: apt_update function exists"
    else
        echo "FAIL: apt_update function should exist"
        exit 1
    fi
    echo ""

    # Test security functions exist
    echo "6. Testing security functions..."
    all_defined=true
    for func in configure_firewall install_fail2ban install_jq install_all_prerequisites; do
        if type -t "$func" &>/dev/null; then
            echo "PASS: $func is defined"
        else
            echo "FAIL: $func is not defined"
            all_defined=false
        fi
    done
    if [[ "$all_defined" != "true" ]]; then
        exit 1
    fi
    echo ""

    echo "========================================"
    echo "All prereq-lib tests passed!"
    echo "========================================"
fi

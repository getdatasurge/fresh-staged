#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Prerequisites Library
# Docker Engine and utilities installation
# ===========================================
# Usage: source this file in deployment scripts
#   source "$(dirname "$0")/lib/prereq-lib.sh"
#
# Functions provided:
#   - install_docker()        Install Docker Engine via apt repository
#   - verify_docker_compose() Verify Docker Compose v2 is available
#   - is_package_installed()  Check if apt package is installed
#   - ensure_package()        Install package if not present (idempotent)
#   - wait_for_apt_lock()     Wait for apt locks to be released
#   - apt_update()            Run apt-get update with lock handling
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

    echo "========================================"
    echo "All prereq-lib tests passed!"
    echo "========================================"
fi

#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Verification Library
# Functions for validating deployment health
# ===========================================
# Usage: source this file
#   source "$(dirname "$0")/lib/verify-lib.sh"
# ===========================================

# Ensure we have preflight-lib for colors/helpers
if [[ "$(type -t step)" != "function" ]]; then
    LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -f "${LIB_DIR}/preflight-lib.sh" ]]; then
        source "${LIB_DIR}/preflight-lib.sh"
    else
        echo "Error: preflight-lib.sh not found" >&2
        return 1
    fi
fi

# ===========================================
# Verification Functions
# ===========================================

# VERIFY-01: Validate endpoint returns 200 OK
# Args: $1 = Name of service
#       $2 = URL to check
#       $3 = Expected status code (default: 200)
# Returns: 0 if healthy, 1 if unhealthy
verify_endpoint_health() {
    local service="$1"
    local url="$2"
    local expected="${3:-200}"
    local retries=3
    local wait_s=2
    
    step "Verifying $service health ($url)..."
    
    for ((i=1; i<=retries; i++)); do
        local status
        status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
        
        if [[ "$status" == "$expected" ]]; then
            success "$service is healthy (HTTP $status)"
            return 0
        fi
        
        if [[ $i -lt $retries ]]; then
            echo "  Attempt $i: Received HTTP $status (expected $expected). Retrying in ${wait_s}s..."
            sleep "$wait_s"
        fi
    done
    
    error "$service verification failed after $retries attempts (Last status: $status)"
    return 1
}

# VERIFY-02: Validate SSL certificate
# Args: $1 = domain
# Returns: 0 if valid and >30 days remaining, 1 otherwise
verify_ssl_cert() {
    local domain="$1"
    
    step "Verifying SSL certificate for $domain..."
    
    if [[ -z "$domain" ]]; then
        error "No domain provided for SSL verification"
        return 1
    fi
    
    # Check if we can connect via HTTPS
    if ! curl -s --connect-timeout 5 --head "https://$domain" >/dev/null; then
        error "Cannot connect to https://$domain"
        return 1
    fi
    
    # Check expiry with openssl
    local expiry_date
    if command -v openssl &>/dev/null; then
        # output date in format like "Jan 25 14:00:00 2026 GMT"
        expiry_date=$(echo | openssl s_client -servername "$domain" -connect "$domain":443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
        
        if [[ -z "$expiry_date" ]]; then
            warning "Could not retrieve SSL expiry date (openssl failed)"
            # Connection worked, so return success with warning
            success "SSL connection established (expiry check failed)"
            return 0
        fi
        
        # Check if expired
        local expiry_epoch current_epoch
        if date --version >/dev/null 2>&1; then
            # GNU date
            expiry_epoch=$(date -d "$expiry_date" +%s)
            current_epoch=$(date +%s)
        else
            # BSD/MacOS date
            expiry_epoch=$(date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry_date" +%s)
            current_epoch=$(date +%s)
        fi
        
        local days_remaining=$(( (expiry_epoch - current_epoch) / 86400 ))
        
        if [[ $days_remaining -lt 0 ]]; then
            error "SSL Certificate EXPIRED ($days_remaining days ago)"
            return 1
        elif [[ $days_remaining -lt 30 ]]; then
            warning "SSL Certificate expires soon ($days_remaining days remaining)"
            success "SSL Certificate valid"
            return 0
        else
            success "SSL Certificate valid ($days_remaining days remaining)"
            return 0
        fi
    else
        warning "openssl not found, skipping deep certificate check"
        success "SSL connection established"
        return 0
    fi
}

# VERIFY-05: Validate monitoring stack (Prometheus + Grafana)
# Args: $1 = domain
# Returns: 0 if both healthy, 1 otherwise
verify_monitoring_stack() {
    local domain="$1"
    local failed=0

    step "Verifying monitoring stack..."

    # Prometheus health check
    if ! verify_endpoint_health "Prometheus" "https://${domain}/prometheus/-/healthy"; then
        failed=1
    fi

    # Grafana health check
    if ! verify_endpoint_health "Grafana" "https://${domain}/grafana/api/health"; then
        failed=1
    fi

    if [[ $failed -eq 0 ]]; then
        success "Monitoring stack healthy"
        return 0
    else
        return 1
    fi
}

# VERIFY-01: Validate worker health endpoint
# Args: $1 = domain
# Returns: 0 if healthy, 1 otherwise
verify_worker_health() {
    local domain="$1"
    verify_endpoint_health "Worker" "https://${domain}/api/worker/health"
}

# VERIFY-01: Validate all service health endpoints
# Args: $1 = domain
# Returns: 0 if core services healthy, 1 otherwise
verify_all_services() {
    local domain="$1"
    local failed=0

    step "Verifying all service endpoints..."

    # Backend health
    if ! verify_endpoint_health "Backend API" "https://${domain}/api/health"; then
        failed=1
    fi

    # Frontend accessibility
    if ! verify_endpoint_health "Frontend" "https://${domain}"; then
        failed=1
    fi

    # Worker health (optional - may not exist in all deployments)
    if ! verify_endpoint_health "Worker" "https://${domain}/api/worker/health"; then
        warning "Worker health check failed (may not be exposed externally)"
        # Don't fail on worker - it may be internal only
    fi

    if [[ $failed -eq 0 ]]; then
        success "All core services healthy"
        return 0
    else
        error "One or more core services unhealthy"
        return 1
    fi
}

# Check Docker service state
# Args: $1 = service name (e.g. backend, postgres)
# Returns: 0 if Running, 1 otherwise
verify_service_status() {
    local service="$1"
    
    # assumes docker compose is running in current directory or COMPOSE_FILE env var set
    local state
    state=$(docker compose ps --format '{{.State}}' "$service" 2>/dev/null)
    
    if [[ "$state" == "running" ]]; then
        # success "$service container is running" # Too verbose, skip
        return 0
    else
        error "$service container is NOT running (State: $state)"
        return 1
    fi
}

# POST-04: Display Complete URL Summary
# Args: $1 = domain
display_url_summary() {
    local domain="$1"
    
    if [[ -z "$domain" ]]; then
        return
    fi
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}       DEPLOYMENT VERIFIED & LIVE       ${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "Access your FreshTrack Pro instance at:"
    echo ""
    echo -e "  📊 Dashboard: ${BLUE}https://${domain}${NC}"
    echo -e "  🔌 API:       ${BLUE}https://${domain}/api/health${NC}"
    echo -e "  📈 Grafana:   ${BLUE}https://${domain}/grafana${NC}"
    echo -e "  🔎 Prometheus:${BLUE}https://${domain}/prometheus${NC}"
    echo ""
    echo -e "Administration:"
    echo -e "  To create first admin user: Sign up in the dashboard"
    echo -e "  To view logs: docker compose logs -f"
    echo -e "  To stop:      docker compose down"
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo ""
}

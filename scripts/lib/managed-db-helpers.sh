#!/bin/bash
# FreshTrack Pro - DigitalOcean Managed Database Helper Functions
# Source this file in deploy-digitalocean.sh when USE_MANAGED_DB=true
# Requires: doctl CLI installed and authenticated

# ===========================================
# Managed PostgreSQL Provisioning
# ===========================================

# Check if managed database cluster exists
check_existing_database() {
    local cluster_name="$1"

    step "Checking for existing database cluster: ${cluster_name}..."

    local cluster_info
    cluster_info=$(doctl databases list --format Name,ID,Engine,Status --no-header | grep "^${cluster_name}" || true)

    if [ -n "$cluster_info" ]; then
        local cluster_id cluster_status
        cluster_id=$(echo "$cluster_info" | awk '{print $2}')
        cluster_status=$(echo "$cluster_info" | awk '{print $4}')

        success "Found existing database cluster: ${cluster_name}"
        echo "  ID:     ${cluster_id}"
        echo "  Status: ${cluster_status}"

        DB_CLUSTER_ID="$cluster_id"
        return 0
    fi

    return 1
}

# Create managed PostgreSQL cluster
create_managed_database() {
    local cluster_name="${1:-freshtrack-db}"
    local region="${2:-$DO_REGION}"
    local size="${3:-$DO_DB_SIZE}"
    local vpc_uuid="$4"

    # Check for existing cluster
    if check_existing_database "$cluster_name"; then
        warning "Database cluster already exists. Skipping creation."
        return 0
    fi

    step "Creating managed PostgreSQL cluster: ${cluster_name}..."
    echo "  Region: ${region}"
    echo "  Size:   ${size}"
    echo ""
    echo "This may take 5-10 minutes..."

    local create_args=(
        --engine pg
        --version 15
        --region "$region"
        --size "$size"
        --num-nodes 1
        --wait
        --format ID
        --no-header
    )

    if [ -n "$vpc_uuid" ]; then
        create_args+=(--private-network-uuid "$vpc_uuid")
        info "Database will be in VPC for private networking"
    fi

    DB_CLUSTER_ID=$(doctl databases create "$cluster_name" "${create_args[@]}")

    if [ -z "$DB_CLUSTER_ID" ]; then
        error "Failed to create database cluster"
        return 1
    fi

    success "Database cluster created: ${DB_CLUSTER_ID}"

    # Create connection pool for transaction mode
    create_connection_pool "$DB_CLUSTER_ID"

    # Download SSL certificate
    download_ssl_certificate "$DB_CLUSTER_ID"

    return 0
}

# Create connection pool (transaction mode for web apps)
create_connection_pool() {
    local cluster_id="$1"
    local pool_name="${2:-app-pool}"
    local pool_size="${3:-25}"

    step "Creating connection pool: ${pool_name}..."

    # Check if pool already exists
    if doctl databases pool list "$cluster_id" --format Name --no-header | grep -qx "$pool_name"; then
        success "Connection pool already exists: ${pool_name}"
        return 0
    fi

    # Get default database and user
    local db_name="defaultdb"
    local db_user="doadmin"

    doctl databases pool create "$cluster_id" "$pool_name" \
        --db "$db_name" \
        --user "$db_user" \
        --size "$pool_size" \
        --mode transaction

    success "Connection pool created: ${pool_name} (transaction mode, ${pool_size} connections)"
}

# Download SSL certificate for secure connections
download_ssl_certificate() {
    local cluster_id="$1"
    local output_path="${2:-/opt/freshtrack-pro/secrets/ca-certificate.crt}"

    step "Downloading SSL certificate..."

    mkdir -p "$(dirname "$output_path")"

    doctl databases ca get "$cluster_id" --output "$output_path"

    if [ -f "$output_path" ]; then
        chmod 600 "$output_path"
        success "SSL certificate saved: ${output_path}"
    else
        warning "Failed to download SSL certificate"
        echo "You may need to download manually from DigitalOcean dashboard"
    fi
}

# ===========================================
# Connection String Management
# ===========================================

# Get connection string for managed database
get_connection_string() {
    local cluster_id="$1"
    local use_pool="${2:-true}"
    local ssl_mode="${3:-require}"

    step "Retrieving connection string..."

    # Get connection details
    local conn_info
    conn_info=$(doctl databases connection "$cluster_id" --format Host,Port,User,Password,Database --no-header)

    local host port user password database
    host=$(echo "$conn_info" | awk '{print $1}')
    port=$(echo "$conn_info" | awk '{print $2}')
    user=$(echo "$conn_info" | awk '{print $3}')
    password=$(echo "$conn_info" | awk '{print $4}')
    database=$(echo "$conn_info" | awk '{print $5}')

    # Use pooler endpoint if requested (IMPORTANT: always use for production)
    if [ "$use_pool" = "true" ]; then
        # Pooler hostname format: {host}-pooler instead of {host}
        # DigitalOcean format: private-xxx.db.ondigitalocean.com -> private-xxx-pooler.db.ondigitalocean.com
        host="${host//.db.ondigitalocean.com/-pooler.db.ondigitalocean.com}"
        info "Using connection pooler endpoint"
    else
        warning "Using direct connection (not recommended for production)"
    fi

    # Construct connection string
    local conn_string="postgresql://${user}:${password}@${host}:${port}/${database}?sslmode=${ssl_mode}"

    echo "$conn_string"
}

# Save connection string to secrets file
save_connection_string() {
    local cluster_id="$1"
    local output_path="${2:-/opt/freshtrack-pro/secrets/do_database_url}"

    local conn_string
    conn_string=$(get_connection_string "$cluster_id" "true" "require")

    mkdir -p "$(dirname "$output_path")"
    echo -n "$conn_string" > "$output_path"
    chmod 600 "$output_path"

    success "Connection string saved: ${output_path}"

    # Display obfuscated connection info
    local safe_conn
    safe_conn=$(echo "$conn_string" | sed 's/:.*@/:****@/')
    info "Connection: ${safe_conn}"
}

# ===========================================
# Database Management
# ===========================================

# Configure trusted sources (firewall)
configure_trusted_sources() {
    local cluster_id="$1"
    local droplet_id="$2"

    step "Configuring trusted sources..."

    # Get Droplet private IP
    local droplet_ip
    droplet_ip=$(doctl compute droplet get "$droplet_id" --format PrivateIPv4 --no-header)

    if [ -n "$droplet_ip" ]; then
        # Add Droplet as trusted source
        doctl databases firewalls append "$cluster_id" --rule "droplet:${droplet_id}"
        success "Added Droplet as trusted source"
    else
        warning "Could not get Droplet private IP, database may not be accessible"
    fi
}

# Display database cluster info
show_database_info() {
    local cluster_id="$1"

    echo ""
    echo "Managed PostgreSQL Cluster Information:"
    echo "========================================"
    doctl databases get "$cluster_id" --format ID,Name,Engine,Version,Status,Region,Size
    echo ""
    echo "Connection Pools:"
    doctl databases pool list "$cluster_id" --format Name,Size,Mode,Database,User
    echo ""
    echo "Dashboard: https://cloud.digitalocean.com/databases/${cluster_id}"
    echo ""
}

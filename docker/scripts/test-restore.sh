#!/bin/bash
# PostgreSQL Backup Restoration Test Script for FreshTrack Pro
# Tests backup restoration by downloading from MinIO and restoring to test database
# This validates backup integrity without affecting production data

set -eo pipefail

# Configuration (override via environment variables)
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-freshtrack}"
POSTGRES_USER="${POSTGRES_USER:-freshtrack_user}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"

TEST_DB="${TEST_DB:-freshtrack_restore_test}"

MINIO_ALIAS="${MINIO_ALIAS:-minio}"
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY}"
MINIO_BUCKET="${MINIO_BUCKET:-postgres-backups}"

BACKUP_FILE="${BACKUP_FILE:-}"  # If empty, will use most recent backup

# Logging
log() {
    echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] $*"
}

error() {
    echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] ERROR: $*" >&2
}

# Cleanup function (called on exit)
cleanup() {
    log "Cleaning up test resources"

    # Remove downloaded backup file
    if [ -n "$LOCAL_BACKUP_FILE" ] && [ -f "$LOCAL_BACKUP_FILE" ]; then
        rm -f "$LOCAL_BACKUP_FILE"
        log "Removed temporary backup file"
    fi

    # Drop test database
    export PGPASSWORD="$POSTGRES_PASSWORD"
    if psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres \
        -c "DROP DATABASE IF EXISTS \"${TEST_DB}\"" >/dev/null 2>&1; then
        log "Dropped test database: ${TEST_DB}"
    fi
    unset PGPASSWORD
}

# Register cleanup on exit
trap cleanup EXIT

# Main restoration test logic
main() {
    log "Starting backup restoration test"

    # Validate required environment variables
    if [ -z "$POSTGRES_PASSWORD" ]; then
        error "POSTGRES_PASSWORD is required"
        exit 1
    fi

    if [ -z "$MINIO_ACCESS_KEY" ] || [ -z "$MINIO_SECRET_KEY" ]; then
        error "MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required"
        exit 1
    fi

    # Configure MinIO client
    log "Configuring MinIO client"
    if ! mc alias set "$MINIO_ALIAS" "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" --api S3v4 >/dev/null 2>&1; then
        error "Failed to configure MinIO client"
        exit 1
    fi

    # List available backups
    log "Listing available backups in ${MINIO_BUCKET}"
    if ! mc ls "${MINIO_ALIAS}/${MINIO_BUCKET}/" >/dev/null 2>&1; then
        error "Failed to list backups (bucket may not exist or credentials invalid)"
        exit 1
    fi

    # Determine which backup to restore
    if [ -z "$BACKUP_FILE" ]; then
        # Find most recent backup
        BACKUP_FILE=$(mc ls "${MINIO_ALIAS}/${MINIO_BUCKET}/" | grep '\.dump$' | sort -r | head -n 1 | awk '{print $NF}')

        if [ -z "$BACKUP_FILE" ]; then
            error "No backup files found in bucket ${MINIO_BUCKET}"
            exit 1
        fi

        log "Using most recent backup: ${BACKUP_FILE}"
    else
        log "Using specified backup: ${BACKUP_FILE}"

        # Verify backup exists
        if ! mc ls "${MINIO_ALIAS}/${MINIO_BUCKET}/${BACKUP_FILE}" >/dev/null 2>&1; then
            error "Backup file not found: ${BACKUP_FILE}"
            exit 1
        fi
    fi

    # Download backup from MinIO
    LOCAL_BACKUP_FILE="/tmp/${BACKUP_FILE}"
    log "Downloading backup to ${LOCAL_BACKUP_FILE}"

    if ! mc cp "${MINIO_ALIAS}/${MINIO_BUCKET}/${BACKUP_FILE}" "$LOCAL_BACKUP_FILE" 2>&1; then
        error "Failed to download backup from MinIO"
        exit 1
    fi

    # Verify backup file was downloaded and has size > 0
    if [ ! -f "$LOCAL_BACKUP_FILE" ] || [ ! -s "$LOCAL_BACKUP_FILE" ]; then
        error "Downloaded backup file is empty or does not exist"
        exit 1
    fi

    BACKUP_SIZE=$(du -h "$LOCAL_BACKUP_FILE" | cut -f1)
    log "Downloaded backup successfully: ${BACKUP_SIZE}"

    # Validate backup file integrity using pg_restore --list
    log "Validating backup file integrity"
    export PGPASSWORD="$POSTGRES_PASSWORD"
    if ! pg_restore --list "$LOCAL_BACKUP_FILE" >/dev/null 2>&1; then
        error "Backup file is corrupted or invalid"
        unset PGPASSWORD
        exit 1
    fi
    log "Backup file integrity validated"

    # Create test database
    log "Creating test database: ${TEST_DB}"
    if ! psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres \
        -c "DROP DATABASE IF EXISTS \"${TEST_DB}\"" >/dev/null 2>&1; then
        error "Failed to drop existing test database"
        unset PGPASSWORD
        exit 1
    fi

    if ! psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres \
        -c "CREATE DATABASE \"${TEST_DB}\"" >/dev/null 2>&1; then
        error "Failed to create test database"
        unset PGPASSWORD
        exit 1
    fi
    log "Test database created successfully"

    # Restore backup to test database
    log "Restoring backup to test database"
    if ! pg_restore \
        --host="$POSTGRES_HOST" \
        --port="$POSTGRES_PORT" \
        --username="$POSTGRES_USER" \
        --dbname="$TEST_DB" \
        --verbose \
        --no-owner \
        --no-acl \
        "$LOCAL_BACKUP_FILE" 2>&1 | grep -v "^;" | grep -v "^$"; then

        # pg_restore may exit with non-zero even on success (warnings about existing objects)
        # Check if database has tables as validation
        TABLE_COUNT=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$TEST_DB" \
            -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null || echo "0")

        if [ "$TABLE_COUNT" -eq 0 ]; then
            error "Restore completed but no tables found in test database"
            unset PGPASSWORD
            exit 1
        fi
    fi

    # Validate restoration (count tables)
    log "Validating restoration"
    TABLE_COUNT=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$TEST_DB" \
        -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" | xargs)

    if [ -z "$TABLE_COUNT" ] || [ "$TABLE_COUNT" -eq 0 ]; then
        error "Restoration validation failed: no tables found"
        unset PGPASSWORD
        exit 1
    fi

    log "Restoration validated: ${TABLE_COUNT} tables found in test database"

    # Get sample data count from a known table (if exists)
    SAMPLE_TABLE="sensor_readings"
    if psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$TEST_DB" \
        -c "SELECT 1 FROM information_schema.tables WHERE table_name = '${SAMPLE_TABLE}'" | grep -q 1; then

        ROW_COUNT=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$TEST_DB" \
            -t -c "SELECT COUNT(*) FROM ${SAMPLE_TABLE}" | xargs)

        log "Sample data: ${SAMPLE_TABLE} has ${ROW_COUNT} rows"
    fi

    unset PGPASSWORD

    log "✅ Backup restoration test completed successfully"
    log "Test database ${TEST_DB} will be dropped on exit"
}

# Execute main function
main "$@"

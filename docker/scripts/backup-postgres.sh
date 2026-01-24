#!/bin/bash
# PostgreSQL Backup Script for FreshTrack Pro
# Runs daily via cron to dump PostgreSQL database to MinIO with 30-day retention

set -eo pipefail

# Configuration (override via environment variables)
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-freshtrack}"
POSTGRES_USER="${POSTGRES_USER:-freshtrack_user}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"

MINIO_ALIAS="${MINIO_ALIAS:-minio}"
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY}"
MINIO_BUCKET="${MINIO_BUCKET:-postgres-backups}"

RETENTION_DAYS="${RETENTION_DAYS:-30}"
WEBHOOK_URL="${WEBHOOK_URL:-}"

# Logging
log() {
    echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] $*"
}

error() {
    echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] ERROR: $*" >&2
}

# Send failure notification
notify_failure() {
    local error_msg="$1"

    if [ -z "$WEBHOOK_URL" ]; then
        error "No webhook URL configured, skipping notification"
        return 0
    fi

    local payload
    payload=$(cat <<EOF
{
    "text": "🚨 PostgreSQL Backup Failed",
    "attachments": [{
        "color": "danger",
        "fields": [
            {
                "title": "Database",
                "value": "${POSTGRES_DB}",
                "short": true
            },
            {
                "title": "Error",
                "value": "${error_msg}",
                "short": false
            },
            {
                "title": "Timestamp",
                "value": "$(date -u +"%Y-%m-%d %H:%M:%S UTC")",
                "short": true
            }
        ]
    }]
}
EOF
)

    # Attempt to send notification (retry 3 times with backoff)
    for attempt in 1 2 3; do
        if curl -X POST \
            -H "Content-Type: application/json" \
            -d "$payload" \
            "$WEBHOOK_URL" \
            --max-time 10 \
            --retry 0 \
            --silent \
            --show-error \
            --fail 2>&1; then
            log "Notification sent successfully"
            return 0
        fi

        if [ $attempt -lt 3 ]; then
            sleep $((attempt * 2))  # Exponential backoff: 2s, 4s
        fi
    done

    error "Failed to send notification after 3 attempts"
    return 0  # Don't fail the script on notification failure
}

# Main backup logic
main() {
    log "Starting PostgreSQL backup for database: ${POSTGRES_DB}"

    # Validate required environment variables
    if [ -z "$POSTGRES_PASSWORD" ]; then
        error "POSTGRES_PASSWORD is required"
        notify_failure "POSTGRES_PASSWORD environment variable not set"
        exit 1
    fi

    if [ -z "$MINIO_ACCESS_KEY" ] || [ -z "$MINIO_SECRET_KEY" ]; then
        error "MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required"
        notify_failure "MinIO credentials not configured"
        exit 1
    fi

    # Generate backup filename with timestamp
    TIMESTAMP=$(date -u +"%Y-%m-%d_%H-%M-%S")
    BACKUP_FILE="/tmp/${POSTGRES_DB}_${TIMESTAMP}.dump"

    log "Creating backup: ${BACKUP_FILE}"

    # Perform pg_dump with custom format (compressed)
    export PGPASSWORD="$POSTGRES_PASSWORD"
    if ! pg_dump \
        --host="$POSTGRES_HOST" \
        --port="$POSTGRES_PORT" \
        --username="$POSTGRES_USER" \
        --dbname="$POSTGRES_DB" \
        --format=custom \
        --compress=9 \
        --verbose \
        --file="$BACKUP_FILE" 2>&1 | tee -a /var/log/backup.log; then

        error "pg_dump failed"
        notify_failure "pg_dump failed for ${POSTGRES_DB}"
        rm -f "$BACKUP_FILE"
        exit 1
    fi
    unset PGPASSWORD

    # Verify backup file was created and has size > 0
    if [ ! -f "$BACKUP_FILE" ] || [ ! -s "$BACKUP_FILE" ]; then
        error "Backup file is empty or does not exist"
        notify_failure "Backup file created but is empty"
        rm -f "$BACKUP_FILE"
        exit 1
    fi

    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "Backup created successfully: ${BACKUP_SIZE}"

    # Configure MinIO client
    log "Configuring MinIO client"
    if ! mc alias set "$MINIO_ALIAS" "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" --api S3v4 2>&1 | tee -a /var/log/backup.log; then
        error "Failed to configure MinIO client"
        notify_failure "MinIO client configuration failed"
        rm -f "$BACKUP_FILE"
        exit 1
    fi

    # Ensure bucket exists
    if ! mc ls "${MINIO_ALIAS}/${MINIO_BUCKET}" >/dev/null 2>&1; then
        log "Bucket ${MINIO_BUCKET} does not exist, creating..."
        if ! mc mb "${MINIO_ALIAS}/${MINIO_BUCKET}" 2>&1 | tee -a /var/log/backup.log; then
            error "Failed to create bucket ${MINIO_BUCKET}"
            notify_failure "Failed to create MinIO bucket"
            rm -f "$BACKUP_FILE"
            exit 1
        fi
    fi

    # Upload backup to MinIO
    log "Uploading backup to MinIO: ${MINIO_ALIAS}/${MINIO_BUCKET}/${POSTGRES_DB}_${TIMESTAMP}.dump"
    if ! mc cp "$BACKUP_FILE" "${MINIO_ALIAS}/${MINIO_BUCKET}/${POSTGRES_DB}_${TIMESTAMP}.dump" 2>&1 | tee -a /var/log/backup.log; then
        error "Failed to upload backup to MinIO"
        notify_failure "Upload to MinIO failed"
        rm -f "$BACKUP_FILE"
        exit 1
    fi

    log "Upload successful, removing local backup file"
    rm -f "$BACKUP_FILE"

    # Clean up old backups (retain last 30 days)
    log "Cleaning up backups older than ${RETENTION_DAYS} days"
    CUTOFF_DATE=$(date -u -d "${RETENTION_DAYS} days ago" +"%Y-%m-%d" 2>/dev/null || date -u -v-${RETENTION_DAYS}d +"%Y-%m-%d" 2>/dev/null)

    # List all backups and delete those older than retention period
    mc ls "${MINIO_ALIAS}/${MINIO_BUCKET}/" | while read -r line; do
        # Extract filename from mc ls output (format: [date] [time] [size] [name])
        FILENAME=$(echo "$line"| awk '{print $NF}')

        # Skip if not a dump file
        if [[ ! "$FILENAME" =~ \.dump$ ]]; then
            continue
        fi

        # Extract date from filename (format: dbname_YYYY-MM-DD_HH-MM-SS.dump)
        BACKUP_DATE=$(echo "$FILENAME" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')

        if [ -n "$BACKUP_DATE" ] && [ "$BACKUP_DATE" \< "$CUTOFF_DATE" ]; then
            log "Deleting old backup: ${FILENAME} (${BACKUP_DATE})"
            mc rm "${MINIO_ALIAS}/${MINIO_BUCKET}/${FILENAME}" 2>&1 | tee -a /var/log/backup.log || error "Failed to delete ${FILENAME}"
        fi
    done

    log "Backup process completed successfully"
}

# Execute main function
main "$@"

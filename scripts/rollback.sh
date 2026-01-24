#!/bin/bash
# FreshTrack Pro - Production Rollback Script
# Reverses cutover to new infrastructure, preserves data, and provides DNS guidance
# Usage: ./scripts/rollback.sh [--yes]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
AUTO_CONFIRM=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --yes)
            AUTO_CONFIRM=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--yes]"
            exit 1
            ;;
    esac
done

# Helper functions
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

confirm() {
    if [ "$AUTO_CONFIRM" = true ]; then
        return 0
    fi

    while true; do
        read -p "$1 (yes/no): " yn
        case $yn in
            [Yy]es|[Yy])
                return 0
                ;;
            [Nn]o|[Nn])
                return 1
                ;;
            *)
                echo "Please answer yes or no."
                ;;
        esac
    done
}

echo "========================================"
echo "FreshTrack Pro Production Rollback"
echo "========================================"
echo ""
echo -e "${RED}WARNING: This will rollback to the previous infrastructure${NC}"
echo ""
echo "This script will:"
echo "  1. Stop new infrastructure services (backend, caddy)"
echo "  2. Export post-cutover data for preservation"
echo "  3. Provide DNS change instructions"
echo "  4. Send rollback notification (if configured)"
echo "  5. Create rollback manifest documentation"
echo ""

# ===========================================
# Confirmation Prompt
# ===========================================
if ! confirm "Are you sure you want to proceed with rollback?"; then
    echo "Rollback cancelled."
    exit 0
fi

echo ""
echo "Start time: $(date '+%Y-%m-%d %H:%M:%S')"
ROLLBACK_TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
EXPORT_DIR="rollback_exports_${ROLLBACK_TIMESTAMP}"

# ===========================================
# STEP 1: Stop New System Services
# ===========================================
step "STEP 1: Stopping new infrastructure services..."

if ! confirm "Stop backend and reverse proxy services?"; then
    warning "Skipping service shutdown"
else
    echo "Stopping backend service..."
    if docker compose -f docker-compose.yml -f compose.production.yaml stop backend; then
        success "Backend stopped"
    else
        error "Failed to stop backend"
    fi

    echo "Stopping Caddy reverse proxy (if running)..."
    if docker compose -f docker/docker-compose.yml stop caddy 2>/dev/null; then
        success "Caddy stopped"
    else
        warning "Caddy not running or already stopped"
    fi

    success "New infrastructure services stopped"
fi

# ===========================================
# STEP 2: Export Post-Cutover Data
# ===========================================
step "STEP 2: Exporting post-cutover data..."

if ! confirm "Export data created since cutover?"; then
    warning "Skipping data export"
else
    echo "Creating export directory: ${EXPORT_DIR}/"
    mkdir -p "$EXPORT_DIR"

    # Get cutover timestamp from environment or use conservative estimate
    CUTOVER_TIMESTAMP="${CUTOVER_TIMESTAMP:-$(date -d '1 day ago' '+%Y-%m-%d %H:%M:%S')}"
    echo "Exporting data created after: ${CUTOVER_TIMESTAMP}"

    # Export sensor readings
    echo "Exporting sensor_readings..."
    docker compose -f docker-compose.yml -f compose.production.yaml exec -T postgres \
        psql -U postgres -d freshtrack -c \
        "COPY (SELECT * FROM sensor_readings WHERE created_at > '${CUTOVER_TIMESTAMP}') TO STDOUT WITH CSV HEADER" \
        > "${EXPORT_DIR}/sensor_readings.csv" 2>/dev/null || warning "Failed to export sensor_readings"

    if [ -f "${EXPORT_DIR}/sensor_readings.csv" ]; then
        READING_COUNT=$(wc -l < "${EXPORT_DIR}/sensor_readings.csv")
        success "Exported ${READING_COUNT} sensor readings"
    fi

    # Export alerts
    echo "Exporting alerts..."
    docker compose -f docker-compose.yml -f compose.production.yaml exec -T postgres \
        psql -U postgres -d freshtrack -c \
        "COPY (SELECT * FROM alerts WHERE created_at > '${CUTOVER_TIMESTAMP}') TO STDOUT WITH CSV HEADER" \
        > "${EXPORT_DIR}/alerts.csv" 2>/dev/null || warning "Failed to export alerts"

    if [ -f "${EXPORT_DIR}/alerts.csv" ]; then
        ALERT_COUNT=$(wc -l < "${EXPORT_DIR}/alerts.csv")
        success "Exported ${ALERT_COUNT} alerts"
    fi

    # Export user profiles
    echo "Exporting user_profiles..."
    docker compose -f docker-compose.yml -f compose.production.yaml exec -T postgres \
        psql -U postgres -d freshtrack -c \
        "COPY (SELECT * FROM user_profiles WHERE created_at > '${CUTOVER_TIMESTAMP}') TO STDOUT WITH CSV HEADER" \
        > "${EXPORT_DIR}/user_profiles.csv" 2>/dev/null || warning "Failed to export user_profiles"

    if [ -f "${EXPORT_DIR}/user_profiles.csv" ]; then
        PROFILE_COUNT=$(wc -l < "${EXPORT_DIR}/user_profiles.csv")
        success "Exported ${PROFILE_COUNT} user profiles"
    fi

    # Create database dump for safety
    echo "Creating full database backup..."
    docker compose -f docker-compose.yml -f compose.production.yaml exec -T postgres \
        pg_dump -U postgres -d freshtrack --format=custom \
        > "${EXPORT_DIR}/full_backup.dump" 2>/dev/null || warning "Failed to create full backup"

    if [ -f "${EXPORT_DIR}/full_backup.dump" ]; then
        DUMP_SIZE=$(du -h "${EXPORT_DIR}/full_backup.dump" | cut -f1)
        success "Created full database backup (${DUMP_SIZE})"
    fi

    success "Data export complete: ${EXPORT_DIR}/"
fi

# ===========================================
# STEP 3: DNS Change Instructions
# ===========================================
step "STEP 3: DNS change instructions"

echo ""
echo "========================================="
echo "DNS CHANGES REQUIRED"
echo "========================================="
echo ""
echo "To complete rollback, update DNS records:"
echo ""
echo "  Record Type: A or CNAME"
echo "  Domain: freshtrackpro.com (and www.freshtrackpro.com)"
echo "  Current Target: [NEW_INFRASTRUCTURE_IP]"
echo "  Change To: [OLD_SUPABASE_INFRASTRUCTURE]"
echo ""
echo "DNS Provider Instructions:"
echo "  1. Log in to your DNS provider (Cloudflare, Route53, etc.)"
echo "  2. Navigate to DNS settings for freshtrackpro.com"
echo "  3. Update A/CNAME records to point to previous infrastructure"
echo "  4. Wait for DNS propagation (typically 5-60 minutes)"
echo ""
echo "Verify propagation with:"
echo "  dig freshtrackpro.com"
echo "  nslookup freshtrackpro.com"
echo ""

if ! confirm "Have DNS changes been initiated?"; then
    warning "DNS changes not confirmed - complete manually"
fi

# ===========================================
# STEP 4: Send Notification
# ===========================================
step "STEP 4: Sending rollback notification..."

SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

if [ -n "$SLACK_WEBHOOK_URL" ]; then
    echo "Sending Slack notification..."
    PAYLOAD=$(cat <<EOF
{
    "text": "🔄 FreshTrack Pro Rollback Initiated",
    "blocks": [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🔄 Production Rollback"
            }
        },
        {
            "type": "section",
            "fields": [
                {
                    "type": "mrkdwn",
                    "text": "*Timestamp:*\n$(date '+%Y-%m-%d %H:%M:%S')"
                },
                {
                    "type": "mrkdwn",
                    "text": "*Export Dir:*\n${EXPORT_DIR}"
                }
            ]
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "New infrastructure services have been stopped. DNS changes required to complete rollback."
            }
        }
    ]
}
EOF
)

    if curl -s -X POST -H 'Content-type: application/json' --data "$PAYLOAD" "$SLACK_WEBHOOK_URL" >/dev/null; then
        success "Slack notification sent"
    else
        warning "Failed to send Slack notification"
    fi
else
    warning "SLACK_WEBHOOK_URL not configured - skipping notification"
    echo "Set SLACK_WEBHOOK_URL environment variable to enable Slack notifications"
fi

# ===========================================
# STEP 5: Create Rollback Manifest
# ===========================================
step "STEP 5: Creating rollback manifest..."

MANIFEST_FILE="ROLLBACK_MANIFEST_${ROLLBACK_TIMESTAMP}.md"

cat > "$MANIFEST_FILE" <<EOF
# FreshTrack Pro Rollback Manifest

**Rollback Timestamp:** $(date '+%Y-%m-%d %H:%M:%S')
**Export Directory:** ${EXPORT_DIR}/

## Actions Taken

### 1. Services Stopped
- Backend API (Docker container)
- Caddy reverse proxy

### 2. Data Exported
- Sensor readings created after ${CUTOVER_TIMESTAMP}
- Alerts created after ${CUTOVER_TIMESTAMP}
- User profiles created after ${CUTOVER_TIMESTAMP}
- Full database backup: ${EXPORT_DIR}/full_backup.dump

### 3. DNS Changes Required
Update DNS records to point back to previous infrastructure:
- Domain: freshtrackpro.com
- Previous Target: [OLD_SUPABASE_INFRASTRUCTURE]

### 4. Database Preservation
The new PostgreSQL database remains intact and running.
- Container: freshtrack-pro_postgres
- Volume: freshtrack-pro_postgres-data
- Access: docker compose exec postgres psql -U postgres -d freshtrack

## Next Steps

1. **Complete DNS Changes**
   - Update DNS A/CNAME records
   - Verify propagation: \`dig freshtrackpro.com\`

2. **Verify Old System**
   - Test login at previous URL
   - Verify sensor data flowing
   - Check alert generation

3. **Data Migration (if needed)**
   - Review exported data in ${EXPORT_DIR}/
   - Import into old system if necessary
   - Reconcile any new records

4. **System Cleanup (after verification)**
   - Optionally stop new database: \`docker compose stop postgres redis\`
   - Preserve volumes for potential future use
   - Archive export directory

## Rollback Reason

[Document reason for rollback here]

## Lessons Learned

[Document lessons learned for future deployment attempts]

---

Generated by: scripts/rollback.sh
Date: $(date '+%Y-%m-%d %H:%M:%S')
EOF

success "Rollback manifest created: ${MANIFEST_FILE}"

# ===========================================
# Rollback Complete
# ===========================================
echo ""
echo "========================================"
echo -e "${GREEN}Rollback Process Complete${NC}"
echo "========================================"
echo ""
echo "End time: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "Summary:"
echo "  - New services stopped"
echo "  - Data exported to: ${EXPORT_DIR}/"
echo "  - Manifest created: ${MANIFEST_FILE}"
echo ""
echo "IMPORTANT: Complete DNS changes to finish rollback"
echo ""
echo "Monitor old system at previous URL after DNS propagates."
echo ""

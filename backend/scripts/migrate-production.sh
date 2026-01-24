#!/bin/sh
set -e

# Production database migration script
# This script runs Drizzle migrations against the production database
#
# Usage:
#   ./scripts/migrate-production.sh
#
# Environment variables:
#   DATABASE_URL - PostgreSQL connection string (required)
#
# Exit codes:
#   0 - Migrations completed successfully
#   1 - Migration failed

echo "=== FrostGuard Database Migration ==="
echo "Starting at: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# Validate DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

# Extract host for logging (hide credentials)
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
echo "Connecting to database host: $DB_HOST"

# Run migrations
echo "Running migrations..."
node dist/src/db/migrate.js

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "=== Migration completed successfully ==="
  echo "Finished at: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
else
  echo "=== Migration FAILED ==="
  echo "Exit code: $EXIT_CODE"
fi

exit $EXIT_CODE

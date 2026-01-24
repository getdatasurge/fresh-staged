# Production Secrets

This directory contains sensitive credentials for production deployment. Never commit actual secret values to version control.

## Required Secret Files

Create the following files in this directory:

### 1. `postgres_password.txt`
PostgreSQL database password for the `frostguard` user.

```bash
# For managed PostgreSQL (e.g., DigitalOcean, AWS RDS)
echo "your-managed-db-password" > postgres_password.txt

# For self-hosted PostgreSQL
openssl rand -base64 32 > postgres_password.txt
```

### 2. `jwt_secret.txt`
Secret key for signing JWT tokens (authentication).

```bash
openssl rand -base64 32 > jwt_secret.txt
```

### 3. `stack_auth_secret.txt`
Stack Auth API secret key for authentication service integration.

```bash
# Get this from your Stack Auth dashboard
echo "your-stack-auth-secret" > stack_auth_secret.txt
```

### 4. `minio_user.txt`
MinIO root username for S3-compatible object storage.

```bash
# Use a strong username (not "admin")
echo "frostguard-minio-admin" > minio_user.txt
```

### 5. `minio_password.txt`
MinIO root password for S3-compatible object storage.

```bash
openssl rand -base64 32 > minio_password.txt
```

### 6. `grafana_password.txt`
Grafana admin password for monitoring dashboard.

```bash
openssl rand -base64 32 > grafana_password.txt
```

## Quick Setup Script

Generate all secrets at once:

```bash
#!/bin/bash
# Run from project root: bash secrets/generate-all.sh

cd secrets

# Generate random secrets
openssl rand -base64 32 > postgres_password.txt
openssl rand -base64 32 > jwt_secret.txt
openssl rand -base64 32 > minio_password.txt
openssl rand -base64 32 > grafana_password.txt

# Create MinIO username
echo "freshtrack-minio-admin" > minio_user.txt

# Prompt for external service secrets
echo "Enter your Stack Auth secret key (from dashboard):"
read -s stack_secret
echo "$stack_secret" > stack_auth_secret.txt

# Set permissions
chmod 600 *.txt

echo "All secrets generated! Remember to save stack_auth_secret.txt value."
```

## Generating Secure Secrets

### Using OpenSSL (recommended)
```bash
# Generate 32-byte random secrets (256-bit)
openssl rand -base64 32 > jwt_secret.txt
openssl rand -base64 32 > minio_password.txt
openssl rand -base64 32 > postgres_password.txt
```

### Using pwgen
```bash
# Generate 32-character alphanumeric passwords
pwgen -s 32 1 > jwt_secret.txt
pwgen -s 32 1 > minio_password.txt
```

### Using /dev/urandom
```bash
# Generate 32-byte random secrets
head -c 32 /dev/urandom | base64 > jwt_secret.txt
```

## File Permissions

Ensure restricted permissions on secret files:

```bash
# Make secrets readable only by owner
chmod 600 secrets/*.txt

# Verify permissions
ls -la secrets/
```

Expected output:
```
-rw------- 1 user user   45 Jan 23 10:00 grafana_password.txt
-rw------- 1 user user   45 Jan 23 10:00 jwt_secret.txt
-rw------- 1 user user   45 Jan 23 10:00 minio_password.txt
-rw------- 1 user user   30 Jan 23 10:00 minio_user.txt
-rw------- 1 user user   45 Jan 23 10:00 postgres_password.txt
-rw------- 1 user user   45 Jan 23 10:00 stack_auth_secret.txt
```

## Docker Secrets

These files are mounted as Docker secrets in production:

```yaml
secrets:
  postgres_password:
    file: ./secrets/postgres_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt
  # ... etc
```

In containers, secrets are available at:
- `/run/secrets/postgres_password`
- `/run/secrets/jwt_secret`
- `/run/secrets/stack_auth_secret`
- `/run/secrets/minio_user`
- `/run/secrets/minio_password`
- `/run/secrets/grafana_password`

## Backup and Recovery

1. **Backup**: Store secrets securely in a password manager or encrypted vault
2. **Team access**: Use 1Password, Bitwarden, or HashiCorp Vault for team secret sharing
3. **Rotation**: Rotate secrets regularly (quarterly recommended)
4. **Emergency access**: Ensure multiple team members have backup access

## Security Checklist

- [ ] All secret files have 600 permissions (owner read/write only)
- [ ] Secrets are at least 32 characters or 256 bits
- [ ] Secrets are randomly generated (not dictionary words)
- [ ] Secrets are backed up in secure password manager
- [ ] `.gitignore` prevents secrets from being committed
- [ ] Production secrets differ from development/staging
- [ ] Team members know emergency secret rotation procedure

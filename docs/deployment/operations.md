# Operations Manual: FreshTrack Pro

## Managing Services

FreshTrack Pro runs on Docker Compose. All commands should be run from the project root.

**Check Status:**
```bash
docker compose ps
```

**View Logs:**
```bash
# All logs
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f caddy
```

**Restart Services:**
```bash
docker compose restart
```

**Stop Services:**
```bash
docker compose down
```

## Data Management

### Backups
Primary data resides in the PostgreSQL container.

**Running a specific backup:**
```bash
./scripts/backup-db.sh
```
*Note: Ensure you have configured backup destination or volume mounts.*

### Database Access
You can access the database directly:
```bash
docker compose exec postgres psql -U postgres -d freshtrack
```

## Updates

To update FreshTrack Pro:

1. **Pull latest code:**
   ```bash
   git pull origin main
   ```

2. **Re-run deployment:**
   ```bash
   sudo ./scripts/deploy-automated.sh
   ```
   *The script is idempotent and will rebuild/restart containers as needed.*

## Security

### Firewall (UFW)
The deployment script configures UFW to allow only SSH, HTTP, and HTTPS.
Check status:
```bash
sudo ufw status verbose
```

### SSL Certificates
Caddy handles SSL automatically. Certificates are stored in the `caddy_data` volume.

## Troubleshooting

### "Bad Gateway" (502)
Usually means the backend is not running or not reachable by Caddy.
1. Check backend logs: `docker compose logs backend`
2. Check Caddy logs: `docker compose logs caddy`

### "Database Connection Error"
1. Check Postgres status: `docker compose ps postgres`
2. specific connection logs: `docker compose logs backend | grep error`

### Resetting Passwords
Administrative access relies on Stack Auth. Refer to Stack Auth documentation for user management.
Local database user (simulated) can be reset via SQL if necessary.

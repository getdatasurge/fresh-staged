# Local Development Environment

This guide explains how to set up and run the FrostGuard local development environment.

## Prerequisites

- **Docker** (v20.10+) and **Docker Compose** (v2.0+)
- **Node.js** (v20 LTS) - for backend development
- **Git** - for version control

### Verify Prerequisites

```bash
docker --version        # Docker version 20.10+
docker compose version  # Docker Compose version v2.0+
node --version          # v20.x.x
```

## Quick Start

### 1. Start Services

```bash
# Start core services (PostgreSQL, PgBouncer, Redis, MinIO)
./scripts/dev/up.sh

# Or include admin UIs (pgAdmin, Redis Commander)
./scripts/dev/up.sh --admin
```

### 2. Verify Services

After running `up.sh`, you should see:

```
✅ All services are running!

📝 Service URLs:
   PostgreSQL: localhost:5432 (via PgBouncer: localhost:6432)
   Redis:      localhost:6379
   MinIO API:  http://localhost:9000
   MinIO Console: http://localhost:9001 (minioadmin / minioadmin_dev_password)
```

### 3. Test Connections

```bash
# PostgreSQL (via PgBouncer)
psql postgresql://frostguard:frostguard_dev_password@localhost:6432/frostguard -c "SELECT 1"

# Redis
redis-cli -h localhost -p 6379 PING

# MinIO
curl -I http://localhost:9000/minio/health/live
```

## Services

### PostgreSQL 15

- **Purpose:** Primary database
- **Port:** 5432 (direct) / 6432 (via PgBouncer - recommended)
- **Credentials:**
  - User: `frostguard`
  - Password: `frostguard_dev_password`
  - Database: `frostguard`

### PgBouncer

- **Purpose:** Connection pooling
- **Port:** 6432
- **Mode:** Transaction pooling
- **Pool Size:** 20 connections

### Redis 7

- **Purpose:** Caching, job queues, Socket.io pub/sub
- **Port:** 6379
- **Persistence:** AOF enabled

### MinIO

- **Purpose:** S3-compatible object storage
- **S3 API Port:** 9000
- **Console Port:** 9001
- **Credentials:**
  - Access Key: `minioadmin`
  - Secret Key: `minioadmin_dev_password`
- **Default Bucket:** `frostguard`

## Environment Variables

Create a `.env` file in the backend directory:

```bash
# Database (use PgBouncer port)
DATABASE_URL=postgresql://frostguard:frostguard_dev_password@localhost:6432/frostguard

# Redis
REDIS_URL=redis://localhost:6379

# MinIO
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin_dev_password
S3_BUCKET=frostguard

# Server
PORT=4000
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:3000

# Stack Auth (get from dashboard.stack-auth.com)
STACK_AUTH_PROJECT_ID=your_project_id
STACK_AUTH_SECRET_KEY=your_secret_key

# JWT (for local development)
JWT_SECRET=development-jwt-secret-min-32-characters
```

## Admin UIs

Start with the `--admin` flag to include admin interfaces:

```bash
./scripts/dev/up.sh --admin
```

### pgAdmin 4

- **URL:** http://localhost:5050
- **Email:** admin@frostguard.local
- **Password:** admin

To connect to PostgreSQL from pgAdmin:
1. Add New Server
2. Name: FrostGuard Dev
3. Host: `postgres` (use container name, not localhost)
4. Port: `5432`
5. Database: `frostguard`
6. Username: `frostguard`
7. Password: `frostguard_dev_password`

### Redis Commander

- **URL:** http://localhost:8081
- Auto-connects to local Redis

### MinIO Console

- **URL:** http://localhost:9001
- **Access Key:** minioadmin
- **Secret Key:** minioadmin_dev_password

## Scripts Reference

| Script | Description |
|--------|-------------|
| `./scripts/dev/up.sh` | Start all development services |
| `./scripts/dev/up.sh --admin` | Start with admin UIs |
| `./scripts/dev/down.sh` | Stop all services (preserves data) |
| `./scripts/dev/reset.sh` | Stop and remove all data (fresh start) |

## Troubleshooting

### Services won't start

```bash
# Check Docker is running
docker info

# Check for port conflicts
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :9000  # MinIO

# View logs
docker compose -f docker/docker-compose.yml logs -f
```

### Database connection issues

```bash
# Check PostgreSQL health
docker exec frostguard-postgres pg_isready -U frostguard

# Connect directly (bypassing PgBouncer)
psql postgresql://frostguard:frostguard_dev_password@localhost:5432/frostguard

# Check PgBouncer status
docker logs frostguard-pgbouncer
```

### Redis connection issues

```bash
# Check Redis health
docker exec frostguard-redis redis-cli ping

# View Redis info
docker exec frostguard-redis redis-cli info
```

### MinIO issues

```bash
# Check MinIO health
curl http://localhost:9000/minio/health/live

# List buckets
docker exec frostguard-minio mc ls local

# Check MinIO logs
docker logs frostguard-minio
```

### Reset everything

If all else fails, do a complete reset:

```bash
./scripts/dev/reset.sh
./scripts/dev/up.sh
```

## Network

All services run on the `frostguard_network` Docker network. Services can reach each other by container name:

| Service | Container Name | Internal URL |
|---------|----------------|--------------|
| PostgreSQL | frostguard-postgres | postgres:5432 |
| PgBouncer | frostguard-pgbouncer | pgbouncer:6432 |
| Redis | frostguard-redis | redis:6379 |
| MinIO | frostguard-minio | minio:9000 |

## Data Persistence

Data is stored in Docker volumes:

- `frostguard_postgres_data` - PostgreSQL data
- `frostguard_redis_data` - Redis AOF
- `frostguard_minio_data` - MinIO objects

Volumes persist across container restarts. Use `reset.sh` to remove all data.

---

*Last Updated: January 2026*

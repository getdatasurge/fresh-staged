# Production Monitoring Guide

This document describes the monitoring and observability setup for FreshTrack Pro backend.

## Overview

FreshTrack Pro uses a structured approach to monitoring with:

- **Structured JSON logging** (Pino) for log aggregation
- **Health check endpoints** for load balancers and orchestration
- **Request correlation** via request IDs
- **Optional error tracking** via Sentry
- **Graceful shutdown** for zero-downtime deployments

## Logging

### Configuration

Logging behavior is controlled via environment variables:

| Variable    | Default       | Description                                                       |
| ----------- | ------------- | ----------------------------------------------------------------- |
| `LOG_LEVEL` | `info`        | Log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`     |
| `NODE_ENV`  | `development` | Environment: `development` for pretty logs, `production` for JSON |

### Log Format

**Production (JSON):**

```json
{
  "level": "info",
  "time": "2024-01-24T12:00:00.000Z",
  "pid": 1234,
  "hostname": "api-pod-abc123",
  "service": "freshtrack-api",
  "version": "1.0.0",
  "requestId": "req-abc123",
  "msg": "Request completed"
}
```

**Development (Pretty):**

```
12:00:00 INFO: Request completed
    requestId: req-abc123
```

### Log Levels

| Level   | Usage                                                |
| ------- | ---------------------------------------------------- |
| `fatal` | System is unusable, immediate action required        |
| `error` | Error events that need investigation                 |
| `warn`  | Unusual conditions, slow requests (>3s)              |
| `info`  | Normal operations: startup, shutdown, config changes |
| `debug` | Detailed debugging (development only)                |
| `trace` | Very detailed tracing (performance impact)           |

### Sensitive Data Redaction

The following fields are automatically redacted from logs:

- Authorization headers
- Stack Auth tokens
- Cookies
- Passwords, API keys, secrets, tokens

### Request Correlation

Every request is assigned a unique ID for tracing:

1. If `X-Request-ID` or `X-Correlation-ID` header is present, it's reused
2. Otherwise, a new ID is generated: `req-<timestamp>-<random>`
3. The request ID is included in all log entries and error responses

## Health Check Endpoints

All endpoints are publicly accessible (no authentication required).

### GET /health

Comprehensive health check for monitoring dashboards.

**Response:**

```json
{
  "status": "healthy",
  "uptime": 3600.123,
  "timestamp": "2024-01-24T12:00:00.000Z",
  "version": "1.0.0",
  "environment": "production",
  "checks": {
    "database": {
      "status": "pass",
      "latency_ms": 5
    },
    "redis": {
      "status": "pass",
      "latency_ms": 2
    }
  }
}
```

**Status Codes:**

- `200` - Healthy or degraded (can accept traffic)
- `503` - Unhealthy (should not accept traffic)

**Overall Status:**

- `healthy` - All checks passing
- `degraded` - Required checks passing, optional checks failing
- `unhealthy` - Required checks failing (database)

### GET /health/ready

Kubernetes readiness probe. Returns 503 if the service cannot handle requests.

### GET /health/live

Kubernetes liveness probe. Returns 200 if the process is running.

### GET /health/realtime

WebSocket health check. Returns active connection count.

## Log Aggregation

### Docker Compose

Logs are output to stdout/stderr and captured by Docker:

```bash
# View all logs
docker compose logs -f backend

# View last 100 lines
docker compose logs --tail=100 backend

# Filter by level (requires jq)
docker compose logs backend | jq 'select(.level == "error")'
```

### Log Forwarding Options

**Option 1: Docker Logging Driver**

Configure in `docker-compose.prod.yml`:

```yaml
services:
  backend:
    logging:
      driver: 'json-file'
      options:
        max-size: '100m'
        max-file: '5'
```

**Option 2: Fluent Bit Sidecar**

Add Fluent Bit for shipping to CloudWatch, Elasticsearch, etc.:

```yaml
services:
  fluent-bit:
    image: fluent/fluent-bit:latest
    volumes:
      - ./fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
```

**Option 3: Vector**

Lightweight alternative for log aggregation:

```yaml
services:
  vector:
    image: timberio/vector:latest
    volumes:
      - ./vector.toml:/etc/vector/vector.toml
```

### Common Log Queries

**Find errors by request ID:**

```bash
docker compose logs backend | jq 'select(.requestId == "req-abc123")'
```

**Find slow requests:**

```bash
docker compose logs backend | jq 'select(.responseTime > 3000)'
```

**Count errors by type:**

```bash
docker compose logs backend | jq -s 'map(select(.level == "error")) | group_by(.err.type) | map({type: .[0].err.type, count: length})'
```

## Error Tracking (Sentry)

### Setup

1. Create a Sentry project at https://sentry.io
2. Set environment variable:

   ```
   SENTRY_DSN=https://key@sentry.io/project-id
   ```

3. Optional: Configure sample rate for performance monitoring:
   ```
   SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% of requests
   ```

### What Gets Reported

- All 5xx server errors
- Uncaught exceptions
- Unhandled promise rejections

### What's Excluded

- 4xx client errors (validation, auth, not found)
- Expected business logic errors

### Context

Each error includes:

- Request ID
- HTTP method and URL
- User ID and organization ID (if authenticated)
- Request headers and parameters

## Alerting Recommendations

### Critical Alerts

| Metric                | Threshold        | Action       |
| --------------------- | ---------------- | ------------ |
| `/health` returns 503 | Any occurrence   | Page on-call |
| Error rate            | > 5% of requests | Page on-call |
| Response time p99     | > 5 seconds      | Notify team  |

### Warning Alerts

| Metric                   | Threshold        | Action               |
| ------------------------ | ---------------- | -------------------- |
| Error rate               | > 1% of requests | Notify team          |
| Redis health check fails | 3 consecutive    | Investigate          |
| Memory usage             | > 80%            | Scale or investigate |

## Metrics Export (Optional)

For Prometheus-style metrics, consider adding:

```bash
pnpm add fastify-metrics
```

Then export `/metrics` endpoint for:

- Request count by route and status
- Response time histograms
- Active connections
- Node.js runtime metrics

## Troubleshooting

### Log Output Not Appearing

1. Check `LOG_LEVEL` is set appropriately
2. Verify `NODE_ENV` for correct format
3. Ensure process has stdout/stderr access

### High Error Rate

1. Check Sentry for error details
2. Search logs by request ID
3. Check `/health` for infrastructure issues

### Slow Requests

1. Look for "Slow request" warnings in logs
2. Check database latency in health check
3. Profile specific endpoints

## Security Considerations

- Logs never contain passwords or tokens (redacted)
- Error messages in production hide internal details
- Request body logging disabled by default
- PII should not be logged without consent

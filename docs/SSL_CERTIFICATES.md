# SSL/TLS Certificate Configuration

FreshTrack Pro uses Caddy for automatic HTTPS. Caddy handles certificate acquisition, renewal, and OCSP stapling automatically with zero configuration in most cases.

## Table of Contents

1. [How Caddy Automatic HTTPS Works](#how-caddy-automatic-https-works)
2. [Default Setup: Individual Certificates](#default-setup-individual-certificates)
3. [Advanced Setup: Wildcard Certificates](#advanced-setup-wildcard-certificates)
4. [DNS Provider Configuration](#dns-provider-configuration)
5. [Troubleshooting](#troubleshooting)
6. [Let's Encrypt Rate Limits](#lets-encrypt-rate-limits)

## How Caddy Automatic HTTPS Works

Caddy obtains and renews TLS certificates automatically using the ACME protocol (Let's Encrypt). Two challenge types are available:

### HTTP-01 Challenge (Default)

**How it works:**

1. You request a certificate for `example.com`
2. Let's Encrypt sends a challenge to `http://example.com/.well-known/acme-challenge/TOKEN`
3. Caddy responds with the challenge value
4. Let's Encrypt verifies ownership and issues the certificate

**Requirements:**

- Port 80 must be accessible from the internet
- DNS must point to your server
- One certificate per domain/subdomain

**Best for:** Most deployments, simple setup, no API credentials needed

### DNS-01 Challenge (Wildcard)

**How it works:**

1. You request a certificate for `*.example.com`
2. Let's Encrypt requests a DNS TXT record at `_acme-challenge.example.com`
3. Caddy creates the record via DNS provider API
4. Let's Encrypt verifies the record and issues the certificate
5. Caddy removes the TXT record

**Requirements:**

- DNS provider API credentials
- DNS provider supported by Caddy
- Works with private servers (no port 80 exposure needed)

**Best for:** Many subdomains, private networks, DNS providers with API access

## Default Setup: Individual Certificates

This is the **recommended approach** for most deployments.

### Pros

- **No DNS API credentials needed** — works with any DNS provider
- **Zero configuration** — Caddy handles everything automatically
- **Simple troubleshooting** — fewer moving parts
- **Works with any firewall** — just needs port 80 open

### Cons

- **One certificate per subdomain** — `example.com`, `api.example.com`, `monitoring.example.com` each get separate certs
- **Requires port 80 accessible** — Let's Encrypt must reach your server on port 80
- **50 cert/week limit** — may hit rate limits with many subdomains (see [Rate Limits](#lets-encrypt-rate-limits))

### Configuration

The default Caddyfile handles this automatically. See `docker/caddy/Caddyfile`:

```caddyfile
# Main application
{$DOMAIN:localhost} {
    reverse_proxy /api/* backend:3000
    reverse_proxy /* frontend:5173
}

# Monitoring subdomain
monitoring.{$DOMAIN:localhost} {
    reverse_proxy grafana:3000
}

# Status page subdomain
status.{$DOMAIN:localhost} {
    reverse_proxy uptime-kuma:3001
}
```

When `DOMAIN=freshtrackpro.com`, Caddy automatically obtains certificates for:

- `freshtrackpro.com`
- `monitoring.freshtrackpro.com`
- `status.freshtrackpro.com`

### Required DNS Setup

Create A records pointing to your server's public IP:

```dns
freshtrackpro.com                A    203.0.113.42
monitoring.freshtrackpro.com     A    203.0.113.42
status.freshtrackpro.com         A    203.0.113.42
```

**For IPv6:**

```dns
freshtrackpro.com                AAAA 2001:db8::1
monitoring.freshtrackpro.com     AAAA 2001:db8::1
status.freshtrackpro.com         AAAA 2001:db8::1
```

### Deployment Steps

1. **Set the DOMAIN environment variable:**

   ```bash
   echo "DOMAIN=freshtrackpro.com" >> .env
   ```

2. **Configure admin email in Caddyfile:**

   ```caddyfile
   {
       email admin@freshtrackpro.com
   }
   ```

3. **Ensure port 80 is open:**

   ```bash
   # Check firewall (Ubuntu/Debian)
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp

   # Check firewall (RHEL/CentOS)
   sudo firewall-cmd --permanent --add-service=http
   sudo firewall-cmd --permanent --add-service=https
   sudo firewall-cmd --reload
   ```

4. **Start Caddy:**

   ```bash
   docker-compose up -d caddy
   ```

5. **Verify certificates:**

   ```bash
   # Check Caddy logs
   docker-compose logs -f caddy

   # Test HTTPS
   curl -I https://freshtrackpro.com
   ```

Caddy will automatically renew certificates ~30 days before expiry.

## Advanced Setup: Wildcard Certificates

Use wildcard certificates when:

- You have **many subdomains** (>10)
- You want to **add subdomains without SSL configuration**
- You have **DNS provider API access**
- You run on a **private network** without port 80 exposure

### Pros

- **Single certificate covers all subdomains** — `*.example.com` includes `api.example.com`, `monitoring.example.com`, etc.
- **Add subdomains dynamically** — no new certificate requests
- **Works without port 80** — DNS-01 doesn't require HTTP access
- **No rate limit concerns** — one certificate regardless of subdomain count

### Cons

- **Requires DNS provider API credentials** — must store sensitive token in environment
- **More complex setup** — additional configuration and testing
- **Provider-specific** — must use supported DNS provider
- **Propagation delays** — DNS changes take time (30s to 5min)

### Configuration

1. **Copy the wildcard template:**

   ```bash
   cp docker/caddy/Caddyfile.wildcard.example docker/caddy/Caddyfile
   ```

2. **Set DNS provider credentials:**

   ```bash
   # Example for Cloudflare
   echo "CLOUDFLARE_API_TOKEN=your-token-here" >> .env
   echo "DOMAIN=freshtrackpro.com" >> .env
   echo "ADMIN_EMAIL=admin@freshtrackpro.com" >> .env
   ```

3. **Restart Caddy:**
   ```bash
   docker-compose restart caddy
   ```

See [DNS Provider Configuration](#dns-provider-configuration) for provider-specific instructions.

## DNS Provider Configuration

Caddy supports 100+ DNS providers. See [Caddy DNS Providers](https://caddyserver.com/docs/modules/) for the full list.

### Cloudflare (Recommended)

**Pros:** Fast DNS propagation (30-60 seconds), excellent API, generous free tier

**Setup:**

1. **Create API token:**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
   - Click **Create Token**
   - Use **Edit zone DNS** template
   - **Permissions:**
     - Zone → DNS → Edit
   - **Zone Resources:**
     - Include → Specific zone → `freshtrackpro.com`
   - Click **Continue to summary** → **Create Token**
   - **Copy the token** (shown only once)

2. **Set environment variable:**

   ```bash
   echo "CLOUDFLARE_API_TOKEN=your-token-here" >> .env
   ```

3. **Update Caddyfile:**

   ```caddyfile
   *.{$DOMAIN} {
       tls {
           dns cloudflare {env.CLOUDFLARE_API_TOKEN}
       }
   }
   ```

4. **Verify:**
   ```bash
   docker-compose restart caddy
   docker-compose logs -f caddy
   ```

**Troubleshooting:**

- Token must have **Zone DNS Edit** permission
- Zone Resources must include your domain
- Token expires — check expiration in dashboard

### DigitalOcean

**Pros:** Simple API, integrated with DO infrastructure

**Setup:**

1. **Create personal access token:**
   - Go to [DigitalOcean API](https://cloud.digitalocean.com/account/api/tokens)
   - Click **Generate New Token**
   - Name: `caddy-dns-challenge`
   - Scopes: **Read and Write**
   - Click **Generate Token**
   - **Copy the token**

2. **Set environment variable:**

   ```bash
   echo "DO_AUTH_TOKEN=your-token-here" >> .env
   ```

3. **Update Caddyfile:**
   ```caddyfile
   *.{$DOMAIN} {
       tls {
           dns digitalocean {env.DO_AUTH_TOKEN}
       }
   }
   ```

**Troubleshooting:**

- Token must have **write** access (read-only won't work)
- DNS records must be managed in DigitalOcean (not just domain registration)

### Route53 (AWS)

**Pros:** Integrates with AWS infrastructure, reliable

**Setup:**

1. **Create IAM user for DNS challenges:**

   ```bash
   aws iam create-user --user-name caddy-dns-challenge
   ```

2. **Attach policy:**

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["route53:ListHostedZones", "route53:GetChange"],
         "Resource": "*"
       },
       {
         "Effect": "Allow",
         "Action": "route53:ChangeResourceRecordSets",
         "Resource": "arn:aws:route53:::hostedzone/ZXXXXXXXXXXXXX"
       }
     ]
   }
   ```

   Replace `ZXXXXXXXXXXXXX` with your hosted zone ID.

3. **Create access key:**

   ```bash
   aws iam create-access-key --user-name caddy-dns-challenge
   ```

4. **Set environment variables:**

   ```bash
   echo "AWS_ACCESS_KEY_ID=your-key-id" >> .env
   echo "AWS_SECRET_ACCESS_KEY=your-secret-key" >> .env
   echo "AWS_REGION=us-east-1" >> .env
   ```

5. **Update Caddyfile:**
   ```caddyfile
   *.{$DOMAIN} {
       tls {
           dns route53
       }
   }
   ```

**Troubleshooting:**

- Hosted zone must exist in Route53
- IAM user needs `route53:ChangeResourceRecordSets` permission
- Check CloudTrail logs for permission errors

### Other Providers

Caddy supports 100+ DNS providers including:

- **Namecheap**
- **GoDaddy**
- **Google Cloud DNS**
- **Azure DNS**
- **Linode**
- **Vultr**
- **Hetzner**

See [Caddy DNS module list](https://caddyserver.com/docs/modules/) for configuration examples.

## Troubleshooting

### Certificate Not Issued

**Symptom:** Caddy logs show certificate acquisition failures

**Common causes:**

1. **DNS not propagated:**

   ```bash
   # Check if DNS points to your server
   dig +short freshtrackpro.com
   # Should return your server IP
   ```

   **Solution:** Wait for DNS propagation (up to 48 hours, typically <1 hour)

2. **Port 80 blocked:**

   ```bash
   # Test from external server
   curl http://your-server-ip/.well-known/acme-challenge/test
   ```

   **Solution:** Open port 80 in firewall, check cloud provider security groups

3. **Domain not pointing to server:**

   ```bash
   # Check what IP the domain resolves to
   nslookup freshtrackpro.com
   ```

   **Solution:** Update A record to point to your server's public IP

4. **Caddy behind reverse proxy:**

   If Caddy is behind another reverse proxy (nginx, HAProxy), ensure the proxy forwards ACME challenge requests.

   **Solution:** Configure upstream proxy to forward `/.well-known/acme-challenge/*`

### Rate Limit Errors

**Symptom:** Error like `too many certificates already issued`

**Cause:** Let's Encrypt limits 50 certificates per registered domain per week

**Solutions:**

1. **Use staging environment for testing:**

   ```caddyfile
   {
       acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
   }
   ```

   Staging has higher limits (30,000/week) and issues untrusted certificates for testing.

2. **Switch to wildcard certificates** — counts as 1 certificate regardless of subdomains

3. **Wait 7 days** — rate limit window is rolling 7-day period

See [Let's Encrypt Rate Limits](#lets-encrypt-rate-limits) for details.

### DNS Propagation Delays (Wildcard)

**Symptom:** `DNS record not found` errors during DNS-01 challenge

**Cause:** DNS provider hasn't propagated TXT record yet

**Solutions:**

1. **Increase propagation timeout:**

   ```caddyfile
   *.{$DOMAIN} {
       tls {
           dns cloudflare {env.CLOUDFLARE_API_TOKEN}
           propagation_timeout 5m
           propagation_delay 60s
       }
   }
   ```

2. **Check DNS propagation:**

   ```bash
   # Check if TXT record is visible
   dig +short TXT _acme-challenge.freshtrackpro.com
   ```

3. **Verify DNS provider credentials:**
   ```bash
   # Check environment variable is set
   echo $CLOUDFLARE_API_TOKEN
   ```

### Certificate Renewal Failures

**Symptom:** Existing certificates expire, Caddy fails to renew

**Common causes:**

1. **Server was offline during renewal window** (Caddy renews ~30 days before expiry)

   **Solution:** Restart Caddy to trigger immediate renewal

2. **DNS/firewall changes broke challenge:**

   **Solution:** Test certificate acquisition manually:

   ```bash
   docker-compose restart caddy
   docker-compose logs -f caddy
   ```

3. **API token expired/revoked (wildcard):**

   **Solution:** Generate new token and update environment

### Testing Certificate Acquisition

**Before production deployment, test with Let's Encrypt staging:**

1. **Add staging CA to Caddyfile:**

   ```caddyfile
   {
       acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
   }
   ```

2. **Start Caddy:**

   ```bash
   docker-compose up -d caddy
   docker-compose logs -f caddy
   ```

3. **Verify certificate issued:**

   ```bash
   # Check certificate details
   echo | openssl s_client -connect freshtrackpro.com:443 2>/dev/null | openssl x509 -noout -issuer
   # Should show: issuer=CN = (STAGING) Artificial Apricot R3
   ```

4. **Switch to production:**
   Remove or comment out `acme_ca` line and restart Caddy.

**Staging certificates are not trusted by browsers** — you'll see SSL warnings. This is expected.

## Let's Encrypt Rate Limits

Let's Encrypt enforces rate limits to prevent abuse. Key limits as of 2026:

### Certificates per Registered Domain

**Limit:** 50 certificates per registered domain per week

**What counts:**

- Each unique set of domains/subdomains is one certificate
- Renewals of existing certificates (same domains) are free
- Wildcard certificates count as 1 certificate regardless of subdomain count

**Example:**

- Certificate for `example.com` — 1 cert
- Certificate for `api.example.com` — 1 cert
- Certificate for `example.com` + `www.example.com` — 1 cert
- Certificate for `*.example.com` — 1 cert (covers unlimited subdomains)

**Registered domain** = domain + public suffix. For `api.example.com`, registered domain is `example.com`.

**Impact on FreshTrack Pro:**

- Default setup uses 3 certificates (`example.com`, `monitoring.example.com`, `status.example.com`)
- Well within 50/week limit
- Wildcard setup uses 1 certificate total

**Mitigation:** Use wildcard certificates if you have >10 subdomains or frequently add/remove subdomains.

### Duplicate Certificates

**Limit:** 5 duplicate certificates per week

A duplicate certificate contains the exact same set of domains as a previously issued certificate.

**What counts as duplicate:**

- Requesting `example.com` after already having a valid cert for `example.com` → duplicate
- Adding `www.example.com` to `example.com` → NOT duplicate (different domain set)

**Impact:** Don't delete and recreate certificates unnecessarily. Caddy handles renewals automatically.

### Failed Validations

**Limit:** 5 failed validations per account, per hostname, per hour

**What counts:**

- Failed HTTP-01 challenge (port 80 unreachable)
- Failed DNS-01 challenge (DNS record not found)

**Impact:** If certificate acquisition fails, wait 1 hour before retrying, or fix the underlying issue first.

**Mitigation:** Test with staging environment (`acme-staging-v02.api.letsencrypt.org`) before production.

### New Orders

**Limit:** 300 new orders per account per 3 hours

An order is a request for a certificate. Renewals don't count against this limit.

**Impact:** Very unlikely to hit this limit in normal operation.

### Best Practices

1. **Use staging for testing:**
   - Staging has much higher limits (30,000/week)
   - Catches configuration errors before production
   - Enable with `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory`

2. **Let Caddy handle renewals:**
   - Caddy renews certificates automatically ~30 days before expiry
   - Don't manually delete and recreate certificates

3. **Verify DNS before requesting certificates:**

   ```bash
   dig +short freshtrackpro.com
   # Should return your server IP
   ```

4. **Use wildcard certificates for many subdomains:**
   - 1 wildcard cert vs 50 individual certs
   - No rate limit concerns
   - Requires DNS provider API access

5. **Don't retry immediately on failure:**
   - Wait 1 hour after failed validations
   - Fix underlying issue (DNS, firewall) first
   - Check Caddy logs for error details

6. **Monitor certificate expiry:**
   - Caddy auto-renews, but monitor for failures
   - Set up alerts 30 days before expiry
   - FreshTrack Pro includes Blackbox Exporter for SSL monitoring (see Phase 10)

### Rate Limit Resources

- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/)
- [Let's Encrypt Staging Environment](https://letsencrypt.org/docs/staging-environment/)
- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)

---

**Related Documentation:**

- `docker/caddy/Caddyfile` — Default configuration (individual certificates)
- `docker/caddy/Caddyfile.wildcard.example` — Wildcard certificate template
- `docs/DEPLOYMENT.md` — Full deployment guide
- `docs/DATABASE.md` — Database SSL certificate monitoring (Phase 10)

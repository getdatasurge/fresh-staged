#!/usr/bin/env bash
# Generate self-signed TLS certificates for IP-based Caddy deployments.
# These are used when no domain is available for Let's Encrypt.
#
# Usage: ./generate-self-signed-certs.sh [IP_OR_HOSTNAME]
# Default: localhost
#
# Output: docker/caddy/certs/server.crt and server.key

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="${SCRIPT_DIR}/certs"
HOST="${1:-localhost}"

mkdir -p "${CERTS_DIR}"

echo "Generating self-signed certificate for: ${HOST}"

openssl req -x509 -newkey rsa:4096 \
  -keyout "${CERTS_DIR}/server.key" \
  -out "${CERTS_DIR}/server.crt" \
  -sha256 -days 365 -nodes \
  -subj "/CN=${HOST}" \
  -addext "subjectAltName=DNS:${HOST},DNS:localhost,IP:127.0.0.1"

echo "Certificates generated:"
echo "  ${CERTS_DIR}/server.crt"
echo "  ${CERTS_DIR}/server.key"
echo ""
echo "These are self-signed and will show browser warnings."
echo "For production with a domain, use Let's Encrypt via Caddyfile.wildcard.example."

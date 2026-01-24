#!/bin/bash
# Simple webhook receiver for E2E testing
# Captures notification payloads to verify delivery during alert lifecycle testing
#
# Usage:
#   ./webhook-receiver.sh [OPTIONS]
#
# Options:
#   --port PORT        Listen on PORT (default: 8888)
#   --timeout SECONDS  Timeout after SECONDS (default: 60)
#   --output FILE      Write payload to FILE (default: /tmp/webhook-test-<timestamp>.json)
#   --help             Show this help message
#
# Example:
#   ./webhook-receiver.sh --port 8888 --timeout 120
#
# The receiver will:
# - Listen on http://localhost:PORT/webhook
# - Capture first POST request payload
# - Return 200 OK to caller
# - Print payload to stdout
# - Save payload to output file
# - Exit after receiving one request or timeout

set -euo pipefail

# Default configuration
PORT=8888
TIMEOUT=60
OUTPUT_FILE="/tmp/webhook-test-$(date +%s).json"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --port)
      PORT="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --help)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Check if Python is available
if ! command -v python3 &> /dev/null; then
  echo "Error: python3 is required but not installed"
  exit 1
fi

# Create simple HTTP server that captures POST requests
echo "Starting webhook receiver on http://localhost:${PORT}/webhook"
echo "Output file: ${OUTPUT_FILE}"
echo "Timeout: ${TIMEOUT}s"
echo ""
echo "Waiting for webhook notification..."

# Create Python HTTP server script
python3 -c "
import sys
import json
import signal
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime

class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')

        # Log request details
        print(f'Received webhook at {datetime.now().isoformat()}')
        print(f'Path: {self.path}')
        print(f'Headers: {dict(self.headers)}')
        print(f'Body: {body}')
        print('')

        # Save to output file
        with open('${OUTPUT_FILE}', 'w') as f:
            f.write(body)

        # Return 200 OK
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        response = json.dumps({'status': 'received'})
        self.wfile.write(response.encode('utf-8'))

        # Exit after first request
        print('Payload saved to: ${OUTPUT_FILE}')
        sys.exit(0)

    def log_message(self, format, *args):
        # Suppress default logging
        pass

def timeout_handler(signum, frame):
    print('Timeout reached. No webhook received.')
    sys.exit(1)

# Set timeout
signal.signal(signal.SIGALRM, timeout_handler)
signal.alarm(${TIMEOUT})

# Start server
server = HTTPServer(('127.0.0.1', ${PORT}), WebhookHandler)
try:
    server.serve_forever()
except KeyboardInterrupt:
    print('Interrupted by user')
    sys.exit(1)
" || {
  exit_code=$?
  if [ $exit_code -eq 0 ]; then
    # Normal exit after receiving webhook
    exit 0
  else
    # Timeout or error
    exit $exit_code
  fi
}

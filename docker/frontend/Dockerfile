# ===========================================
# Stage 1: Install dependencies
# ===========================================
FROM node:20-alpine AS deps

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependency manifests
COPY package.json pnpm-lock.yaml ./

# Install dependencies with frozen lockfile
RUN pnpm install --frozen-lockfile

# ===========================================
# Stage 2: Build static assets
# ===========================================
FROM node:20-alpine AS builder

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./

# Copy source files
COPY . .

# Set production environment for build
ENV NODE_ENV=production

# Build args for Vite (must be available at build time)
ARG VITE_STACK_PROJECT_ID
ARG VITE_STACK_PUBLISHABLE_CLIENT_KEY
ARG VITE_API_URL
ENV VITE_STACK_PROJECT_ID=$VITE_STACK_PROJECT_ID
ENV VITE_STACK_PUBLISHABLE_CLIENT_KEY=$VITE_STACK_PUBLISHABLE_CLIENT_KEY
ENV VITE_API_URL=$VITE_API_URL

# Build static assets
RUN pnpm build

# ===========================================
# Stage 3: Production nginx server
# ===========================================
FROM nginx:alpine AS production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root user for nginx
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Create 50x error page
RUN echo '<!DOCTYPE html><html><head><title>Server Error</title></head><body><h1>Server Error</h1><p>We are experiencing technical difficulties. Please try again later.</p></body></html>' > /usr/share/nginx/html/50x.html

# Switch to non-root user
USER nginx

# Expose port 8080 (non-privileged port for non-root user)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
  CMD curl -f http://localhost:8080/health || exit 1

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]

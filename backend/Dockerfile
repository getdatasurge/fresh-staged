# ===========================================
# Stage 1: Install dependencies (for caching)
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
# Stage 2: Build TypeScript
# ===========================================
FROM node:20-alpine AS builder

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./

# Copy source files
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY src ./src

# Build TypeScript to JavaScript
RUN pnpm build

# ===========================================
# Stage 3: Development (hot reload)
# ===========================================
FROM node:20-alpine AS development

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Set environment
ENV NODE_ENV=development

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./

# Copy source (will be overridden by volume mount)
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src

# Expose port
EXPOSE 3000

# Start dev server with hot reload
CMD ["pnpm", "dev"]

# ===========================================
# Stage 4: Production (minimal)
# ===========================================
FROM node:20-alpine AS production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Set environment
ENV NODE_ENV=production

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy drizzle migrations folder (SQL files needed for migrations)
COPY --chown=nodejs:nodejs drizzle ./drizzle

# Copy migration script
COPY --chown=nodejs:nodejs scripts/migrate-production.sh ./scripts/

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD curl -f http://localhost:3000/health || exit 1

# Start production server (TypeScript compiles to dist/src/)
CMD ["node", "dist/src/index.js"]

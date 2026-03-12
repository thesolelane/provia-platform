# ============================================================
# Dockerfile
# Builds the Preferred Builders AI application
# Works on any machine that has Docker installed
# ============================================================

# ── Stage 1: Build the React frontend ───────────────────────
FROM node:20-alpine AS client-build

WORKDIR /build

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ── Stage 2: Production image ───────────────────────────────
FROM node:20-alpine

# Install Chromium for PDF generation (Puppeteer)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Tell Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY server/ ./server/
COPY config/ ./config/
COPY scripts/ ./scripts/
COPY knowledge-base/ ./knowledge-base/

# Copy the built React frontend from Stage 1
COPY --from=client-build /build/build ./client/build/

# Create required directories
RUN mkdir -p data uploads outputs

# Non-root user for security
RUN addgroup -g 1001 -S pbuser && \
    adduser -S -u 1001 -G pbuser pbuser && \
    chown -R pbuser:pbuser /app

USER pbuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server/index.js"]

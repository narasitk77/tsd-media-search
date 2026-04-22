# ── Stage 1: install dependencies ────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ── Stage 2: production image ─────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Copy installed modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy app source
COPY . .

# Install su-exec for privilege dropping after volume permission fix
RUN apk add --no-cache su-exec

# data/ directory writable by node user (built-in in node:alpine)
RUN mkdir -p data && chown -R node:node /app

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "app.js"]

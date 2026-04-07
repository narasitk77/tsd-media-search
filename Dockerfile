# ── Stage 1: install dependencies ────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: production image ─────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy installed modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy app source
COPY . .

# data/ holds activity.log and changelog.json
# Make the directory writable by appuser
RUN mkdir -p data && chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "app.js"]

# ── Secure Chat – API Server ──────────────────────────────────────────────────
FROM node:22-alpine

# Create a non-root user to run the process
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Install production dependencies first (layer-cached when code changes)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source
COPY . .

# Ensure uploads directory exists and is owned by the app user
RUN mkdir -p uploads/profile-pictures && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["node", "server.js"]

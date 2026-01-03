FROM node:20-slim AS builder

WORKDIR /app

# Set npm to be more patient with slow networks
RUN npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5

# Enable corepack (built-in to Node)
RUN corepack enable

# Install dependencies
COPY package.json ./
# If pnpm-lock.yaml exists, use it for faster, deterministic builds
COPY pnpm-lock.yaml* ./
RUN pnpm install $([ -f pnpm-lock.yaml ] && echo "--frozen-lockfile" || echo "")

# Copy source
COPY . .

# Build
RUN pnpm run build
# Prune dev dependencies to keep image small
RUN pnpm prune --prod

# Final stage
FROM node:20-slim

WORKDIR /app

# Copy built artifacts and production deps
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Environment variables
ENV NODE_ENV=production

# Expose stdio for MCP
CMD ["node", "build/index.js"]

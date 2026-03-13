# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY app/package*.json ./
RUN npm install --only=production

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only production dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY app/ ./

# Remove dev files
RUN rm -f nodemon.json .env* *.test.js

# Set ownership
RUN chown -R appuser:appgroup /app
USER appuser

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Use exec form to ensure SIGTERM is received by the Node process
CMD ["node", "index.js"]

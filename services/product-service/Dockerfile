# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY app/package*.json ./
RUN npm install --only=production

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/node_modules ./node_modules
COPY app/ ./
RUN rm -f nodemon.json .env* *.test.js
RUN chown -R appuser:appgroup /app
USER appuser

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "index.js"]

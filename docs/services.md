# Microservices API Reference

Both services are accessible via the NGINX Ingress Controller at `api.example.com`.

---

## User Service

**Base URL:** `http://api.example.com/users`  
**Port (internal):** `3000`  
**Namespace:** `app`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users/health` | Health check (used by Kubernetes probes) |
| `GET` | `/users` | List all users |
| `GET` | `/users/:id` | Get user by MongoDB ID |
| `POST` | `/users` | Create a new user |
| `DELETE` | `/users/:id` | Delete a user |

### POST /users — Request Body

```json
{
  "name": "Alice Smith",
  "email": "alice@example.com",
  "role": "user"
}
```

**Fields:**
- `name` (required) — display name
- `email` (required) — unique email address
- `role` (optional, default `user`) — `user` or `admin`

### Example Responses

#### GET /users/health
```json
{ "status": "ok", "service": "user-service", "db": "connected" }
```

#### GET /users
```json
{
  "service": "user-service",
  "count": 2,
  "data": [
    { "_id": "65a1...", "name": "Alice", "email": "alice@example.com", "role": "user", "createdAt": "..." }
  ]
}
```

#### POST /users — 201 Created
```json
{ "service": "user-service", "data": { "_id": "...", "name": "Alice", ... } }
```

---

## Product Service

**Base URL:** `http://api.example.com/products`  
**Port (internal):** `3001`  
**Namespace:** `app`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/products/health` | Health check |
| `GET` | `/products` | List all products (optional `?category=` filter) |
| `GET` | `/products/:id` | Get product by ID |
| `POST` | `/products` | Create a product |
| `PUT` | `/products/:id` | Update a product |
| `DELETE` | `/products/:id` | Delete a product |

### POST /products — Request Body

```json
{
  "name": "Widget Pro",
  "price": 29.99,
  "description": "High-quality widget",
  "stock": 150,
  "category": "hardware"
}
```

---

## Building & Pushing Docker Images

```bash
# Build images
docker build -t your-registry/user-service:1.0.0 ./services/user-service
docker build -t your-registry/product-service:1.0.0 ./services/product-service

# Push to registry
docker push your-registry/user-service:1.0.0
docker push your-registry/product-service:1.0.0
```

Then update `image:` in each `k8s/deployment.yaml` to match your registry URL.

## Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `PORT` | HTTP listen port | ConfigMap |
| `NODE_ENV` | Node environment | ConfigMap |
| `MONGO_URI` | Full MongoDB connection string | Secret |

## Rolling Updates

```bash
# Update image tag
kubectl set image deployment/user-service \
  user-service=your-registry/user-service:1.1.0 \
  -n app

# Monitor rollout
kubectl rollout status deployment/user-service -n app

# Rollback if needed
kubectl rollout undo deployment/user-service -n app
```

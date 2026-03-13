# MongoDB — Database Setup

## Design

MongoDB runs as a **StatefulSet** to provide:
- Stable pod identity (`mongodb-0`, `mongodb-1`, ...)
- Stable DNS: `mongodb-0.mongodb-headless.app.svc.cluster.local`
- Ordered start/stop
- Persistent volumes via `volumeClaimTemplates`

---

## Storage on Bare Metal

### Option 1: Local Storage (this repo — lab/learning)

```
PersistentVolume → /mnt/data/mongodb on worker-node-1
```

Pros: Simple, fast  
Cons: Not portable — data is tied to one node

**Before deploying, create the directory on your worker node:**
```bash
ssh worker-node-1 'sudo mkdir -p /mnt/data/mongodb'
kubectl apply -f database/storageclass.yaml
kubectl apply -f database/persistentvolume.yaml
```

### Option 2: Longhorn (recommended for learning multi-node)

Longhorn provides a cloud-native distributed storage system for Kubernetes:
```bash
kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.6.0/deploy/longhorn.yaml
# Then update storageClassName: longhorn in statefulset.yaml
```

### Option 3: NFS

```yaml
# In statefulset.yaml volumeClaimTemplates:
storageClassName: nfs-client
```

---

## Connecting to MongoDB

### From Inside the Cluster

Use the connection string from the Secret:
```
mongodb://admin:<password>@mongodb.app.svc.cluster.local:27017/proddb?authSource=admin
```

The microservices pick this up from the `mongodb-secret`:
```yaml
env:
  - name: MONGO_URI
    valueFrom:
      secretKeyRef:
        name: mongodb-secret
        key: mongo-uri
```

### From Your Laptop (port-forward)

```bash
kubectl port-forward svc/mongodb 27017:27017 -n app
# Then connect with mongosh or MongoDB Compass
mongosh "mongodb://admin:Str0ngP@ssw0rd!@localhost:27017/proddb?authSource=admin"
```

---

## Changing Credentials

1. Generate new Base64 values:
```bash
echo -n 'newpassword' | base64
```

2. Update `database/secret.yaml` with new values
3. Apply: `kubectl apply -f database/secret.yaml`
4. Restart deployments to pick up new secret:
```bash
kubectl rollout restart deployment/user-service deployment/product-service -n app
```

---

## Backup & Restore

### Backup

```bash
# Port-forward, then run mongodump
kubectl port-forward svc/mongodb 27017:27017 -n app &
mongodump --uri="mongodb://admin:Str0ngP@ssw0rd!@localhost:27017/proddb?authSource=admin" --out=./backup/$(date +%Y%m%d)
```

### Restore

```bash
mongorestore --uri="mongodb://admin:Str0ngP@ssw0rd!@localhost:27017/?authSource=admin" ./backup/20240101/
```

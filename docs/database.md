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

# MongoDB —# Stateful Workloads & Persistence: MongoDB

Running databases in Kubernetes requires a different approach than stateless microservices. This guide covers how we manage persistence and data safety.

---

## 💾 The Storage Hierarchy: PV vs. PVC

Kubernetes decouples storage from the pod using two main objects:

1.  **PersistentVolume (PV)**: The "Physical" storage. It represents a piece of storage in the cluster (e.g., a local disk, an NFS mount, or a cloud volume like AWS EBS). It is a cluster-level resource.
2.  **PersistentVolumeClaim (PVC)**: The "Request" for storage. A pod doesn't talk to a PV directly; it submits a PVC. Kubernetes then "binds" a matching PV to that PVC.

**Analogy**: A PV is like a **hard drive** sitting on a shelf. A PVC is a **request** for a 10GB drive. Kubernetes takes the drive off the shelf and plugs it into your server (Pod).

---

## 🏗️ StorageClasses in Production

In a production environment, we use **StorageClasses** to enable "Dynamic Provisioning". 

*   **Bare Metal**: We use `local-storage` for high performance, but this ties the pod to a specific physical node.
*   **Kind (Local)**: We use the `standard` StorageClass which uses the underlying Docker volume driver.
*   **Distributed Storage**: For high availability, tools like **Longhorn** or **Ceph (Rook)** provide storage that can "move" between nodes if one fails.

---

## 🔒 StatefulSet: Why not a Deployment?

We use a **StatefulSet** for MongoDB because:
*   **Sticky Identity**: Pods are named `mongodb-0`, `mongodb-1`, etc. This name never changes, which is vital for database clustering.
*   **Stable Storage**: Even if a pod is deleted and recreated, it will always reconnect to the exact same PVC it had before.
*   **Ordered Deployment**: In a replica set, pods are started and stopped one-by-one in order.

---

## 🛡️ Backup & Disaster Recovery

A database in Kubernetes is only as good as its backups. Here is our recommended strategy:

### 1. Database-Native Backups (`mongodump`)
Run a CronJob inside the cluster that executes weekly/daily:
```bash
kubectl run mongo-backup --image=mongo:7.0 --rm -it -n app -- \
  mongodump --uri="mongodb://admin:SECRET@mongodb:27017/proddb" --archive=/backup/db.archive
```

### 2. Volume Snapshots
If your StorageClass supports it, use **VolumeSnapshots** to take instant, crash-consistent copies of the entire underlying disk.

### 3. Off-site Sync
Always ship your `.archive` or snapshot files to a different physical location (e.g., S3, a different server, or a NAS) to protect against total datacenter failure.

---

## 🚀 Performance Tuning
For production MongoDB, we set:
*   **WiredTiger Cache**: Configured to use 50-60% of the pod's memory limit.
*   **Transparent Huge Pages (THP)**: Should be disabled on the host nodes to prevent memory latency issues.

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

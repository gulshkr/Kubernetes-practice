# Troubleshooting Guide

A collection of debugging techniques and common issues for this Kubernetes stack.

---

## Essential kubectl Commands

### Cluster Health

```bash
# Check all nodes
kubectl get nodes -o wide

# Check system pods (all should be Running)
kubectl get pods -n kube-system

# Check events across all namespaces (most recent first)
kubectl get events --all-namespaces --sort-by='.lastTimestamp' | tail -30
```

### Pod Debugging

```bash
# Get pod status across all app namespaces
kubectl get pods -n app -o wide
kubectl get pods -n logging -o wide

# Describe a pod (shows events, probe failures, node assignment)
kubectl describe pod <pod-name> -n app

# Get logs from a pod
kubectl logs <pod-name> -n app
kubectl logs <pod-name> -n app -f        # follow
kubectl logs <pod-name> -n app --previous  # previous crashed instance

# Get logs from all pods matching a label
kubectl logs -l app=user-service -n app --all-containers

# Open a shell in a running pod
kubectl exec -it <pod-name> -n app -- /bin/sh
```

---

## Common Issues

### Pods stuck in `Pending`

```bash
kubectl describe pod <pod-name> -n app
# Look in Events section for:
# "0/2 nodes are available: 2 node(s) didn't match Pod's node affinity"
# → Fix: Update PV nodeAffinity to match actual hostname
# "Insufficient memory/cpu"
# → Fix: Lower resource requests or add more nodes
```

### Pods stuck in `CrashLoopBackOff`

```bash
# Check why it crashed
kubectl logs <pod-name> -n app --previous
# Case A: MongoDB connection refused → check MongoDB is running
# Case B: "getaddrinfo ENOTFOUND" or URI parsing error → check special characters in password
```

> [!IMPORTANT]
> **Special Characters in Passwords**: Characters like `@` or `!` in the MongoDB password can break the connection string parser.
> If your password is `P@ssword!`, the URI parser might think the hostname starts after the `@`.
> **Fix**: either URL-encode the characters or use a alphanumeric password for the root secret.

```bash
# Check if Secret has correct values
kubectl get secret mongodb-secret -n app -o yaml
```

---

## Docker & Build Issues

### `npm ci` fails with "package-lock.json missing"
- **Reason**: `npm ci` is designed for CI/CD and *requires* a lockfile for deterministic builds.
- **Fix**: Use `npm install --only=production` if a lockfile hasn't been generated yet, or run `npm install` locally first to create the lockfile.

### `ENOENT: no such file or directory /app/package.json`
- **Reason**: The Docker build context doesn't match the `COPY` commands.
- **Example**: If your code is in a subfolder named `app/` but the Dockerfile sits in the root, you must use `COPY app/package*.json ./`.

---

### MongoDB Connection Issues

```bash
# Test MongoDB connectivity from inside the cluster
kubectl run mongo-test --image=mongo:7.0 --rm -it -n app -- \
  mongosh "mongodb://admin:Str0ngP@ssw0rd\!@mongodb.app.svc.cluster.local:27017/proddb?authSource=admin" \
  --eval "db.adminCommand('ping')"

# Check MongoDB pod is healthy
kubectl describe statefulset mongodb -n app
kubectl logs mongodb-0 -n app
```

### Ingress Not Routing (or "Connection Aborted")

**Special Case: `kind` (Kubernetes in Docker)**
In a `kind` cluster, your host port (80) is typically mapped to the **Control Plane** node only. If the Ingress Controller pod is scheduled to a **Worker** node, the traffic will hit the control plane but there will be no listener on that specific node's port 80.

**Fix**: Patch the Ingress Controller to run on the control-plane:
```bash
kubectl patch deployment ingress-nginx-controller -n ingress-nginx \
  -p '{"spec":{"template":{"spec":{"nodeSelector":{"ingress-ready":"true"}}}}}'
```

**General Diagnostics**:
```bash
# Check Ingress resource
kubectl describe ingress app-ingress -n app

# Check NGINX Ingress Controller pods
kubectl get pods -n ingress-nginx

# Check MetalLB assigned an IP
kubectl get svc ingress-nginx-controller -n ingress-nginx

# Check NGINX logs
kubectl logs -l app.kubernetes.io/name=ingress-nginx -n ingress-nginx --tail=50
```

### Elasticsearch Not Starting

```bash
kubectl describe statefulset elasticsearch -n logging
kubectl logs elasticsearch-0 -n logging

# Common issue: vm.max_map_count too low on the node
# Check init container logs
kubectl logs elasticsearch-0 -n logging -c increase-vm-max-map-count

# On the node directly
sysctl vm.max_map_count  # Should be 262144
```

### Filebeat Not Shipping Logs

```bash
# Check Filebeat is running on every node
kubectl get pods -n logging -l app=filebeat -o wide

# Check Filebeat logs
kubectl logs -l app=filebeat -n logging --tail=50

# Check Logstash is receiving events
kubectl logs -l app=logstash -n logging --tail=50

# Count documents in Elasticsearch
kubectl port-forward svc/elasticsearch 9200:9200 -n logging &
curl 'http://localhost:9200/_cat/indices?v&index=k8s-logs-*'
```

---

## Useful One-liners

```bash
# Watch all pods in real-time
watch kubectl get pods -A

# Get all pod resource usage
kubectl top pods -A

# Check HPA scaling decisions
kubectl describe hpa user-service-hpa -n app

# Force restart a deployment
kubectl rollout restart deployment/user-service -n app

# Delete a stuck pod (it will be recreated by the Deployment)
kubectl delete pod <pod-name> -n app

# Check NetworkPolicy is applying correctly
kubectl describe networkpolicy default-deny-ingress -n app

# Tail logs from all ELK components at once
kubectl logs -l 'app in (elasticsearch,logstash,kibana,filebeat)' -n logging --follow
```

---

## Port Forwarding for Local Access

```bash
# MongoDB
kubectl port-forward svc/mongodb 27017:27017 -n app

# Elasticsearch (REST API)
kubectl port-forward svc/elasticsearch 9200:9200 -n logging

# Kibana
kubectl port-forward svc/kibana 5601:5601 -n logging
# Open: http://localhost:5601

# User Service
kubectl port-forward svc/user-service 8080:80 -n app
# Test: curl http://localhost:8080/health

# Product Service
kubectl port-forward svc/product-service 8081:80 -n app
# Test: curl http://localhost:8081/health
```

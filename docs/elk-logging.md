# ELK Stack — Centralised Logging

## Overview

The ELK stack (Elasticsearch + Logstash + Kibana) provides a centralised logging solution. **Filebeat** runs as a DaemonSet on every node and ships logs automatically.

## Log Flow

```
Node.js stdout/stderr
    ↓
/var/log/containers/<pod-id>.log       (written by kubelet)
    ↓
Filebeat DaemonSet                      (reads and ships)
    ↓ beats protocol (port 5044)
Logstash                                (parse, enrich, filter)
    ↓ HTTP
Elasticsearch                           (store logs)
    ↓
Kibana                                  (search & visualise)
```

---

## Component Details

### Elasticsearch

- **Image:** `docker.elastic.co/elasticsearch/elasticsearch:8.12.0`
- **Namespace:** `logging`
- **Storage:** 20Gi PersistentVolume
- **Index pattern:** `k8s-logs-{service-name}-{YYYY.MM.dd}`
- **Access:** `http://elasticsearch.logging.svc.cluster.local:9200`

> ⚠️ **Single-node for learning.** For production, scale to 3 replicas and configure:
> `discovery.seed_hosts: [es-0, es-1, es-2]`  
> `cluster.initial_master_nodes: [es-0, es-1, es-2]`

### Logstash

The pipeline is defined in `elk/logstash/configmap.yaml`:

```
Input: Filebeat (port 5044)
  ↓
Filter:
  - JSON parse (Node.js structured logs)
  - Add kubernetes.* fields to top-level
  - Drop /health endpoint requests
  - Parse @timestamp
Output: Elasticsearch
  - Index: k8s-logs-{service_name}-{YYYY.MM.dd}
```

### Filebeat

Filebeat uses **Kubernetes autodiscover** to dynamically discover pods and tail their logs. Key features:
- Runs on every node (DaemonSet)
- Mounts `/var/log/containers`, `/var/log/pods`, `/var/lib/docker/containers`
- Enriches events with pod labels, namespace, node name
- Only ships logs from the `app` namespace (configurable)

---

## Deploy the ELK Stack

```bash
# 1. Apply RBAC for Filebeat
kubectl apply -f elk/filebeat/rbac.yaml

# 2. Start Elasticsearch first (others depend on it)
kubectl apply -f elk/elasticsearch/
kubectl wait --for=condition=ready pod -l app=elasticsearch -n logging --timeout=120s

# 3. Start Logstash
kubectl apply -f elk/logstash/
kubectl wait --for=condition=ready pod -l app=logstash -n logging --timeout=90s

# 4. Start Kibana
kubectl apply -f elk/kibana/
kubectl wait --for=condition=ready pod -l app=kibana -n logging --timeout=120s

# 5. Start Filebeat
kubectl apply -f elk/filebeat/

# Check all pods
kubectl get pods -n logging
```

---

## Using Kibana

### Access Kibana

```
http://kibana.example.com
```

### Create an Index Pattern

1. Go to **Stack Management → Index Patterns**
2. Click **Create index pattern**
3. Enter: `k8s-logs-*`
4. Set time field: `@timestamp`
5. Click **Create index pattern**

### Useful Searches (KQL)

```
# All logs from user-service
service_name: "user-service"

# All error-level logs
level: "error" or message: "*Error*"

# Logs from a specific pod
pod_name: "user-service-abc123-xyz"

# HTTP 500 errors
status: 500

# Last 15 minutes with errors in app namespace
namespace: "app" and (level: "error" or response_code >= 500)
```

### Checking Elasticsearch Health

```bash
# Port-forward to access locally
kubectl port-forward svc/elasticsearch 9200:9200 -n logging

# Cluster health
curl http://localhost:9200/_cluster/health?pretty

# List all indices
curl http://localhost:9200/_cat/indices?v

# Count documents in an index
curl http://localhost:9200/k8s-logs-user-service-$(date +%Y.%m.%d)/_count
```

# ELK Stack —# Centralized Observability: The ELK Stack

In a distributed system, logging directly to a file is useless. We need a way to aggregate, search, and visualize logs from hundreds of pods in one place.

---

## 🏗️ The Log Pipeline: Step-by-Step

### 1. Filebeat (The Shipper)
Running as a **DaemonSet**, Filebeat ensures an agent is present on every node. 
*   **Harvesting**: It tails the JSON log files created by Docker/containerd.
*   **Backpressure**: If Logstash is slow, Filebeat slows down its reading to prevent crashing the node.

### 2. Logstash (The Processor)
Logstash is where the "magic" happens. Our configuration (`elk/logstash/configmap.yaml`) performs three critical tasks:
*   **JSON Parsing**: It turns the raw log string into searchable JSON fields.
*   **Metadata Enrichment**: It talks to the Kubernetes API to add tags like `kubernetes.pod.name`, `kubernetes.namespace`, and node details to every log entry.
*   **Filtering**: It drops "noise" (e.g., repeating health check logs) to save disk space.

### 3. Elasticsearch (The Storage)
Elasticsearch stores the processed logs. 
*   **Index Sharding**: Logs are stored in daily indices (e.g., `k8s-logs-2024.03.16`). This makes deleting old logs (Index Lifecycle Management) very simple.
*   **Full-Text Search**: Powered by the Lucene engine, it allows for near-instant searching across millions of log lines.

---

## 🚀 Resource Tuning & Stability

ELK is resource-heavy. We've applied specific "Lean K8s" optimizations:

### JVM Heap Management
We explicitly set the Java Heap space (`ES_JAVA_OPTS` and `LS_JAVA_OPTS`) to exactly 50% of the container's RAM limit. 
*   **Reason**: If the Heap is too small, you get `OutOfMemoryError`. If it's too large, the OS might kill the container (OOMKill) because it needs RAM for its own processes.

### Storage Persistence
Elasticsearch is a stateful app. In our setup, it uses a **StatefulSet** with a **PersistentVolume**. If the ES pod restarts, it doesn't lose your history.

---

## 🔍 Using Kibana Like a Pro

1.  **Index Patterns**: Your first step in Kibana is to create an Index Pattern for `k8s-logs-*`.
2.  **Discover**: Use the KQL (Kibana Query Language) to filter:
    *   `kubernetes.namespace : "app"`
    *   `message : "error" AND kubernetes.labels.app : "user-service"`
3.  **Dashboards**: You can build real-time "Error Rate" charts to see if a new deployment is causing issues before users complain.

---

## 🛠️ Maintenance & Debugging

*   **Check pipeline health**: `kubectl logs -l app=logstash -n logging`
*   **Check ES health**: `curl -X GET "elasticsearch:9200/_cluster/health?pretty"` (from inside the cluster)
*   **Cleanup**: Use a CronJob to run a tool like **Curator** to delete logs older than 7 or 14 days.

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

# Local Testing Guide — Using kind on Windows

Test the entire stack locally on Windows using **kind** (Kubernetes IN Docker).  
No VMs, no bare-metal nodes needed.

> ⚠️ **Differences vs Production:**
> - MetalLB is **skipped** — Ingress uses host port-mapping (port 80 on localhost)  
> - StorageClass is `standard` (kind built-in) instead of `local-storage`  
> - Docker images are built locally and loaded into kind (no registry needed)  
> - Elasticsearch uses reduced Java heap to work on a laptop

---

## Prerequisites — Install These First

Open **PowerShell as Administrator** and run:

```powershell
# 1. Install Chocolatey (Windows package manager) if not already installed
Set-ExecutionPolicy Bypass -Scope Process -Force; `
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; `
  iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 2. Install Docker Desktop, kind, and kubectl
choco install docker-desktop -y
choco install kind -y
choco install kubernetes-cli -y

# 3. Restart PowerShell after install, then verify
docker --version
kind --version
kubectl version --client
```

> After installing Docker Desktop, make sure it's running before continuing.

---

## Step 1 — Create the kind Cluster

```powershell
# Navigate to your project
cd "C:\Users\Nuaav01\Desktop\Personal\Kubernetes-practice"

# Create the 3-node cluster (1 control-plane + 2 workers)
kind create cluster --config cluster\kind-config.yaml

# Verify nodes are Ready (takes ~2 minutes)
kubectl get nodes

# Expected output:
# NAME                         STATUS   ROLES           AGE   VERSION
# k8s-practice-control-plane   Ready    control-plane   2m    v1.29.x
# k8s-practice-worker          Ready    <none>          2m    v1.29.x
# k8s-practice-worker2         Ready    <none>          2m    v1.29.x
```

---

## Step 2 — Install NGINX Ingress Controller (kind-specific)

```powershell
# kind has its own Ingress build — use this instead of the baremetal manifest
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# Wait for Ingress controller to be ready
kubectl wait --namespace ingress-nginx `
  --for=condition=ready pod `
  --selector=app.kubernetes.io/component=controller `
  --timeout=120s

# Verify
kubectl get pods -n ingress-nginx
```

---

## Step 3 — Create Namespaces and RBAC

```powershell
kubectl apply -f namespaces\namespaces.yaml
kubectl apply -f rbac\roles.yaml

# Verify
kubectl get namespaces
# Should show: app, logging, monitoring (plus kube-system etc.)
```

---

## Step 4 — Deploy MongoDB

```powershell
# Secret first
kubectl apply -f database\secret.yaml

# Deploy the headless + ClusterIP services
kubectl apply -f database\service.yaml

# Use the kind-compatible StatefulSet (uses 'standard' StorageClass, not local-storage)
kubectl apply -f database\statefulset-local.yaml

# Wait for MongoDB to be ready (takes ~60s)
kubectl rollout status statefulset/mongodb -n app --timeout=120s

# Verify pod is Running
kubectl get pods -n app

# Quick health check from inside the cluster
kubectl exec -n app mongodb-0 -- mongosh --eval "db.adminCommand('ping')" --quiet
# Expected: { ok: 1 }
```

---

## Step 5 — Build Docker Images & Load Into kind

```powershell
# Build User Service image
docker build -t user-service:local .\services\user-service

# Build Product Service image  
docker build -t product-service:local .\services\product-service

# Load both images into the kind cluster (no registry needed!)
kind load docker-image user-service:local --name k8s-practice
kind load docker-image product-service:local --name k8s-practice

# Verify images are available
docker exec k8s-practice-control-plane crictl images | Select-String "service"
```

---

## Step 6 — Deploy Microservices

```powershell
# Apply ConfigMaps
kubectl apply -f services\user-service\k8s\configmap.yaml
kubectl apply -f services\product-service\k8s\configmap.yaml

# Patch the deployment YAML to use local image names (imagePullPolicy: Never)
# This tells Kubernetes to use the locally loaded image, not try to pull from a registry
kubectl apply -f services\user-service\k8s\deployment.yaml
kubectl apply -f services\product-service\k8s\deployment.yaml

# IMPORTANT: Patch image name and pull policy for local testing
# We use escaped quotes for Windows PowerShell compatibility
kubectl set image deployment/user-service user-service=user-service:local -n app
kubectl set image deployment/product-service product-service=product-service:local -n app
kubectl patch deployment user-service -n app -p '{\"spec\":{\"template\":{\"spec\":{\"containers\":[{\"name\":\"user-service\",\"imagePullPolicy\":\"Never\"}]}}}}'
kubectl patch deployment product-service -n app -p '{\"spec\":{\"template\":{\"spec\":{\"containers\":[{\"name\":\"product-service\",\"imagePullPolicy\":\"Never\"}]}}}}'

# Deploy Services
kubectl apply -f services\user-service\k8s\service.yaml
kubectl apply -f services\product-service\k8s\service-hpa.yaml

# Wait for deployments
kubectl rollout status deployment/user-service -n app --timeout=120s
kubectl rollout status deployment/product-service -n app --timeout=120s

# Verify both services Running
kubectl get pods -n app
```

---

## Step 7 — Apply Ingress Rules

```powershell
kubectl apply -f networking\ingress\app-ingress.yaml

# CRITICAL: Patch Ingress Controller to run on the control-plane node
# In kind, port 80/443 mapping is tied to the control-plane node.
kubectl patch deployment ingress-nginx-controller -n ingress-nginx `
  -p '{\"spec\":{\"template\":{\"spec\":{\"nodeSelector\":{\"ingress-ready\":\"true\"}}}}}'

# Verify Ingress is configured
kubectl get ingress -n app
kubectl describe ingress app-ingress -n app
```

---

## Step 8 — Configure /etc/hosts (Windows hosts file)

```powershell
# Open hosts file as Administrator and add these lines:
notepad C:\Windows\System32\drivers\etc\hosts
```

Add these lines at the bottom:
```
127.0.0.1  api.example.com
127.0.0.1  kibana.example.com
```

---

## Step 9 — Test the APIs

Open a **new PowerShell** window and run:

```powershell
# ── User Service Tests ──────────────────────────────────────────────────────

# Health check
curl http://api.example.com/users/health
# Expected: {"status":"ok","service":"user-service","db":"connected"}

# Create a user
curl -X POST http://api.example.com/users `
  -H "Content-Type: application/json" `
  -d '{"name":"Alice Smith","email":"alice@example.com","role":"admin"}'

# Create another user
curl -X POST http://api.example.com/users `
  -H "Content-Type: application/json" `
  -d '{"name":"Bob Jones","email":"bob@example.com"}'

# List all users
curl http://api.example.com/users

# ── Product Service Tests ────────────────────────────────────────────────────

# Health check
curl http://api.example.com/products/health
# Expected: {"status":"ok","service":"product-service","db":"connected"}

# Create a product
curl -X POST http://api.example.com/products `
  -H "Content-Type: application/json" `
  -d '{"name":"Widget Pro","price":29.99,"stock":100,"category":"hardware"}'

# Create another product
curl -X POST http://api.example.com/products `
  -H "Content-Type: application/json" `
  -d '{"name":"Blue Notebook","price":4.99,"stock":500,"category":"stationery"}'

# List all products
curl http://api.example.com/products

# Filter by category
curl "http://api.example.com/products?category=hardware"
```

---

## Step 10 — Deploy ELK Stack (Optional — Resource Heavy)

> ⚠️ Requires at least **16GB RAM** on your machine. If you have less, skip this and use port-forward to check logs directly.

```powershell
# Deploy Filebeat RBAC
kubectl apply -f elk\filebeat\rbac.yaml

# Deploy Elasticsearch (reduced heap for local)
kubectl apply -f elk\elasticsearch\statefulset.yaml

# Wait for Elasticsearch (can take 3-5 minutes)
kubectl rollout status statefulset/elasticsearch -n logging --timeout=300s

# Deploy Logstash
kubectl apply -f elk\logstash\configmap.yaml
kubectl apply -f elk\logstash\deployment.yaml

# Deploy Kibana
kubectl apply -f elk\kibana\deployment.yaml

# Deploy Filebeat
kubectl apply -f elk\filebeat\configmap.yaml
kubectl apply -f elk\filebeat\daemonset.yaml

# Check all ELK pods
kubectl get pods -n logging

# Apply Kibana ingress
kubectl apply -f networking\ingress\app-ingress.yaml

# Test Elasticsearch (port-forward)
kubectl port-forward svc/elasticsearch 9200:9200 -n logging
# In a new terminal:
curl http://localhost:9200/_cluster/health?pretty

# Access Kibana in browser
Start-Process "http://kibana.example.com"
```

---

## Useful Debugging Commands

```powershell
# Watch all pods live
kubectl get pods -A -w

# Check pod logs
kubectl logs -l app=user-service -n app
kubectl logs -l app=product-service -n app

# Describe a pod if it's not starting
kubectl describe pod -l app=user-service -n app

# Check Ingress events
kubectl describe ingress app-ingress -n app

# Check all Kubernetes events
kubectl get events -n app --sort-by='.lastTimestamp'

# Shell into the user-service pod
kubectl exec -it -n app deploy/user-service -- /bin/sh

# Shell into MongoDB and query
kubectl exec -it -n app mongodb-0 -- mongosh `
  "mongodb://admin:K8sPassword123@localhost:27017/proddb?authSource=admin"

# Port-forward individual services (bypasses Ingress)
kubectl port-forward svc/user-service 8080:80 -n app
kubectl port-forward svc/product-service 8081:80 -n app
kubectl port-forward svc/mongodb 27017:27017 -n app
```

---

## Cleanup

```powershell
# Delete the entire cluster when done
kind delete cluster --name k8s-practice

# Remove hosts file entries manually (open notepad as admin)
notepad C:\Windows\System32\drivers\etc\hosts
```

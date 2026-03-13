# Getting Started — Bare Metal Cluster Setup

This guide walks you through setting up a production-grade Kubernetes cluster on bare-metal servers using **kubeadm** and **Calico**.

## Prerequisites

### Hardware Requirements
| Node | Role | Minimum Specs |
|------|------|---------------|
| `control-plane` | Control plane | 2 vCPU, 4GB RAM, 40GB disk |
| `worker-node-1` | Worker | 4 vCPU, 8GB RAM, 100GB disk |
| `worker-node-2` | Worker | 4 vCPU, 8GB RAM, 100GB disk |

### Software Requirements (all nodes)
- Ubuntu 22.04 LTS
- Static IP addresses assigned
- All nodes can reach each other on the network
- Ports opened: 6443, 2379-2380, 10250-10252, 30000-32767

---

## Step 1 — Prepare All Nodes

Run on **every node** (control-plane + workers):

```bash
# Disable swap (Kubernetes requires this)
sudo swapoff -a
sudo sed -i '/ swap / s/^/#/' /etc/fstab

# Load kernel modules for networking
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF
sudo modprobe overlay
sudo modprobe br_netfilter

# Set sysctl params for networking
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sudo sysctl --system
```

---

## Step 2 — Install containerd

```bash
# Install containerd runtime
sudo apt-get update
sudo apt-get install -y containerd

# Configure containerd with SystemdCgroup
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
sudo systemctl restart containerd
sudo systemctl enable containerd
```

---

## Step 3 — Install kubeadm, kubelet, kubectl

```bash
# Add Kubernetes apt repository
sudo apt-get install -y apt-transport-https ca-certificates curl gpg
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.29/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.29/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list

sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl
sudo systemctl enable kubelet
```

---

## Step 4 — Initialize the Control Plane

Run on the **control-plane node only**:

```bash
# Edit the config first — update advertiseAddress to your control-plane IP
nano cluster/kubeadm-config.yaml

# Initialize the cluster
sudo kubeadm init --config cluster/kubeadm-config.yaml

# Set up kubeconfig for your user
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

---

## Step 5 — Install Calico CNI

```bash
# Download fresh Calico manifest
curl https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml -O

# Patch CIDR to match kubeadm-config.yaml podSubnet
sed -i 's|# - name: CALICO_IPV4POOL_CIDR|  - name: CALICO_IPV4POOL_CIDR|' calico.yaml
sed -i 's|#   value: "192.168.0.0/16"|    value: "10.244.0.0/16"|' calico.yaml

kubectl apply -f calico.yaml

# Verify all nodes become Ready (may take 2-3 minutes)
kubectl get nodes -w
```

---

## Step 6 — Join Worker Nodes

Run the join command from the kubeadm init output on each worker:

```bash
# Get a fresh token if needed (on control-plane)
kubeadm token create --print-join-command

# On each worker node
sudo kubeadm join 192.168.1.100:6443 \
  --token <your-token> \
  --discovery-token-ca-cert-hash sha256:<your-hash>
```

---

## Step 7 — Install MetalLB

```bash
# Install MetalLB
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.3/config/manifests/metallb-native.yaml

# Wait for MetalLB pods to be ready
kubectl wait --namespace metallb-system \
  --for=condition=ready pod \
  --selector=app=metallb \
  --timeout=90s

# Apply IP pool config (edit the IP range first!)
nano networking/metallb/metallb-config.yaml
kubectl apply -f networking/metallb/metallb-config.yaml
```

---

## Step 8 — Install NGINX Ingress Controller

```bash
# Install controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.6/deploy/static/provider/baremetal/deploy.yaml

# Patch to use LoadBalancer (gets IP from MetalLB)
kubectl patch svc ingress-nginx-controller \
  -n ingress-nginx \
  -p '{"spec":{"type":"LoadBalancer"}}'

# Apply custom config
kubectl apply -f networking/ingress-controller/ingress-nginx.yaml

# Verify EXTERNAL-IP is assigned
kubectl get svc ingress-nginx-controller -n ingress-nginx
```

---

## Step 9 — Deploy the Application Stack

```bash
# 1. Namespaces
kubectl apply -f namespaces/

# 2. RBAC
kubectl apply -f rbac/

# 3. Create local directory for MongoDB PV on your worker node
ssh worker-node-1 'sudo mkdir -p /mnt/data/mongodb'

# 4. Database
kubectl apply -f database/

# 5. Microservices
kubectl apply -f services/user-service/k8s/
kubectl apply -f services/product-service/k8s/

# 6. ELK Stack
kubectl apply -f elk/filebeat/rbac.yaml
kubectl apply -f elk/elasticsearch/
kubectl apply -f elk/logstash/
kubectl apply -f elk/kibana/
kubectl apply -f elk/filebeat/

# 7. Networking rules and Ingress
kubectl apply -f networking/network-policy/
kubectl apply -f networking/ingress/

# 8. Verify everything is running
kubectl get all -n app
kubectl get all -n logging
```

---

## Step 10 — Test the Setup

```bash
# Get Ingress IP
INGRESS_IP=$(kubectl get svc ingress-nginx-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Add to /etc/hosts (or configure DNS)
echo "$INGRESS_IP api.example.com kibana.example.com" | sudo tee -a /etc/hosts

# Test user service
curl http://api.example.com/users/health
curl -X POST http://api.example.com/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alice","email":"alice@example.com"}'
curl http://api.example.com/users

# Test product service
curl http://api.example.com/products/health
curl -X POST http://api.example.com/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Widget","price":9.99,"stock":100}'

# Access Kibana
open http://kibana.example.com
```

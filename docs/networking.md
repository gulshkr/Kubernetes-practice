# Networking — Ingress, MetalLB, DNS, TLS

## Overview

```
Internet
   │
   ▼
MetalLB LoadBalancer IP (192.168.1.200-250)
   │
# Production Networking & Security

Kubernetes networking on bare-metal requires careful planning for external access and internal isolation. This guide explains our "Defense in Depth" strategy.

---

## 🚦 External Traffic: The NGINX Ingress Controller

While MetalLB provides the IP address, the **NGINX Ingress Controller** acts as the intelligent director for all HTTP/HTTPS traffic.

### Why NGINX?
*   **Layer 7 Routing**: It routes traffic based on the domain name (`api.example.com`) and the URL path (`/users`).
*   **CORS Management**: We've configured global CORS policies to allow frontend applications to safely call the API.
*   **Rate Limiting**: Protects your services from "noisy" clients or DDoS attempts at the edge.

### Ingress Lifecycle
1.  **Ingress Resource**: You define a rule in YAML (e.g., `networking/ingress/app-ingress.yaml`).
2.  **Controller Sync**: NGINX watches the Kubernetes API and automatically rebuilds its `nginx.conf` when rules change.
3.  **Traffic Admission**: NGINX terminates the connection and proxies it to the service inside the cluster.

---

## 🛡️ Internal Security: NetworkPolicies

By default, every pod in Kubernetes can talk to every other pod. In a production cluster, this is a security risk. We use **NetworkPolicies** to enforce "Zero Trust".

### Our Strategy: Default Deny
We apply a policy that blocks ALL ingress traffic to our namespaces, then we selectively "punch holes" for allowed traffic:

| Policy | Allowed Source | Allowed Destination | Reason |
| :--- | :--- | :--- | :--- |
| **Ingress Allow** | NGINX Controller | Microservices | Allow external API calls. |
| **DB Access** | Microservices | MongoDB | Allow apps to query the database. |
| **Log Shippings** | Microservices | Logstash | Allow apps to send logs. |

**Important**: Calico (the CNI) is responsible for actually blocking the packets at the Linux kernel level.

---

## 🔒 SSL/TLS & Certificates

For production, all traffic MUST be encrypted (HTTPS).

### The Recommendation: cert-manager
While not included in this repo to keep it lightweight, the standard way to handle TLS in Kubernetes is **cert-manager**.
*   **Let's Encrypt**: Automatically issues free SSL certificates.
*   **Rotation**: Automatically renews certificates before they expire.
*   **Usage**: You simply add an annotation to your Ingress resource: `cert-manager.io/cluster-issuer: letsencrypt-prod`.

---

## 📡 DNS for Bare-Metal

Since we are on bare-metal, you have three options for DNS:

1.  **Public DNS**: Point `api.yourdomain.com` to your node's physical IP (or MetalLB VIP).
2.  **Local DNS Server**: Use a tool like **Pi-hole** or **CoreDNS** on your LAN to point names to IPs.
3.  **Local Hosts File**: (For testing) Update `/etc/hosts` or `C:\Windows\System32\drivers\etc\hosts`.
```

---

## MetalLB

MetalLB gives Kubernetes `LoadBalancer` services real, reachable IP addresses on bare metal. In **L2 mode**, it responds to ARP requests for the allocated IP from the node that owns the service.

### Install

```bash
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.3/config/manifests/metallb-native.yaml
```

### Configure IP Pool

Edit `networking/metallb/metallb-config.yaml` and update the IP range to match **your** LAN:
```yaml
addresses:
  - 192.168.1.200-192.168.1.250
```

Apply:
```bash
kubectl apply -f networking/metallb/metallb-config.yaml
```

---

## NGINX Ingress Controller

### Install

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.6/deploy/static/provider/baremetal/deploy.yaml
kubectl patch svc ingress-nginx-controller -n ingress-nginx -p '{"spec":{"type":"LoadBalancer"}}'
```

### Verify External IP

```bash
kubectl get svc ingress-nginx-controller -n ingress-nginx
# NAME                      TYPE           CLUSTER-IP     EXTERNAL-IP      PORT(S)
```

### Useful Annotations

| Annotation | Purpose |
|-----------|---------|
| `nginx.ingress.kubernetes.io/rewrite-target: /$2` | Strip path prefix |
| `nginx.ingress.kubernetes.io/limit-rps: "100"` | Rate limit per IP |
| `nginx.ingress.kubernetes.io/enable-cors: "true"` | Enable CORS headers |
| `nginx.ingress.kubernetes.io/whitelist-source-range: "x.x.x.x/32"` | IP allowlist |

---

## DNS Setup

### Development (/etc/hosts)

```bash
# Get IP
INGRESS_IP=$(kubectl get svc ingress-nginx-controller -n ingress-nginx \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Add entries
echo "$INGRESS_IP api.example.com kibana.example.com" | sudo tee -a /etc/hosts
```

### Production (Real DNS)

Add A records pointing your domain to the MetalLB IP:
```
api.example.com     A  192.168.1.200
kibana.example.com  A  192.168.1.200
```

---

## TLS with cert-manager (Production)

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml

# Create a ClusterIssuer for Let's Encrypt
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your@email.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

Then add to your Ingress:
```yaml
annotations:
  cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts: ["api.example.com"]
    secretName: api-tls
```

---

## NetworkPolicies

### Policy Summary

| Policy | Namespace | Effect |
|--------|-----------|--------|
| `default-deny-ingress` | app | Block all ingress by default |
| `allow-ingress-to-services` | app | Allow traffic from NGINX only |
| `allow-app-to-mongodb` | app | Only user/product-service → MongoDB |
| `allow-app-egress-to-logstash` | app | Only app pods → Logstash port 5044 |
| `allow-logstash-kibana-to-elasticsearch` | logging | Only ES clients → ES |
| `allow-filebeat-to-logstash` | logging | Only Filebeat → Logstash |
| `allow-ingress-to-kibana` | logging | Only Ingress → Kibana |

### Apply All Network Policies

```bash
kubectl apply -f networking/network-policy/
```

### Test NetworkPolicy

```bash
# This should FAIL (blocked by NetworkPolicy)
kubectl run test --image=busybox -n app --rm -it -- \
  wget -qO- http://mongodb:27017

# This should SUCCEED (from user-service pod)
kubectl exec -n app deploy/user-service -- \
  wget -qO- http://mongodb:27017
```

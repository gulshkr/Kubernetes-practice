# Networking — Ingress, MetalLB, DNS, TLS

## Overview

```
Internet
   │
   ▼
MetalLB LoadBalancer IP (192.168.1.200-250)
   │
   ▼
NGINX Ingress Controller (ingress-nginx namespace)
   │
   ├── api.example.com/users     → user-service (app ns)
   ├── api.example.com/products  → product-service (app ns)
   └── kibana.example.com        → kibana (logging ns)
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
# ingress-nginx-controller  LoadBalancer   10.96.5.10     192.168.1.200    80:30080/TCP,443:30443/TCP
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

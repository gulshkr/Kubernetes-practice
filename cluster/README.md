## Cluster Bootstrap Guide

This directory contains configuration files to bootstrap a production Kubernetes cluster on bare-metal using **kubeadm** and **Calico** as the CNI.

### Files

| File | Purpose |
|------|---------|
| `kubeadm-config.yaml` | kubeadm init configuration |
| `calico.yaml` | Calico CNI (v3.27) |

### Step-by-step

See [docs/getting-started.md](../docs/getting-started.md) for the full guide.

Quick reference:
```bash
# On control-plane node
sudo kubeadm init --config kubeadm-config.yaml
# Apply CNI
kubectl apply -f calico.yaml
# On each worker node
sudo kubeadm join <control-plane-ip>:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>
```

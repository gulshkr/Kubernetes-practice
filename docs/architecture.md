# Architecture Overview

## System Architecture

```
Internet / LAN
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  MetalLB (L2 mode)  ← assigns IP from 192.168.1.200-250    │
└───────────────────────────┬─────────────────────────────────┘
                            │ LoadBalancer IP
                            ▼
              ┌─────────────────────────┐
              │  NGINX Ingress Ctrl     │
              │  (ingress-nginx ns)     │
              └─────┬──────────┬────────┘
                    │          │
          api.example.com  kibana.example.com
                    │          │
        ┌───────────┘          └──────────────────────┐
        │  namespace: app                              │ namespace: logging
        │                                             │
        │  ┌──────────────────┐                       │  ┌─────────┐
        │  │  user-service    │──┐                    └─▶│  Kibana │
        │  │  (2 replicas)    │  │                       └────┬────┘
        │  │  HPA: 2-8 pods   │  │ MongoDB                    │
        │  └──────────────────┘  │ URI (secret)          ┌────┴──────────┐
        │                        ▼                       │ Elasticsearch  │
        │  ┌──────────────────┐  ┌──────────────────┐    │  (StatefulSet) │
        │  │ product-service  │─▶│    MongoDB        │    └────────────────┘
        │  │  (2 replicas)    │  │  (StatefulSet)    │          ▲
        │  │  HPA: 2-8 pods   │  │  PV: 10Gi         │          │
        │  └──────────────────┘  └──────────────────┘    ┌──────┴──────┐
        │                                                 │  Logstash   │
        └─────────────────────────────────────────────────┤  Deployment │
                                                          └──────┬──────┘
                                                                 ▲
                                                          ┌──────┴──────┐
                                                          │  Filebeat   │
                                                          │  DaemonSet  │
                                                          │ (all nodes) │
                                                          └─────────────┘
                                                                 │
                                                     /var/log/containers/*
                                                     (all pod logs)
```

## Component Responsibilities

### Microservices (namespace: `app`)

| Component | Purpose | Replicas |
|-----------|---------|---------|
| `user-service` | CRUD API for users — Node.js/Express + MongoDB | 2 (HPA: 2-8) |
| `product-service` | CRUD API for products — Node.js/Express + MongoDB | 2 (HPA: 2-8) |
| `mongodb` | Primary data store — StatefulSet with 10Gi PV | 1 |

### Logging Stack (namespace: `logging`)

| Component | Purpose |
|-----------|---------|
| `filebeat` | DaemonSet on every node — ships container logs |
| `logstash` | Receives from Filebeat, enriches with k8s metadata, indexes to ES |
| `elasticsearch` | Stores all log data — StatefulSet with 20Gi PV |
| `kibana` | UI for searching, visualising, and dashboarding logs |

### Networking

| Component | Purpose |
|-----------|---------|
| **MetalLB** | Provides real LoadBalancer IPs on bare metal |
| **NGINX Ingress** | Routes HTTP traffic by hostname + path |
| **NetworkPolicy** | Isolates namespaces — default-deny with allow rules |
| **Calico CNI** | Pod-to-pod networking and NetworkPolicy enforcement |

## Log Flow

```
Node.js app (stdout/stderr)
    → /var/log/containers/*.log (kernel)
    → Filebeat (reads & ships via beats protocol)
    → Logstash (parse JSON, add k8s metadata, drop noise)
    → Elasticsearch (store in k8s-logs-{service}-{date} indices)
    → Kibana (search & visualise)
```

## Traffic Flow

```
Browser → DNS → MetalLB IP → NGINX Ingress → ClusterIP Service → Pod
```

## Kubernetes Version Compatibility

- Kubernetes: **v1.29+**
- Elasticsearch/Logstash/Kibana/Filebeat: **8.12.0**
- MongoDB: **7.0**
- NGINX Ingress Controller: **v1.9.6**
- MetalLB: **v0.14.x**
- Calico: **v3.27**

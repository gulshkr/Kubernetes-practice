# 🚀 Production-Grade Kubernetes on Bare Metal

A comprehensive, learning-focused Kubernetes project designed to take you from "What is a Pod?" to running a production-grade microservice stack on bare-metal hardware.

---

## 🏗️ System Architecture

This project simulates a real-world production environment with multiple layers of networking, storage, and observability.

```text
Internet / LAN
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  MetalLB (Provides LoadBalancer IPs on Bare Metal)         │
└───────────────────────────┬─────────────────────────────────┘
                            │ external traffic
                            ▼
              ┌─────────────────────────┐
              │  NGINX Ingress Controller│ (Routes traffic by URL)
              └─────┬──────────┬────────┘
                    │          │
          api.example.com  kibana.example.com
                    │          │
        ┌───────────┘          └──────────────────────┐
        │  namespace: app                              │ namespace: logging
        │                                             │
        │  ┌──────────────────┐                       │  ┌─────────┐
        │  │  user-service    │──┐                    └─▶│  Kibana │ (Log UI)
        │  │  (2 replicas)    │  │                       └────┬────┘
        │  │  Auto-scaling    │  │                            │
        │  └──────────────────┘  │ MongoDB                    │
        │                        ▼                       ┌────┴──────────┐
        │  ┌──────────────────┐  ┌──────────────────┐    │ Elasticsearch  │
        │  │ product-service  │─▶│    MongoDB        │    │  (Log Storage) │
        │  │  (2 replicas)    │  │  (StatefulSet)    │    └────────────────┘
        │  │  Auto-scaling    │  │  Persistent Disk  │          ▲
        │  └──────────────────┘  └──────────────────┘    ┌──────┴──────┐
        │                                                 │  Logstash   │
        └─────────────────────────────────────────────────┤  (Processor)│
                                                          └──────┬──────┘
                                                                 ▲
                                                          ┌──────┴──────┐
                                                          │  Filebeat   │
                                                          │  (Shipper)  │
                                                          └─────────────┘
```

---

## 📂 Project Structure: The "What" and "Why"

Understanding why a file exists is just as important as knowing what it does. Here is the breakdown:

### 1. Cluster Infrastructure (`/cluster`)
*   **What**: `kubeadm-config.yaml` and `calico.yaml`.
*   **Why**: This is the foundation. `kubeadm` bootstraps the cluster, and `Calico` (a Container Network Interface - CNI) creates the virtual network that allows Pods to talk to each other.

### 2. Networking (`/networking`)
*   **`/metallb`**: Kubernetes doesn't have a built-in LoadBalancer for bare metal. MetalLB fixes this by assigning real IPs from your home/office network to your services.
*   **`/ingress-controller`**: Instead of having a different IP for every service, NGINX acts as a gateway (an Ingress Controller) so you can use hostnames like `api.example.com`.
*   **`/network-policy`**: In production, security is key. These files act as a "Firewall" inside Kubernetes, blocking unauthorized traffic between services.

### 3. Application Services (`/services`)
*   **`user-service`** & **`product-service`**: These are Node.js microservices. Each contains:
    *   `app/`: The actual code.
    *   `Dockerfile`: Instructions to turn the code into a "Container Image".
    *   `k8s/`: Kubernetes manifests (Deployments to run pods, Services to make them reachable, and HPA for auto-scaling).

### 4. Database (`/database`)
*   **What**: MongoDB defined as a **StatefulSet**.
*   **Why**: Unlike microservices, databases need "memory". A StatefulSet ensures that if a database pod restarts, it stays connected to the same storage and name, so your data isn't lost.

### 5. Observability Stack (`/elk`)
*   **Filebeat**: A small agent running on every node to "watch" the log files from your apps.
*   **Logstash**: A heavy-lifter that takes raw logs, cleans them up, and labels them.
*   **Elasticsearch**: The database for your logs.
*   **Kibana**: The web interface where you search and visualize logs.

---

## 🛠️ Kubernetes Manifests: A Beginner's "Rosetta Stone"

In the `k8s/` folders throughout this project, you will see several types of YAML files. Here is what they are and why we use them:

| File Type | Purpose | Real-world Analogy |
|:---|:---|:---|
| **`deployment.yaml`** | Defines how many copies (replicas) of your app should run and which container image to use. It handles "Rolling Updates" automatically. | **The Manager**: Ensures the right number of workers are always on the shift. |
| **`service.yaml`** | Provides a stable "Internal IP" and DNS name for your pods. Since pods can die and restart with new IPs, the Service is the constant address. | **The Receptionist**: You call the receptionist, and they connect you to whoever is currently available. |
| **`configmap.yaml`** | Stores non-sensitive configuration like port numbers or environment names (`NODE_ENV=production`). | **The Instruction Manual**: Tells the app how to behave in different environments. |
| **`secret.yaml`** | Stores sensitive data like database passwords or API keys, encoded in base64. | **The Vault**: Keeps the keys safe and only gives them to authorized containers. |
| **`statefulset.yaml`** | Like a Deployment, but for apps that need to save data (like MongoDB). It gives pods a "sticky" identity (e.g., `mongodb-0`). | **The Assigned Desk**: Unlike a hot-desk (Deployment), the worker always has the same desk and drawer. |
| **`hpa.yaml`** | The Horizontal Pod Autoscaler. It watches CPU/Memory usage and adds more pods if the app is under heavy load. | **The Elastic Band**: Stretches (adds pods) when pulled and shrinks when the tension is gone. |

---

## 📖 Learning Map (The Docs)

We have broken down the learning process into 8 focused guides:

| Step | Guide | Goal |
|:---:|-------|------|
| 🟢 | [**Getting Started**](docs/getting-started.md) | Prepare your OS and bootstrap your first cluster. |
| 🏰 | [**Architecture**](docs/architecture.md) | Deep dive into how traffic flows and logs move. |
| 🗺️ | [**Cloud-to-K8s Terminology Hub**](docs/k8s-vs-cloud.md) | K8s vs AWS (ECS, Beanstalk, etc.) |
| 🔌 | [**Networking**](docs/networking.md) | Understand Ingress, LoadBalancers, and Network Policies. |
| 💾 | [**Database**](docs/database.md) | Learn about PersistentVolumes and StatefulSets on bare metal. |
| 🛠️ | [**Microservices**](docs/services.md) | See how to build, deploy, and scale application code. |
| 🪵 | [**ELK Logging**](docs/elk-logging.md) | Set up professional log aggregation and monitoring. |
| 🔑 | [**RBAC**](docs/rbac.md) | Learn the Principle of Least Privilege (Security). |
| 🆘 | [**Troubleshooting**](docs/troubleshooting.md) | Master the `kubectl` commands needed to fix things when they break. |

---

## 🧪 Testing Locally
If you don't have bare-metal servers yet, you can test this entire stack on your laptop (Windows/Mac/Linux) using `kind`.
👉 **[Local Testing Guide](docs/local-testing.md)**

---

## 🔧 Prerequisites
*   **Machines**: 2-3 Ubuntu 22.04 nodes (Real hardware or VMs).
*   **RAM**: At least 4-8GB per node is recommended for the full ELK stack.
*   **Knowledge**: Basic terminal usage. We'll handle the K8s parts!

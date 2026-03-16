# Microservices in Kubernetes: Deep Dive

This guide explains how our microservices interact with the Kubernetes orchestrator to ensure high availability, scalability, and performance.

---

## ⚡ Resource Management: Requests vs. Limits

Every service in this repo defines explicit resource requirements. This is critical for cluster stability.

| Type | Purpose | Analogy |
| :--- | :--- | :--- |
| **Requests** | The minimum resources a pod needs to start. The scheduler uses this to find a node. | The "Minimum Wage" guaranteed to the pod. |
| **Limits** | The maximum resources a pod is allowed to consume. CPU is throttled; Memory kills the pod (OOM). | The "Speed Limit" to prevent one pod from crashing the whole node. |

**Why this matters**: Without requests, the scheduler might over-provision a node, leading to "noisy neighbor" issues where one service starves others of CPU.

---

## 🩺 Health Probes: The Three Tiers

We use three different types of probes to manage the lifecycle of our Node.js services:

### 1. Startup Probe
*   **Purpose**: Protects slow-starting apps.
*   **Behavior**: Kubernetes waits for this to pass before starting liveness/readiness probes.
*   **Value**: Prevents a pod from being killed before it has finished its initial database connection or cache warming.

### 2. Readiness Probe
*   **Purpose**: Tells the Service/Ingress when to send traffic.
*   **Behavior**: If this fails, the pod is removed from the Service endpoints but NOT killed.
*   **Value**: Ensures users don't see `502 Gateway Error` during a deployment or if the app is momentarily overloaded.

### 3. Liveness Probe
*   **Purpose**: Tells Kubernetes when to restart a pod.
*   **Behavior**: If this fails multiple times, the kubelet kills the container and starts a new one.
*   **Value**: Automatically fixes "deadlocked" apps that are running but not responding to requests.

---

## 📈 Auto-scaling Logic (HPA)

The **Horizontal Pod Autoscaler (HPA)** automatically adjusts the number of replicas based on real-time metrics.

*   **Mechanism**: The HPA queries the Metrics Server every 15 seconds.
*   **Algorithm**: `Desired Replicas = ceil[current replicas * (current metric / target metric)]`
*   **Cooldown**: There is a default 5-minute "scale-down" delay to prevent "flapping" (rapidly adding and removing pods).

---

## 🛠️ Efficient Docker-to-K8s Workflow

1.  **Multi-stage Builds**: Our Dockerfiles use a `build` stage to install dev dependencies and a `production` stage to run the app. This reduces image size from ~800MB to ~150MB.
2.  **ImagePullPolicy: Always**: In production, we use versioned tags (e.g., `v1.0.1`). In local dev/testing, we use `:local` with `imagePullPolicy: Never` to skip the registry.
3.  **Config Injection**: Apps NEVER hardcode database URLs. We inject them via Environment Variables sourced from ConfigMaps and Secrets.

---

## 🔄 Deployment Strategies: Rolling Updates

When you run `kubectl apply`, Kubernetes performs a **Rolling Update**:
1.  It starts a new pod with the new version.
2.  It waits for the **Readiness Probe** to pass.
3.  It terminates one old pod.
4.  It repeats until all pods are updated.

This ensures **Zero Downtime** deployments!

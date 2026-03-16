## 🎡 Kubernetes Internal Architecture

To understand how our services run, we must first look at how the cluster itself is built. Kubernetes split into two main parts: the **Control Plane** (The Brain) and the **Worker Nodes** (The Muscles).

```text
       ┌─────────────────────────────────────────────────────────┐
       │                CONTROL PLANE (Master Node)              │
       │                                                         │
       │   ┌──────────────┐      ┌──────────────┐      ┌─────┐   │
       │   │ API Server   │◀─────┤  Scheduler   │      │etcd │   │
       │   │ (Central Hub)│      │ (Matchmaker) │      │(DB) │   │
       │   └──────┬───────┘      └──────────────┘      └──┬──┘   │
       │          │                                       │      │
       │   ┌──────┴──────────────┐          ┌─────────────┴──┐   │
       │   │ Controller Manager  │          │ Cloud Control  │   │
       │   │ (The Enforcer)      │          │ (Cloud Hub)    │   │
       │   └─────────────────────┘          └────────────────┘   │
       └────────────────────────────┬────────────────────────────┘
                                    │
            Instructions & Heartbeats Over the Network
                                    │
       ┌────────────────────────────┴────────────────────────────┐
       │                                                         │
       │   ┌────────────────────────┐    ┌────────────────────────┐
       │   │      WORKER NODE 1     │    │      WORKER NODE 2     │
       │   │                        │    │                        │
       │   │  ┌──────────┐  ┌─────┐ │    │  ┌──────────┐  ┌─────┐ │
       │   │  │ Kubelet  │  │Proxy│ │    │  │ Kubelet  │  │Proxy│ │
       │   │  └────┬─────┘  └─────┘ │    │  └────┬─────┘  └─────┘ │
       │   │       │                │    │       │                │
       │   │  ┌────┴───────────┐    │    │  ┌────┴───────────┐    │
       │   │  │   Pod (App)    │    │    │  │   Pod (App)    │    │
       │   │  └────────────────┘    │    │  └────────────────┘    │
       │   └────────────────────────┘    └────────────────────────┘
```

---

## 🏗️ Technical Architecture

### 1. Control Plane Components (The "Brains")
The Control Plane is responsible for maintaining the desired state of the cluster.

*   **kube-apiserver**: The central hub. All components (kubectl, workers) talk to this via REST. It validates and configures data for api objects (pods, services, etc.).
*   **etcd**: The cluster's distributed "source of truth". A key-value store that holds all cluster data.
*   **kube-scheduler**: The "matchmaker". It watches for newly created pods with no assigned node and selects a node for them based on resources, policies, and constraints.
*   **kube-controller-manager**: The "enforcer". It runs controller processes like the Node Controller (detects node failures) and Job Controller (ensures jobs finish).
*   **cloud-controller-manager**: (Not used in bare-metal) Links your cluster into a cloud provider's API.

### 2. Worker Node Components (The "Muscles")
Worker nodes run the actual applications.

*   **kubelet**: The "agent". It ensures that containers are running in a pod and follows instructions from the Control Plane.
*   **kube-proxy**: The "network traffic controller". It maintains network rules on nodes, allowing communication to your pods from inside/outside the cluster.
*   **Container Runtime**: (Docker/containerd) The software responsible for actually running the containers.

---

## 🌐 Networking Deep Dive

### Container Network Interface (CNI): Calico
We use **Calico** to manage pod-to-pod communication.
*   **Encapsulation**: Calico uses IP-in-IP or VXLAN to tunnel traffic between nodes.
*   **BGP**: For high-performance bare-metal, Calico can use BGP (Border Gateway Protocol) to advertise pod routes directly to your physical routers.
*   **NetworkPolicy**: Calico enforces the security rules defined in our YAML files at the Linux kernel level (using iptables/BPF).

### Bare-Metal Load Balancing: MetalLB
Standard Kubernetes doesn't know how to handle `type: LoadBalancer` on bare-metal (it just stays `<pending>`).
*   **L2 Mode**: MetalLB uses ARP (Address Resolution Protocol) to announce that a specific IP (from our pool) belongs to one of our nodes.
*   **Traffic Flow**: External Client -> Router -> Node (ARP response) -> Kube-Proxy -> Pod.

---

## 🪵 Observability Flow

The ELK pipeline follows a structured path to ensure no logs are lost:

1.  **Generation**: Node.js app writes to `stdout`.
2.  **Collection**: Docker captures this and writes to `/var/log/containers/*.log`.
3.  **Shipping**: **Filebeat** DaemonSet mounts this folder, reads the files, and ships them to Logstash using the "Beats" protocol.
4.  **Processing**: **Logstash** parses the raw string into JSON, adds tags (which node, which namespace), and filters out noise.
5.  **Storage**: **Elasticsearch** indexes the data for fast searching.
6.  **Visualization**: **Kibana** queries Elasticsearch to build dashboards.

---

## 🚦 Request Lifecycle: api.example.com/users

1.  **DNS**: Client resolves `api.example.com` to a MetalLB VIP (e.g., `192.168.1.200`).
2.  **L2 Entry**: Traffic hits the node currently "owning" that IP via ARP.
3.  **Ingress**: The **NGINX Ingress Controller** pod receives the traffic on port 80.
4.  **Routing**: NGINX looks at the `Host` header (`api.example.com`) and the path (`/users`).
5.  **Service**: NGINX forwards traffic to the `user-service` **ClusterIP Service**.
6.  **Load Balancing**: The Service (via kube-proxy) selects a healthy `user-service` pod.
7.  **Execution**: The pod handles the request and talks to **MongoDB** via its internal DNS name.

---

## 📦 Version Matrix

| Component | Version | Why? |
|-----------|---------|------|
| Kubernetes | v1.29+ | Balanced stability and modern features (Gateway API support). |
| Calico | v3.27 | Integrated NetworkPolicy engine and BGP support. |
| MongoDB | 7.0 | Modern JSON features and improved performance. |
| NGINX Ingress | v1.9.6 | Industry standard for L7 routing. |
| ELK Stack | 8.12.0 | Version 8.x offers significant memory optimizations for ES. |

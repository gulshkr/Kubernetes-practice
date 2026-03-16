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

### 1. Control Plane Components (The "Center of Operations")
The Control Plane is like the **Headquarters** of a large company. It makes the big decisions and ensures everything is running according to plan.

*   **kube-apiserver (The Secretary/Receptionist)**: 
    - **What it does**: This is the only way in or out of the cluster. Every command you run (`kubectl`), every heartbeat from a node, and every internal communication goes through here. 
    - **Analogy**: Like a highly efficient secretary who validates every request before passing it to the boss. If you want to deploy a pod, you ask the API Server; it checks if you're allowed, then writes the request into the database (etcd).
*   **etcd (The Vault/Brain's Memory)**: 
    - **What it does**: This is a secure, high-speed database that stores the "Blueprint" of your cluster. It knows exactly which pods are running, on which nodes, and what their IP addresses are.
    - **Analogy**: Like the company's ledger. If it's not in the ledger, it doesn't exist in the company. If the ledger is lost, the company closes down.
*   **kube-scheduler (The Matchmaker/Logistician)**: 
    - **What it does**: When you ask for a new pod, the scheduler looks at all your Worker Nodes and decides which one is the best "home" for it based on CPU/RAM availability and your specific rules.
    - **Analogy**: Like a dispatcher at a taxi company. He sees a new call (pod) and assigns it to the nearest available driver (node) who has enough fuel (resources).
*   **kube-controller-manager (The Enforcer/Maintenance Crew)**: 
    - **What it does**: It runs multiple "watchers" (controllers). For example, the **Node Controller** watches for nodes going offline. If a node crashes, this component realizes it and orders new pods to be created elsewhere to maintain your "desired state."
    - **Analogy**: Like a thermostat in your house. If you set it to 22°C (desired state), and the temperature drops to 20°C (current state), the controller manager "turns on the heater" to get it back to 22°C.
*   **cloud-controller-manager (The External Liaison)**: 
    - **What it does**: This talks to your cloud provider (AWS/GCP/Azure). It handles things like creating a physical LoadBalancer for your app in the cloud.
    - **Note**: In our bare-metal project, this role is largely taken over by **MetalLB**.

### 2. Worker Node Components (The "Field Workers")
Worker nodes are the servers that do the actual heavy lifting—running your applications.

*   **kubelet (The Site Manager/Agent)**: 
    - **What it does**: An agent that runs on every single node. It listens to the API Server for instructions ("Hey, run this pod!") and makes sure those containers are healthy and running. If a container dies, the kubelet restarts it.
    - **Analogy**: Like a site manager at a construction project. He takes the blueprints from HQ and makes sure the local workers (containers) are actually doing their job correctly.
*   **kube-proxy (The Traffic Cop)**: 
    - **What it does**: It handles the network networking on each node. It makes sure that if someone calls a "Service," the traffic is correctly routed to the right pod, even if the pod moved to a different node.
    - **Analogy**: Like a traffic cop standing at a busy intersection. He knows all the current shortcuts and detours to get drivers (data) to their destination as fast as possible.
*   **Container Runtime (The Engine)**: 
    - **What it does**: The software actually responsible for running the containers (we use **Docker/containerd**). Kubernetes doesn't run containers itself; it asks the runtime to do it.
    - **Analogy**: Like the engine in a car. The Kubelet is the driver turning the key, but the engine (Runtime) is what actually makes the car move.

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

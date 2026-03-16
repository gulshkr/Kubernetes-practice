# Kubernetes for Cloud Engineers: Terminology Hub

If you are coming from AWS, Azure, or Google Cloud, Kubernetes can feel like a different language. This guide maps core K8s concepts to the cloud services you already know.

---

## 🗺️ Concept Mapping: K8s vs. AWS

| Kubernetes Term | AWS Equivalent | What is it? (The "Simple" version) |
| :--- | :--- | :--- |
| **Node** | **EC2 Instance** | A physical or virtual server that provides the CPU/RAM for your apps. |
| **Pod** | **ECS Task / Beanstalk Instance** | The smallest unit. It's one or more containers running together with a single IP. |
| **Deployment** | **ECS Service** | The supervisor. It says "I always want 3 copies of this app running." |
| **Service** | **Target Group / ELB** | A stable internal name or "phone number" to reach your group of pods. |
| **Ingress** | **Application Load Balancer (ALB)** | The front door. It handles domain names (`api.com`) and routes to the right Service. |
| **ConfigMap / Secret** | **Parameter Store / Secrets Manager** | Where you store app settings and passwords so they aren't in your code. |
| **Namespace** | **Virtual Private Cloud (VPC) / Resource Groups** | A "folder" to organize and isolate different teams or environments. |
| **StatefulSet** | **N/A (Traditional RDS/EC2)** | A special supervisor for databases that ensures they keep their identity and disk. |

---

## 深入 Deep Dive: "The What & The Why"

### 1. The Pod (The Atom)
In AWS ECS, you run a **Task**. In Kubernetes, you run a **Pod**.
*   **Why not just "Container"?**: A Pod can have multiple containers that share the same network. 
*   **Analogy**: A Pod is like a **Hotel Room**. It might have a bedroom (Main App) and a minibar (Sidecar log shipper), but they both share the same Room Number (IP Address).

### 2. The Service (The Phone Number)
In AWS, you talk to an **Elastic Load Balancer (ELB)**. In K8s, your pods are constantly being created and destroyed (with new IPs each time).
*   **The Problem**: How do you talk to the `user-service` if its address keeps changing?
*   **The Solution**: You call the **Service**. It acts as a permanent "Internal Load Balancer" that always knows where the latest pods are.

### 3. The Ingress (The Gatekeeper)
If a **Service** is an internal phone extension, the **Ingress** is the company's main public Switchboard.
*   **Comparison**: An Ingress is exactly like an **AWS Application Load Balancer (ALB)**. It takes one public IP/DNS and splits traffic:
    *   `example.com/users` → User Service
    *   `example.com/products` → Product Service

### 4. Nodes (The Foundation)
Nodes are just the **EC2 instances** (servers) in your cluster. 
*   **The Difference**: In a cloud-native K8s (EKS), you don't care about individual nodes. Kubernetes treats all your servers as one giant "Pool of Resources."

---

## 💡 Quick Reference: "I want to..."

*   **Deploy a website** → Use a **Deployment** + **Service** + **Ingress**.
*   **Store a database password** → Use a **Secret**.
*   **Run a background task every hour** → Use a **CronJob**.
*   **Deploy a database like MongoDB** → Use a **StatefulSet**.
*   **Isolate Dev from Production** → Use different **Namespaces**.

# Kubernetes Package Management: Helm

This project includes a **reusable Helm chart** for our microservices, demonstrating how to move from static YAML manifests to dynamic, version-controlled packages.

---

## 🏗️ What is Helm?

Helm is often called the **"Package Manager for Kubernetes"**. If you use `npm` for Node.js or `apt` for Ubuntu, you already know the concept.

### Why use Helm over raw YAML?
1.  **Templating**: Instead of hardcoding values (like MongoDB URIs or Image Tags), we use variables.
2.  **Values Separation**: You define your "logic" once in templates and your "configuration" in a single `values.yaml` file.
3.  **Release Management**: Helm tracks every deployment. If a new version breaks, you can run `helm rollback` to instantly revert.
4.  **Simplicity**: Deploy a complex stack with one command instead of `kubectl apply -f` on 10 different files.

---

## 📂 Chart Structure

```text
charts/microservice-chart/
├── Chart.yaml          # Metadata (name, version, etc.)
├── values.yaml         # Default configuration (The "Dial")
└── templates/          # YAML templates with placeholders
    ├── _helpers.tpl    # Reusable logic/labels
    ├── deployment.yaml # The app workload
    ├── service.yaml    # Internal network access
    ├── ingress.yaml    # External routing
    └── hpa.yaml        # Auto-scaling rules
```

---

---

## 🎭 Multi-Service Deployment Strategies

One of the most common questions is: **"If I have 10 services with 10 different images, do I need 10 charts?"**

The answer is **NO**. You use one "Generic Chart" and override the values for each specific service. There are two professional ways to do this:

### Strategy A: Command-Line Overrides (The "Quick" Way)
When you run `helm install`, you can use the `--set` flag to overwrite any value in `values.yaml` on the fly.

*   **Release 1 (User Service)**:
    `helm install user-app ./charts/microservice-chart --set image.repository=user-service --set image.tag=v1.2.3`
*   **Release 2 (Product Service)**:
    `helm install product-app ./charts/microservice-chart --set image.repository=product-service --set image.tag=v4.5.0`

### Strategy B: Service-Specific Values Files (The "Professional" Way)
Instead of typing long commands, you create small "Override Files" for each service.

**`user-values.yaml`**
```yaml
image:
  repository: user-service
  tag: v1.2.3
service:
  targetPort: 3000
```

**`product-values.yaml`**
```yaml
image:
  repository: product-service
  tag: v4.5.0
service:
  targetPort: 3001
```

**Deployment Command:**
```bash
# Deploying User Service
helm install user-app ./charts/microservice-chart -f user-values.yaml

# Deploying Product Service
helm install product-app ./charts/microservice-chart -f product-values.yaml
```

---

## 🧩 How Helm Tracks These Differently
When you run `helm install <release-name> ...`, Helm creates a **Release** object in the cluster. 
1.  **Release Name**: This is the unique ID (e.g., `user-app`).
2.  **Namespace**: You can even deploy the same image to different namespaces (e.g., `dev` vs `prod`).

Helm mixes your **Templates** + **Default Values** + **Your Overrides** to generate the final YAML that gets sent to Kubernetes.

---

## 🚀 Lifecycle Management

---

## 🗺️ Helm vs. Cloud Services

*   **AWS Equivalent**: **AWS CloudFormation** or **Terraform Modules**.
*   **Analogy**: Raw YAML is like a **Hand-written Receipt**. Helm is like a **Digital POS System**—it's automated, tracks history, and handles multiple "orders" from the same template.

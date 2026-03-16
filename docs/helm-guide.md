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

## 🚀 How to Use the Chart

### 1. Dry Run (Preview)
Always preview what Helm will generate before actually deploying:
```bash
helm install user-service ./charts/microservice-chart --dry-run --debug
```

### 2. Deploy the User Service
```bash
helm install user-service ./charts/microservice-chart \
  --set image.repository=user-service \
  --set ingress.hosts[0].paths[0].path="/users(/|$)(.*)" \
  -n app
```

### 3. Deploy the Product Service (Re-using the same chart!)
```bash
helm install product-service ./charts/microservice-chart \
  --set image.repository=product-service \
  --set service.targetPort=3001 \
  --set ingress.hosts[0].paths[0].path="/products(/|$)(.*)" \
  -n app
```

### 4. Upgrade or Rollback
```bash
# Update the image tag
helm upgrade user-service ./charts/microservice-chart --set image.tag=v2.0.0 -n app

# Rollback if something went wrong
helm rollback user-service 1 -n app
```

---

## 🗺️ Helm vs. Cloud Services

*   **AWS Equivalent**: **AWS CloudFormation** or **Terraform Modules**.
*   **Analogy**: Raw YAML is like a **Hand-written Receipt**. Helm is like a **Digital POS System**—it's automated, tracks history, and handles multiple "orders" from the same template.

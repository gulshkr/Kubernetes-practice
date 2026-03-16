# Kubernetes Security: RBAC & Identity

In Kubernetes, security is based on **Role-Based Access Control (RBAC)**. This guide explains how we govern "Who" can do "What" in our cluster.

---

## 🆔 The Three Pillars of RBAC

To understand RBAC, you must understand three core concepts:

1.  **Subjects**: The "Who". This can be a human user or, more commonly, a **ServiceAccount** (an identity for a pod).
2.  **Roles**: The "What". A list of permissions (e.g., "can read pods", "can delete services").
3.  **RoleBindings**: The "Bridge". This connects a Subject to a Role, effectively granting the permissions.

---

## 🤖 ServiceAccounts: Pod Identities

By default, every namespace has a `default` service account. However, in production, we create specific service accounts for our apps.

*   **Why?**: If your `user-service` is compromised, the attacker only gets the permissions of that specific service account, not the whole cluster.
*   **Usage**: In `deployment.yaml`, we specify `serviceAccountName: user-service-sa`.

---

## 🏗️ Roles vs. ClusterRoles

| Type | Scope | Usage |
| :--- | :--- | :--- |
| **Role** | Namespace | App-specific permissions (e.g., `app` namespace only). |
| **ClusterRole** | Cluster-wide | Infrastructure permissions (e.g., Filebeat reading logs from all nodes). |

**Principle of Least Privilege**: Never use a ClusterRole where a Role will suffice. Our `user-service` only has the `Role` permissions it needs to run; it cannot see or touch the `logging` or `kube-system` namespaces.

---

## 🔒 Security Best Practices in our YAMLs

Beyond RBAC, we've applied **SecurityContext** settings in our manifests:

1.  **RunAsNonRoot**: Our pods are configured to run as a non-privileged user, not as the root user. This prevents container escape attacks.
2.  **ReadOnlyRootFilesystem**: Where possible, we make the container's filesystem read-only to prevent attackers from installing malicious tools.
3.  **AllowPrivilegeEscalation: false**: Prevents a process from gaining more privileges than its parent process.

---

## 🛠️ Auditing & Debugging

```bash
# Check if a ServiceAccount can do something
kubectl auth can-i get pods --as=system:serviceaccount:app:user-service-sa -n app

# List all roles in a namespace
kubectl get roles,rolebindings -n app

# Describe a specific role to see its rules
kubectl describe role <role-name> -n app
```
s: get, list, watch
  - pods: get, list, watch
  - nodes: get, list, watch
  - replicasets: get, list, watch
```


## Apply RBAC

```bash
# App service accounts and roles
kubectl apply -f rbac/roles.yaml

# Filebeat cluster role
kubectl apply -f elk/filebeat/rbac.yaml
```

## Verify Permissions

```bash
# Can user-service-sa read secrets in 'app' namespace?
kubectl auth can-i get secrets \
  --namespace=app \
  --as=system:serviceaccount:app:user-service-sa
# Expected: yes

# Can user-service-sa delete pods?
kubectl auth can-i delete pods \
  --namespace=app \
  --as=system:serviceaccount:app:user-service-sa
# Expected: no

# Can filebeat list pods cluster-wide?
kubectl auth can-i list pods \
  --all-namespaces \
  --as=system:serviceaccount:logging:filebeat
# Expected: yes
```

## Adding More Permissions

If your service needs additional permissions, edit `rbac/roles.yaml`:

```yaml
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "watch"]
    # Add resourceNames to further restrict access to specific configmaps:
    resourceNames: ["user-service-config"]
```

> **Never** grant `*` verbs or `cluster-admin` to application service accounts.

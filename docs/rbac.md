# RBAC — Access Control

## Principle of Least Privilege

Every service runs with a dedicated **ServiceAccount** and only has the permissions it absolutely needs.

## Service Accounts

| ServiceAccount | Namespace | Used By |
|---------------|-----------|---------|
| `user-service-sa` | app | user-service pods |
| `product-service-sa` | app | product-service pods |
| `filebeat` | logging | filebeat DaemonSet pods |

## Permissions Summary

### App Services (`user-service-sa`, `product-service-sa`)

```
Role: app-service-role (namespace-scoped)
  - configmaps: get, list, watch
  - secrets: get, list, watch
  - pods: get, list
```

Rationale: The services need to read their own ConfigMaps and Secrets. They do NOT need to create or delete any resources.

### Filebeat (`filebeat` — cluster-scoped)

```
ClusterRole: filebeat
  - namespaces: get, list, watch
  - pods: get, list, watch
  - nodes: get, list, watch
  - replicasets: get, list, watch
```

Rationale: Filebeat's Kubernetes autodiscover needs to list pods across all namespaces to build the metadata index.

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

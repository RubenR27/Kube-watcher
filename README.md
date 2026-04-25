# 🔭 kube-watcher

> A lightweight Kubernetes pod explorer with real-time WebSocket updates, built as a learning project to understand how Kubernetes, RBAC, and cloud-native observability work in practice.

![Status](https://img.shields.io/badge/status-%20compleated-green)
![K3s](https://img.shields.io/badge/cluster-k3s-blue)
![Python](https://img.shields.io/badge/python-3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)

---

## 📸 Screenshots

<img width="1536" height="867" alt="image" src="https://github.com/user-attachments/assets/2b26eb51-c98a-41b2-a783-8e84cc162ae1" />
<img width="1331" height="462" alt="image" src="https://github.com/user-attachments/assets/d3447884-2117-4855-8788-15b9811fe1c8" />


---

## 📖 What is kube-watcher?

**kube-watcher** is a Kubernetes pod explorer with a web interface. It was born as a learning project to understand, in a hands-on way, how the Kubernetes API works, role-based access control (RBAC), and observability patterns in real environments.

The project covers everything from the basics (listing pods via API) to more advanced concepts like WebSockets for real-time updates, Ingress routing, and health probes.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    k3s cluster                       │
│                                                      │
│  ┌──────────────────┐     ┌────────────────────┐    │
│  │   kube-watcher   │────▶│  Kubernetes API    │    │
│  │   (FastAPI)      │     │  (CoreV1Api)       │    │
│  │                  │     └────────────────────┘    │
│  │  /pods  GET      │                               │
│  │  /pods  DELETE   │  ServiceAccount + RBAC        │
│  │  /ws/pods WS     │  (ClusterRole + Binding)      │
│  │  /healthz GET    │                               │
│  └────────┬─────────┘                               │
│           │ Ingress (kube-watcher.local)             │
└───────────┼─────────────────────────────────────────┘
            │
     ┌──────▼──────┐
     │  Frontend   │
     │  HTML/JS    │
     │  WebSocket  │
     └─────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Cluster | **k3s** | Lightweight, ideal for resource-constrained servers |
| Backend | **FastAPI** (Python) | Native async, WebSocket support, auto-generated docs |
| Kubernetes client | **kubernetes-python** | Official library for talking to the k8s API |
| Frontend | **HTML + Vanilla JS** | No dependencies, easy to serve from within the cluster |
| Runtime | **Docker** | Reproducible, portable packaging |
| External access | **Ingress (k3s Traefik)** | HTTP routing without NodePort |
| Observability | **k9s** | TUI for inspecting the cluster during development |

---

## 📁 Project Structure

```
kube-watcher/
├── api.py               # FastAPI app — REST endpoints + WebSocket
├── kube.py              # Business logic using kubernetes-python
├── Dockerfile           # Application image
├── deployment.yaml      # Kubernetes Deployment + Service
├── rbac.yaml            # ServiceAccount, ClusterRole and Binding
├── requirements.txt     # Python dependencies
└── README.md
```

> **Coming soon:**
> ```
> ├── frontend/
> │   └── index.html     # Web dashboard with WebSocket support
> └── ingress.yaml       # Ingress for kube-watcher.local
> ```

---

## ⚙️ Concepts Covered

### RBAC (Role-Based Access Control)

The application runs under its own `ServiceAccount` with minimal permissions. The `rbac.yaml` file defines exactly what the app can and cannot do:

```yaml
verbs: ["get", "list", "watch", "delete"]
resources: ["pods", "pods/log"]
```

If you try to delete a pod without the `delete` verb, the API returns a 403 error — that is RBAC working exactly as intended.

### Watch API

Instead of polling (asking every N seconds whether something changed), Kubernetes has a **Watch API** that keeps an open connection and streams events (`ADDED`, `MODIFIED`, `DELETED`) in real time. This is the foundation of the watcher.

### WebSockets

The frontend does not refresh the page to see changes. The page opens a WebSocket connection to the API, which in turn holds an open Watch against the cluster. When a pod dies → the cluster notifies FastAPI → FastAPI forwards the event to the browser → the table updates itself automatically.

### CORS

When the browser calls an API on a different origin (even `localhost:3000` vs `localhost:8000`), the browser blocks the request for security reasons. You need to explicitly configure which origins are allowed in FastAPI using `CORSMiddleware`.

### Health Probes

Kubernetes does not know whether your application is alive or ready to receive traffic — unless you tell it. Probes are periodic HTTP requests made by the kubelet:

- **livenessProbe** → if it fails, Kubernetes restarts the pod
- **readinessProbe** → if it fails, Kubernetes stops sending traffic to the pod

---

## 🚀 Deployment Walkthrough

### Prerequisites

- A server with **k3s** installed
- `kubectl` configured and pointing to the cluster
- Docker installed on the server (or an accessible registry)

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/kube-watcher.git
cd kube-watcher
```

### 2. Build and publish the image

```bash
docker build -t kube-watcher:latest .

# If using a private or cluster registry:
docker tag kube-watcher:latest <your-registry>/kube-watcher:latest
docker push <your-registry>/kube-watcher:latest
```

> **Tip for local k3s:** you can import the image directly without a registry:
> ```bash
> docker save kube-watcher:latest | k3s ctr images import -
> ```

### 3. Apply RBAC

```bash
kubectl apply -f rbac.yaml
```

This creates the `ServiceAccount`, the `ClusterRole` with the required permissions, and the `ClusterRoleBinding` that ties them together.

### 4. Deploy the application

```bash
kubectl apply -f deployment.yaml
```

Verify the pod starts correctly:

```bash
kubectl get pods -w
kubectl logs -f deployment/kube-watcher
```

Backend URL stored in configMap deployed in the namespace, then injected in the frontend

### 5. (Optional) Configure Ingress

```bash
kubectl apply -f ingress.yaml
```

Add the entry to your `/etc/hosts` (or your local network DNS):

```
<server-IP>  kube-watcher.local
```

Then open `http://kube-watcher.local` in your browser.

---

## 🔌 API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/pods?namespace=default` | List pods in a namespace |
| `DELETE` | `/pods/{namespace}/{name}` | Delete a pod |
| `GET` | `/healthz` | Health check (used by liveness/readiness probes) |
| `WS` | `/ws/pods?namespace=default` | Real-time event stream |
| `GET` | `/docs` | Swagger UI (auto-generated by FastAPI) |

---

## 🔒 RBAC — Required Permissions

```yaml
apiGroups: [""]
resources: ["pods", "pods/log"]
verbs: ["get", "list", "watch", "delete"]
```

> If you want to run kube-watcher in read-only mode (without the delete button), simply remove `delete` from the verbs list.

---

 
## 🖥️ Development with k9s
 
[k9s](https://k9scli.io/) is a terminal UI that lets you inspect the cluster in real time while you develop:
 
```bash
# Install
brew install derailed/k9s/k9s   # Linux with brew installed
 
# Launch
k9s --namespace default
```
 
Useful shortcuts:
 
| Key | Action |
|---|---|
| `:pods` | View all pods |
| `l` | View logs for the selected pod |
| `d` | Describe the pod |
| `ctrl+d` | Delete the pod |
| `esc` | Go back |
 
---

## 🗺️ Roadmap

- [x] REST API with FastAPI to list pods
- [x] RBAC with ServiceAccount and minimal permissions
- [x] Dockerfile and deployment on k3s
- [x] Web frontend with pod table and color-coded status
- [x] WebSocket watcher (real-time updates)
- [x] Delete pod button from the UI
- [x] livenessProbe and readinessProbe
- [x] Namespace filter in the UI
- [x] Pod log viewer from the UI
- [x] Deployed frontend in cluster
- [x] Ingress for access via `kube-watcher.local`

---

## 📚 Resources

- [Kubernetes Python Client](https://github.com/kubernetes-client/python)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [k3s — Lightweight Kubernetes](https://k3s.io/)
- [k9s TUI](https://k9scli.io/)
- [RBAC Authorization — Kubernetes Docs](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

---

## 👤 Author

Personal project for learning Kubernetes and cloud-native development.

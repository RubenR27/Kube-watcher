from kubernetes import client, config

def get_pod_status():
    try:
        config.load_kube_config()
    except:
        config.load_incluster_config()

    v1 = client.CoreV1Api()
    ret = v1.list_pod_for_all_namespaces(watch=False)

    result = []

    for pod in ret.items:
        if pod.metadata.namespace != "kube-system" and pod.status.phase == "Running":
            
            containers = []
            for c in pod.spec.containers:
                containers.append({
                    "name": c.name,
                    "image": c.image
                })

            result.append({
                "name": pod.metadata.name,
                "namespace": pod.metadata.namespace,
                "status": pod.status.phase,
                "pod_ip": pod.status.pod_ip,
                "node": pod.spec.node_name,
                "containers": containers,
                "restarts": sum(cs.restart_count for cs in pod.status.container_statuses or []),
                "start_time": str(pod.status.start_time)
            })

    return result
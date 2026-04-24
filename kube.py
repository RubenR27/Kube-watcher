from kubernetes import client, config, watch
from fastapi import WebSocket
from fastapi.responses import PlainTextResponse
import asyncio
from datetime import datetime, timezone


def init_kube_config():
    try:
        config.load_incluster_config()
    except:
        try:
            config.load_kube_config()
        except:
            print("No se pudo cargar ninguna configuración")

def format_pod_info(pod):    
    container_statuses = pod.status.container_statuses or []
    ready_count = sum(1 for cs in container_statuses if cs.ready)
    total_containers = len(pod.spec.containers)
    ready_str = f"{ready_count}/{total_containers}"

    restarts = sum(cs.restart_count for cs in container_statuses)

    age = "N/A"
    if pod.status.start_time:
        diff = datetime.now(timezone.utc) - pod.status.start_time
        days = diff.days
        hours, remainder = divmod(diff.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        if days > 0: age = f"{days}d"
        elif hours > 0: age = f"{hours}h"
        elif minutes > 0: age = f"{minutes}m"
        else: age = f"{seconds}s"

    return {
        "name": pod.metadata.name,
        "namespace": pod.metadata.namespace,
        "status": pod.status.phase,
        "ready": ready_str,
        "restarts": restarts,
        "node": pod.spec.node_name or "—",
        "age": age,
        "pod_ip": pod.status.pod_ip
    }

def get_pod_status(namespace: str = None):
    v1 = client.CoreV1Api()
    
    if namespace is None or namespace == "" or namespace == "all":
        ret = v1.list_pod_for_all_namespaces()
    else:
        ret = v1.list_namespaced_pod(namespace)
    
    return [format_pod_info(pod) for pod in ret.items]

async def ws_pod_status(websocket: WebSocket, namespace: str = "default"):
    await websocket.accept()
    v1 = client.CoreV1Api()
    w = watch.Watch()
    
    try:
        func = v1.list_pod_for_all_namespaces if (namespace == "all" or not namespace) else v1.list_namespaced_pod
        args = {} if (namespace == "all" or not namespace) else {"namespace": namespace}

        for event in w.stream(func, **args):
            payload = {
                "type": event["type"], 
                "pod": format_pod_info(event["object"])
            }
            await websocket.send_json(payload)
            await asyncio.sleep(0.1)
    except Exception as e:
        print(f"Error en el stream de pods: {e}")
    finally:
        w.stop()

def delete_pod(namespace: str, name: str):
    v1 = client.CoreV1Api()
    try:
        v1.delete_namespaced_pod(name=name, namespace=namespace)
        return {"status": "success", "message": f"Pod {name} deleted"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def get_pod_logs(namespace: str, name: str, tail: int = 200):
    v1 = client.CoreV1Api()
    try:
        logs = v1.read_namespaced_pod_log(name=name, namespace=namespace, tail_lines=tail)
        return logs
    except Exception as e:
        return f"Error al obtener logs: {str(e)}"
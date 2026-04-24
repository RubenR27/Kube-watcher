from fastapi import FastAPI, HTTPException, Query
from fastapi.concurrency import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from fastapi import WebSocket
import asyncio
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from fastapi.responses import PlainTextResponse

from kube import (
    get_pod_status as kube_get_pod_status, 
    ws_pod_status as kube_ws_handler, 
    delete_pod as kube_delete_logic, 
    get_pod_logs as kube_get_logs_logic,
    init_kube_config
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Iniciando conexión con Kubernetes...")
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, init_kube_config)
        print("Conexión con Kubernetes establecida correctamente.")
    except Exception as e:
        print(f"Error crítico al conectar con K3s: {e}")
    
    yield
    
    print("Cerrando recursos del servidor...")

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

@app.get("/", response_class=FileResponse)
async def get_index():
    return "frontend/index.html"

@app.get("/pods")
async def get_all_pods():
    try:
        return kube_get_pod_status(namespace=None) 
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Kube Error: {str(e)}")

@app.get("/pods/{namespace}")
async def get_pods_by_namespace(namespace: str):
    try:
        return kube_get_pod_status(namespace)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/pods")
async def websocket_endpoint(websocket: WebSocket, namespace: str = Query("default")):
    await kube_ws_handler(websocket, namespace)

@app.delete("/pods/{namespace}/{name}")
async def delete_pod_endpoint(namespace: str, name: str):
    try:
        result = kube_delete_logic(namespace, name)
        return {"message": "deleted", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/pods/{namespace}/{name}/logs", response_class=PlainTextResponse)
async def get_logs_endpoint(namespace: str, name: str, tail: int = 200):
    try:
        logs = kube_get_logs_logic(namespace, name, tail)
        return PlainTextResponse(logs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/healthz")
def health():
    return {"status": "ok"}

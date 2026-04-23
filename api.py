from fastapi import FastAPI, HTTPException
from kube import get_pod_status

app = FastAPI()

@app.get("/pods")
async def get_pods():
    try:
        pods = get_pod_status()
        return pods
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
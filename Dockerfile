FROM python:3.13-slim

WORKDIR /app

COPY  api.py /app/api.py
COPY kube.py /app/kube.py

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


EXPOSE 8000
CMD [ "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000" ]
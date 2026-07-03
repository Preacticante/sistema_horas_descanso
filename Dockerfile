FROM python:3.11-slim

# Instalar dependencias del sistema necesarias para pyodbc
RUN apt-get update && apt-get install -y \
    unixodbc-dev \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar requerimientos e instalar
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copiar todo el código fuente
COPY . .

# Ajustar la ruta para que Python encuentre los módulos
ENV PYTHONPATH=/app/backend

# Comando de ejecución
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
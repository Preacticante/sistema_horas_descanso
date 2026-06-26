from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.database import obtener_conexion

app = FastAPI(title="Sistema de Horas Extra API")

# Permitir que tu Frontend (Live Server) lea los datos sin bloqueos de seguridad (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def inicio():
    return {"status": "online", "mensaje": "Conexión base lista"}

# RUTA REAL PARA TRAER LOS EMPLEADOS DESDE SQL SERVER
@app.get("/api/empleados")
def listar_empleados():
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()
        
        # Ejecutamos la consulta en tu base de datos real
        # Consulta que trae todos los empleados de la tabla tblEmployees
        cursor.execute("SELECT * FROM tblEmployees")
        rows = cursor.fetchall()
        
        # Obtener los nombres de las columnas
        column_names = [description[0] for description in cursor.description]
        
        empleados = []
        for row in rows:
            # Convertir cada fila en un diccionario usando los nombres de columnas
            empleado_dict = dict(zip(column_names, row))
            
            # Mapear los datos al formato esperado por el frontend
            empleados.append({
                "id": empleado_dict.get("iEmployeeNum") or 0,
                "nombre": f"{empleado_dict.get('tFirstName') or ''} {empleado_dict.get('tLastName') or ''}".strip(),
                "numero_empleado": empleado_dict.get("iEmployeeNum") or 0,
                "saldo_horas": 0.0  # tblEmployees no tiene columna de saldo de horas
            })
            
        cursor.close()
        conn.close()
        return empleados
        
    except Exception as e:
        print(f"Error al listar empleados: {e}")
        raise HTTPException(status_code=500, detail=f"Error en la base de datos: {str(e)}")

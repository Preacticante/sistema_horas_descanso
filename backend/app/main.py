from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.database import obtener_conexion
from datetime import datetime

app = FastAPI(title="Sistema de Horas Extra API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RegistroHoras(BaseModel):
    numero_empleado: int
    cantidad_horas: float

@app.get("/")
def inicio():
    return {"status": "online", "mensaje": "Conexión base lista"}

# ==========================================================
# RUTA ACTUALIZADA: PROCESA LAS ENTRADAS/SALIDAS DE LA VISTA
# ==========================================================
@app.get("/api/empleados")
def listar_empleados():
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()
        
        # 1. Traemos todos los eventos de checado de la vista del torniquete
        # Traemos IdEmpNum, la fecha/hora y el nombre completo
        cursor.execute("""
            SELECT IdEmpNum, dtEventReal, tFullName 
            FROM ViewEventNetworks 
            WHERE IdEmpNum IS NOT NULL AND dtEventReal IS NOT NULL
            ORDER BY IdEmpNum, dtEventReal ASC
        """)
        eventos = cursor.fetchall()
        
       
        control_asistencia = {}
        nombres_empleados = {} # Guardar el nombre asociado al ID
        
        for ev in eventos:
            emp_id = ev[0]
            fecha_hora = ev[1] # Esto es un objeto datetime de Python
            nombre = ev[2]
            
            if not emp_id:
                continue
                
            nombres_empleados[emp_id] = nombre if nombre else f"Empleado {emp_id}"
            
            fecha_str = fecha_hora.strftime("%Y-%m-%d")
            
            if emp_id not in control_asistencia:
                control_asistencia[emp_id] = {}
            if fecha_str not in control_asistencia[emp_id]:
                control_asistencia[emp_id][fecha_str] = []
                
            control_asistencia[emp_id][fecha_str].append(fecha_hora)
            
        # 2. Procesamos las horas por cada empleado
        empleados_resultado = []
        
        # Traemos también los ajustes manuales si creaste la tabla tblOvertimeRecords
        saldos_manuales = {}
        try:
            cursor.execute("SELECT iEmployeeNum, SUM(fHours) FROM tblOvertimeRecords GROUP BY iEmployeeNum")
            saldos_manuales = {row[0]: row[1] for row in cursor.fetchall()}
        except Exception:
            # Si no existe la tabla de ajustes manuales todavía, la ignoramos y el saldo manual es 0
            pass

        for emp_id, dias in control_asistencia.items():
            saldo_horas_extra = 0.0
            
            for fecha, marcajes in dias.items():
                if len(marcajes) >= 2:
                    entrada = marcajes[0]   # El primer checado del día
                    salida = marcajes[-1]   # El último checado del día
                    
                    # Calculamos la diferencia en horas
                    diferencia = salida - entrada
                    horas_trabajadas = diferencia.total_seconds() / 3600.0
                    
                    # Supongamos que la jornada estándar son 8.5 horas 
                    JORNADA_LABORAL = 8.5 
                    
                    if horas_trabajadas > JORNADA_LABORAL:
                        # Si trabajó de más, sumamos la diferencia al banco de horas
                        saldo_horas_extra += (horas_trabajadas - JORNADA_LABORAL)
            
            # Le sumamos los ajustes manuales si es que tiene alguno guardado
            saldo_total = saldo_horas_extra + float(saldos_manuales.get(emp_id, 0.0))
            
            # Añadimos al JSON final redondeando a 2 decimales
            empleados_resultado.append({
                "id": emp_id,
                "nombre": nombres_empleados.get(emp_id, f"Empleado {emp_id}"),
                "numero_empleado": emp_id,
                "saldo_horas": round(saldo_total, 2)
            })
            
        cursor.close()
        conn.close()
        return empleados_resultado
        
    except Exception as e:
        print(f"Error al procesar la asistencia: {e}")
        raise HTTPException(status_code=500, detail=f"Error en el servidor: {str(e)}")

@app.post("/api/registrar")
def registrar_horas(datos: RegistroHoras):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()
        
        # Validamos si el empleado existe registrando un marcaje ficticio o en la tabla de ajustes
        cursor.execute("""
            INSERT INTO tblOvertimeRecords (iEmployeeNum, fHours)
            VALUES (?, ?)
        """, datos.numero_empleado, datos.cantidad_horas)
        
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "mensaje": "Ajuste de horas guardado e indexado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
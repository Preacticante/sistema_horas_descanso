from typing import Optional
from datetime import datetime, date, timedelta

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.database import obtener_conexion

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

EMPLEADOS_DASHBOARD = {
    1,
    2,
    55,
    57,
    58,
    72,
    74,
    76,
    78,
    80,
    83,
    84,
    85,
    90,
    91,
    92,
    93,
    94,
    119,
    126,
    127,
    128,
    129,
    130,
    131,
    132,
    133,
    134,
    135,
    136,
    137,
    138,
    140,
    141,
    142,
    143,
    144,
    145,
    146,
    147,
    148,
    274,
    275,
    276,
    279,
    727,
    728,
    732,
    738,
    739,
    740,
}

@app.get("/")
def inicio():
    return {"status": "online", "mensaje": "Conexión base lista"}

# ==========================================================
# RUTA ACTUALIZADA: PROCESA LAS ENTRADAS/SALIDAS DE LA VISTA
# ==========================================================
@app.get("/api/empleados")
def listar_empleados(fecha_inicio: Optional[date] = None, fecha_fin: Optional[date] = None):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        if fecha_inicio is None:
            fecha_inicio = date(2025, 8, 1)
        if fecha_fin is None:
            fecha_fin = date(2025, 8, 16)

        # Aseguramos que la sesión use idioma español para DATENAME(WEEKDAY)
        cursor.execute("SET LANGUAGE Spanish;")

        ids_permitidos = ",".join(str(i) for i in sorted(EMPLEADOS_DASHBOARD))
        cursor.execute(f"""
            WITH Eventos AS (
                SELECT
                    e.IdAutoEvents,
                    e.IdEmpNum,
                    e.tFullName,
                    CAST(e.dtEventReal AS date) AS Fecha,
                    e.dtEventReal,
                    e.IdReader,
                    e.IdPanel,
                    emp.IdAccessGroup,
                    emp.IdDepartment,
                    DATENAME(WEEKDAY, e.dtEventReal) AS NombreDia,
                    CASE
                        WHEN emp.IdAccessGroup IN (5, 9) THEN
                            CASE
                                WHEN e.IdPanel = 1 AND e.IdReader = 1 THEN 'Salida'
                                WHEN e.IdPanel = 1 AND e.IdReader = 2 THEN 'Entrada'
                                WHEN e.IdPanel = 3 AND e.IdReader = 10 THEN 'Salida'
                                WHEN e.IdPanel = 3 AND e.IdReader = 9 THEN 'Entrada'
                                WHEN e.IdPanel = 4 AND e.IdReader = 11 THEN 'Salida'
                                WHEN e.IdPanel = 4 AND e.IdReader = 12 THEN 'Entrada'
                            END
                        WHEN emp.IdAccessGroup = 6 THEN
                            CASE
                                WHEN e.IdPanel = 1 AND e.IdReader = 1 THEN 'Entrada'
                                WHEN e.IdPanel = 1 AND e.IdReader = 2 THEN 'Salida'
                                WHEN e.IdPanel = 3 AND e.IdReader = 10 THEN 'Entrada'
                                WHEN e.IdPanel = 3 AND e.IdReader = 9 THEN 'Salida'
                                WHEN e.IdPanel = 4 AND e.IdReader = 11 THEN 'Entrada'
                                WHEN e.IdPanel = 4 AND e.IdReader = 12 THEN 'Salida'
                            END
                        WHEN emp.IdAccessGroup IN (1, 2, 3, 8) THEN
                            CASE
                                WHEN e.IdPanel = 1 AND e.IdReader = 1 THEN 'Entrada'
                                WHEN e.IdPanel = 1 AND e.IdReader = 2 THEN 'Salida'
                                WHEN e.IdPanel = 3 AND e.IdReader = 10 THEN 'Entrada'
                                WHEN e.IdPanel = 3 AND e.IdReader = 9 THEN 'Salida'
                                WHEN e.IdPanel = 4 AND e.IdReader = 11 THEN 'Entrada'
                                WHEN e.IdPanel = 4 AND e.IdReader = 12 THEN 'Salida'
                            END
                        ELSE 'NO CLASIFICADO'
                    END AS TipoEvento
                FROM [AxTrax1].[dbo].[tblEvents] e
                INNER JOIN [AxTrax1].[dbo].[tblEmployees] emp
                    ON emp.iEmployeeNum = e.IdEmpNum
                WHERE e.dtEventReal >= ?
                  AND e.dtEventReal < ?
                  AND (
                        (e.IdPanel = 1 AND e.IdReader IN (1, 2))
                     OR (e.IdPanel = 3 AND e.IdReader IN (9, 10))
                     OR (e.IdPanel = 4 AND e.IdReader IN (11, 12))
                  )
            ),
            Entradas AS (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY IdEmpNum, Fecha, IdPanel
                    ORDER BY dtEventReal
                ) AS NumEvento
                FROM Eventos
                WHERE TipoEvento = 'Entrada'
            ),
            Salidas AS (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY IdEmpNum, Fecha, IdPanel
                    ORDER BY dtEventReal
                ) AS NumEvento
                FROM Eventos
                WHERE TipoEvento = 'Salida'
            ),
            Duraciones AS (
                SELECT
                    E.IdEmpNum,
                    E.tFullName,
                    E.Fecha,
                    E.NombreDia,
                    E.IdPanel,
                    E.IdAccessGroup,
                    E.IdDepartment,
                    E.dtEventReal AS HoraEntradaCompleta,
                    S.dtEventReal AS HoraSalidaCompleta,
                    CAST(DATEDIFF(MINUTE, E.dtEventReal, S.dtEventReal) / 60.0 AS decimal(10,2)) AS DuracionHoras
                FROM Entradas E
                INNER JOIN Salidas S
                    ON S.IdEmpNum = E.IdEmpNum
                   AND S.Fecha = E.Fecha
                   AND S.IdPanel = E.IdPanel
                   AND S.NumEvento = E.NumEvento
                   AND S.dtEventReal > E.dtEventReal
            ),
            DuracionMayorPorDia AS (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY IdEmpNum, Fecha
                    ORDER BY DuracionHoras DESC
                ) AS RN
                FROM Duraciones
            ),
            DiasCalculados AS (
                SELECT
                    D.IdEmpNum,
                    D.tFullName,
                    D.Fecha,
                    D.NombreDia,
                    D.HoraEntradaCompleta,
                    D.HoraSalidaCompleta,
                    D.DuracionHoras,
                    D.IdAccessGroup,
                    D.IdDepartment,
                    H.HorarioInicio,
                    H.HorarioFinal,
                    CASE WHEN CAST(D.HoraEntradaCompleta AS time) > H.HorarioInicio THEN 1 ELSE 0 END AS LlegoTarde,
                    CASE WHEN CAST(D.HoraSalidaCompleta AS time) < H.HorarioFinal THEN 1 ELSE 0 END AS SalioTemprano
                FROM DuracionMayorPorDia D
                INNER JOIN dbo.tblHorariosEmployees H
                    ON H.IdEmpNum = D.IdEmpNum
                    AND H.DiaSemana = D.NombreDia
                WHERE D.RN = 1
            )
            SELECT
                IdEmpNum,
                tFullName AS NombreUsuario,
                ? AS FechaInicial,
                DATEADD(DAY, -1, ?) AS FechaFinal,
                IdAccessGroup,
                IdDepartment,
                SUM(DuracionHoras) AS TotalHoras,
                SUM(LlegoTarde) AS LlegadasTarde,
                SUM(SalioTemprano) AS SalidasTemprano
            FROM DiasCalculados
            WHERE IdEmpNum IN ({ids_permitidos})
            GROUP BY
                IdEmpNum,
                tFullName,
                IdAccessGroup,
                IdDepartment
            ORDER BY IdEmpNum;
        """, fecha_inicio, fecha_fin, fecha_inicio, fecha_fin)

        filas = cursor.fetchall()

        cursor.execute(f"SELECT iEmployeeNum, tFullName FROM dbo.tblEmployees WHERE iEmployeeNum IN ({ids_permitidos})")
        nombres = {row[0]: row[1] for row in cursor.fetchall()}

        cursor.close()
        conn.close()

        resumen_por_empleado = {
            fila[0]: {
                "id": fila[0],
                "nombre": fila[1],
                "numero_empleado": fila[0],
                "total_horas": float(fila[6] or 0.0),
                "llegadas_tarde": int(fila[7] or 0),
                "salidas_temprano": int(fila[8] or 0),
            }
            for fila in filas
        }

        resultado = []
        for emp_id in sorted(EMPLEADOS_DASHBOARD):
            empleado = resumen_por_empleado.get(emp_id)
            if empleado is None:
                resultado.append({
                    "id": emp_id,
                    "nombre": nombres.get(emp_id, f"Empleado {emp_id}"),
                    "numero_empleado": emp_id,
                    "total_horas": 0.0,
                    "llegadas_tarde": 0,
                    "salidas_temprano": 0,
                })
            else:
                resultado.append(empleado)

        return resultado
    except Exception as e:
        print(f"Error al procesar la consulta de horas: {e}")
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
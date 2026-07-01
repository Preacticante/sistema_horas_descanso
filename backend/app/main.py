import re
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
    dias_semana: list[date] = []

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

EMPLEADOS_NOMBRES = {
    1: "Nelson",
    2: "Luis Francisco Valencia Villasana",
    55: "Martín Bocanegra Lucio",
    57: "Gabriel Vallejo Balderas",
    58: "Juan Domínguez Morales",
    72: "Juan Alberto Zamora Gutiérrez",
    74: "Alberto Jiménez Ruíz",
    76: "José Arreola Morales",
    78: "Juan José Fabián Ramos",
    80: "Yolanda Ramírez García",
    83: "Sergio Antonio Pérez Reséndiz",
    84: "Omar Rodríguez Montoya",
    85: "Mariana Díaz Morales",
    90: "Baruch Alberto",
    91: "Cinthia Flores López",
    92: "Viridiana Ramírez Rojas",
    93: "María Eugenia Montalvo Cosme",
    94: "Álvaro Patiño Botello",
    119: "Eva Angélica Balderas Rojas",
    126: "José Aguas García",
    127: "Roberto Carlos Matehuala Vargas",
    128: "Alma Leticia Muñiz Núñez",
    129: "Dania Sánchez Espino",
    130: "Armando Ramírez Mejía",
    131: "Cecilia de Lourdes Bracho Rodríguez",
    132: "Laura Leticia González González",
    133: "Francisco Javier Limón Naranjo",
    134: "María del Carmen Mendoza Aldape",
    135: "Christopher Arturo Muciño González",
    136: "María Teresa Serrano Lazcano",
    137: "Daniela Fernanda Jiménez Vázquez",
    138: "Erik Gabriel Rojas López",
    140: "Yeniffer Gutiérrez Andrade",
    141: "José Manuel Martínez Alonso",
    142: "Tania Ibette León Flores",
    143: "Miguel Ángel Hernández Tamayo",
    144: "Alicia Ruiz García",
    145: "Alma Cristina Rodríguez Zúñiga",
    146: "Luis Roberto López Yáñez",
    147: "María Guadalupe Garrido García",
    148: "Paula María Corte González",
    274: "Andrea Anguiano Villegas",
    275: "Gerardo Morales Medrano",
    276: "Diana Laura Uribe Núñez",
    279: "Mariano Rivera Sánchez",
    727: "Ma. Guadalupe Ruíz Ramírez",
    728: "Angélica María Cruz Lugo",
    732: "Monserrat Mier Avila",
    738: "Salvador Ordoñez Martínez",
    739: "Irma Lilia",
    740: "Rolando Aranda Gutiérrez",
}

@app.get("/")
def inicio():
    return {"status": "online", "mensaje": "Conexión base lista"}

@app.get("/api/dashboard-resumen")
def dashboard_resumen():
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        # Total de horas en el banco
        cursor.execute("SELECT ISNULL(SUM(fHoras), 0) FROM dbo.tblBancoHorasKardex")
        total_horas = float(cursor.fetchone()[0] or 0.0)

        # Contar empleados con horas positivas (pendientes) vs negativas (aprobadas)
        cursor.execute("""
            SELECT
                SUM(CASE WHEN fHoras > 0 THEN 1 ELSE 0 END) AS empleados_pendientes,
                SUM(CASE WHEN fHoras < 0 THEN 1 ELSE 0 END) AS empleados_aprobadas
            FROM (
                SELECT DISTINCT IdEmpNum, SUM(fHoras) AS fHoras
                FROM dbo.tblBancoHorasKardex
                GROUP BY IdEmpNum
            ) AS resumen
        """)
        resultado = cursor.fetchone()
        empleados_pendientes = int(resultado[0] or 0)
        empleados_aprobadas = int(resultado[1] or 0)

        # Eficiencia: porcentaje de empleados con horas negativas
        cursor.execute("SELECT COUNT(DISTINCT IdEmpNum) FROM dbo.tblBancoHorasKardex")
        total_empleados = int(cursor.fetchone()[0] or 1)
        eficiencia = (empleados_aprobadas / total_empleados * 100) if total_empleados > 0 else 0.0

        cursor.close()
        conn.close()

        return {
            "total_horas": total_horas,
            "empleados_pendientes": empleados_pendientes,
            "empleados_aprobadas": empleados_aprobadas,
            "eficiencia": eficiencia,
        }
    except Exception as e:
        print(f"Error al generar resumen del dashboard: {e}")
        raise HTTPException(status_code=500, detail=f"Error en el servidor: {str(e)}")

# ==========================================================
# RUTA ACTUALIZADA: PROCESA LAS ENTRADAS/SALIDAS DE LA VISTA
# ==========================================================
@app.get("/api/empleados")
def listar_empleados(
    ids: Optional[str] = None,
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    all: bool = False,
):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        if fecha_inicio is None:
            fecha_inicio = date(2025, 8, 1)
        if fecha_fin is None:
            fecha_fin = date(2025, 8, 16)

        # Aseguramos que la sesión use idioma español para DATENAME(WEEKDAY)
        cursor.execute("SET LANGUAGE Spanish;")

        if all:
            cursor.execute("""
                SELECT DISTINCT e.iEmployeeNum, LTRIM(RTRIM(CONCAT(e.tFirstName, ' ', COALESCE(e.tMiddleName, ''), ' ', e.tLastName))) AS tFullName
                FROM dbo.tblEmployees e
                INNER JOIN dbo.tblOrganigramaOficial o ON e.iEmployeeNum = o.IdEmpNum
                ORDER BY e.iEmployeeNum
            """)
            empleados_db = cursor.fetchall()
            cursor.execute("SELECT IdEmpNum, SUM(fHoras) AS HorasBanco FROM dbo.tblBancoHorasKardex GROUP BY IdEmpNum")
            horas_db = {row[0]: float(row[1] or 0.0) for row in cursor.fetchall()}

            resultado = []
            for row in empleados_db:
                emp_id = int(row[0])
                nombre = row[1].strip() if row[1] else f"Empleado {emp_id}"
                resultado.append({
                    "id": emp_id,
                    "nombre": nombre,
                    "numero_empleado": emp_id,
                    "total_horas": horas_db.get(emp_id, 0.0),
                    "llegadas_tarde": 0,
                    "salidas_temprano": 0,
                })

            cursor.close()
            conn.close()
            return resultado

        if ids:
            ids_parsed = [int(x) for x in re.split(r"[\s,;]+", ids.strip()) if x.strip().isdigit()]
            if ids_parsed:
                ids_permitidos = ",".join(str(i) for i in sorted(set(ids_parsed)))
            else:
                ids_permitidos = ",".join(str(i) for i in sorted(EMPLEADOS_DASHBOARD))
        else:
            ids_permitidos = ",".join(str(i) for i in sorted(EMPLEADOS_DASHBOARD))

        cursor.execute(f"""
            WITH Eventos AS (
                SELECT
                    e.IdAutoEvents,
                    e.IdEmpNum,
                    LTRIM(RTRIM(CONCAT(emp.tFirstName, ' ', COALESCE(emp.tMiddleName, ''), ' ', emp.tLastName))) AS tFullName,
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
            ),
            Banco AS (
                SELECT
                    IdEmpNum,
                    SUM(fHoras) AS HorasBanco
                FROM dbo.tblBancoHorasKardex
                GROUP BY IdEmpNum
            )
            SELECT
                D.IdEmpNum,
                D.tFullName AS NombreUsuario,
                ? AS FechaInicial,
                DATEADD(DAY, -1, ?) AS FechaFinal,
                D.IdAccessGroup,
                D.IdDepartment,
                COALESCE(B.HorasBanco, 0) AS TotalHoras,
                SUM(D.SalioTemprano) AS SalidasTemprano
            FROM DiasCalculados D
            LEFT JOIN Banco B
                ON B.IdEmpNum = D.IdEmpNum
            WHERE D.IdEmpNum IN ({ids_permitidos})
            GROUP BY
                D.IdEmpNum,
                D.tFullName,
                D.IdAccessGroup,
                D.IdDepartment,
                B.HorasBanco
            ORDER BY D.IdEmpNum;
        """, fecha_inicio, fecha_fin, fecha_inicio, fecha_fin)

        filas = cursor.fetchall()

        if not all:
            cursor.execute(f"SELECT iEmployeeNum, LTRIM(RTRIM(CONCAT(tFirstName, ' ', COALESCE(tMiddleName, ''), ' ', tLastName))) AS tFullName FROM dbo.tblEmployees WHERE iEmployeeNum IN ({ids_permitidos})")
            nombres = {emp_id: EMPLEADOS_NOMBRES[emp_id] for emp_id in sorted(EMPLEADOS_DASHBOARD) if emp_id in EMPLEADOS_NOMBRES}
            for row in cursor.fetchall():
                nombre = row[1].strip() if row[1] else ""
                if nombre:
                    nombres[row[0]] = nombre

            cursor.execute(f"SELECT IdEmpNum, SUM(fHoras) AS HorasBanco FROM dbo.tblBancoHorasKardex WHERE IdEmpNum IN ({ids_permitidos}) GROUP BY IdEmpNum")
            horas_db = {row[0]: float(row[1] or 0.0) for row in cursor.fetchall()}
        else:
            nombres = nombres if 'nombres' in locals() else {}
            horas_db = {}

        cursor.close()
        conn.close()

        resumen_por_empleado = {
            fila[0]: {
                "id": fila[0],
                "nombre": fila[1],
                "numero_empleado": fila[0],
                "total_horas": float(fila[6] or 0.0),
                "salidas_temprano": int(fila[7] or 0),
            }
            for fila in filas
        }

        if ids:
            # Cuando se pasan ids explícitos, devolver solo esos ids en el resultado
            todos_ids = sorted(ids_parsed) if 'ids_parsed' in locals() else sorted(EMPLEADOS_DASHBOARD)
        elif all:
            todos_ids = sorted(nombres.keys())
        else:
            todos_ids = sorted(EMPLEADOS_DASHBOARD)

        resultado = []
        for emp_id in todos_ids:
            empleado = resumen_por_empleado.get(emp_id)
            if ids:
                # Cuando se filtra por ids, incluir empleados que aparecen en el resumen
                # o, si no tienen eventos pero existen en la tabla de empleados, devolver un placeholder.
                if empleado is not None:
                    resultado.append(empleado)
                else:
                    # si existe en nombres (consulta a tblEmployees), devolver fila con ceros
                    if 'nombres' in locals() and emp_id in nombres:
                        resultado.append({
                            "id": emp_id,
                            "nombre": nombres.get(emp_id, f"Empleado {emp_id}"),
                            "numero_empleado": emp_id,
                            "total_horas": float(horas_db.get(emp_id, 0.0)),
                            "salidas_temprano": 0,
                        })
                    else:
                        # omitir IDs que no existen en la base de datos
                        continue
            else:
                # Comportamiento anterior: rellenar con valores por defecto cuando no hay datos
                if empleado is None:
                    resultado.append({
                        "id": emp_id,
                        "nombre": nombres.get(emp_id, f"Empleado {emp_id}"),
                        "numero_empleado": emp_id,
                        "total_horas": 0.0,
                        "salidas_temprano": 0,
                    })
                else:
                    resultado.append(empleado)

        return resultado
    except Exception as e:
        print(f"Error al procesar la consulta de horas: {e}")
        raise HTTPException(status_code=500, detail=f"Error en el servidor: {str(e)}")

@app.get("/api/reportes")
def reportes(fecha_inicio: Optional[date] = None, fecha_fin: Optional[date] = None):
    if fecha_inicio is None:
        fecha_inicio = date(2025, 8, 1)
    if fecha_fin is None:
        fecha_fin = date(2025, 8, 16)

    try:
        conn = obtener_conexion()
        cursor = conn.cursor()
        cursor.execute("SET LANGUAGE Spanish;")

        ids_permitidos = ",".join(str(i) for i in sorted(EMPLEADOS_DASHBOARD))

        cursor.execute(f"""
            WITH Eventos AS (
                SELECT
                    e.IdEmpNum,
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
                  AND e.dtEventReal <= ?
                  AND emp.iEmployeeNum IN ({ids_permitidos})
            ),
            Salidas AS (
                SELECT IdEmpNum, COUNT(*) AS ConteoSalidas
                FROM Eventos
                WHERE TipoEvento = 'Salida'
                GROUP BY IdEmpNum
            )
            SELECT
                emp.iEmployeeNum,
                LTRIM(RTRIM(CONCAT(emp.tFirstName, ' ', COALESCE(emp.tMiddleName, ''), ' ', emp.tLastName))) AS Nombre,
                ISNULL(h.HorasBanco, 0.0) AS HorasBanco,
                ISNULL(s.ConteoSalidas, 0) AS SalidasTemprano
            FROM dbo.tblEmployees emp
            LEFT JOIN (
                SELECT IdEmpNum, SUM(fHoras) AS HorasBanco
                FROM dbo.tblBancoHorasKardex
                WHERE FechaAfectacion >= ?
                  AND FechaAfectacion <= ?
                  AND IdEmpNum IN ({ids_permitidos})
                GROUP BY IdEmpNum
            ) h ON h.IdEmpNum = emp.iEmployeeNum
            LEFT JOIN Salidas s ON s.IdEmpNum = emp.iEmployeeNum
            WHERE emp.iEmployeeNum IN ({ids_permitidos})
            ORDER BY emp.iEmployeeNum
        """, fecha_inicio, fecha_fin, fecha_inicio, fecha_fin)

        filas = cursor.fetchall()
        cursor.close()
        conn.close()

        return [
            {
                "id": int(fila[0]),
                "nombre": fila[1].strip() if fila[1] else f"Empleado {fila[0]}",
                "total_horas": float(fila[2] or 0.0),
                "salidas_temprano": int(fila[3] or 0),
            }
            for fila in filas
        ]
    except Exception as e:
        print(f"Error al generar el reporte: {e}")
        raise HTTPException(status_code=500, detail=f"Error en el servidor: {str(e)}")

@app.get("/api/empleados/{id}/detalle")
def detalle_empleado(id: int, fecha_inicio: Optional[date] = None, fecha_fin: Optional[date] = None):
    if fecha_inicio is None:
        fecha_inicio = date(2025, 8, 1)
    if fecha_fin is None:
        fecha_fin = date(2025, 8, 16)

    try:
        conn = obtener_conexion()
        cursor = conn.cursor()
        cursor.execute("SET LANGUAGE Spanish;")

        cursor.execute("""
            SELECT
                k.FechaAfectacion,
                k.fHoras,
                k.tObservaciones
            FROM dbo.tblBancoHorasKardex k
            WHERE k.IdEmpNum = ?
              AND k.fHoras < 0
              AND k.FechaAfectacion >= ?
              AND k.FechaAfectacion <= ?
            ORDER BY k.FechaAfectacion DESC
        """, id, fecha_inicio, fecha_fin)

        filas = cursor.fetchall()
        cursor.close()
        conn.close()

        return {
            "id": id,
            "fecha_inicio": fecha_inicio.isoformat(),
            "fecha_fin": fecha_fin.isoformat(),
            "salidas_detalle": [
                {
                    "fecha_afectacion": fila[0].isoformat() if fila[0] else None,
                    "horas": float(fila[1] or 0.0),
                    "observaciones": fila[2] or "",
                }
                for fila in filas
            ],
        }
    except Exception as e:
        print(f"Error al obtener detalle del empleado {id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error en el servidor: {str(e)}")

@app.post("/api/registrar")
def registrar_horas(datos: RegistroHoras):
    if not datos.dias_semana:
        raise HTTPException(status_code=400, detail="Debes seleccionar al menos un día de la semana.")

    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        # Verificar que el empleado existe en tblOrganigramaOficial
        cursor.execute("SELECT IdEmpNum FROM dbo.tblOrganigramaOficial WHERE IdEmpNum = ?", datos.numero_empleado)
        empleado_existe = cursor.fetchone()
        if not empleado_existe:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail=f"El empleado con ID {datos.numero_empleado} no existe en el sistema.")

        dias_unicos = []
        for dia in datos.dias_semana:
            if dia not in dias_unicos:
                dias_unicos.append(dia)

        for dia in dias_unicos:
            observaciones = f"Descuento de {datos.cantidad_horas} hrs por salida temprana el {dia.isoformat()}"
            cursor.execute("""
                INSERT INTO dbo.tblBancoHorasKardex (
                    IdEmpNum,
                    FechaAfectacion,
                    fHoras,
                    tTipoTransaccion,
                    tObservaciones,
                    IdUsuarioAutoriza,
                    bActivo,
                    dtFechaEliminacion,
                    IdUsuarioElimina
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    'Ajuste',
                    ?,
                    NULL,
                    1,
                    '1900-01-01',
                    NULL
                )
            """, datos.numero_empleado, dia, -abs(datos.cantidad_horas), observaciones)

        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "mensaje": "Asignación de horas guardada e indexado"}
    except HTTPException:
        raise
    
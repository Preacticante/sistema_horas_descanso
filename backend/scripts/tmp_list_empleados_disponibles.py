from app.database import obtener_conexion

sql = """
SELECT TOP 10
    e.iEmployeeNum,
    LTRIM(RTRIM(CONCAT(e.tFirstName, ' ', COALESCE(e.tMiddleName, ''), ' ', e.tLastName))) AS Nombre
FROM dbo.tblEmployees e
LEFT JOIN dbo.tblUsuarios u
    ON u.iEmployeeNum = e.iEmployeeNum
WHERE u.iEmployeeNum IS NULL
ORDER BY e.iEmployeeNum
"""

conn = obtener_conexion()
cur = conn.cursor()
cur.execute(sql)
rows = cur.fetchall()
print("DISPONIBLES:", len(rows))
for r in rows:
    print(int(r[0]), "|", (r[1] or "").strip())
cur.close()
conn.close()

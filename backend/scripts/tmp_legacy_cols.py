from app.database import obtener_conexion

conn = obtener_conexion()
cur = conn.cursor()
cur.execute(
    """
    SELECT COLUMN_NAME, IS_NULLABLE, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'tbl_usuarios_sistema'
    ORDER BY ORDINAL_POSITION
    """
)
for row in cur.fetchall():
    print(f"{row[0]} | {row[1]} | {row[2]}")
cur.close()
conn.close()

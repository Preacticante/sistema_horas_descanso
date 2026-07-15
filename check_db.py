import sys
import os
sys.path.insert(0, r"C:\Users\becario.tie\Documents\GitHub\sistema_horas_descanso\backend")
os.chdir(r"C:\Users\becario.tie\Documents\GitHub\sistema_horas_descanso\backend")

from app.database import obtener_conexion

conn = obtener_conexion()
cur = conn.cursor()

for tabla in ["tblUsuarios", "tblUsuariosSistema"]:
    cur.execute(f"SELECT OBJECT_ID('dbo.{tabla}', 'U')")
    r = cur.fetchone()
    if r[0]:
        cur.execute(f"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{tabla}' ORDER BY ORDINAL_POSITION")
        cols = [c[0] for c in cur.fetchall()]
        cur.execute(f"SELECT COUNT(*) FROM dbo.{tabla}")
        cnt = cur.fetchone()[0]
        print(f"[{tabla}] filas={cnt} cols={cols}")
    else:
        print(f"[{tabla}] NO EXISTE")

cur.close()
conn.close()

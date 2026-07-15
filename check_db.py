import sys
import os
sys.path.insert(0, r"C:\Users\becario.tie\Documents\GitHub\sistema_horas_descanso\backend")
os.chdir(r"C:\Users\becario.tie\Documents\GitHub\sistema_horas_descanso\backend")

from app.database import obtener_conexion

conn = obtener_conexion()
cur = conn.cursor()

cur.execute("SELECT OBJECT_ID('dbo.tblUsuarios', 'U')")
r = cur.fetchone()
print("tblUsuarios existe:", r[0] is not None)

if r[0]:
    cur.execute("SELECT COUNT(*) FROM dbo.tblUsuarios")
    print("Total usuarios:", cur.fetchone()[0])
    cur.execute("SELECT TOP 5 IdUsuario, NombreUsuario, Email, Rol, Activo FROM dbo.tblUsuarios")
    for row in cur.fetchall():
        print(row)
else:
    print("TABLA NO EXISTE - ejecuta backend/db/crear_tabla_usuarios.sql primero")

cur.close()
conn.close()

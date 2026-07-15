from app.database import obtener_conexion

conn = obtener_conexion()
cur = conn.cursor()

cur.execute("SELECT OBJECT_ID('dbo.tblUsuarios', 'U')")
r = cur.fetchone()
print("tblUsuarios existe:", r[0] is not None)

if r[0]:
    cur.execute("SELECT COUNT(*) FROM dbo.tblUsuarios")
    print("Usuarios en BD:", cur.fetchone()[0])
else:
    print("TABLA NO EXISTE - hay que crearla primero")

cur.close()
conn.close()

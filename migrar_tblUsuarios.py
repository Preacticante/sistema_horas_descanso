import sys, os
sys.path.insert(0, r"C:\Users\becario.tie\Documents\GitHub\sistema_horas_descanso\backend")
os.chdir(r"C:\Users\becario.tie\Documents\GitHub\sistema_horas_descanso\backend")

from app.database import obtener_conexion

conn = obtener_conexion()
cur = conn.cursor()

# Agregar columnas faltantes a tblUsuarios (solo si no existen)
alteraciones = [
    ("Nombre",         "ALTER TABLE dbo.tblUsuarios ADD Nombre NVARCHAR(150) NULL"),
    ("NombreUsuario",  "ALTER TABLE dbo.tblUsuarios ADD NombreUsuario NVARCHAR(50) NULL"),
    ("Rol",            "ALTER TABLE dbo.tblUsuarios ADD Rol NVARCHAR(20) NOT NULL DEFAULT 'empleado'"),
    ("PasswordHash",   "ALTER TABLE dbo.tblUsuarios ADD PasswordHash VARBINARY(256) NULL"),
    ("PasswordSalt",   "ALTER TABLE dbo.tblUsuarios ADD PasswordSalt VARBINARY(128) NULL"),
    ("FechaCreacion",  "ALTER TABLE dbo.tblUsuarios ADD FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()"),
]

for col, sql in alteraciones:
    cur.execute(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME = 'tblUsuarios' AND COLUMN_NAME = ?", col
    )
    existe = cur.fetchone()[0]
    if not existe:
        cur.execute(sql)
        print(f"  + Columna '{col}' agregada")
    else:
        print(f"  ✓ Columna '{col}' ya existe")

# Agregar índice único en NombreUsuario y email si no existe
try:
    cur.execute("""
        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes 
            WHERE name = 'UQ_tblUsuarios_NombreUsuario' AND object_id = OBJECT_ID('dbo.tblUsuarios')
        )
        CREATE UNIQUE INDEX UQ_tblUsuarios_NombreUsuario ON dbo.tblUsuarios(NombreUsuario)
        WHERE NombreUsuario IS NOT NULL
    """)
    print("  + Índice único NombreUsuario creado")
except Exception as e:
    print(f"  ! Índice NombreUsuario: {e}")

conn.commit()
cur.close()
conn.close()
print("\nTabla tblUsuarios lista.")

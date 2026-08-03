import sys, os
sys.path.insert(0, r"C:\Users\becario.tie\Documents\GitHub\sistema_horas_descanso\backend")
os.chdir(r"C:\Users\becario.tie\Documents\GitHub\sistema_horas_descanso\backend")

from app.database import obtener_conexion

conn = obtener_conexion()
cur = conn.cursor()

# Agregar columnas faltantes a tbl_usuarios_sistema (solo si no existen)
alteraciones = [
    ("nombre_usuario", "ALTER TABLE dbo.tbl_usuarios_sistema ADD nombre_usuario NVARCHAR(50) NULL"),
    ("FechaCreacion", "ALTER TABLE dbo.tbl_usuarios_sistema ADD FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()"),
]

tabla = 'tbl_usuarios_sistema'
for col, sql in alteraciones:
    cur.execute(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME = ? AND COLUMN_NAME = ?", tabla, col
    )
    existe = cur.fetchone()[0]
    if not existe:
        cur.execute(sql)
        print(f"  + Columna '{col}' agregada")
    else:
        print(f"  ✓ Columna '{col}' ya existe")

# Agregar índice único en nombre_usuario si no existe
try:
    cur.execute("""
        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes 
            WHERE name = 'UQ_tbl_usuarios_sistema_nombre_usuario' AND object_id = OBJECT_ID('dbo.tbl_usuarios_sistema')
        )
        CREATE UNIQUE INDEX UQ_tbl_usuarios_sistema_nombre_usuario ON dbo.tbl_usuarios_sistema(nombre_usuario)
        WHERE nombre_usuario IS NOT NULL
    """)
    print("  + Índice único nombre_usuario creado")
except Exception as e:
    print(f"  ! Índice nombre_usuario: {e}")

conn.commit()
cur.close()
conn.close()
print("\nTabla tbl_usuarios_sistema lista.")

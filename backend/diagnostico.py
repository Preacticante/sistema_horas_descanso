import pyodbc
import os
from dotenv import load_dotenv

# Cargar variables del .env
load_dotenv()

SERVER = os.getenv("DB_SERVER")
DATABASE = os.getenv("DB_DATABASE")

print(f"Intentando conectar a: {SERVER}/{DATABASE}")

CONN_STR = (
    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
    f"SERVER={SERVER};"
    f"DATABASE={DATABASE};"
    f"Trusted_Connection=yes;"
    f"TrustServerCertificate=yes;"
)

try:
    print("\n1. Probando conexión...")
    conn = pyodbc.connect(CONN_STR)
    print("✓ Conexión exitosa a SQL Server")
    
    cursor = conn.cursor()
    
    print("\n2. Listando todas las tablas en la base de datos:")
    cursor.execute("""
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE='BASE TABLE'
    """)
    
    tablas = cursor.fetchall()
    if tablas:
        for tabla in tablas:
            print(f"   - {tabla[0]}")
    else:
        print("   ⚠ No hay tablas en la base de datos")
    
    print("\n3. Buscando tabla 'tblEmployees'...")
    cursor.execute("""
        SELECT COLUMN_NAME, DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'tblEmployees'
    """)
    
    columnas = cursor.fetchall()
    if columnas:
        print("   ✓ Tabla 'employees' encontrada. Columnas:")
        for col in columnas:
            print(f"      - {col[0]} ({col[1]})")
        
        print("\n4. Intentando hacer SELECT desde 'tblEmployees':")
        cursor.execute("SELECT * FROM tblEmployees")
        filas = cursor.fetchall()
        print(f"   ✓ {len(filas)} filas encontradas")
    else:
        print("   ✗ Tabla 'employees' NO encontrada")
        print("      Verifica el nombre exacto de la tabla (puede ser 'Employees', 'EMPLOYEES', etc.)")
    
    cursor.close()
    conn.close()
    
except Exception as e:
    print(f"✗ Error: {e}")

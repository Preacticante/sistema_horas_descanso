import pyodbc
import os
from dotenv import load_dotenv

# Cargar las variables del archivo .env
load_dotenv()

SERVER = os.getenv("DB_SERVER")
DATABASE = os.getenv("DB_DATABASE")

# Cadena de conexión limpia para SQL Server Express (Usa Windows Auth)
CONN_STR = (
    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
    f"SERVER={SERVER};"
    f"DATABASE={DATABASE};"
    f"Trusted_Connection=yes;"
    f"TrustServerCertificate=yes;"
)

def obtener_conexion():
    try:
        conexion = pyodbc.connect(CONN_STR)
        return conexion
    except Exception as e:
        print(f"Error crítico al conectar a SQL Server: {e}")
        raise e
import pyodbc
from pathlib import Path
import os
from dotenv import load_dotenv

# Cargar las variables del archivo .env desde la carpeta backend, independiente del directorio de trabajo actual
BASE_DIR = Path(__file__).resolve().parent
DOTENV_PATH = BASE_DIR.parent / ".env"
load_dotenv(dotenv_path=DOTENV_PATH)

SERVER = os.getenv("DB_SERVER")
DATABASE = os.getenv("DB_DATABASE")

if not SERVER or not DATABASE:
    raise RuntimeError(
        f"Faltan variables de entorno de base de datos. Verifica {DOTENV_PATH}"
    )

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
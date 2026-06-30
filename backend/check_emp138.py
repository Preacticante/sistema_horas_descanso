import os
import pyodbc
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / '.env')

conn = pyodbc.connect(
    'DRIVER={ODBC Driver 17 for SQL Server};'
    f"SERVER={os.getenv('DB_SERVER')};"
    f"DATABASE={os.getenv('DB_DATABASE')};"
    'Trusted_Connection=yes;'
    'TrustServerCertificate=yes;'
)
cur = conn.cursor()
cur.execute('SELECT iEmployeeNum, tFirstName, tMiddleName, tLastName FROM dbo.tblEmployees WHERE iEmployeeNum = 138')
print(cur.fetchone())
cur.close()
conn.close()

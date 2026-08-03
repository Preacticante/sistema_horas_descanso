import re
import hashlib

from app.database import obtener_conexion

EMAIL_OBJETIVO = "ah9267992@gmail.com.mx".strip().lower()
PASSWORD_TEMPORAL = "Prueba123!"
ROL = "Empleado"


def generar_hash_salt(password: str, salt: bytes | None = None) -> tuple[bytes, bytes]:
    if salt is None:
        salt = __import__("os").urandom(16)
    hash_bytes = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200000)
    return salt, hash_bytes


def username_disponible(cursor, base: str) -> str:
    candidato = base
    i = 1
    while True:
        cursor.execute("SELECT TOP 1 1 FROM dbo.tblUsuarios WHERE NombreUsuario = ?", candidato)
        if cursor.fetchone() is None:
            return candidato
        i += 1
        candidato = f"{base}{i}"


def limpiar_username(email: str) -> str:
    base = email.split("@")[0]
    base = re.sub(r"[^A-Za-z0-9_]", "", base)
    if len(base) < 4:
        base = f"emp_{base}" if base else "empleado"
    return base[:40]


conn = obtener_conexion()
cur = conn.cursor()

try:
    # 1) Si ya existe por correo, no duplicar
    cur.execute(
        "SELECT TOP 1 id, NombreUsuario, iEmployeeNum, bActivo FROM dbo.tblUsuarios WHERE LOWER(email)=LOWER(?)",
        EMAIL_OBJETIVO,
    )
    existente = cur.fetchone()
    if existente:
        print("YA_EXISTE")
        print(f"id={existente[0]} usuario={existente[1]} empleado={existente[2]} activo={existente[3]}")
        raise SystemExit(0)

    # 2) Buscar empleado libre
    cur.execute(
        """
        SELECT TOP 1
            e.iEmployeeNum,
            LTRIM(RTRIM(CONCAT(e.tFirstName, ' ', COALESCE(e.tMiddleName, ''), ' ', e.tLastName))) AS Nombre
        FROM dbo.tblEmployees e
        LEFT JOIN dbo.tblUsuarios u ON u.iEmployeeNum = e.iEmployeeNum
        WHERE u.iEmployeeNum IS NULL
        ORDER BY e.iEmployeeNum
        """
    )
    empleado = cur.fetchone()
    if not empleado:
        print("SIN_EMPLEADOS_DISPONIBLES")
        raise SystemExit(1)

    id_empleado = int(empleado[0])
    nombre = (empleado[1] or "Empleado de Prueba").strip()

    # 3) Username único
    base_username = limpiar_username(EMAIL_OBJETIVO)
    username = username_disponible(cur, base_username)

    # 4) Insert directo
    salt, hash_bytes = generar_hash_salt(PASSWORD_TEMPORAL)
    cur.execute(
        """
        INSERT INTO dbo.tblUsuarios
            (Nombre, NombreUsuario, email, [password], PasswordHash, PasswordSalt, Rol, iEmployeeNum, FechaCreacion, bActivo)
        VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, SYSUTCDATETIME(), 1)
        """,
        nombre,
        username,
        EMAIL_OBJETIVO,
        PASSWORD_TEMPORAL,
        hash_bytes,
        salt,
        ROL,
        id_empleado,
    )
    conn.commit()

    print("CREADO_OK")
    print(f"email={EMAIL_OBJETIVO}")
    print(f"usuario={username}")
    print(f"password_temporal={PASSWORD_TEMPORAL}")
    print(f"empleado={id_empleado}")
    print(f"nombre={nombre}")

finally:
    cur.close()
    conn.close()

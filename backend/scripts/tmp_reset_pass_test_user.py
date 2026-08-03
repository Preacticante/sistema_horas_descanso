import hashlib
import os

from app.database import obtener_conexion

EMAIL = "ah9267992@gmail.com.mx".strip().lower()
NEW_PASSWORD = "Prueba123"


def generar_hash_salt(password: str, salt: bytes | None = None) -> tuple[bytes, bytes]:
    if salt is None:
        salt = os.urandom(16)
    hash_bytes = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200000)
    return salt, hash_bytes


salt, hash_bytes = generar_hash_salt(NEW_PASSWORD)

conn = obtener_conexion()
cur = conn.cursor()

try:
    cur.execute(
        """
        UPDATE dbo.tblUsuarios
        SET [password] = ?, PasswordHash = ?, PasswordSalt = ?, bActivo = 1
        WHERE LOWER(email) = LOWER(?)
        """,
        NEW_PASSWORD,
        hash_bytes,
        salt,
        EMAIL,
    )
    updated_tblusuarios = cur.rowcount

    cur.execute(
        """
        UPDATE dbo.tbl_usuarios_sistema
        SET [password] = ?, PasswordHash = ?, PasswordSalt = ?, estatus = 1
        WHERE LOWER(email) = LOWER(?)
        """,
        NEW_PASSWORD,
        hash_bytes,
        salt,
        EMAIL,
    )
    updated_legacy = cur.rowcount

    conn.commit()
    print(f"OK tblUsuarios={updated_tblusuarios} legacy={updated_legacy} pass={NEW_PASSWORD}")
finally:
    cur.close()
    conn.close()

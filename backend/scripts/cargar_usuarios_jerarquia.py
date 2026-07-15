from __future__ import annotations

import csv
import hashlib
import os
from pathlib import Path
from typing import Optional

from app.database import obtener_conexion

# Uso:
#   python -m scripts.cargar_usuarios_jerarquia backend/db/usuarios_jerarquia.csv
#
# CSV esperado (encabezados):
# id_empleado,nombre,nombre_usuario,email,rol,password,id_jefe_directo_empleado,id_jefe_superior_empleado
#
# Notas:
# - Si password viene vacío, se usa DEFAULT_TEMP_PASSWORD.
# - Si nombre_usuario viene vacío, se genera desde el email.
# - Si rol viene vacío, se usa "empleado".

DEFAULT_TEMP_PASSWORD = "Cambio123!*"


def normalizar_rol_db(rol: str) -> str:
    valor = (rol or "empleado").strip().lower()
    if valor == "admin":
        return "Administrador"
    if valor == "jefe":
        return "Jefe"
    return "Empleado"


def generar_hash_salt(password: str, salt: bytes | None = None) -> tuple[bytes, bytes]:
    if salt is None:
        salt = os.urandom(16)
    hash_bytes = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200000)
    return salt, hash_bytes


def _to_int(value: str | None) -> Optional[int]:
    if value is None:
        return None
    v = value.strip()
    if not v:
        return None
    return int(v)


def cargar_csv(ruta_csv: Path) -> list[dict]:
    rows: list[dict] = []
    with ruta_csv.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        required = {"id_empleado", "nombre", "email"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Faltan columnas requeridas en CSV: {sorted(missing)}")

        for row in reader:
            id_empleado = _to_int(row.get("id_empleado"))
            if not id_empleado:
                continue

            email = (row.get("email") or "").strip().lower()
            if not email:
                continue

            nombre_usuario = (row.get("nombre_usuario") or "").strip()
            if not nombre_usuario:
                nombre_usuario = email.split("@")[0]

            rows.append(
                {
                    "id_empleado": id_empleado,
                    "nombre": (row.get("nombre") or "").strip(),
                    "nombre_usuario": nombre_usuario,
                    "email": email,
                    "rol": normalizar_rol_db((row.get("rol") or "empleado")),
                    "password": (row.get("password") or "").strip() or DEFAULT_TEMP_PASSWORD,
                    "id_jefe_directo_empleado": _to_int(row.get("id_jefe_directo_empleado")),
                    "id_jefe_superior_empleado": _to_int(row.get("id_jefe_superior_empleado")),
                }
            )

    return rows


def upsert_usuarios(rows: list[dict]) -> None:
    conn = obtener_conexion()
    cur = conn.cursor()

    try:
        for r in rows:
            cur.execute(
                "SELECT IdUsuario FROM dbo.tblUsuarios WHERE IdEmpleado = ? OR Email = ? OR NombreUsuario = ?",
                r["id_empleado"],
                r["email"],
                r["nombre_usuario"],
            )
            existente = cur.fetchone()

            if existente:
                cur.execute(
                    "UPDATE dbo.tblUsuarios "
                    "SET Nombre = ?, NombreUsuario = ?, Email = ?, Rol = ?, IdEmpleado = ?, Activo = 1 "
                    "WHERE IdUsuario = ?",
                    r["nombre"],
                    r["nombre_usuario"],
                    r["email"],
                    r["rol"],
                    r["id_empleado"],
                    int(existente[0]),
                )
            else:
                salt, hash_bytes = generar_hash_salt(r["password"])
                cur.execute(
                    "INSERT INTO dbo.tblUsuarios "
                    "(Nombre, NombreUsuario, Email, PasswordHash, PasswordSalt, Rol, IdEmpleado, FechaCreacion, Activo) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, SYSUTCDATETIME(), 1)",
                    r["nombre"],
                    r["nombre_usuario"],
                    r["email"],
                    hash_bytes,
                    salt,
                    r["rol"],
                    r["id_empleado"],
                )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def upsert_jerarquia(rows: list[dict]) -> None:
    conn = obtener_conexion()
    cur = conn.cursor()

    try:
        cur.execute(
            "IF OBJECT_ID('dbo.tbl_jerarquia_autorizacion', 'U') IS NULL "
            "BEGIN "
            "CREATE TABLE dbo.tbl_jerarquia_autorizacion ("
            "id_jerarquia INT IDENTITY(1,1) NOT NULL PRIMARY KEY,"
            "id_empleado INT NOT NULL,"
            "id_jefe_directo INT NOT NULL,"
            "id_jefe_superior INT NOT NULL,"
            "activo BIT NOT NULL DEFAULT 1,"
            "fecha_creacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),"
            "fecha_actualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),"
            "CONSTRAINT UQ_tbl_jerarquia_autorizacion_empleado UNIQUE (id_empleado),"
            "CONSTRAINT CK_tbl_jerarquia_autorizacion_jefes_distintos CHECK (id_jefe_directo <> id_jefe_superior)"
            ") END"
        )

        for r in rows:
            jd_emp = r.get("id_jefe_directo_empleado")
            js_emp = r.get("id_jefe_superior_empleado")
            if not jd_emp or not js_emp or jd_emp == js_emp:
                continue

            cur.execute("SELECT IdUsuario FROM dbo.tblUsuarios WHERE IdEmpleado = ? AND Activo = 1", jd_emp)
            jd_user = cur.fetchone()
            cur.execute("SELECT IdUsuario FROM dbo.tblUsuarios WHERE IdEmpleado = ? AND Activo = 1", js_emp)
            js_user = cur.fetchone()
            if not jd_user or not js_user:
                continue

            id_jd = int(jd_user[0])
            id_js = int(js_user[0])

            cur.execute("SELECT id_jerarquia FROM dbo.tbl_jerarquia_autorizacion WHERE id_empleado = ?", r["id_empleado"])
            ex = cur.fetchone()
            if ex:
                cur.execute(
                    "UPDATE dbo.tbl_jerarquia_autorizacion "
                    "SET id_jefe_directo = ?, id_jefe_superior = ?, activo = 1, fecha_actualizacion = SYSUTCDATETIME() "
                    "WHERE id_jerarquia = ?",
                    id_jd,
                    id_js,
                    int(ex[0]),
                )
            else:
                cur.execute(
                    "INSERT INTO dbo.tbl_jerarquia_autorizacion "
                    "(id_empleado, id_jefe_directo, id_jefe_superior, activo, fecha_creacion, fecha_actualizacion) "
                    "VALUES (?, ?, ?, 1, SYSUTCDATETIME(), SYSUTCDATETIME())",
                    r["id_empleado"],
                    id_jd,
                    id_js,
                )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def main() -> None:
    import sys

    if len(sys.argv) < 2:
        print("Uso: python -m scripts.cargar_usuarios_jerarquia <ruta_csv>")
        raise SystemExit(1)

    ruta_csv = Path(sys.argv[1]).expanduser().resolve()
    if not ruta_csv.exists():
        print(f"No existe el archivo: {ruta_csv}")
        raise SystemExit(1)

    rows = cargar_csv(ruta_csv)
    if not rows:
        print("No hay filas válidas para procesar.")
        return

    upsert_usuarios(rows)
    upsert_jerarquia(rows)
    print(f"Proceso terminado. Filas procesadas: {len(rows)}")


if __name__ == "__main__":
    main()

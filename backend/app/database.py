from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Generator, Iterable

import pyodbc
from dotenv import load_dotenv

# Cargar variables desde backend/.env sin depender del CWD actual
BASE_DIR = Path(__file__).resolve().parent
DOTENV_PATH = BASE_DIR.parent / ".env"
load_dotenv(dotenv_path=DOTENV_PATH)


def _get_env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name, default)
    if value is None:
        return None
    value = value.strip()
    return value or None


DB_DRIVER = _get_env("DB_DRIVER", "ODBC Driver 17 for SQL Server")
DB_SERVER = _get_env("DB_SERVER")
DB_DATABASE = _get_env("DB_DATABASE")
DB_USER = _get_env("DB_USER")
DB_PASSWORD = _get_env("DB_PASSWORD")
DB_TRUSTED_CONNECTION = (_get_env("DB_TRUSTED_CONNECTION", "yes") or "yes").lower()
DB_ENCRYPT = (_get_env("DB_ENCRYPT", "no") or "no").lower()
DB_TRUST_SERVER_CERTIFICATE = (_get_env("DB_TRUST_SERVER_CERTIFICATE", "yes") or "yes").lower()

if not DB_SERVER or not DB_DATABASE:
    raise RuntimeError(
        f"Faltan variables de entorno de base de datos (DB_SERVER, DB_DATABASE). Verifica {DOTENV_PATH}"
    )


def _build_connection_string() -> str:
    parts = [
        f"DRIVER={{{DB_DRIVER}}}",
        f"SERVER={DB_SERVER}",
        f"DATABASE={DB_DATABASE}",
        f"Encrypt={DB_ENCRYPT}",
        f"TrustServerCertificate={DB_TRUST_SERVER_CERTIFICATE}",
    ]

    # Permite Windows Auth por defecto y SQL Auth si se define usuario/contraseña
    use_trusted = DB_TRUSTED_CONNECTION in {"yes", "true", "1"}
    if DB_USER and DB_PASSWORD:
        parts.extend([f"UID={DB_USER}", f"PWD={DB_PASSWORD}"])
    elif use_trusted:
        parts.append("Trusted_Connection=yes")
    else:
        raise RuntimeError(
            "Configuración inválida: define DB_USER/DB_PASSWORD o habilita DB_TRUSTED_CONNECTION=yes"
        )

    return ";".join(parts) + ";"


CONN_STR = _build_connection_string()


def obtener_conexion(timeout: int = 10) -> pyodbc.Connection:
    """Devuelve una conexión abierta a SQL Server.

    Mantiene compatibilidad con el código existente del proyecto.
    """
    try:
        return pyodbc.connect(CONN_STR, timeout=timeout, autocommit=False)
    except pyodbc.Error as exc:
        print(f"Error crítico al conectar a SQL Server: {exc}")
        raise


@contextmanager
def get_db_cursor() -> Generator[pyodbc.Cursor, None, None]:
    """Context manager para abrir conexión + cursor con commit/rollback automático."""
    conn = obtener_conexion()
    cursor = conn.cursor()
    try:
        yield cursor
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


def execute_query(query: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
    """Ejecuta un SELECT parametrizado y devuelve una lista de diccionarios."""
    with get_db_cursor() as cursor:
        cursor.execute(query, *params)
        columns = [col[0] for col in cursor.description] if cursor.description else []
        rows = cursor.fetchall() if cursor.description else []
        return [dict(zip(columns, row)) for row in rows]


def execute_non_query(query: str, params: Iterable[Any] = ()) -> int:
    """Ejecuta INSERT/UPDATE/DELETE parametrizado y devuelve filas afectadas."""
    with get_db_cursor() as cursor:
        cursor.execute(query, *params)
        return cursor.rowcount
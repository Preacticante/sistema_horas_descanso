import os
import re
import hashlib
import json
import smtplib
import urllib.request
import urllib.error
from datetime import datetime, date, timedelta
from typing import Optional, Annotated, Any
from email.message import EmailMessage

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse  # 👈 Ambos imports juntos aquí

from pydantic import BaseModel, Field
from app.database import obtener_conexion
from app.rbac_rules import create_access_token, decode_access_token, get_current_user, require_roles, normalizar_rol
from app.models import (
    UsuarioCreate as UsuarioCreateSchema,
    UsuarioUpdate as UsuarioUpdateSchema,
    UsuarioOut as UsuarioOutSchema,
    SolicitudReposicionCreate as SolicitudReposicionCreateSchema,
    SolicitudReposicionOut as SolicitudReposicionOutSchema,
    SolicitudAutorizacionPatch as SolicitudAutorizacionPatchSchema,
)

app = FastAPI(title="Sistema de Horas Extra API")

# 🔹 Middleware CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔹 Ruta hacia la carpeta 'frontend' subiendo dos niveles desde 'backend/app'
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "frontend"))

# 🔹 Servir todos los archivos estáticos de frontend (JS, CSS, HTMLs secundarios, imágenes)
if os.path.exists(FRONTEND_DIR):
    app.mount("/frontend", StaticFiles(directory=FRONTEND_DIR), name="frontend")

# 🔹 1. La ruta principal redirige directo al LOGIN al hacer clic en Docker (8000:8000)
@app.get("/")
def read_root():
    return RedirectResponse(url="/login.html")

# 🔹 2. Ruta directa a /login.html
@app.get("/login.html")
def serve_login_html():
    login_path = os.path.join(FRONTEND_DIR, "login.html")
    if os.path.exists(login_path):
        return FileResponse(login_path)
    return {"message": "No se encontró login.html"}

# 🔹 3. Guardamos la vista del Panel/Dashboard para cuando ya inicien sesión
@app.get("/dashboard")
def serve_dashboard():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return RedirectResponse(url="/login.html")

@app.get("/{filename}")
def serve_static_root_files(filename: str):
    file_path = os.path.join(FRONTEND_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="Archivo no encontrado")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RegistroHoras(BaseModel):
    numero_empleado: int
    cantidad_horas: float
    dias_semana: list[date] = []

class ActualizarPerfil(BaseModel):
    nombre: str
    rol: str = "Empleado"
    email: str
    telefono: str
    departamento: str = ""
    sucursal: str = ""
    direccion: str = ""

class CambiarPassword(BaseModel):
    actual_password: str
    new_password: str

class RegistroUsuario(BaseModel):
    nombre: Annotated[str, Field(min_length=3, max_length=150)]
    nombre_usuario: Annotated[str, Field(min_length=4, max_length=50, pattern=r"^[A-Za-z0-9_]+$")]
    email: str
    password: Annotated[str, Field(min_length=8)]
    confirm_password: str
    rol: str = "Empleado"
    id_empleado: Optional[int] = None

class LoginRequest(BaseModel):
    username_or_email: str
    password: str


class PasswordRecoveryRequest(BaseModel):
    email: str


class PasswordRecoveryReset(BaseModel):
    token: str
    new_password: str
    confirm_password: str

PERFIL_DATA = {
    "nombre": "Alexis Hernández",
    "rol": "Administrador",
    "email": "alexis@uco.mx",
    "telefono": "55 1234 5678",
    "departamento": "Control",
    "sucursal": "Sucursal Centro",
    "direccion": "Av. Reforma 123",
}

PASSWORD_SPECIAL_CHARS = "!@#$%^&*"


def validar_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener mínimo 8 caracteres.")


def es_email_valido(email: str) -> bool:
    return bool(re.fullmatch(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email.strip()))


def generar_hash_salt(password: str, salt: bytes | None = None) -> tuple[bytes, bytes]:
    if salt is None:
        salt = os.urandom(16)
    hash_bytes = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200000)
    return salt, hash_bytes


def verificar_password(stored_hash: bytes, stored_salt: bytes, password: str) -> bool:
    # 1. Forzar la conversión a bytes puros por si vienen como memoryview/bytearray
    stored_hash_bytes = bytes(stored_hash)
    stored_salt_bytes = bytes(stored_salt)
    
    # 2. Generar el hash con la contraseña que escribió el usuario
    _, computed_hash = generar_hash_salt(password, stored_salt_bytes)
    
    # 3. IMPRIMIR EN CONSOLA (Para ver qué está fallando)
    print("\n====== DEBUG DE CONTRASEÑA ======")
    print(f"Contraseña ingresada: '{password}'")
    print(f"Salt usado (Hex):     {stored_salt_bytes.hex()}")
    print(f"Hash guardado (Hex):  {stored_hash_bytes.hex()} (Longitud: {len(stored_hash_bytes)})")
    print(f"Hash calculado (Hex): {computed_hash.hex()} (Longitud: {len(computed_hash)})")
    print(f"¿Son iguales?:        {computed_hash == stored_hash_bytes}")
    print("=================================\n")
    
    return computed_hash == stored_hash_bytes


def _enviar_email_recuperacion(destinatario: str, nombre: str, token: str) -> bool:
    """Envía correo de recuperación con Brevo o SMTP.

    Si no hay proveedor configurado, retorna False para que el flujo use modo desarrollo.
    """
    api_key = (os.getenv("BREVO_API_KEY") or "").strip()
    remitente = (os.getenv("BREVO_SENDER_EMAIL") or "").strip()
    nombre_remitente = (os.getenv("BREVO_SENDER_NAME") or "Sistema UCO").strip()

    frontend_base = (os.getenv("FRONTEND_BASE_URL") or "").strip()
    if frontend_base:
        reset_link = f"{frontend_base.rstrip('/')}/login.html?reset_token={token}"
    else:
        reset_link = f"Token de recuperación: {token}"

    asunto = "Recuperación de contraseña - Sistema UCO"
    html_content = (
        f"<h3>Recuperación de contraseña</h3>"
        f"<p>Hola {nombre or 'usuario'},</p>"
        f"<p>Recibimos una solicitud para restablecer tu contraseña.</p>"
        f"<p><strong>{reset_link}</strong></p>"
        f"<p>Este enlace/token expira en 15 minutos.</p>"
        f"<p>Si no solicitaste este cambio, ignora este correo.</p>"
    )

    # 1) Brevo API
    if api_key and remitente:
        payload = {
            "sender": {"name": nombre_remitente, "email": remitente},
            "to": [{"email": destinatario, "name": nombre or "Usuario"}],
            "subject": asunto,
            "htmlContent": html_content,
        }

        req = urllib.request.Request(
            "https://api.brevo.com/v3/smtp/email",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "accept": "application/json",
                "api-key": api_key,
                "content-type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                if 200 <= resp.status < 300:
                    return True
        except (urllib.error.URLError, urllib.error.HTTPError) as exc:
            print(f"Error al enviar email de recuperación con Brevo: {exc}")

    # 2) SMTP genérico
    smtp_host = (os.getenv("SMTP_HOST") or "").strip()
    smtp_port_raw = (os.getenv("SMTP_PORT") or "587").strip()
    smtp_user = (os.getenv("SMTP_USER") or "").strip()
    smtp_password = (os.getenv("SMTP_PASSWORD") or "").strip()
    smtp_from_email = (os.getenv("SMTP_FROM_EMAIL") or smtp_user).strip()
    smtp_from_name = (os.getenv("SMTP_FROM_NAME") or "Sistema UCO").strip()
    smtp_use_tls = (os.getenv("SMTP_USE_TLS") or "yes").strip().lower() in {"1", "true", "yes", "on"}
    smtp_use_ssl = (os.getenv("SMTP_USE_SSL") or "no").strip().lower() in {"1", "true", "yes", "on"}

    if not smtp_host or not smtp_from_email:
        return False

    try:
        smtp_port = int(smtp_port_raw)
    except ValueError:
        smtp_port = 587

    mensaje = EmailMessage()
    mensaje["Subject"] = asunto
    mensaje["From"] = f"{smtp_from_name} <{smtp_from_email}>"
    mensaje["To"] = destinatario
    mensaje.set_content(
        f"Hola {nombre or 'usuario'},\n\n"
        f"Recibimos una solicitud para restablecer tu contraseña.\n"
        f"{reset_link}\n\n"
        f"Este enlace/token expira en 15 minutos.\n"
        f"Si no solicitaste este cambio, ignora este correo."
    )
    mensaje.add_alternative(html_content, subtype="html")

    try:
        if smtp_use_ssl:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15) as server:
                if smtp_user and smtp_password:
                    server.login(smtp_user, smtp_password)
                server.send_message(mensaje)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
                if smtp_use_tls:
                    server.starttls()
                if smtp_user and smtp_password:
                    server.login(smtp_user, smtp_password)
                server.send_message(mensaje)
        return True
    except Exception as exc:
        print(f"Error al enviar email de recuperación con SMTP: {exc}")
        return False

def rol_db_desde_normalizado(rol: str) -> str:
    rol_norm = normalizar_rol(rol)
    mapa = {
        "admin": "Administrador",
        "jefe": "Jefe",
        "empleado": "Empleado",
    }
    return mapa.get(rol_norm, "Empleado")


def _estado_normalizado(valor: str | None) -> str:
    estado = (valor or "pendiente").strip().lower()
    if estado in {"aprobado", "aprobada"}:
        return "aprobada"
    if estado in {"rechazado", "rechazada"}:
        return "rechazada"
    return "pendiente"


def _to_solicitud_out(row: Any) -> dict[str, Any]:
    return {
        "id_solicitud": int(row[0]),
        "id_empleado": int(row[1]),
        "nombre_empleado": str(row[2]) if row[2] else "",  # 👈 Posición 2: nombre_empleado
        "fecha": str(row[3]),                              # 👈 Posición 3: fecha_solicitada
        "horas_solicitadas": float(row[4]),                # 👈 Posición 4: horas
        "motivo": str(row[5]) if row[5] else "",           # 👈 Posición 5: motivo
        "estado_jefe_directo": _estado_normalizado(str(row[6])),
        "estado_jefe_superior": _estado_normalizado(str(row[7])),
        "estado_final": _estado_normalizado(str(row[8])),
        "fecha_creacion": str(row[9]) if row[9] else None,
    }


def _registrar_descuento_reposicion(
    cursor,
    *,
    id_empleado: int,
    fecha_solicitada: date,
    horas_a_reponer: float,
    id_usuario_autoriza_historial: int,
    id_reposicion: int,
) -> bool:
    """Aplica el descuento en banco de horas al aprobarse por completo una solicitud.

    Retorna True si insertó el movimiento; False si ya existía (idempotente).
    """
    referencia = f"Reposición autorizada - Solicitud #{id_reposicion}"

    cursor.execute(
        "SELECT TOP 1 1 "
        "FROM dbo.tblBancoHorasKardex "
        "WHERE IdEmpNum = ? "
        "  AND tTipoTransaccion = 'Reposicion' "
        "  AND tObservaciones = ?",
        id_empleado,
        referencia,
    )
    if cursor.fetchone() is not None:
        return False

    cursor.execute(
        "INSERT INTO dbo.tblBancoHorasKardex "
        "(IdEmpNum, FechaAfectacion, fHoras, tTipoTransaccion, tObservaciones, IdUsuarioAutoriza, bActivo, dtFechaEliminacion, IdUsuarioElimina) "
        "VALUES (?, ?, ?, 'Reposicion', ?, ?, 1, '1900-01-01', NULL)",
        int(id_empleado),
        fecha_solicitada,
        -abs(float(horas_a_reponer)),
        referencia,
        None,
    )

    cursor.execute(
        "INSERT INTO dbo.tbl_historial_movimientos "
        "(tabla_afectada, id_registro_afectado, accion, usuario_responsable, fecha_movimiento, descripcion) "
        "VALUES (?, ?, ?, ?, SYSUTCDATETIME(), ?)",
        "tblBancoHorasKardex",
        id_reposicion,
        "BANCO_DESC",
        int(id_usuario_autoriza_historial),
        f"Reposicion aprobada. Emp {id_empleado}, hrs {-abs(float(horas_a_reponer)):.2f}, fecha {fecha_solicitada}.",
    )

    return True


def _obtener_id_empleado_por_usuario(cursor, id_usuario: int) -> Optional[int]:
    cursor.execute(
        "SELECT id_usuario_original FROM tbl_usuarios_sistema WHERE id_usuario_sistema = ? AND estatus = 1",
        id_usuario,
    )
    row = cursor.fetchone()
    if not row:
        return None
    return int(row[0]) if row[0] is not None else None

def _obtener_jerarquia_autorizacion_por_empleado(cursor, id_empleado: int):
    """
    Obtiene la jerarquía de jefes usando IdEmpNum y la relación de id_jefe en tbl_usuarios_sistema.
    """
    query = """
        SELECT 
            u.id_jefe AS id_jefe_directo,
            jefe_directo.id_jefe AS id_jefe_superior
        FROM tbl_usuarios_sistema u
        LEFT JOIN tbl_usuarios_sistema jefe_directo 
            ON u.id_jefe = jefe_directo.id_usuario_sistema
        WHERE u.id_usuario_original = ?
    """
    
    cursor.execute(query, (id_empleado,))
    row = cursor.fetchone()

    if not row or not row.id_jefe_directo or not row.id_jefe_superior:
        raise HTTPException(
            status_code=400,
            detail="No se encontró la jerarquía de autorización completa para este empleado."
        )

    return row.id_jefe_directo, row.id_jefe_superior


def obtener_usuario_por_login(cursor, username_or_email: str):
    login = (username_or_email or "").strip()
    login_lower = login.lower()
    print(f"\n[DEBUG] Buscando en la base de datos el correo/usuario: '{login}'")

    # 1) Compatibilidad legacy (tbl_usuarios_sistema)
    cursor.execute(
        "SELECT TOP 1 id_usuario_sistema, nombre_completo, nombre_completo AS nombre_usuario, email, PasswordHash, PasswordSalt, rol, estatus "
        "FROM dbo.tbl_usuarios_sistema "
        "WHERE estatus = 1 AND (LOWER(email) = ? OR LOWER(nombre_completo) = ?)",
        (login_lower, login_lower),
    )
    resultado = cursor.fetchone()
    if resultado:
        print(f"[DEBUG] Resultado devuelto por tbl_usuarios_sistema: {resultado}\n")
        return resultado

    # 2) Fuente principal del sistema actual (tblUsuarios)
    cursor.execute(
        "SELECT TOP 1 id, Nombre, NombreUsuario, email, PasswordHash, PasswordSalt, Rol, bActivo "
        "FROM dbo.tblUsuarios "
        "WHERE bActivo = 1 AND (LOWER(email) = ? OR NombreUsuario = ?)",
        (login_lower, login),
    )
    resultado = cursor.fetchone()
    print(f"[DEBUG] Resultado devuelto por tblUsuarios: {resultado}\n")
    return resultado

EMPLEADOS_DASHBOARD = {
    1,
    2,
    55,
    57,
    58,
    72,
    74,
    76,
    78,
    80,
    83,
    84,
    85,
    90,
    91,
    92,
    93,
    94,
    119,
    126,
    127,
    128,
    129,
    130,
    131,
    132,
    133,
    134,
    135,
    136,
    137,
    138,
    140,
    141,
    142,
    143,
    144,
    145,
    146,
    147,
    148,
    274,
    275,
    276,
    279,
    727,
    728,
    732,
    738,
    739,
    740,
}

EMPLEADOS_NOMBRES = {
    1: "Nelson",
    2: "Luis Francisco Valencia Villasana",
    55: "Martín Bocanegra Lucio",
    57: "Gabriel Vallejo Balderas",
    58: "Juan Domínguez Morales",
    72: "Juan Alberto Zamora Gutiérrez",
    74: "Alberto Jiménez Ruíz",
    76: "José Arreola Morales",
    78: "Juan José Fabián Ramos",
    80: "Yolanda Ramírez García",
    83: "Sergio Antonio Pérez Reséndiz",
    84: "Omar Rodríguez Montoya",
    85: "Mariana Díaz Morales",
    90: "Baruch Alberto",
    91: "Cinthia Flores López",
    92: "Viridiana Ramírez Rojas",
    93: "María Eugenia Montalvo Cosme",
    94: "Álvaro Patiño Botello",
    119: "Eva Angélica Balderas Rojas",
    126: "José Aguas García",
    127: "Roberto Carlos Matehuala Vargas",
    128: "Alma Leticia Muñiz Núñez",
    129: "Dania Sánchez Espino",
    130: "Armando Ramírez Mejía",
    131: "Cecilia de Lourdes Bracho Rodríguez",
    132: "Laura Leticia González González",
    133: "Francisco Javier Limón Naranjo",
    134: "María del Carmen Mendoza Aldape",
    135: "Christopher Arturo Muciño González",
    136: "María Teresa Serrano Lazcano",
    137: "Daniela Fernanda Jiménez Vázquez",
    138: "Erik Gabriel Rojas López",
    140: "Yeniffer Gutiérrez Andrade",
    141: "José Manuel Martínez Alonso",
    142: "Tania Ibette León Flores",
    143: "Miguel Ángel Hernández Tamayo",
    144: "Alicia Ruiz García",
    145: "Alma Cristina Rodríguez Zúñiga",
    146: "Luis Roberto López Yáñez",
    147: "María Guadalupe Garrido García",
    148: "Paula María Corte González",
    274: "Andrea Anguiano Villegas",
    275: "Gerardo Morales Medrano",
    276: "Diana Laura Uribe Núñez",
    279: "Mariano Rivera Sánchez",
    727: "Ma. Guadalupe Ruíz Ramírez",
    728: "Angélica María Cruz Lugo",
    732: "Monserrat Mier Avila",
    738: "Salvador Ordoñez Martínez",
    739: "Irma Lilia",
    740: "Rolando Aranda Gutiérrez",
}

@app.get("/")
def inicio():
    return {"status": "online", "mensaje": "Conexión base lista"}

@app.post("/api/auth/register")
def registrar_usuario(usuario: RegistroUsuario):
    if usuario.password != usuario.confirm_password:
        raise HTTPException(status_code=400, detail="Las contraseñas no coinciden.")

    if usuario.id_empleado is None:
        raise HTTPException(
            status_code=400,
            detail="El número de empleado es obligatorio para registrar tu cuenta.",
        )

    if not es_email_valido(usuario.email):
        raise HTTPException(status_code=400, detail="El correo electrónico no tiene un formato válido.")

    validar_password(usuario.password)

    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT nombre_completo, email FROM dbo.tbl_usuarios_sistema WHERE nombre_completo = ? OR email = ?",
            usuario.nombre_usuario,
            usuario.email.lower(),
        )
        usuario_existente = cursor.fetchone()
        if usuario_existente:
            if usuario_existente[0] == usuario.nombre_usuario:
                raise HTTPException(status_code=409, detail="El nombre de usuario ya está en uso.")
            if usuario_existente[1].lower() == usuario.email.lower():
                raise HTTPException(status_code=409, detail="El correo electrónico ya está registrado.")

        cursor.execute(
            "SELECT iEmployeeNum FROM dbo.tblEmployees WHERE iEmployeeNum = ?",
            usuario.id_empleado,
        )
        if cursor.fetchone() is None:
            raise HTTPException(
                status_code=400,
                detail="El número de empleado no existe en el catálogo de empleados activo.",
            )

        salt, hash_bytes = generar_hash_salt(usuario.password)

        cursor.execute(
            "INSERT INTO dbo.tblUsuarios (Nombre, NombreUsuario, email, [password], PasswordHash, PasswordSalt, Rol, iEmployeeNum, FechaCreacion, bActivo) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, SYSUTCDATETIME(), 1)",
            usuario.nombre,
            usuario.nombre_usuario,
            usuario.email.lower(),
            usuario.password,
            hash_bytes,
            salt,
            usuario.rol,
            usuario.id_empleado,
        )
        conn.commit()
        cursor.close()
        conn.close()

        return {
            "status": "success",
            "mensaje": "Usuario registrado correctamente.",
            "usuario": {
                "nombre": usuario.nombre_usuario,
                "nombre_usuario": usuario.nombre_usuario,
                "email": usuario.email.lower(),
                "rol": usuario.rol,
                "id_empleado": usuario.id_empleado,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al registrar usuario: {e}")
        err = str(e).lower()
        if "iemployeenum" in err and "null" in err:
            raise HTTPException(
                status_code=400,
                detail="El número de empleado es obligatorio para registrar tu cuenta.",
            )
        if "fk__tblusuari__iempl" in err or ("foreign key" in err and "iemployeenum" in err):
            raise HTTPException(
                status_code=400,
                detail="El número de empleado no está habilitado para crear cuenta en este sistema.",
            )
        raise HTTPException(status_code=500, detail="No se pudo registrar el usuario.")


@app.post("/api/auth/login")
def login_usuario(datos: LoginRequest):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        fila = obtener_usuario_por_login(cursor, datos.username_or_email.strip())
        if not fila:
            raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")

        id_usuario, nombre, nombre_usuario, email, password_hash, password_salt, rol, activo = fila
        if password_hash is None or password_salt is None:
            raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")

        if not verificar_password(password_hash, password_salt, datos.password):
            raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")

        cursor.close()
        conn.close()

        rol_normalizado = normalizar_rol(str(rol))
        token = create_access_token(
            payload={
                "id_usuario": int(id_usuario),
                "nombre": nombre,
                "nombre_usuario": nombre_usuario,
                "rol": rol_normalizado,
            }
        )

        return {
            "status": "success",
            "access_token": token,
            "token_type": "bearer",
            "usuario": {
                "id": id_usuario,
                "nombre": nombre,
                "usuario": nombre_usuario,
                "email": email,
                "rol": rol_normalizado,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al iniciar sesión: {e}")
        raise HTTPException(status_code=500, detail="No se pudo iniciar sesión.")


@app.post("/api/auth/logout")
def logout_usuario(user: dict = Depends(get_current_user)):
    """Logout endpoint (stateless): verifica token y devuelve confirmación.

    Nota: como los tokens son JWT sin blacklist por defecto, este endpoint
    simplemente valida el token actual y devuelve éxito para que el cliente
    pueda limpiar su sesión localmente.
    """
    try:
        return {"status": "success", "message": "Sesión cerrada."}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al cerrar sesión: {e}")
        raise HTTPException(status_code=500, detail="Error al cerrar sesión.")


@app.post("/api/auth/password-recovery/request")
def solicitar_recuperacion_password(datos: PasswordRecoveryRequest):
    email = (datos.email or "").strip().lower()
    if not es_email_valido(email):
        raise HTTPException(status_code=400, detail="Correo inválido.")

    # Respuesta genérica para no filtrar usuarios existentes
    generic_response = {
        "status": "success",
        "message": "Si el correo existe, recibirás instrucciones para recuperar tu contraseña.",
    }

    try:
        conn = obtener_conexion()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT TOP 1 id_usuario_sistema, nombre_completo, email "
            "FROM dbo.tbl_usuarios_sistema "
            "WHERE LOWER(email) = LOWER(?) AND estatus = 1",
            email,
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            return generic_response

        id_usuario = int(row[0])
        nombre = str(row[1] or "")
        correo = str(row[2] or email)

        token = create_access_token(
            payload={
                "id_usuario": id_usuario,
                "email": correo,
                "purpose": "password_recovery",
            },
            expires_minutes=15,
        )

        enviado = _enviar_email_recuperacion(correo, nombre, token)
        if enviado:
            return {**generic_response, "delivery": "email"}

        # Modo local/desarrollo: devolver token para flujo interno
        return {
            **generic_response,
            "delivery": "dev_token",
            "recovery_token": token,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en recuperación de contraseña: {e}")
        raise HTTPException(status_code=500, detail="No se pudo procesar la recuperación de contraseña.")


@app.post("/api/auth/password-recovery/reset")
def resetear_password(datos: PasswordRecoveryReset):
    token = (datos.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token inválido.")

    if datos.new_password != datos.confirm_password:
        raise HTTPException(status_code=400, detail="Las contraseñas no coinciden.")

    validar_password(datos.new_password)

    try:
        claims = decode_access_token(token)
        purpose = str(claims.get("purpose", "")).strip().lower()
        if purpose != "password_recovery":
            raise HTTPException(status_code=400, detail="Token de recuperación inválido.")

        id_usuario = claims.get("id_usuario")
        email = str(claims.get("email", "")).strip().lower()
        if not id_usuario or not email:
            raise HTTPException(status_code=400, detail="Token de recuperación inválido.")

        salt, hash_bytes = generar_hash_salt(datos.new_password)

        conn = obtener_conexion()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE dbo.tbl_usuarios_sistema "
            "SET PasswordHash = ?, PasswordSalt = ? "
            "WHERE id_usuario_sistema = ? AND LOWER(email) = LOWER(?) AND estatus = 1",
            hash_bytes,
            salt,
            int(id_usuario),
            email,
        )
        if cursor.rowcount == 0:
            conn.rollback()
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="No se encontró la cuenta para actualizar contraseña.")

        conn.commit()
        cursor.close()
        conn.close()

        return {
            "status": "success",
            "message": "Contraseña actualizada correctamente. Ya puedes iniciar sesión.",
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al restablecer contraseña: {e}")
        raise HTTPException(status_code=500, detail="No se pudo restablecer la contraseña.")


@app.get("/api/auth/me")
def auth_me(current_user: dict = Depends(get_current_user)):
    return {
        "status": "success",
        "usuario": current_user,
    }


@app.get("/api/usuarios", response_model=list[UsuarioOutSchema])
def listar_usuarios_sistema(
    activos_solo: bool = True,
    _: dict = Depends(require_roles("admin", "jefe")),
):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        query = (
            "SELECT id_usuario_sistema, nombre_completo, email, rol, id_usuario_original, estatus "
            "FROM dbo.tbl_usuarios_sistema "
        )
        if activos_solo:
            query += "WHERE estatus = 1 "
        query += "ORDER BY id_usuario_sistema DESC"

        cursor.execute(query)
        filas = cursor.fetchall()
        cursor.close()
        conn.close()

        return [
            {
                "id_usuario": int(fila[0]),
                "nombre": fila[1],
                "nombre_usuario": fila[1],
                "email": fila[2],
                "rol": normalizar_rol(str(fila[3])),
                "id_empleado": fila[4],
                "activo": bool(fila[5]),
                "fecha_creacion": None,
            }
            for fila in filas
        ]
    except Exception as e:
        print(f"Error al listar usuarios del sistema: {e}")
        raise HTTPException(status_code=500, detail="No se pudieron consultar los usuarios del sistema.")


@app.get("/api/usuarios/{id_usuario}", response_model=UsuarioOutSchema)
def obtener_usuario_sistema(
    id_usuario: int,
    _: dict = Depends(require_roles("admin", "jefe")),
):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id_usuario_sistema, nombre_completo, email, rol, id_usuario_original, estatus "
            "FROM dbo.tbl_usuarios_sistema WHERE id_usuario_sistema = ?",
            id_usuario,
        )
        fila = cursor.fetchone()
        cursor.close()
        conn.close()

        if not fila:
            raise HTTPException(status_code=404, detail="Usuario no encontrado.")

        return {
            "id_usuario": int(fila[0]),
            "nombre": fila[1],
            "nombre_usuario": fila[1],
            "email": fila[2],
            "rol": normalizar_rol(str(fila[3])),
            "id_empleado": fila[4],
            "activo": bool(fila[5]),
            "fecha_creacion": None,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al obtener usuario del sistema: {e}")
        raise HTTPException(status_code=500, detail="No se pudo consultar el usuario del sistema.")

@app.get("/api/usuarios/mis-reportes")
def obtener_empleados_a_cargo(
    current_user: dict = Depends(get_current_user)
):
    """
    Devuelve la lista de empleados que le reportan directamente 
    al usuario que tiene la sesión iniciada.
    """
    try:
        # 1. Obtenemos el ID del jefe desde el token del usuario logueado
        id_jefe_conectado = int(current_user.get("id_usuario"))

        conn = obtener_conexion()
        cursor = conn.cursor()

        # 2. Query para buscar los subordinados directos en tbl_usuarios_sistema
        query = """
            SELECT 
                sub.[id_usuario_sistema],
                sub.[id_usuario_original],
                sub.[nombre_completo],
                sub.[email],
                sub.[rol]
            FROM [dbo].[tbl_usuarios_sistema] sub
            WHERE sub.[id_jefe] = ?
        """
        
        cursor.execute(query, (id_jefe_conectado,))
        filas = cursor.fetchall()
        
        cursor.close()
        conn.close()

        # 3. Formateamos y retornamos los datos en formato JSON
        return [
            {
                "id_usuario_sistema": int(fila[0]),
                "id_usuario_original": int(fila[1]) if fila[1] is not None else None,
                "nombre_completo": fila[2],
                "email": fila[3],
                "rol": fila[4]
            }
            for fila in filas
        ]

    except Exception as e:
        print(f"Error al obtener empleados a cargo: {e}")
        raise HTTPException(
            status_code=500, 
            detail="No se pudo consultar la lista de tus empleados a cargo."
        )

@app.post("/api/usuarios", response_model=UsuarioOutSchema)
def crear_usuario_sistema(
    usuario: UsuarioCreateSchema,
    _: dict = Depends(require_roles("admin")),
):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT nombre_completo, email FROM dbo.tbl_usuarios_sistema WHERE nombre_completo = ? OR email = ?",
            usuario.nombre_usuario,
            usuario.email.lower(),
        )
        existente = cursor.fetchone()
        if existente:
            if existente[0] == usuario.nombre_usuario:
                raise HTTPException(status_code=409, detail="El nombre de usuario ya está en uso.")
            raise HTTPException(status_code=409, detail="El correo electrónico ya está registrado.")

        if usuario.id_empleado is not None:
            cursor.execute(
                "SELECT IdEmpNum FROM dbo.tblOrganigramaOficial WHERE IdEmpNum = ?",
                usuario.id_empleado,
            )
            if cursor.fetchone() is None:
                raise HTTPException(status_code=400, detail="El número de empleado proporcionado no existe.")

        salt, hash_bytes = generar_hash_salt(usuario.password)
        rol_db = rol_db_desde_normalizado(usuario.rol.value)

        cursor.execute(
            "INSERT INTO dbo.tblUsuarios (Nombre, NombreUsuario, email, [password], PasswordHash, PasswordSalt, Rol, iEmployeeNum, FechaCreacion, bActivo) "
            "OUTPUT INSERTED.id, INSERTED.FechaCreacion "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, SYSUTCDATETIME(), ?)",
            usuario.nombre,
            usuario.nombre_usuario,
            usuario.email.lower(),
            usuario.password,
            hash_bytes,
            salt,
            rol_db,
            usuario.id_empleado,
            1 if usuario.activo else 0,
        )
        cursor.execute("SELECT SCOPE_IDENTITY()");
        inserted = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()

        return {
            "id_usuario": int(inserted[0]),
            "nombre": usuario.nombre_usuario,
            "nombre_usuario": usuario.nombre_usuario,
            "email": usuario.email.lower(),
            "rol": normalizar_rol(rol_db),
            "id_empleado": usuario.id_empleado,
            "activo": usuario.activo,
            "fecha_creacion": None,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al crear usuario del sistema: {e}")
        raise HTTPException(status_code=500, detail="No se pudo crear el usuario del sistema.")


@app.patch("/api/usuarios/{id_usuario}", response_model=UsuarioOutSchema)
def actualizar_usuario_sistema(
    id_usuario: int,
    datos: UsuarioUpdateSchema,
    _: dict = Depends(require_roles("admin")),
):
    campos = []
    params = []

    if datos.nombre is not None:
        campos.append("nombre_completo = ?")
        params.append(datos.nombre)

    if datos.email is not None:
        campos.append("email = ?")
        params.append(datos.email.lower())

    if datos.rol is not None:
        campos.append("rol = ?")
        params.append(rol_db_desde_normalizado(datos.rol.value))

    if datos.activo is not None:
        campos.append("estatus = ?")
        params.append(1 if datos.activo else 0)

    if not campos:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar.")

    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        if datos.email is not None:
            cursor.execute(
                "SELECT id_usuario_sistema FROM dbo.tbl_usuarios_sistema WHERE email = ? AND id_usuario_sistema <> ?",
                datos.email.lower(),
                id_usuario,
            )
            if cursor.fetchone() is not None:
                raise HTTPException(status_code=409, detail="El correo electrónico ya está registrado.")

        query = (
            "UPDATE dbo.tbl_usuarios_sistema SET "
            + ", ".join(campos)
            + " WHERE id_usuario_sistema = ?"
        )
        params.append(id_usuario)
        cursor.execute(query, *params)

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Usuario no encontrado.")

        cursor.execute(
            "SELECT id_usuario_sistema, nombre_completo, email, rol, id_usuario_original, estatus "
            "FROM dbo.tbl_usuarios_sistema WHERE id_usuario_sistema = ?",
            id_usuario,
        )
        fila = cursor.fetchone()

        conn.commit()
        cursor.close()
        conn.close()

        return {
            "id_usuario": int(fila[0]),
            "nombre": fila[1],
            "nombre_usuario": fila[1],
            "email": fila[2],
            "rol": normalizar_rol(str(fila[3])),
            "id_empleado": fila[4],
            "activo": bool(fila[5]),
            "fecha_creacion": None,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al actualizar usuario del sistema: {e}")
        raise HTTPException(status_code=500, detail="No se pudo actualizar el usuario del sistema.")


@app.delete("/api/usuarios/{id_usuario}")
def desactivar_usuario_sistema(
    id_usuario: int,
    _: dict = Depends(require_roles("admin")),
):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE dbo.tbl_usuarios_sistema SET estatus = 0 WHERE id_usuario_sistema = ?",
            id_usuario,
        )

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Usuario no encontrado.")

        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "mensaje": "Usuario desactivado correctamente."}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al desactivar usuario del sistema: {e}")
        raise HTTPException(status_code=500, detail="No se pudo desactivar el usuario del sistema.")


@app.post("/api/registros/solicitudes", response_model=SolicitudReposicionOutSchema)
def crear_solicitud_reposicion(
    datos: SolicitudReposicionCreateSchema,
    current_user: dict = Depends(get_current_user),
):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        rol_actual = normalizar_rol(current_user.get("rol"))
        id_usuario_actual = int(current_user.get("id_usuario"))

        if rol_actual == "empleado":
            id_emp_usuario = _obtener_id_empleado_por_usuario(cursor, id_usuario_actual)

            print(f"DEBUG: id_usuario_actual={id_usuario_actual} -> Encontró id_emp_usuario={id_emp_usuario}")

            if id_emp_usuario is None:
                raise HTTPException(status_code=403, detail="Tu usuario no está ligado a un empleado.")
            if int(datos.id_empleado) != int(id_emp_usuario):
                raise HTTPException(status_code=403, detail="Solo puedes registrar solicitudes para tu propio usuario.")

        id_jefe_directo = int(datos.id_jefe_directo) if datos.id_jefe_directo is not None else None
        id_jefe_superior = int(datos.id_jefe_superior) if datos.id_jefe_superior is not None else None

        if id_jefe_directo is None or id_jefe_superior is None:
            jer_jd, jer_js = _obtener_jerarquia_autorizacion_por_empleado(cursor, int(datos.id_empleado))
            if id_jefe_directo is None:
                id_jefe_directo = jer_jd
            if id_jefe_superior is None:
                id_jefe_superior = jer_js

        if id_jefe_directo is None or id_jefe_superior is None:
            raise HTTPException(
                status_code=400,
                detail="No se encontró la jerarquía de autorización para el empleado. Configura jefe directo y jefe superior.",
            )

        if id_jefe_directo == id_jefe_superior:
            raise HTTPException(status_code=400, detail="El jefe directo y el jefe superior deben ser diferentes.")

        if rol_actual == "empleado" and (id_usuario_actual == id_jefe_directo or id_usuario_actual == id_jefe_superior):
            raise HTTPException(status_code=400, detail="Un empleado no puede autorizar su propia solicitud.")

        cursor.execute(
            "SELECT IdEmpNum FROM dbo.tblOrganigramaOficial WHERE IdEmpNum = ?",
            datos.id_empleado,
        )
        if cursor.fetchone() is None:
            raise HTTPException(status_code=400, detail="El empleado no existe en el organigrama oficial.")

        # 🔔 CAMBIO CLAVE AQUÍ: Usamos 'id_usuario_sistema' y 'estatus' en lugar de 'id_usuario' y 'activo'
        cursor.execute(
            "SELECT COUNT(*) FROM tbl_usuarios_sistema WHERE id_usuario_sistema IN (?, ?) AND estatus = 1",
            id_jefe_directo,
            id_jefe_superior,
        )
        jefes_validos = int(cursor.fetchone()[0] or 0)
        if jefes_validos != 2:
            raise HTTPException(status_code=400, detail="Los usuarios autorizadores no existen o están inactivos.")

        # ==========================================
        # 1. INSERTAR EN LA TABLA DE SOLICITUDES
        # ==========================================
        cursor.execute(
            "INSERT INTO dbo.tbl_solicitudes_reposicion "
            "(id_usuario_sistema, fecha_solicitada, horas_a_reponer, comentarios, id_jefe_directo, id_jefe_superior, "
            "estado_jefe_directo, estado_jefe_superior, estado_final, created_at, updated_at) "
            "OUTPUT INSERTED.id_reposicion, INSERTED.created_at "
            "VALUES (?, ?, ?, ?, ?, ?, 'pendiente', 'pendiente', 'pendiente', SYSUTCDATETIME(), SYSUTCDATETIME())",
            id_usuario_actual,       # Guardamos el ID de usuario del sistema (ej. 35 en el caso de Mariana)
            datos.fecha,
            float(datos.horas_solicitadas),
            datos.motivo,            # Entra en la columna 'comentarios'
            id_jefe_directo,
            id_jefe_superior,
        )
        inserted = cursor.fetchone()

        id_solicitud = int(inserted[0])  # Ahora lee de 'id_reposicion'
        fecha_creacion = inserted[1]     # Ahora lee de 'created_at'

        # ==========================================
        # 2. INSERTAR EN LA TABLA DE HISTORIAL
        # ==========================================
        cursor.execute(
            "INSERT INTO dbo.tbl_historial_movimientos "
            "(tabla_afectada, id_registro_afectado, accion, usuario_responsable, fecha_movimiento, descripcion) "
            "VALUES (?, ?, ?, ?, SYSUTCDATETIME(), ?)",
            "tbl_solicitudes_reposicion",  # tabla_afectada
            id_solicitud,                  # id_registro_afectado
            "SOLICITUD_CREADA",            # accion
            id_usuario_actual,             # usuario_responsable
            f"Solicitud de reposición creada por {datos.horas_solicitadas} horas para el día {datos.fecha}. Motivo: {datos.motivo}" # descripcion
        )

        conn.commit()
        cursor.close()
        conn.close()

        return {
            "id_solicitud": id_solicitud,
            "id_empleado": int(datos.id_empleado),
            "fecha": datos.fecha,
            "horas_solicitadas": float(datos.horas_solicitadas),
            "motivo": datos.motivo,
            "estado_jefe_directo": "pendiente",
            "estado_jefe_superior": "pendiente",
            "estado_final": "pendiente",
            "fecha_creacion": fecha_creacion,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al crear solicitud de reposición: {e}")
        raise HTTPException(status_code=500, detail="No se pudo crear la solicitud de reposición.")

from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException

# Asegúrate de usar 'router' o 'app' según como tengas instanciado tu archivo
@app.get("/api/registros/solicitudes", response_model=list[SolicitudReposicionOutSchema])
def listar_solicitudes_reposicion(
    estado: Optional[str] = None,
    id_empleado: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        rol_actual = normalizar_rol(current_user.get("rol"))
        id_usuario_actual = int(current_user.get("id_usuario"))

        # 💡 SELECT mejorado con JOIN para traer el nombre del empleado y evitar fallos
        query = (
            "SELECT "
            "   s.id_reposicion AS id_solicitud, "
            "   COALESCE(u.id_usuario_original, s.id_usuario_sistema) AS id_empleado, "
            "   ISNULL(u.nombre_completo, 'Empleado #' + CAST(s.id_usuario_sistema AS VARCHAR)) AS nombre_empleado, "
            "   s.fecha_solicitada AS fecha_solicitud, "
            "   s.horas_a_reponer AS horas_solicitadas, "
            "   s.comentarios AS motivo, "
            "   s.estado_jefe_directo, "
            "   s.estado_jefe_superior, "
            "   s.estado_final, "
            "   s.created_at AS fecha_creacion "
            "FROM dbo.tbl_solicitudes_reposicion s "
            "LEFT JOIN dbo.tbl_usuarios_sistema u ON s.id_usuario_sistema = u.id_usuario_sistema "
            "WHERE 1=1"
        )
        params: list[Any] = []

        if rol_actual == "admin":
            if id_empleado is not None:
                query += " AND (s.id_usuario_sistema = ? OR u.id_usuario_original = ?)"
                params.extend([id_empleado, id_empleado])
                
        elif rol_actual == "jefe":
            if estado:
                query += " AND (s.id_jefe_directo = ? OR s.id_jefe_superior = ?)"
                params.extend([id_usuario_actual, id_usuario_actual])
            else:
                # Bandeja de Pendientes
                query += """ AND (
                    (s.id_jefe_directo = ? AND LOWER(s.estado_jefe_directo) = 'pendiente') 
                    OR 
                    (s.id_jefe_superior = ? AND LOWER(s.estado_jefe_directo) IN ('aprobada', 'aprobado') AND LOWER(s.estado_jefe_superior) = 'pendiente')
                )"""
                params.extend([id_usuario_actual, id_usuario_actual])
            
            if id_empleado is not None:
                query += " AND (s.id_usuario_sistema = ? OR u.id_usuario_original = ?)"
                params.extend([id_empleado, id_empleado])
                
        else:
            # Empleado común
            query += " AND s.id_usuario_sistema = ?"
            params.append(id_usuario_actual)

        if estado:
            query += " AND LOWER(s.estado_final) = ?"
            params.append(_estado_normalizado(estado).lower())

        query += " ORDER BY s.id_reposicion DESC"

        # ⚡ pyodbc requiere parámetros desempaquetados
        cursor.execute(query, *params)
        rows = cursor.fetchall()

        cursor.close()
        conn.close()

        # Retornar mapeo ordenado
        return [_to_solicitud_out(row) for row in rows]
        
    except HTTPException:
        raise
    except Exception as e:
        print("=========================================================")
        print(f"⚠️ ERROR AL LISTAR SOLICITUDES EN BASE DE DATOS: {e}")
        print("=========================================================")
        # En lugar de silenciar el error devolviendo [], lanzamos un 500 con el detalle para depurar
        raise HTTPException(status_code=500, detail=f"Error interno al obtener solicitudes: {str(e)}")

# ==========================================================
# RUTA ACTUALIZADA: PROCESA LAS ENTRADAS/SALIDAS DE LA VISTA
# ==========================================================
@app.get("/api/empleados")
def listar_empleados(
    ids: Optional[str] = None,
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    all: bool = False,
):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        if fecha_fin is None:
            fecha_fin = date.today()
        if fecha_inicio is None:
            fecha_inicio = fecha_fin - timedelta(days=30)

        # Aseguramos que la sesión use idioma español para DATENAME(WEEKDAY)
        cursor.execute("SET LANGUAGE Spanish;")

        if all:
            cursor.execute("""
                SELECT DISTINCT e.iEmployeeNum, LTRIM(RTRIM(CONCAT(e.tFirstName, ' ', COALESCE(e.tMiddleName, ''), ' ', e.tLastName))) AS tFullName
                FROM dbo.tblEmployees e
                INNER JOIN dbo.tblOrganigramaOficial o ON e.iEmployeeNum = o.IdEmpNum
                ORDER BY e.iEmployeeNum
            """)
            empleados_db = cursor.fetchall()
            
            # Obtener horas totales
            cursor.execute("SELECT IdEmpNum, SUM(fHoras) AS HorasBanco FROM dbo.tblBancoHorasKardex GROUP BY IdEmpNum")
            horas_db = {row[0]: float(row[1] or 0.0) for row in cursor.fetchall()}
            
            # Obtener salidas tempranas (registros donde fHoras < 0)
            cursor.execute("SELECT IdEmpNum, COUNT(*) AS SalidasTemprano FROM dbo.tblBancoHorasKardex WHERE fHoras < 0 GROUP BY IdEmpNum")
            salidas_db = {row[0]: int(row[1] or 0) for row in cursor.fetchall()}
            
            # Obtener horarios (L-V: Lunes a Viernes, usando nombres de día)
            horarios_db = {}
            try:
                cursor.execute("""
                    SELECT DISTINCT 
                        IdEmpNum,
                        CAST(HorarioInicio AS VARCHAR(8)) + ' - ' + CAST(HorarioFinal AS VARCHAR(8)) AS Horario
                    FROM dbo.tblHorariosEmployees
                    WHERE DiaSemana IN ('Lunes', 'Martes', 'Miércoles', 'Miercoles', 'Jueves', 'Viernes')
                    ORDER BY IdEmpNum
                """)
                horarios_db = {row[0]: row[1] for row in cursor.fetchall()}
            except Exception as e:
                print(f"Advertencia: No se pudieron cargar los horarios: {e}")
                horarios_db = {}

            resultado = []
            for row in empleados_db:
                emp_id = int(row[0])
                nombre = row[1].strip() if row[1] else f"Empleado {emp_id}"
                resultado.append({
                    "id": emp_id,
                    "nombre": nombre,
                    "numero_empleado": emp_id,
                    "total_horas": horas_db.get(emp_id, 0.0),
                    "horario": horarios_db.get(emp_id, "No configurado"),
                    "salidas_temprano": salidas_db.get(emp_id, 0),
                })

            cursor.close()
            conn.close()
            return resultado

        if ids:
            ids_parsed = [int(x) for x in re.split(r"[\s,;]+", ids.strip()) if x.strip().isdigit()]
            if ids_parsed:
                ids_permitidos = ",".join(str(i) for i in sorted(set(ids_parsed)))
            else:
                ids_permitidos = ",".join(str(i) for i in sorted(EMPLEADOS_DASHBOARD))
        else:
            ids_permitidos = ",".join(str(i) for i in sorted(EMPLEADOS_DASHBOARD))

        cursor.execute(f"""
            WITH Eventos AS (
                SELECT
                    e.IdAutoEvents,
                    e.IdEmpNum,
                    LTRIM(RTRIM(CONCAT(emp.tFirstName, ' ', COALESCE(emp.tMiddleName, ''), ' ', emp.tLastName))) AS tFullName,
                    CAST(e.dtEventReal AS date) AS Fecha,
                    e.dtEventReal,
                    e.IdReader,
                    e.IdPanel,
                    emp.IdAccessGroup,
                    emp.IdDepartment,
                    DATENAME(WEEKDAY, e.dtEventReal) AS NombreDia,
                    CASE
                        WHEN emp.IdAccessGroup IN (5, 9) THEN
                            CASE
                                WHEN e.IdPanel = 1 AND e.IdReader = 1 THEN 'Salida'
                                WHEN e.IdPanel = 1 AND e.IdReader = 2 THEN 'Entrada'
                                WHEN e.IdPanel = 3 AND e.IdReader = 10 THEN 'Salida'
                                WHEN e.IdPanel = 3 AND e.IdReader = 9 THEN 'Entrada'
                                WHEN e.IdPanel = 4 AND e.IdReader = 11 THEN 'Salida'
                                WHEN e.IdPanel = 4 AND e.IdReader = 12 THEN 'Entrada'
                            END
                        WHEN emp.IdAccessGroup = 6 THEN
                            CASE
                                WHEN e.IdPanel = 1 AND e.IdReader = 1 THEN 'Entrada'
                                WHEN e.IdPanel = 1 AND e.IdReader = 2 THEN 'Salida'
                                WHEN e.IdPanel = 3 AND e.IdReader = 10 THEN 'Entrada'
                                WHEN e.IdPanel = 3 AND e.IdReader = 9 THEN 'Salida'
                                WHEN e.IdPanel = 4 AND e.IdReader = 11 THEN 'Entrada'
                                WHEN e.IdPanel = 4 AND e.IdReader = 12 THEN 'Salida'
                            END
                        WHEN emp.IdAccessGroup IN (1, 2, 3, 8) THEN
                            CASE
                                WHEN e.IdPanel = 1 AND e.IdReader = 1 THEN 'Entrada'
                                WHEN e.IdPanel = 1 AND e.IdReader = 2 THEN 'Salida'
                                WHEN e.IdPanel = 3 AND e.IdReader = 10 THEN 'Entrada'
                                WHEN e.IdPanel = 3 AND e.IdReader = 9 THEN 'Salida'
                                WHEN e.IdPanel = 4 AND e.IdReader = 11 THEN 'Entrada'
                                WHEN e.IdPanel = 4 AND e.IdReader = 12 THEN 'Salida'
                            END
                        ELSE 'NO CLASIFICADO'
                    END AS TipoEvento
                FROM [AxTrax1].[dbo].[tblEvents] e
                INNER JOIN [AxTrax1].[dbo].[tblEmployees] emp
                    ON emp.iEmployeeNum = e.IdEmpNum
                WHERE e.dtEventReal >= ?
                  AND e.dtEventReal < ?
                  AND (
                        (e.IdPanel = 1 AND e.IdReader IN (1, 2))
                     OR (e.IdPanel = 3 AND e.IdReader IN (9, 10))
                     OR (e.IdPanel = 4 AND e.IdReader IN (11, 12))
                  )
            ),
            Entradas AS (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY IdEmpNum, Fecha, IdPanel
                    ORDER BY dtEventReal
                ) AS NumEvento
                FROM Eventos
                WHERE TipoEvento = 'Entrada'
            ),
            Salidas AS (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY IdEmpNum, Fecha, IdPanel
                    ORDER BY dtEventReal
                ) AS NumEvento
                FROM Eventos
                WHERE TipoEvento = 'Salida'
            ),
            Duraciones AS (
                SELECT
                    E.IdEmpNum,
                    E.tFullName,
                    E.Fecha,
                    E.NombreDia,
                    E.IdPanel,
                    E.IdAccessGroup,
                    E.IdDepartment,
                    E.dtEventReal AS HoraEntradaCompleta,
                    S.dtEventReal AS HoraSalidaCompleta,
                    CAST(DATEDIFF(MINUTE, E.dtEventReal, S.dtEventReal) / 60.0 AS decimal(10,2)) AS DuracionHoras
                FROM Entradas E
                INNER JOIN Salidas S
                    ON S.IdEmpNum = E.IdEmpNum
                   AND S.Fecha = E.Fecha
                   AND S.IdPanel = E.IdPanel
                   AND S.NumEvento = E.NumEvento
                   AND S.dtEventReal > E.dtEventReal
            ),
            DuracionMayorPorDia AS (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY IdEmpNum, Fecha
                    ORDER BY DuracionHoras DESC
                ) AS RN
                FROM Duraciones
            ),
            DiasCalculados AS (
                SELECT
                    D.IdEmpNum,
                    D.tFullName,
                    D.Fecha,
                    D.NombreDia,
                    D.HoraEntradaCompleta,
                    D.HoraSalidaCompleta,
                    D.DuracionHoras,
                    D.IdAccessGroup,
                    D.IdDepartment,
                    H.HorarioInicio,
                    H.HorarioFinal,
                    CASE WHEN CAST(D.HoraEntradaCompleta AS time) > H.HorarioInicio THEN 1 ELSE 0 END AS LlegoTarde,
                    CASE WHEN CAST(D.HoraSalidaCompleta AS time) < H.HorarioFinal THEN 1 ELSE 0 END AS SalioTemprano
                FROM DuracionMayorPorDia D
                INNER JOIN dbo.tblHorariosEmployees H
                    ON H.IdEmpNum = D.IdEmpNum
                    AND H.DiaSemana = D.NombreDia
                WHERE D.RN = 1
            ),
            Banco AS (
                SELECT
                    IdEmpNum,
                    SUM(fHoras) AS HorasBanco
                FROM dbo.tblBancoHorasKardex
                GROUP BY IdEmpNum
            )
            SELECT
                D.IdEmpNum,
                D.tFullName AS NombreUsuario,
                ? AS FechaInicial,
                DATEADD(DAY, -1, ?) AS FechaFinal,
                D.IdAccessGroup,
                D.IdDepartment,
                COALESCE(B.HorasBanco, 0) AS TotalHoras,
                SUM(D.SalioTemprano) AS SalidasTemprano
            FROM DiasCalculados D
            LEFT JOIN Banco B
                ON B.IdEmpNum = D.IdEmpNum
            WHERE D.IdEmpNum IN ({ids_permitidos})
            GROUP BY
                D.IdEmpNum,
                D.tFullName,
                D.IdAccessGroup,
                D.IdDepartment,
                B.HorasBanco
            ORDER BY D.IdEmpNum;
        """, fecha_inicio, fecha_fin, fecha_inicio, fecha_fin)

        filas = cursor.fetchall()

        if not all:
            cursor.execute(f"SELECT iEmployeeNum, LTRIM(RTRIM(CONCAT(tFirstName, ' ', COALESCE(tMiddleName, ''), ' ', tLastName))) AS tFullName FROM dbo.tblEmployees WHERE iEmployeeNum IN ({ids_permitidos})")
            nombres = {emp_id: EMPLEADOS_NOMBRES[emp_id] for emp_id in sorted(EMPLEADOS_DASHBOARD) if emp_id in EMPLEADOS_NOMBRES}
            for row in cursor.fetchall():
                nombre = row[1].strip() if row[1] else ""
                if nombre:
                    nombres[row[0]] = nombre

            cursor.execute(f"SELECT IdEmpNum, SUM(fHoras) AS HorasBanco FROM dbo.tblBancoHorasKardex WHERE IdEmpNum IN ({ids_permitidos}) GROUP BY IdEmpNum")
            horas_db = {row[0]: float(row[1] or 0.0) for row in cursor.fetchall()}
        else:
            nombres = nombres if 'nombres' in locals() else {}
            horas_db = {}

        cursor.close()
        conn.close()

        resumen_por_empleado = {
            fila[0]: {
                "id": fila[0],
                "nombre": fila[1],
                "numero_empleado": fila[0],
                "total_horas": float(fila[6] or 0.0),
                "salidas_temprano": int(fila[7] or 0),
            }
            for fila in filas
        }

        if ids:
            # Cuando se pasan ids explícitos, devolver solo esos ids en el resultado
            todos_ids = sorted(ids_parsed) if 'ids_parsed' in locals() else sorted(EMPLEADOS_DASHBOARD)
        elif all:
            todos_ids = sorted(nombres.keys())
        else:
            todos_ids = sorted(EMPLEADOS_DASHBOARD)

        resultado = []
        for emp_id in todos_ids:
            empleado = resumen_por_empleado.get(emp_id)
            if ids:
                # Cuando se filtra por ids, incluir empleados que aparecen en el resumen
                # o, si no tienen eventos pero existen en la tabla de empleados, devolver un placeholder.
                if empleado is not None:
                    resultado.append(empleado)
                else:
                    # si existe en nombres (consulta a tblEmployees), devolver fila con ceros
                    if 'nombres' in locals() and emp_id in nombres:
                        resultado.append({
                            "id": emp_id,
                            "nombre": nombres.get(emp_id, f"Empleado {emp_id}"),
                            "numero_empleado": emp_id,
                            "total_horas": float(horas_db.get(emp_id, 0.0)),
                            "salidas_temprano": 0,
                        })
                    else:
                        # omitir IDs que no existen en la base de datos
                        continue
            else:
                # Comportamiento anterior: rellenar con valores por defecto cuando no hay datos
                if empleado is None:
                    resultado.append({
                        "id": emp_id,
                        "nombre": nombres.get(emp_id, f"Empleado {emp_id}"),
                        "numero_empleado": emp_id,
                        "total_horas": 0.0,
                        "salidas_temprano": 0,
                    })
                else:
                    resultado.append(empleado)

        return resultado
    except Exception as e:
        print(f"Error al procesar la consulta de horas: {e}")
        raise HTTPException(status_code=500, detail=f"Error en el servidor: {str(e)}")

class ActualizarEmpleado(BaseModel):
    nombre: str
    total_horas: Optional[float] = None
    salidas_temprano: Optional[int] = None

@app.patch("/api/empleados/{empleado_id}")
def actualizar_empleado(
    empleado_id: int,
    datos: ActualizarEmpleado,
    _: dict = Depends(require_roles("admin", "jefe")),
):
    if not datos.nombre or not datos.nombre.strip():
        raise HTTPException(status_code=400, detail="El nombre del empleado es obligatorio.")

    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        cursor.execute("SELECT iEmployeeNum FROM dbo.tblEmployees WHERE iEmployeeNum = ?", empleado_id)
        empleado_existente = cursor.fetchone()
        if not empleado_existente:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Empleado no encontrado.")

        nombre_completo = datos.nombre.strip()
        partes = nombre_completo.split()
        tFirstName = partes[0]
        tLastName = partes[-1] if len(partes) > 1 else ''
        tMiddleName = ' '.join(partes[1:-1]) if len(partes) > 2 else ''

        cursor.execute(
            "UPDATE dbo.tblEmployees SET tFirstName = ?, tMiddleName = ?, tLastName = ? WHERE iEmployeeNum = ?",
            tFirstName, tMiddleName, tLastName, empleado_id,
        )

        if datos.total_horas is not None:
            cursor.execute("SELECT SUM(fHoras) FROM dbo.tblBancoHorasKardex WHERE IdEmpNum = ?", empleado_id)
            total_horas_actual = cursor.fetchone()
            current_horas = float(total_horas_actual[0] or 0.0) if total_horas_actual else 0.0
            diff = float(datos.total_horas) - current_horas
            if abs(diff) >= 0.01:
                observaciones = f"Ajuste de horas por edición de empleado {empleado_id}"
                cursor.execute(
                    "INSERT INTO dbo.tblBancoHorasKardex (IdEmpNum, FechaAfectacion, fHoras, tTipoTransaccion, tObservaciones, IdUsuarioAutoriza, bActivo, dtFechaEliminacion, IdUsuarioElimina) VALUES (?, ?, ?, 'Ajuste', ?, NULL, 1, '1900-01-01', NULL)",
                    empleado_id, date.today(), diff, observaciones,
                )

        if datos.salidas_temprano is not None:
            cursor.execute("SELECT COUNT(*) FROM dbo.tblBancoHorasKardex WHERE IdEmpNum = ? AND fHoras < 0", empleado_id)
            current_salidas = cursor.fetchone()
            current_salidas = int(current_salidas[0] or 0) if current_salidas else 0
            diferencia_salidas = datos.salidas_temprano - current_salidas
            if diferencia_salidas > 0:
                for _ in range(diferencia_salidas):
                    observaciones = f"Ajuste de salida temprana por edición de empleado {empleado_id}"
                    cursor.execute(
                        "INSERT INTO dbo.tblBancoHorasKardex (IdEmpNum, FechaAfectacion, fHoras, tTipoTransaccion, tObservaciones, IdUsuarioAutoriza, bActivo, dtFechaEliminacion, IdUsuarioElimina) VALUES (?, ?, ?, 'Ajuste', ?, NULL, 1, '1900-01-01', NULL)",
                        empleado_id, date.today(), -1.0, observaciones,
                    )
            elif diferencia_salidas < 0:
                raise HTTPException(status_code=400, detail="No es posible reducir el número de salidas tempranas a través de esta edición.")

        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "mensaje": "Empleado actualizado en la base de datos."}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al actualizar el empleado: {e}")
        raise HTTPException(status_code=500, detail="No se pudo actualizar el empleado en la base de datos.")

@app.get("/api/reportes")
def obtener_reportes(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        if fecha_fin is None:
            fecha_fin = date.today()
        if fecha_inicio is None:
            fecha_inicio = fecha_fin - timedelta(days=30)

        cursor.execute("SET LANGUAGE Spanish;")

        cursor.execute("""
            SELECT
                b.IdEmpNum,
                LTRIM(RTRIM(CONCAT(emp.tFirstName, ' ', COALESCE(emp.tMiddleName, ''), ' ', emp.tLastName))) AS NombreUsuario,
                SUM(b.fHoras) AS TotalHoras,
                COUNT(*) AS SalidasTemprano
            FROM dbo.tblBancoHorasKardex b
            INNER JOIN dbo.tblEmployees emp
                ON emp.iEmployeeNum = b.IdEmpNum
            WHERE b.FechaAfectacion >= ?
              AND b.FechaAfectacion <= ?
              AND b.fHoras < 0
            GROUP BY b.IdEmpNum, emp.tFirstName, emp.tMiddleName, emp.tLastName
            ORDER BY b.IdEmpNum;
        """, fecha_inicio, fecha_fin)

        filas = cursor.fetchall()
        cursor.close()
        conn.close()

        return [
            {
                "id": fila[0],
                "nombre": fila[1],
                "total_horas": float(fila[2] or 0.0),
                "salidas_temprano": int(fila[3] or 0),
            }
            for fila in filas
        ]
    except Exception as e:
        print(f"Error al generar el reporte: {e}")
        raise HTTPException(status_code=500, detail=f"Error en el servidor: {str(e)}")

@app.get("/api/empleados/{empleado_id}/salidas-temprano")
def obtener_detalle_salidas_temprano(
    empleado_id: int,
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        if fecha_fin is None:
            fecha_fin = date.today()
        if fecha_inicio is None:
            fecha_inicio = fecha_fin - timedelta(days=30)

        cursor.execute("SET LANGUAGE Spanish;")

        cursor.execute("""
            SELECT
                b.FechaAfectacion,
                b.tObservaciones,
                b.fHoras
            FROM dbo.tblBancoHorasKardex b
            WHERE b.IdEmpNum = ?
              AND b.FechaAfectacion >= ?
              AND b.FechaAfectacion <= ?
              AND b.fHoras < 0
            ORDER BY b.FechaAfectacion;
        """, empleado_id, fecha_inicio, fecha_fin)

        filas = cursor.fetchall()
        cursor.close()
        conn.close()

        return [
            {
                "fecha": fila[0].isoformat() if fila[0] else None,
                "observaciones": fila[1],
                "horas": float(fila[2] or 0.0),
            }
            for fila in filas
        ]
    except Exception as e:
        print(f"Error al obtener el detalle de salidas temprano: {e}")
        raise HTTPException(status_code=500, detail=f"Error en el servidor: {str(e)}")
    

    
@app.get("/api/dashboard-empleados")
def obtener_empleados_dashboard(
    current_user: dict = Depends(get_current_user)
):
    try:
        # 1. ID del jefe conectado desde el token decodificado
        id_jefe_conectado = int(current_user.get("id_usuario"))

        conn = obtener_conexion()
        cursor = conn.cursor()

        # 2. Tu consulta SQL exacta para obtener los IDs de los subordinados
        query = """
            SELECT sub.[id_usuario_original]
            FROM [dbo].[tbl_usuarios_sistema] sub
            INNER JOIN [dbo].[tbl_usuarios_sistema] jefe 
                ON sub.[id_jefe] = jefe.[id_usuario_sistema]
            WHERE jefe.[id_usuario_sistema] = ?
        """
        cursor.execute(query, (id_jefe_conectado,))
        mis_empleados_ids = [row[0] for row in cursor.fetchall() if row[0] is not None]
        
        cursor.close()
        conn.close()

        # 3. Si no tiene personal a cargo, retornamos una lista vacía de inmediato
        if not mis_empleados_ids:
            return []

        # 4. Traemos la lista completa de asistencias recalculadas por tu función original
        todos_empleados = listar_empleados(all=True)

        # 5. Filtramos en memoria para quedarnos únicamente con los suyos
        empleados_filtrados = [
            emp for emp in todos_empleados
            if emp.get("id") in mis_empleados_ids or emp.get("id_empleado") in mis_empleados_ids
        ]

        return empleados_filtrados

    except Exception as e:
        print(f"Error al obtener empleados del dashboard: {e}")
        raise HTTPException(
            status_code=500, 
            detail="No se pudieron cargar tus empleados a cargo."
        )
    

@app.get("/api/empleados/{empleado_id}/horario")
def obtener_horario_empleado(
    empleado_id: int,
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        if fecha_fin is None:
            fecha_fin = date.today()
        if fecha_inicio is None:
            fecha_inicio = fecha_fin - timedelta(days=30)

        cursor.execute("SET LANGUAGE Spanish;")

        cursor.execute("""
            SELECT
                H.DiaSemana,
                CAST(H.HorarioInicio AS VARCHAR(5)) + ' - ' + CAST(H.HorarioFinal AS VARCHAR(5)) AS Horario,
                ISNULL(SUM(CASE WHEN b.fHoras > 0 THEN b.fHoras ELSE 0 END), 0) AS HorasExtra
            FROM dbo.tblHorariosEmployees H
            LEFT JOIN dbo.tblBancoHorasKardex b
                ON b.IdEmpNum = H.IdEmpNum
                AND b.fHoras > 0
                AND b.FechaAfectacion >= ?
                AND b.FechaAfectacion <= ?
                AND DATENAME(WEEKDAY, b.FechaAfectacion) = H.DiaSemana
            WHERE H.IdEmpNum = ?
              AND H.DiaSemana IN ('Lunes', 'Martes', 'Miércoles', 'Miercoles', 'Jueves', 'Viernes')
            GROUP BY H.DiaSemana, H.HorarioInicio, H.HorarioFinal
            ORDER BY CASE
                WHEN H.DiaSemana = 'Lunes' THEN 1
                WHEN H.DiaSemana = 'Martes' THEN 2
                WHEN H.DiaSemana = 'Miércoles' THEN 3
                WHEN H.DiaSemana = 'Miercoles' THEN 3
                WHEN H.DiaSemana = 'Jueves' THEN 4
                WHEN H.DiaSemana = 'Viernes' THEN 5
                ELSE 6
            END;
        """, fecha_inicio, fecha_fin, empleado_id)

        filas = cursor.fetchall()
        cursor.close()
        conn.close()

        return [
            {
                "dia": fila[0],
                "horario": fila[1],
                "horas_extra": float(fila[2] or 0.0),
            }
            for fila in filas
        ]
    except Exception as e:
        print(f"Error al obtener el horario del empleado: {e}")
        raise HTTPException(status_code=500, detail=f"Error en el servidor: {str(e)}")

@app.get("/api/dashboard-resumen")
def obtener_dashboard_resumen(current_user: dict = Depends(get_current_user)):
    try:
        # 1. Obtenemos el ID de usuario del jefe en sesión
        id_jefe_conectado = int(current_user.get("id_usuario"))

        # 2. Buscamos en la base de datos los IDs de los empleados que tiene a cargo
        conn = obtener_conexion()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id_usuario_original 
            FROM dbo.tbl_usuarios_sistema 
            WHERE id_jefe = ?
        """, (id_jefe_conectado,))
        
        # Guardamos los IDs originales en un set para una búsqueda súper rápida
        mis_empleados_ids = {row[0] for row in cursor.fetchall() if row[0] is not None}
        
        cursor.close()
        conn.close()

        # 3. Traemos todos los empleados calculados por tu función original
        todos_empleados = listar_empleados(all=True)

        # 4. Filtramos la lista para quedarnos ÚNICAMENTE con sus subordinados directos
        # (Comprobamos tanto 'id' como 'id_empleado' por seguridad de la estructura de tu diccionario)
        empleados = [
            emp for emp in todos_empleados 
            if emp.get("id") in mis_empleados_ids or emp.get("id_empleado") in mis_empleados_ids
        ]

        # 5. Calculamos las métricas únicamente sobre este grupo filtrado
        total_horas = sum(float(emp.get("total_horas", 0) or 0) for emp in empleados)
        empleados_pendientes = sum(1 for emp in empleados if emp.get("salidas_temprano", 0) > 0)
        empleados_aprobadas = sum(1 for emp in empleados if emp.get("salidas_temprano", 0) == 0)
        eficiencia = round((empleados_aprobadas / len(empleados) * 100) if empleados else 0.0, 2)

        return {
            "total_horas": total_horas,
            "empleados_pendientes": empleados_pendientes,
            "empleados_aprobadas": empleados_aprobadas,
            "eficiencia": eficiencia,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al generar resumen del dashboard: {e}")
        raise HTTPException(status_code=500, detail="No se pudo generar el resumen del dashboard.")
@app.get("/api/perfil")
def obtener_perfil(_: dict = Depends(get_current_user)):
    return PERFIL_DATA

@app.post("/api/perfil")
def guardar_perfil(
    perfil: ActualizarPerfil,
    _: dict = Depends(get_current_user),
):
    try:
        PERFIL_DATA["nombre"] = perfil.nombre
        PERFIL_DATA["rol"] = perfil.rol
        PERFIL_DATA["email"] = perfil.email
        PERFIL_DATA["telefono"] = perfil.telefono
        PERFIL_DATA["departamento"] = perfil.departamento
        PERFIL_DATA["sucursal"] = perfil.sucursal
        PERFIL_DATA["direccion"] = perfil.direccion
        return PERFIL_DATA
    except Exception as e:
        print(f"Error al guardar el perfil: {e}")
        raise HTTPException(status_code=500, detail="No se pudo guardar el perfil.")

@app.post("/api/perfil-password")
def cambiar_password(
    datos: CambiarPassword,
    _: dict = Depends(get_current_user),
):
    """
    Cambiar la contraseña del usuario. 
    En un sistema real, esto verificaría la contraseña actual en la BD.
    Por ahora, aceptamos cualquier contraseña actual válida (mock).
    """
    try:
        # Validar que la nueva contraseña sea fuerte
        if len(datos.new_password) < 8:
            raise HTTPException(status_code=400, detail="La contraseña debe tener mínimo 8 caracteres.")
        
        has_upper = any(c.isupper() for c in datos.new_password)
        has_digit = any(c.isdigit() for c in datos.new_password)
        has_special = any(c in "!@#$%^&*" for c in datos.new_password)
        
        if not (has_upper and has_digit and has_special):
            raise HTTPException(status_code=400, detail="La contraseña debe incluir mayúsculas, números y símbolos (!@#$%^&*).")
        
        # En un sistema real, aquí verificarías con la base de datos
        # Por ahora, simulamos que la contraseña cambió
        print(f"[MOCK] Contraseña actualizada para usuario (de {len(datos.actual_password)} chars a {len(datos.new_password)} chars)")
        
        return {"detail": "Contraseña actualizada correctamente.", "status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al cambiar contraseña: {e}")
        raise HTTPException(status_code=500, detail="No se pudo cambiar la contraseña.")

@app.post("/api/registrar")
def registrar_horas(
    datos: RegistroHoras,
    _: dict = Depends(require_roles("admin", "jefe")),
):
    if not datos.dias_semana:
        raise HTTPException(status_code=400, detail="Debes seleccionar al menos un día de la semana.")

    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        # Verificar que el empleado existe en tblOrganigramaOficial
        cursor.execute("SELECT IdEmpNum FROM dbo.tblOrganigramaOficial WHERE IdEmpNum = ?", datos.numero_empleado)
        empleado_existe = cursor.fetchone()
        if not empleado_existe:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail=f"El empleado con ID {datos.numero_empleado} no existe en el sistema.")

        dias_unicos = []
        for dia in datos.dias_semana:
            if dia not in dias_unicos:
                dias_unicos.append(dia)

        for dia in dias_unicos:
            observaciones = f"Descuento de {datos.cantidad_horas} hrs por salida temprana el {dia.isoformat()}"
            cursor.execute("""
                INSERT INTO dbo.tblBancoHorasKardex (
                    IdEmpNum,
                    FechaAfectacion,
                    fHoras,
                    tTipoTransaccion,
                    tObservaciones,
                    IdUsuarioAutoriza,
                    bActivo,
                    dtFechaEliminacion,
                    IdUsuarioElimina
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    'Ajuste',
                    ?,
                    NULL,
                    1,
                    '1900-01-01',
                    NULL
                )
            """, datos.numero_empleado, dia, -abs(datos.cantidad_horas), observaciones)

        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "mensaje": "Asignación de horas guardada e indexado"}
    except HTTPException:
        raise
    
@app.put("/api/registros/solicitudes/{id_reposicion}/estado")
def actualizar_estado_solicitud(
    id_reposicion: int,
    datos: dict, # Recibimos un JSON con {"estado": "aprobar"} o {"estado": "rechazar"}
    current_user: dict = Depends(get_current_user)
):
    try:
        conn = obtener_conexion()
        cursor = conn.cursor()

        # 1. Validar el nuevo estado que nos envía el frontend
        accion = datos.get("estado")
        if accion not in ["aprobar", "rechazar"]:
            raise HTTPException(status_code=400, detail="Acción no válida. Debe ser 'aprobar' o 'rechazar'")

        # Mapeamos la acción al estado de la base de datos
        nuevo_estado = "aprobada" if accion == "aprobar" else "rechazada"
        id_usuario_actual = int(current_user.get("id_usuario"))
        rol_actual = normalizar_rol(current_user.get("rol"))

        # 2. Consultar la solicitud actual para saber quién la autoriza
        cursor.execute(
            "SELECT id_usuario_sistema, id_jefe_directo, id_jefe_superior, estado_jefe_directo, estado_jefe_superior, estado_final, fecha_solicitada, horas_a_reponer "
            "FROM dbo.tbl_solicitudes_reposicion WHERE id_reposicion = ?", 
            id_reposicion
        )
        solicitud = cursor.fetchone()
        if not solicitud:
            raise HTTPException(status_code=404, detail="La solicitud de reposición no existe.")

        id_solicitante_sistema, id_jd, id_js, estado_jd, estado_js, estado_final_actual, fecha_solicitada, horas_a_reponer = solicitud

        estado_jd = _estado_normalizado(str(estado_jd))
        estado_js = _estado_normalizado(str(estado_js))
        estado_final_actual = _estado_normalizado(str(estado_final_actual))

        if estado_final_actual in {"aprobada", "rechazada"}:
            raise HTTPException(status_code=409, detail=f"La solicitud ya está {estado_final_actual}.")

        if int(id_usuario_actual) == int(id_solicitante_sistema):
            raise HTTPException(status_code=403, detail="No puedes autorizar tu propia solicitud.")

        # 3. Determinar qué jefe está firmando y actualizar su columna correspondiente
        columna_a_actualizar = None
        if id_usuario_actual == id_jd:
            if estado_jd != "pendiente":
                raise HTTPException(status_code=409, detail="El jefe directo ya procesó esta solicitud.")
            columna_a_actualizar = "estado_jefe_directo"
            estado_jd = nuevo_estado
        elif id_usuario_actual == id_js:
            if estado_jd != "aprobada":
                raise HTTPException(status_code=409, detail="El jefe superior solo puede autorizar después de la aprobación del jefe directo.")
            if estado_js != "pendiente":
                raise HTTPException(status_code=409, detail="El jefe superior ya procesó esta solicitud.")
            columna_a_actualizar = "estado_jefe_superior"
            estado_js = nuevo_estado
        elif rol_actual == "admin":
            # Si es admin, puede actuar por cualquiera que falte
            if estado_jd == "pendiente":
                columna_a_actualizar = "estado_jefe_directo"
                estado_jd = nuevo_estado
            elif estado_js == "pendiente":
                columna_a_actualizar = "estado_jefe_superior"
                estado_js = nuevo_estado
            else:
                raise HTTPException(status_code=409, detail="La solicitud ya fue procesada por ambos niveles de autorización.")
        else:
            raise HTTPException(status_code=403, detail="No tienes permisos para autorizar esta solicitud.")

        # 4. Calcular el estado final de la solicitud
        # Si alguno rechaza, el final es rechazada. Si ambos aprueban, el final es aprobada.
        estado_final = "pendiente"
        if estado_jd == "rechazada" or estado_js == "rechazada":
            estado_final = "rechazada"
        elif estado_jd == "aprobada" and estado_js == "aprobada":
            estado_final = "aprobada"

        # 5. Ejecutar la actualización en la base de datos
        cursor.execute(
            f"UPDATE dbo.tbl_solicitudes_reposicion "
            f"SET {columna_a_actualizar} = ?, estado_final = ?, updated_at = SYSUTCDATETIME() "
            f"WHERE id_reposicion = ?",
            nuevo_estado, estado_final, id_reposicion
        )

        # 5.1 Si ya quedó aprobada por ambos niveles, aplica el descuento del banco de horas
        if estado_final == "aprobada":
            id_emp_solicitante = _obtener_id_empleado_por_usuario(cursor, int(id_solicitante_sistema))
            if id_emp_solicitante is None:
                raise HTTPException(status_code=500, detail="No se pudo resolver el empleado de la solicitud para aplicar el descuento.")

            _registrar_descuento_reposicion(
                cursor,
                id_empleado=int(id_emp_solicitante),
                fecha_solicitada=fecha_solicitada,
                horas_a_reponer=float(horas_a_reponer),
                id_usuario_autoriza_historial=id_usuario_actual,
                id_reposicion=id_reposicion,
            )

        # 6. Registrar en el historial de movimientos
        cursor.execute(
            "INSERT INTO dbo.tbl_historial_movimientos "
            "(tabla_afectada, id_registro_afectado, accion, usuario_responsable, fecha_movimiento, descripcion) "
            "VALUES (?, ?, ?, ?, SYSUTCDATETIME(), ?)",
            "tbl_solicitudes_reposicion",
            id_reposicion,
            f"SOLICITUD_{nuevo_estado.upper()}",
            id_usuario_actual,
            f"El usuario {current_user.get('nombre')} cambió el estado a '{nuevo_estado}'."
        )

        conn.commit()
        cursor.close()
        conn.close()

        return {"status": "success", "mensaje": f"Solicitud actualizada a {nuevo_estado} con éxito.", "estado_final": estado_final}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al actualizar la solicitud: {e}")
        raise HTTPException(status_code=500, detail="Error interno al procesar la actualización.")
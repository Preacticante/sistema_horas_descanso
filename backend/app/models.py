from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RolSistema(str, Enum):
	admin = "admin"
	jefe = "jefe"
	empleado = "empleado"


class EstadoSolicitud(str, Enum):
	pendiente = "pendiente"
	aprobada = "aprobada"
	rechazada = "rechazada"


class AccionAutorizacion(str, Enum):
	aprobar = "aprobar"
	rechazar = "rechazar"


class BaseSchema(BaseModel):
	model_config = ConfigDict(str_strip_whitespace=True, from_attributes=True)


class LoginRequest(BaseSchema):
	username_or_email: str = Field(min_length=3, max_length=150)
	password: str = Field(min_length=8, max_length=128)


class LoginResponse(BaseSchema):
	access_token: str
	token_type: str = "bearer"
	id_usuario: int
	nombre: str
	nombre_usuario: str
	rol: RolSistema


class UsuarioBase(BaseSchema):
	nombre: str = Field(min_length=3, max_length=150)
	nombre_usuario: str = Field(min_length=4, max_length=50, pattern=r"^[A-Za-z0-9_]+$")
	email: str = Field(min_length=6, max_length=150, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
	rol: RolSistema = RolSistema.empleado
	id_empleado: Optional[int] = Field(default=None, ge=1)
	activo: bool = True


class UsuarioCreate(UsuarioBase):
	password: str = Field(min_length=8, max_length=128)
	confirm_password: str = Field(min_length=8, max_length=128)

	@field_validator("confirm_password")
	@classmethod
	def confirmar_password(cls, value: str, info):
		password = info.data.get("password")
		if password and value != password:
			raise ValueError("Las contraseñas no coinciden")
		return value


class UsuarioUpdate(BaseSchema):
	nombre: Optional[str] = Field(default=None, min_length=3, max_length=150)
	email: Optional[str] = Field(default=None, min_length=6, max_length=150, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
	rol: Optional[RolSistema] = None
	activo: Optional[bool] = None


class UsuarioOut(BaseSchema):
	id_usuario: int
	nombre: str
	nombre_usuario: str
	email: str
	rol: RolSistema
	id_empleado: Optional[int] = None
	activo: bool
	fecha_creacion: Optional[datetime] = None


class BancoHorasItem(BaseSchema):
	id_empleado: int
	nombre_empleado: str
	total_horas: float = Field(ge=-9999, le=9999)
	salidas_temprano: int = Field(ge=0)
	horas_extras: float = Field(default=0, ge=0)
	horas_reposicion: float = Field(default=0, ge=0)


class DashboardResumen(BaseSchema):
	total_horas: float
	empleados_pendientes: int = Field(ge=0)
	empleados_aprobadas: int = Field(ge=0)
	eficiencia: float = Field(ge=0, le=100)


class ReporteFiltro(BaseSchema):
	fecha_inicio: date
	fecha_fin: date
	id_empleado: Optional[int] = Field(default=None, ge=1)
	departamento: Optional[str] = Field(default=None, max_length=100)

	@field_validator("fecha_fin")
	@classmethod
	def validar_rango_fechas(cls, value: date, info):
		inicio = info.data.get("fecha_inicio")
		if inicio and value < inicio:
			raise ValueError("fecha_fin no puede ser menor que fecha_inicio")
		return value


class SolicitudReposicionCreate(BaseSchema):
	id_empleado: int = Field(ge=1)
	fecha: date
	horas_solicitadas: float = Field(gt=0, le=12)
	motivo: str = Field(min_length=5, max_length=500)
	id_jefe_directo: Optional[int] = Field(default=None, ge=1)
	id_jefe_superior: Optional[int] = Field(default=None, ge=1)


class SolicitudReposicionOut(BaseSchema):
	id_solicitud: int
	id_empleado: int
	fecha: date
	horas_solicitadas: float
	motivo: str
	estado_jefe_directo: EstadoSolicitud
	estado_jefe_superior: EstadoSolicitud
	estado_final: EstadoSolicitud
	fecha_creacion: datetime


class SolicitudAutorizacionPatch(BaseSchema):
	accion: AccionAutorizacion
	comentario: Optional[str] = Field(default=None, max_length=500)


class HistorialMovimientoOut(BaseSchema):
	id_movimiento: int
	id_empleado: int
	tipo_movimiento: str
	horas: float
	fecha_movimiento: datetime
	referencia: Optional[str] = None

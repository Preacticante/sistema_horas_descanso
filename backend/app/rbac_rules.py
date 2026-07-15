from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer_scheme = HTTPBearer(auto_error=False)
_TOKEN_SECRET = os.getenv("APP_TOKEN_SECRET", "change-me-in-production")
_TOKEN_EXP_MINUTES = int(os.getenv("APP_TOKEN_EXP_MINUTES", "120"))


def normalizar_rol(rol: str | None) -> str:
	valor = (rol or "").strip().lower()
	mapa = {
		"administrador": "admin",
		"admin": "admin",
		"jefe": "jefe",
		"empleado": "empleado",
	}
	return mapa.get(valor, valor)


def _b64url_encode(data: bytes) -> str:
	return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
	padding = "=" * ((4 - len(data) % 4) % 4)
	return base64.urlsafe_b64decode(data + padding)


def _sign(message: bytes) -> str:
	sig = hmac.new(_TOKEN_SECRET.encode("utf-8"), message, hashlib.sha256).digest()
	return _b64url_encode(sig)


def create_access_token(*, payload: dict[str, Any], expires_minutes: int | None = None) -> str:
	exp_seconds = (expires_minutes or _TOKEN_EXP_MINUTES) * 60
	claims = {**payload, "exp": int(time.time()) + exp_seconds}
	header = {"alg": "HS256", "typ": "JWT"}

	encoded_header = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
	encoded_payload = _b64url_encode(json.dumps(claims, separators=(",", ":")).encode("utf-8"))
	signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
	signature = _sign(signing_input)
	return f"{encoded_header}.{encoded_payload}.{signature}"


def decode_access_token(token: str) -> dict[str, Any]:
	try:
		encoded_header, encoded_payload, signature = token.split(".")
	except ValueError as exc:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido") from exc

	signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
	expected_sig = _sign(signing_input)
	if not hmac.compare_digest(signature, expected_sig):
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Firma de token inválida")

	try:
		claims = json.loads(_b64url_decode(encoded_payload).decode("utf-8"))
	except Exception as exc:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Payload de token inválido") from exc

	exp = claims.get("exp")
	if not isinstance(exp, int) or exp < int(time.time()):
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expirado")

	return claims


def get_current_user(
	credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict[str, Any]:
	if credentials is None or not credentials.credentials:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")

	claims = decode_access_token(credentials.credentials)
	rol = normalizar_rol(str(claims.get("rol", "")))
	user_id = claims.get("id_usuario")
	if not user_id or not rol:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

	return {
		"id_usuario": int(user_id),
		"nombre": claims.get("nombre", ""),
		"nombre_usuario": claims.get("nombre_usuario", ""),
		"rol": rol,
	}


def require_roles(*roles: str):
	permitidos = {normalizar_rol(r) for r in roles}

	def _dependency(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
		rol_usuario = normalizar_rol(user.get("rol"))
		if rol_usuario not in permitidos:
			raise HTTPException(
				status_code=status.HTTP_403_FORBIDDEN,
				detail="No tienes permisos para realizar esta acción",
			)
		return user

	return _dependency

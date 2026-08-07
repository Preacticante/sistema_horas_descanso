import sys
import os
import time
import pytest
from fastapi import HTTPException

# Ensure backend package is importable when running pytest from repo root
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app import rbac_rules


def test_create_and_decode_token():
    payload = {"id_usuario": 42, "nombre": "Test", "rol": "empleado"}
    token = rbac_rules.create_access_token(payload=payload, expires_minutes=1)
    claims = rbac_rules.decode_access_token(token)
    assert claims.get("id_usuario") == 42
    assert claims.get("nombre") == "Test"
    assert claims.get("rol") == "empleado"


def test_expired_token_raises():
    payload = {"id_usuario": 1}
    token = rbac_rules.create_access_token(payload=payload, expires_minutes=0)
    # Sleep a tick to ensure expiration
    time.sleep(1)
    with pytest.raises(HTTPException) as excinfo:
        rbac_rules.decode_access_token(token)
    assert "expir" in str(excinfo.value.detail).lower()

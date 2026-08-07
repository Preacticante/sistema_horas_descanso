import sys
import os
import pytest
from fastapi import HTTPException

# Ensure backend package is importable when running pytest from repo root
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app import rbac_rules


def test_decode_tampered_signature_raises():
    payload = {"id_usuario": 10, "rol": "empleado"}
    token = rbac_rules.create_access_token(payload=payload, expires_minutes=5)

    # Tamper token by changing one character in signature
    parts = token.split('.')
    assert len(parts) == 3
    sig = parts[2]
    # flip last char (safe because base64url charset)
    tampered_sig = sig[:-1] + ("A" if sig[-1] != "A" else "B")
    tampered = f"{parts[0]}.{parts[1]}.{tampered_sig}"

    with pytest.raises(HTTPException) as exc:
        rbac_rules.decode_access_token(tampered)
    assert 'firma' in str(exc.value.detail).lower() or 'firma' in str(exc.value).lower()


def test_decode_malformed_token_raises():
    bad_token = 'this.is.not.valid'
    with pytest.raises(HTTPException):
        rbac_rules.decode_access_token(bad_token)

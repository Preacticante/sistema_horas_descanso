from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app  # noqa: E402
from app.database import obtener_conexion  # noqa: E402
from app.rbac_rules import create_access_token  # noqa: E402


def obtener_cadena_autorizacion() -> dict:
    conn = obtener_conexion()
    cur = conn.cursor()
    cur.execute(
        "SELECT TOP 1 "
        "e.id_usuario_sistema AS emp_sys, "
        "e.id_usuario_original AS emp_orig, "
        "e.nombre_completo AS emp_nombre, "
        "e.id_jefe AS jd, "
        "j.id_jefe AS js "
        "FROM dbo.tbl_usuarios_sistema e "
        "INNER JOIN dbo.tbl_usuarios_sistema j ON e.id_jefe = j.id_usuario_sistema "
        "INNER JOIN dbo.tbl_usuarios_sistema s ON j.id_jefe = s.id_usuario_sistema "
        "WHERE e.estatus = 1 "
        "AND j.estatus = 1 "
        "AND s.estatus = 1 "
        "AND e.id_usuario_original IS NOT NULL "
        "AND e.id_jefe IS NOT NULL "
        "AND j.id_jefe IS NOT NULL "
        "AND e.id_usuario_sistema <> e.id_jefe "
        "AND e.id_usuario_sistema <> j.id_jefe "
        "AND e.id_jefe <> j.id_jefe "
        "ORDER BY e.id_usuario_sistema"
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        raise RuntimeError("No se encontró una cadena empleado -> jefe directo -> jefe superior")

    return {
        "emp_sys": int(row[0]),
        "emp_orig": int(row[1]),
        "emp_nombre": str(row[2] or "Empleado"),
        "jd": int(row[3]),
        "js": int(row[4]),
    }


def obtener_total_horas(id_empleado: int) -> float:
    conn = obtener_conexion()
    cur = conn.cursor()
    cur.execute(
        "SELECT COALESCE(SUM(fHoras), 0) FROM dbo.tblBancoHorasKardex WHERE IdEmpNum = ?",
        id_empleado,
    )
    row = cur.fetchone()
    conn.close()
    return float(row[0] or 0.0)


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def main() -> int:
    chain = obtener_cadena_autorizacion()
    before_hours = obtener_total_horas(chain["emp_orig"])

    t_emp = create_access_token(
        payload={
            "id_usuario": chain["emp_sys"],
            "nombre": chain["emp_nombre"],
            "nombre_usuario": "emp_test",
            "rol": "empleado",
        }
    )
    t_jd = create_access_token(
        payload={
            "id_usuario": chain["jd"],
            "nombre": "Jefe Directo Test",
            "nombre_usuario": "jd_test",
            "rol": "jefe",
        }
    )
    t_js = create_access_token(
        payload={
            "id_usuario": chain["js"],
            "nombre": "Jefe Superior Test",
            "nombre_usuario": "js_test",
            "rol": "jefe",
        }
    )
    t_admin = create_access_token(
        payload={
            "id_usuario": 1,
            "nombre": "Admin Test",
            "nombre_usuario": "admin_test",
            "rol": "admin",
        }
    )

    fecha = date.today().isoformat()
    motivo = f"Prueba E2E flujo completo {datetime.now().strftime('%Y%m%d-%H%M%S')}"

    payload = {
        "id_empleado": chain["emp_orig"],
        "fecha": fecha,
        "horas_solicitadas": 0.01,
        "motivo": motivo,
        "id_jefe_directo": chain["jd"],
        "id_jefe_superior": chain["js"],
    }

    with TestClient(app) as client:
        create_resp = client.post("/api/registros/solicitudes", headers=bearer(t_emp), json=payload)
        if create_resp.status_code != 200:
            print(json.dumps({"ok": False, "stage": "create", "status": create_resp.status_code, "body": create_resp.text}, ensure_ascii=False))
            return 1

        data = create_resp.json()
        id_solicitud = int(data["id_solicitud"])

        jd_resp = client.put(
            f"/api/registros/solicitudes/{id_solicitud}/estado",
            headers=bearer(t_jd),
            json={"estado": "aprobar"},
        )
        if jd_resp.status_code != 200:
            print(json.dumps({"ok": False, "stage": "approve_jd", "status": jd_resp.status_code, "body": jd_resp.text, "id_solicitud": id_solicitud}, ensure_ascii=False))
            return 1

        js_resp = client.put(
            f"/api/registros/solicitudes/{id_solicitud}/estado",
            headers=bearer(t_js),
            json={"estado": "aprobar"},
        )
        if js_resp.status_code != 200:
            print(json.dumps({"ok": False, "stage": "approve_js", "status": js_resp.status_code, "body": js_resp.text, "id_solicitud": id_solicitud}, ensure_ascii=False))
            return 1

        list_resp = client.get("/api/registros/solicitudes", headers=bearer(t_admin))
        if list_resp.status_code != 200:
            print(json.dumps({"ok": False, "stage": "list", "status": list_resp.status_code, "body": list_resp.text, "id_solicitud": id_solicitud}, ensure_ascii=False))
            return 1

        rows = list_resp.json()
        row = next((r for r in rows if int(r.get("id_solicitud", 0)) == id_solicitud), None)
        if not row:
            print(json.dumps({"ok": False, "stage": "verify_row", "id_solicitud": id_solicitud}, ensure_ascii=False))
            return 1

        after_hours = obtener_total_horas(chain["emp_orig"])
        delta = round(after_hours - before_hours, 4)

        ok = (
            str(row.get("estado_jefe_directo", "")).lower() == "aprobada"
            and str(row.get("estado_jefe_superior", "")).lower() == "aprobada"
            and str(row.get("estado_final", "")).lower() == "aprobada"
            and delta == -0.01
        )

        result = {
            "ok": ok,
            "id_solicitud": id_solicitud,
            "empleado": chain,
            "estado_jd": row.get("estado_jefe_directo"),
            "estado_js": row.get("estado_jefe_superior"),
            "estado_final": row.get("estado_final"),
            "before_hours": before_hours,
            "after_hours": after_hours,
            "delta": delta,
        }
        print(json.dumps(result, ensure_ascii=False))
        return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

from app.database import obtener_conexion

EMAIL = "ah9267992@gmail.com.mx".strip().lower()

conn = obtener_conexion()
cur = conn.cursor()

try:
    cur.execute(
        """
        SELECT TOP 1
            u.iEmployeeNum,
            u.Nombre,
            u.email,
            u.[password],
            u.Rol,
            u.PasswordHash,
            u.PasswordSalt
        FROM dbo.tblUsuarios u
        WHERE LOWER(u.email) = LOWER(?) AND u.bActivo = 1
        """,
        EMAIL,
    )
    src = cur.fetchone()
    if not src:
        print("NO_ENCONTRADO_EN_TBLUSUARIOS")
        raise SystemExit(1)

    id_empleado = int(src[0])
    nombre = (src[1] or "Empleado").strip()
    email = (src[2] or EMAIL).strip().lower()
    plain_password = src[3] or "Prueba123!"
    rol = (src[4] or "empleado").strip().lower()
    phash = src[5]
    psalt = src[6]

    cur.execute(
        "SELECT TOP 1 id_usuario_sistema FROM dbo.tbl_usuarios_sistema WHERE LOWER(email) = LOWER(?)",
        email,
    )
    dst = cur.fetchone()

    if dst:
        cur.execute(
            """
            UPDATE dbo.tbl_usuarios_sistema
            SET id_usuario_original = ?,
                nombre_completo = ?,
                [password] = ?,
                rol = ?,
                estatus = 1,
                PasswordHash = ?,
                PasswordSalt = ?
            WHERE id_usuario_sistema = ?
            """,
            id_empleado,
            nombre,
            plain_password,
            rol,
            phash,
            psalt,
            int(dst[0]),
        )
        conn.commit()
        print("LEGACY_ACTUALIZADO")
        print(f"id_usuario_sistema={int(dst[0])}")
    else:
        cur.execute(
            """
            INSERT INTO dbo.tbl_usuarios_sistema
                (id_usuario_original, nombre_completo, email, [password], rol, estatus, PasswordHash, PasswordSalt)
            VALUES
                (?, ?, ?, ?, ?, 1, ?, ?)
            """,
            id_empleado,
            nombre,
            email,
            plain_password,
            rol,
            phash,
            psalt,
        )
        conn.commit()
        print("LEGACY_CREADO")

finally:
    cur.close()
    conn.close()

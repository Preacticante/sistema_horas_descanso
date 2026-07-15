import hashlib
import os
import pyodbc # Usamos la librería estándar para conectarnos a SQL Server

def obtener_conexion_directa():
    # Cadena de conexión estándar a tu SQL Server local
    conn_str = (
        "Driver={ODBC Driver 17 for SQL Server};"
        "Server=localhost;" # <--- Cambia esto por tu servidor si no es localhost (ej: .\SQLEXPRESS)
        "Database=AxTrax1;"
        "Trusted_Connection=yes;"
    )
    return pyodbc.connect(conn_str)

# USAMOS EXACTAMENTE TU FUNCIÓN DEL BACKEND
def generar_hash_salt(password: str, salt: bytes | None = None) -> tuple[bytes, bytes]:
    if salt is None:
        salt = os.urandom(16)
    hash_bytes = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200000)
    return salt, hash_bytes

def actualizar_passwords_sistema():
    try:
        print("Conectando a la base de datos AxTrax1...")
        conn = obtener_conexion_directa()
        cursor = conn.cursor()

        # Buscamos a todos los usuarios.
        # NOTA: Como en la ejecución anterior cambiamos el campo 'password' a 'ENC_PROTECTED', 
        # ahora buscamos los que tengan 'ENC_PROTECTED' para sobreescribir sus hashes con el algoritmo correcto.
        cursor.execute("""
            SELECT [id_usuario_sistema], [email]
            FROM [AxTrax1].[dbo].[tbl_usuarios_sistema]
            WHERE [password] = 'ENC_PROTECTED' OR [password] = 'Temp123!'
        """)
        
        usuarios = cursor.fetchall()
        
        if not usuarios:
            print("\nNo se encontraron usuarios pendientes de actualizar.")
            return

        print(f"\nSe encontraron {len(usuarios)} usuarios. Re-encriptando contraseñas con el algoritmo oficial de 200k iteraciones...")

        for usuario in usuarios:
            id_usuario_sistema, email = usuario
            
            # Generamos el salt y hash de la contraseña temporal "Temp123!" usando tu lógica exacta de 200k iteraciones
            password_salt_bytes, password_hash_bytes = generar_hash_salt("Temp123!")
            
            # Actualizamos utilizando los tipos binarios correctos
            cursor.execute("""
                UPDATE [AxTrax1].[dbo].[tbl_usuarios_sistema]
                SET [PasswordHash] = ?, 
                    [PasswordSalt] = ?,
                    [password] = 'ENC_PROTECTED' -- Mantenemos la marca de protegido
                WHERE [id_usuario_sistema] = ?
            """, (password_hash_bytes, password_salt_bytes, id_usuario_sistema))
            
            print(f" -> Contraseña encriptada (200k iteraciones) exitosamente para: {email}")

        conn.commit()
        print("\n¡Proceso terminado con éxito! Todos los usuarios han sido migrados con el algoritmo oficial.")
        
        cursor.close()
        conn.close()

    except Exception as e:
        print(f"\nOcurrió un error durante la migración: {e}")

if __name__ == "__main__":
    actualizar_passwords_sistema()
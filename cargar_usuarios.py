import sys, os
sys.path.insert(0, r"C:\Users\becario.tie\Documents\GitHub\sistema_horas_descanso\backend")
os.chdir(r"C:\Users\becario.tie\Documents\GitHub\sistema_horas_descanso\backend")

import hashlib

def generar_hash_salt(password: str, salt: bytes = None):
    if salt is None:
        salt = os.urandom(16)
    hash_bytes = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200000)
    return salt, hash_bytes

from app.database import obtener_conexion

# Datos del admin principal
USUARIOS = [
    (100, "Leticia Macías Zúñiga",            "lmacias",       "lmacias@prepauco.edu.mx",       "Administrador", "Cambio123!*"),
    (1,   "Nelson Hernán Torres Cervantes",    "ntorres",       "ntorres@prepauco.edu.mx",       "Jefe",          "Cambio123!*"),
    (102, "Irma Lilian Cedillo Reyes",         "lcedillo",      "lcedillo@prepauco.edu.mx",      "Jefe",          "Cambio123!*"),
    (103, "Martha Eugenia Montes Gómez",       "martha.montes", "martha.montes@prepauco.edu.mx", "Jefe",          "Cambio123!*"),
    (115, "Roberto Carlos Matehuala Vargas",   "rmatehuala",    "rmatehuala@prepauco.edu.mx",    "Jefe",          "Cambio123!*"),
    (104, "Baruch Alberto Rosales Sánchez",    "brosales",      "brosales@prepauco.edu.mx",      "Jefe",          "Cambio123!*"),
    (105, "Diana Sánchez Espino",              "dsancheze",     "dsancheze@prepauco.edu.mx",     "Jefe",          "Cambio123!*"),
    (109, "Cecilia de Lourdes Bracho Rodríguez","cbracho",      "cbracho@prepauco.edu.mx",       "Jefe",          "Cambio123!*"),
    (110, "María Teresa Serrano Lazcano",      "teresa.serrano","teresa.serrano@prepauco.edu.mx","Jefe",          "Cambio123!*"),
    (111, "Christopher Arturo Muciño González","chmucino",      "chmucino@prepauco.edu.mx",      "Jefe",          "Cambio123!*"),
    (112, "Laura Leticia González González",   "lgonzalez",     "lgonzalez@prepauco.edu.mx",     "Jefe",          "Cambio123!*"),
    (113, "María del Carmen Mendoza Aldape",   "mmendoza",      "mmendoza@prepauco.edu.mx",      "Jefe",          "Cambio123!*"),
    (2,   "Luis Francisco Valencia Villasana", "fvalencia",     "fvalencia@prepauco.edu.mx",     "Empleado",      "Cambio123!*"),
    (55,  "Martín Bocanegra Lucio",            "mbocanegra",    "mbocanegra@prepauco.edu.mx",    "Empleado",      "Cambio123!*"),
    (57,  "Gabriel Vallejo Balderas",          "gvallejo",      "gvallejo@prepauco.edu.mx",      "Empleado",      "Cambio123!*"),
    (58,  "Juan Domínguez Morales",            "jdominguez",    "jdominguez@prepauco.edu.mx",    "Empleado",      "Cambio123!*"),
    (72,  "Juan Alberto Zamora Gutiérrez",     "jzamora",       "jzamora@prepauco.edu.mx",       "Empleado",      "Cambio123!*"),
    (76,  "José Arreola Morales",              "jarreola",      "jarreola@prepauco.edu.mx",      "Empleado",      "Cambio123!*"),
    (116, "Alma Leticia Muñiz Núñez",          "amuniz",        "amuniz@prepauco.edu.mx",        "Empleado",      "Cambio123!*"),
    (117, "Viridiana Ramírez Rojas",           "vramirez",      "vramirez@prepauco.edu.mx",      "Empleado",      "Cambio123!*"),
    (118, "Salvador Ordoñez Martínez",         "sordonez",      "sordonez@prepauco.edu.mx",      "Empleado",      "Cambio123!*"),
    (119, "Cinthia Flores López",              "cflores",       "cflores@prepauco.edu.mx",       "Empleado",      "Cambio123!*"),
    (120, "Omar Rodríguez Montoya",            "orodriguez",    "orodriguez@prepauco.edu.mx",    "Empleado",      "Cambio123!*"),
    (740, "Rolando Aranda Gutiérrez",          "raranda",       "raranda@prepauco.edu.mx",       "Empleado",      "Cambio123!*"),
]

conn = obtener_conexion()
cur = conn.cursor()

insertados = 0
actualizados = 0

for id_emp, nombre, username, email, rol, password in USUARIOS:
    cur.execute("SELECT id FROM dbo.tblUsuarios WHERE iEmployeeNum = ? OR email = ?", id_emp, email)
    existe = cur.fetchone()
    salt, hash_bytes = generar_hash_salt(password)

    if existe:
        cur.execute("""
            UPDATE dbo.tblUsuarios
            SET Nombre=?, NombreUsuario=?, email=?, PasswordHash=?, PasswordSalt=?, Rol=?, bActivo=1
            WHERE id=?
        """, nombre, username, email, hash_bytes, salt, rol, int(existe[0]))
        actualizados += 1
        print(f"  ✓ Actualizado: {username}")
    else:
        cur.execute("""
            INSERT INTO dbo.tblUsuarios
            (iEmployeeNum, Nombre, NombreUsuario, email, password, PasswordHash, PasswordSalt, Rol, FechaCreacion, bActivo)
            VALUES (?, ?, ?, ?, '', ?, ?, ?, SYSUTCDATETIME(), 1)
        """, id_emp, nombre, username, email, hash_bytes, salt, rol)
        insertados += 1
        print(f"  + Insertado: {username}")

conn.commit()
cur.close()
conn.close()

print(f"\nListo. Insertados: {insertados} | Actualizados: {actualizados}")
print("\nCredenciales de acceso:")
print("  Usuario: lmacias  |  Contraseña: Cambio123!*")
print("  Usuario: ntorres   |  Contraseña: Cambio123!*")

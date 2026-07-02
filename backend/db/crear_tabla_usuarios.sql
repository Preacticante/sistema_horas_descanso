-- Crea la tabla de usuarios para el sistema de acceso.
-- Ejecuta este script en la base de datos oficial antes de poner el sistema en producción.

IF OBJECT_ID('dbo.tblUsuarios', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tblUsuarios (
        IdUsuario INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Nombre NVARCHAR(150) NOT NULL,
        NombreUsuario NVARCHAR(50) NOT NULL,
        Email NVARCHAR(255) NOT NULL,
        PasswordHash VARBINARY(256) NOT NULL,
        PasswordSalt VARBINARY(128) NOT NULL,
        Rol NVARCHAR(50) NOT NULL DEFAULT 'Empleado',
        IdEmpleado INT NULL,
        FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FechaUltimoAcceso DATETIME2 NULL,
        Activo BIT NOT NULL DEFAULT 1,
        CONSTRAINT UQ_tblUsuarios_NombreUsuario UNIQUE (NombreUsuario),
        CONSTRAINT UQ_tblUsuarios_Email UNIQUE (Email)
    );
END

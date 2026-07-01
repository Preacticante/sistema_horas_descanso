-- Crea la tabla de configuración global necesaria para guardar los valores del sistema.
-- Ejecuta este script en la base de datos oficial antes de poner el sistema en producción.

IF OBJECT_ID('dbo.tblConfiguracionSistema', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tblConfiguracionSistema (
        tClave VARCHAR(100) NOT NULL PRIMARY KEY,
        tValor NVARCHAR(MAX) NOT NULL,
        dtActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END

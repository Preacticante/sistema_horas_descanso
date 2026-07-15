-- Tabla para resolver autorización automática de solicitudes por empleado.
-- Mapea cada IdEmpNum (empleado) al IdUsuario de su jefe directo y jefe superior.

IF OBJECT_ID('dbo.tbl_jerarquia_autorizacion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tbl_jerarquia_autorizacion (
        id_jerarquia INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        id_empleado INT NOT NULL,
        id_jefe_directo INT NOT NULL,
        id_jefe_superior INT NOT NULL,
        activo BIT NOT NULL CONSTRAINT DF_tbl_jerarquia_autorizacion_activo DEFAULT 1,
        fecha_creacion DATETIME2 NOT NULL CONSTRAINT DF_tbl_jerarquia_autorizacion_creacion DEFAULT SYSUTCDATETIME(),
        fecha_actualizacion DATETIME2 NOT NULL CONSTRAINT DF_tbl_jerarquia_autorizacion_actualizacion DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_tbl_jerarquia_autorizacion_empleado UNIQUE (id_empleado),
        CONSTRAINT CK_tbl_jerarquia_autorizacion_jefes_distintos CHECK (id_jefe_directo <> id_jefe_superior)
    );

    CREATE INDEX IX_tbl_jerarquia_autorizacion_jefes
        ON dbo.tbl_jerarquia_autorizacion(id_jefe_directo, id_jefe_superior);
END
GO

/*
Carga inicial con base en tu organigrama.
IMPORTANTE:
- Se resuelven jefes por tblUsuarios.IdEmpleado.
- Antes de ejecutar, asegúrate de haber dado de alta usuarios en tblUsuarios con su IdEmpleado.
*/

DECLARE @Map TABLE (
    id_empleado INT NOT NULL,
    jefe_directo_empleado INT NOT NULL,
    jefe_superior_empleado INT NOT NULL
);

INSERT INTO @Map (id_empleado, jefe_directo_empleado, jefe_superior_empleado)
VALUES
    -- Nivel 1 (directores): jefe directo Presidenta (100), jefe superior Director TI (1) como escalamiento administrativo
    (102, 100, 1),
    (103, 100, 1),
    (104, 100, 1),
    (1,   100, 102),
    (105, 100, 1),
    (106, 100, 1),
    (107, 100, 1),
    (108, 100, 1),

    -- Mandos medios
    (109, 103, 100),
    (110, 103, 100),
    (111, 103, 100),
    (112, 103, 100),
    (113, 103, 100),
    (114, 103, 100),
    (115, 105, 100),

    -- Operativos
    (116, 102, 100),
    (117, 104, 100),
    (118, 104, 100),
    (119, 104, 100),
    (2,   1,   100),
    (120, 1,   100),
    (121, 105, 100),
    (122, 105, 100),
    (123, 112, 103),
    (124, 112, 103),
    (125, 112, 103),
    (126, 112, 103),
    (127, 113, 103),
    (128, 109, 103),
    (129, 109, 103),
    (130, 110, 103),
    (131, 111, 103),
    (55,  115, 105),
    (58,  115, 105),
    (57,  115, 105),
    (740, 115, 105),
    (72,  115, 105),
    (76,  115, 105);

;WITH Resolucion AS (
    SELECT
        m.id_empleado,
        jd.IdUsuario AS id_jefe_directo,
        js.IdUsuario AS id_jefe_superior
    FROM @Map m
    INNER JOIN dbo.tblUsuarios jd ON jd.IdEmpleado = m.jefe_directo_empleado AND jd.Activo = 1
    INNER JOIN dbo.tblUsuarios js ON js.IdEmpleado = m.jefe_superior_empleado AND js.Activo = 1
)
MERGE dbo.tbl_jerarquia_autorizacion AS tgt
USING Resolucion AS src
ON tgt.id_empleado = src.id_empleado
WHEN MATCHED THEN
    UPDATE SET
        tgt.id_jefe_directo = src.id_jefe_directo,
        tgt.id_jefe_superior = src.id_jefe_superior,
        tgt.activo = 1,
        tgt.fecha_actualizacion = SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id_empleado, id_jefe_directo, id_jefe_superior, activo, fecha_creacion, fecha_actualizacion)
    VALUES (src.id_empleado, src.id_jefe_directo, src.id_jefe_superior, 1, SYSUTCDATETIME(), SYSUTCDATETIME());
GO

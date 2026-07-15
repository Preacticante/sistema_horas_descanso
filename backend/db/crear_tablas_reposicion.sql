-- Crea las tablas para solicitudes de reposición con doble autorización.
-- Ejecuta este script en la base de datos oficial antes de habilitar el módulo de Registros.

IF OBJECT_ID('dbo.tbl_solicitudes_reposicion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tbl_solicitudes_reposicion (
        id_solicitud INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        id_empleado INT NOT NULL,
        fecha_solicitud DATE NOT NULL,
        horas_solicitadas DECIMAL(10,2) NOT NULL,
        motivo NVARCHAR(500) NOT NULL,

        id_jefe_directo INT NOT NULL,
        id_jefe_superior INT NOT NULL,

        estado_jefe_directo NVARCHAR(20) NOT NULL CONSTRAINT DF_tbl_solicitudes_reposicion_estado_jd DEFAULT 'pendiente',
        estado_jefe_superior NVARCHAR(20) NOT NULL CONSTRAINT DF_tbl_solicitudes_reposicion_estado_js DEFAULT 'pendiente',
        estado_final NVARCHAR(20) NOT NULL CONSTRAINT DF_tbl_solicitudes_reposicion_estado_final DEFAULT 'pendiente',

        comentario_jefe_directo NVARCHAR(500) NULL,
        comentario_jefe_superior NVARCHAR(500) NULL,
        fecha_autorizacion_jefe_directo DATETIME2 NULL,
        fecha_autorizacion_jefe_superior DATETIME2 NULL,

        fecha_creacion DATETIME2 NOT NULL CONSTRAINT DF_tbl_solicitudes_reposicion_fecha_creacion DEFAULT SYSUTCDATETIME(),
        fecha_actualizacion DATETIME2 NOT NULL CONSTRAINT DF_tbl_solicitudes_reposicion_fecha_actualizacion DEFAULT SYSUTCDATETIME(),
        activo BIT NOT NULL CONSTRAINT DF_tbl_solicitudes_reposicion_activo DEFAULT 1,

        CONSTRAINT CK_tbl_solicitudes_reposicion_horas_positivas CHECK (horas_solicitadas > 0),
        CONSTRAINT CK_tbl_solicitudes_reposicion_estados_jd CHECK (estado_jefe_directo IN ('pendiente', 'aprobada', 'rechazada')),
        CONSTRAINT CK_tbl_solicitudes_reposicion_estados_js CHECK (estado_jefe_superior IN ('pendiente', 'aprobada', 'rechazada')),
        CONSTRAINT CK_tbl_solicitudes_reposicion_estados_final CHECK (estado_final IN ('pendiente', 'aprobada', 'rechazada'))
    );

    CREATE INDEX IX_tbl_solicitudes_reposicion_emp_fecha
        ON dbo.tbl_solicitudes_reposicion(id_empleado, fecha_solicitud DESC);

    CREATE INDEX IX_tbl_solicitudes_reposicion_estados
        ON dbo.tbl_solicitudes_reposicion(estado_final, estado_jefe_directo, estado_jefe_superior);
END
GO

IF OBJECT_ID('dbo.tbl_historial_movimientos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tbl_historial_movimientos (
        id_movimiento INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        id_solicitud INT NULL,
        id_empleado INT NOT NULL,
        tipo_movimiento NVARCHAR(80) NOT NULL,
        horas DECIMAL(10,2) NOT NULL,
        referencia NVARCHAR(250) NULL,
        id_usuario_accion INT NULL,
        fecha_movimiento DATETIME2 NOT NULL CONSTRAINT DF_tbl_historial_movimientos_fecha DEFAULT SYSUTCDATETIME(),
        detalles NVARCHAR(500) NULL,

        CONSTRAINT FK_tbl_historial_movimientos_solicitud FOREIGN KEY (id_solicitud) REFERENCES dbo.tbl_solicitudes_reposicion(id_solicitud)
    );

    CREATE INDEX IX_tbl_historial_movimientos_emp_fecha
        ON dbo.tbl_historial_movimientos(id_empleado, fecha_movimiento DESC);
END
GO

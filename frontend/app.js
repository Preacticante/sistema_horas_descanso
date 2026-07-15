const API_URL = `http://172.16.6.86:8000`; // Cambia el puerto si tu backend está en otro puerto
let empleadosCache = [];
let ultimoReporteData = [];
let empleadosVisual = {
    deleted: new Set(),
    edited: {},
    added: [],
};
let empleadoModalMode = 'add';
let empleadoModalEditingId = null;
let tempEmpleadoId = -1;

const STORAGE_KEY_EMPLEADOS = 'empleados_visual_changes';

function cargarEmpleadosLocales() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_EMPLEADOS);
        if (raw) {
            const parsed = JSON.parse(raw);
            empleadosVisual.deleted = new Set(parsed.deleted || []);
            empleadosVisual.edited = parsed.edited || {};
            empleadosVisual.added = parsed.added || [];
        }
    } catch (error) {
        console.warn('No se pudieron cargar cambios visuales de empleados:', error);
    }
}

function guardarEmpleadosLocales() {
    const payload = {
        deleted: Array.from(empleadosVisual.deleted),
        edited: empleadosVisual.edited,
        added: empleadosVisual.added,
    };
    try {
        localStorage.setItem(STORAGE_KEY_EMPLEADOS, JSON.stringify(payload));
    } catch (error) {
        console.warn('No se pudieron guardar cambios visuales de empleados:', error);
    }
}

function aplicarCambiosVisuales(empleados) {
    return empleados
        .filter(emp => !empleadosVisual.deleted.has(String(emp.id)))
        .map(emp => {
            const edited = empleadosVisual.edited[String(emp.id)];
            return edited ? {...emp, ...edited} : emp;
        })
        .concat(empleadosVisual.added || []);
}

// Sistema de notificaciones
function mostrarNotificacion(tipo, titulo, mensaje, duracion = 4000) {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const iconos = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    const notif = document.createElement('div');
    notif.className = `notification ${tipo}`;
    notif.innerHTML = `
        <div class="notification-icon">${iconos[tipo] || '✓'}</div>
        <div class="notification-content">
            <div class="notification-title">${titulo}</div>
            <div class="notification-message">${mensaje}</div>
        </div>
        <div class="notification-close">✕</div>
    `;

    const closeBtn = notif.querySelector('.notification-close');
    const remover = () => {
        notif.classList.add('removing');
        setTimeout(() => notif.remove(), 300);
    };

    closeBtn.addEventListener('click', remover);
    container.appendChild(notif);

    if (duracion > 0) {
        setTimeout(remover, duracion);
    }

    return notif;
}

let notificacionesSalida = [];
let contadorNotificaciones = 0;

function generarIdNotificacionSalida() {
    return `salida-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function actualizarBadgeNotificaciones() {
    const badge = document.getElementById('sidebar-notificaciones-badge');
    if (!badge) return;
    if (contadorNotificaciones > 0) {
        badge.textContent = contadorNotificaciones;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

function incrementarBadgeNotificaciones() {
    contadorNotificaciones += 1;
    actualizarBadgeNotificaciones();
}

function decrementarBadgeNotificaciones() {
    contadorNotificaciones = Math.max(0, contadorNotificaciones - 1);
    actualizarBadgeNotificaciones();
}

function crearItemNotificacionSalida(notificacion) {
    const { id, empleadoId, empleadoNombre, cantidadHoras, dias, estado } = notificacion;
    const diasTexto = dias.length === 1 ? dias[0] : dias.join(', ');
    const item = document.createElement('div');
    item.className = 'salida-notificacion-item';
    item.dataset.id = id;
    item.style.border = '1px solid #c7d2fe';
    item.style.borderRadius = '14px';
    item.style.padding = '1rem';
    item.style.background = estado === 'pendiente' ? '#faf5ff' : estado === 'autorizada' ? '#eef6f1' : '#fff3f0';
    item.style.display = 'flex';
    item.style.flexDirection = 'column';
    item.style.gap = '0.75rem';
    const estadoColor = estado === 'autorizada' ? '#2f855a' : estado === 'rechazada' ? '#c53030' : '#340C51';
    const borderColor = estado === 'autorizada' ? '#2f855a' : estado === 'rechazada' ? '#c53030' : '#c7d2fe';
    item.style.border = `1px solid ${borderColor}`;
    item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
            <div>
                <div style="font-weight:700; color:#340C51;">Solicitud de salida ${estado === 'pendiente' ? 'pendiente' : estado}</div>
                <div style="margin-top:0.35rem; color:#475569; font-size:0.95rem;">Empleado: <strong>${empleadoNombre}</strong></div>
                <div style="margin-top:0.35rem; color:#475569; font-size:0.95rem;">Horas solicitadas: <strong>${cantidadHoras.toFixed(2)} hrs</strong></div>
                <div style="margin-top:0.35rem; color:#475569; font-size:0.95rem;">Fechas: <strong>${diasTexto}</strong></div>
            </div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:4px;">
                <button type="button" class="btn-autorizar" style="background:#340C51; color:#ffffff; border:none; border-radius:10px; padding:10px 16px; cursor:pointer; font-weight:700; ${estado !== 'pendiente' ? 'opacity:0.65; cursor:not-allowed;' : ''}">Autorizar</button>
                <button type="button" class="btn-rechazar" style="background:#ffffff; color:#340C51; border:2px solid #340C51; border-radius:10px; padding:10px 16px; cursor:pointer; font-weight:700; ${estado !== 'pendiente' ? 'opacity:0.65; cursor:not-allowed;' : ''}">Rechazar</button>
            </div>
        </div>
        <div class="salida-estado-texto" style="color:${estadoColor}; font-size:0.95rem; font-weight:700;">Solicitud ${estado === 'pendiente' ? 'pendiente' : estado}.</div>
        <div style="color:#6b7280; font-size:0.85rem;">Puedes autorizar o rechazar esta solicitud cuando esté lista.</div>
    `;
    const btnAutorizar = item.querySelector('.btn-autorizar');
    const btnRechazar = item.querySelector('.btn-rechazar');
    if (estado === 'pendiente') {
        btnAutorizar.addEventListener('click', () => manejarDecisionSalida(id, true));
        btnRechazar.addEventListener('click', () => manejarDecisionSalida(id, false));
    } else {
        btnAutorizar.disabled = true;
        btnRechazar.disabled = true;
    }
    return item;
}

function renderNotificacionesSalida() {
    const panel = document.getElementById('salida-notifications-panel');
    if (!panel) return;
    panel.innerHTML = '';
    if (!notificacionesSalida.length) {
        panel.innerHTML = '<div data-empty-notifications style="color:#475569; font-size:0.95rem; padding:1rem; border:1px dashed #c7d2fe; border-radius:12px; background:#f8f5ff;">No hay notificaciones activas.</div>';
        return;
    }
    notificacionesSalida.forEach(notificacion => panel.appendChild(crearItemNotificacionSalida(notificacion)));
}

function agregarNotificacionSalida(empleadoId, empleadoNombre, cantidadHoras, dias) {
    const id = generarIdNotificacionSalida();
    notificacionesSalida.unshift({ id, empleadoId, empleadoNombre, cantidadHoras, dias, estado: 'pendiente' });
    incrementarBadgeNotificaciones();
    renderNotificacionesSalida();
}

function manejarDecisionSalida(id, autorizado) {
    const registro = notificacionesSalida.find(n => n.id === id);
    if (!registro || registro.estado !== 'pendiente') return;
    registro.estado = autorizado ? 'autorizada' : 'rechazada';
    decrementarBadgeNotificaciones();
    renderNotificacionesSalida();
    if (autorizado) {
        mostrarNotificacion('success', 'Salida autorizada', 'La solicitud de salida fue autorizada.');
    } else {
        // Devolver las horas registradas al empleado en el cache local
        try {
            const diasCount = Array.isArray(registro.dias) ? registro.dias.length : 0;
            const refund = (Number(registro.cantidadHoras) || 0) * diasCount;
            if (registro.empleadoId != null && refund > 0) {
                const emp = empleadosCache.find(e => String(e.id) === String(registro.empleadoId));
                if (emp) {
                    emp.total_horas = (Number(emp.total_horas) || 0) + refund;
                    mostrarHorasActuales();
                    mostrarNotificacion('success', 'Horas devueltas', `Se devolvieron ${refund.toFixed(2)} hrs a ${emp.nombre || 'el empleado'}.`);
                } else {
                    mostrarNotificacion('info', 'Empleado no encontrado', 'No se encontró el empleado para devolver las horas en la cache local.');
                }
            } else {
                mostrarNotificacion('warning', 'Sin horas a devolver', 'No hay horas válidas para devolver.' );
            }
        } catch (e) {
            console.error('Error al devolver horas:', e);
            mostrarNotificacion('error', 'Error', 'No se pudieron devolver las horas al empleado.');
        }
        mostrarNotificacion('warning', 'Salida rechazada', 'La solicitud de salida fue rechazada.');
    }
}

function limpiarPanelNotificacionesSalida() {
    notificacionesSalida = [];
    contadorNotificaciones = 0;
    actualizarBadgeNotificaciones();
    renderNotificacionesSalida();
}

function inicializarNotificaciones() {
    renderNotificacionesSalida();
}

async function cargarEmpleados(ids = null) {
    const tabla = document.getElementById("tabla-empleados");
    if (!tabla) {
        console.error("tabla-empleados no encontrada");
        return;
    }

    // Si no hay IDs específicos, cargamos TODOS los empleados con all=true
    const query = ids ? `?ids=${encodeURIComponent(ids)}` : "?all=true";
    tabla.innerHTML = `
        <tr>
            <td colspan="5" style="padding:15px; text-align:center;">Cargando empleados...</td>
        </tr>
    `;
    console.log("cargarEmpleados: fetch", `${API_URL}/api/empleados${query}`);

    try {
        const respuesta = await fetch(`${API_URL}/api/empleados${query}`);
        if (!respuesta.ok) {
            let mensajeError = `Error al obtener la lista de empleados (${respuesta.status})`;
            try {
                const errorJson = await respuesta.json();
                if (errorJson?.detail) {
                    mensajeError += `: ${errorJson.detail}`;
                }
            } catch (_e) {
                // Ignore JSON parse errors for non-JSON responses
            }
            throw new Error(mensajeError);
        }

        const empleados = await respuesta.json();
        cargarEmpleadosLocales();
        empleadosCache = aplicarCambiosVisuales(Array.isArray(empleados) ? empleados : []);
        tabla.innerHTML = "";

        if (!empleadosCache.length) {
            tabla.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center;">No se encontraron empleados.</td>
                </tr>
            `;
            return;
        }

        renderEmpleadosTabla(tabla, empleadosCache);

    } catch (error) {
        console.error("Error al conectar con la API:", error);
        tabla.innerHTML = `
            <tr>
                <td colspan="5" style="color: red; text-align: center; font-weight: bold;">Error de conexión: Asegúrate de que el backend esté encendido.</td>
            </tr>
        `;
    }
}

function renderEmpleadosTabla(tabla, empleados) {
    tabla.innerHTML = '';
    if (!empleados.length) {
        tabla.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center;">No se encontraron empleados.</td>
            </tr>
        `;
        return;
    }

    empleados.forEach(emp => {
        const colorHoras = emp.total_horas >= 0 ? "#124416" : "#c0392b";
        tabla.innerHTML += `
            <tr>
                <td>${emp.id}</td>
                <td>${emp.nombre}</td>
                <td style="color: ${colorHoras}; font-weight: bold;">${emp.total_horas.toFixed(2)} hrs</td>
                <td>${emp.salidas_temprano || 0}</td>
                <td>
                    <button class="empleados-btn empleados-btn-secondary ver-horario-btn" data-emp-id="${emp.id}">Horario</button>
                    <button class="empleados-btn empleados-btn-secondary editar-empleado-btn" data-emp-id="${emp.id}">Editar</button>
                    <button class="empleados-btn empleados-btn-secondary eliminar-empleado-btn" data-emp-id="${emp.id}">Eliminar</button>
                </td>
            </tr>
        `;
    });
}

function abrirModalEmpleado(mode, empleado = null) {
    empleadoModalMode = mode;
    empleadoModalEditingId = empleado ? empleado.id : null;
    const titulo = document.getElementById('modal-empleado-titulo');
    const idInput = document.getElementById('empleado-id');
    const nombreInput = document.getElementById('empleado-nombre');
    const horasInput = document.getElementById('empleado-horas');
    const salidasInput = document.getElementById('empleado-salidas');

    if (titulo) {
        titulo.textContent = mode === 'edit' ? 'Editar empleado' : 'Agregar empleado';
    }

    const nota = document.getElementById('modal-empleado-nota');
    if (mode === 'edit' && empleado) {
        if (idInput) idInput.value = empleado.id;
        if (nombreInput) nombreInput.value = empleado.nombre || '';
        if (horasInput) horasInput.value = empleado.total_horas ?? 0;
        if (salidasInput) salidasInput.value = empleado.salidas_temprano ?? 0;
        if (nota) nota.textContent = 'Al guardar, los cambios se aplicarán en la base de datos.';
    } else {
        if (idInput) idInput.value = tempEmpleadoId;
        if (nombreInput) nombreInput.value = '';
        if (horasInput) horasInput.value = 0;
        if (salidasInput) salidasInput.value = 0;
        if (nota) nota.textContent = 'Nota: esta edición es visual, no modifica la base de datos.';
    }

    const modal = document.getElementById('modal-empleado');
    if (modal) modal.style.display = 'flex';
}

function cerrarModalEmpleado() {
    const modal = document.getElementById('modal-empleado');
    if (modal) modal.style.display = 'none';
}

function obtenerSiguienteIdTemporal() {
    return tempEmpleadoId--;
}

async function actualizarEmpleadoEnBD(empleado) {
    try {
        const response = await fetch(`${API_URL}/api/empleados/${empleado.id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                nombre: empleado.nombre,
                total_horas: empleado.total_horas,
                salidas_temprano: empleado.salidas_temprano,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => null);
            const mensaje = error?.detail || 'No se pudo actualizar el empleado en la base de datos.';
            mostrarNotificacion('error', 'Error de servidor', mensaje);
            return false;
        }

        const data = await response.json();
        mostrarNotificacion('success', 'Empleado actualizado', data.mensaje || 'Empleado actualizado en la base de datos.');
        return true;
    } catch (error) {
        console.error('Error actualizando empleado:', error);
        mostrarNotificacion('error', 'Error de red', 'No se pudo conectar con el servidor para actualizar el empleado.');
        return false;
    }
}

function guardarEmpleadoVisual(empleado) {
    if (empleadoModalMode === 'edit' && empleadoModalEditingId !== null) {
        empleadosVisual.edited[String(empleadoModalEditingId)] = {
            nombre: empleado.nombre,
            total_horas: empleado.total_horas,
            salidas_temprano: empleado.salidas_temprano,
        };
        empleadosCache = empleadosCache.map(emp => emp.id === empleadoModalEditingId ? {...emp, ...empleado} : emp);
    } else {
        const nuevoEmpleado = {
            id: empleado.id,
            nombre: empleado.nombre,
            total_horas: empleado.total_horas,
            salidas_temprano: empleado.salidas_temprano,
        };
        empleadosVisual.added.push(nuevoEmpleado);
        empleadosCache.push(nuevoEmpleado);
        mostrarNotificacion('success', 'Empleado agregado', 'El empleado se agregó visualmente.');
    }
    guardarEmpleadosLocales();
    const tabla = document.getElementById('tabla-empleados');
    if (tabla) renderEmpleadosTabla(tabla, empleadosCache);
}

let empleadoAEliminar = null;

function abrirModalConfirmacion(empleadoId, nombreEmpleado) {
    empleadoAEliminar = empleadoId;
    const modal = document.getElementById('modal-confirmacion');
    const titulo = document.getElementById('confirmacion-titulo');
    const mensaje = document.getElementById('confirmacion-mensaje');
    
    if (titulo) titulo.textContent = `Eliminar a ${nombreEmpleado}`;
    if (mensaje) mensaje.textContent = `¿Estás seguro de que deseas eliminar a ${nombreEmpleado}? Esta acción es solo visual y no modifica la base de datos.`;
    
    if (modal) modal.style.display = 'flex';
}

function cerrarModalConfirmacion() {
    const modal = document.getElementById('modal-confirmacion');
    if (modal) modal.style.display = 'none';
    empleadoAEliminar = null;
}

function confirmarEliminacion() {
    if (empleadoAEliminar === null) return;
    
    const empleado = empleadosCache.find(emp => String(emp.id) === String(empleadoAEliminar));
    if (!empleado) {
        cerrarModalConfirmacion();
        return;
    }

    empleadosVisual.deleted.add(String(empleadoAEliminar));
    guardarEmpleadosLocales();
    empleadosCache = empleadosCache.filter(emp => String(emp.id) !== String(empleadoAEliminar));
    const tabla = document.getElementById('tabla-empleados');
    if (tabla) renderEmpleadosTabla(tabla, empleadosCache);
    mostrarNotificacion('success', 'Empleado eliminado', `${empleado.nombre} ha sido ocultado. Esta eliminación es solo visual.`);
    cerrarModalConfirmacion();
}

function eliminarEmpleadoVisual(empleadoId) {
    const empleado = empleadosCache.find(emp => String(emp.id) === String(empleadoId));
    if (!empleado) return;
    
    abrirModalConfirmacion(empleadoId, empleado.nombre);
}

function recuperarEmpleadoVisual(empleadoId) {
    empleadosVisual.deleted.delete(String(empleadoId));
    guardarEmpleadosLocales();
    cargarEmpleados(); // Recargar para mostrar el empleado recuperado
    mostrarNotificacion('success', 'Empleado recuperado', 'El empleado ha sido restaurado en la tabla.');
}

function limpiarCambiosVisualesEmpleados() {
    abrirModalConfirmacionLimpiar();
}

function abrirModalConfirmacionLimpiar() {
    const modal = document.getElementById('modal-confirmacion');
    const titulo = document.getElementById('confirmacion-titulo');
    const mensaje = document.getElementById('confirmacion-mensaje');
    const btnConfirmar = document.getElementById('btn-confirmacion-confirmar');
    
    if (titulo) titulo.textContent = 'Restaurar todos los cambios';
    if (mensaje) mensaje.textContent = '¿Deseas limpiar todos los cambios visuales (adiciones, ediciones y eliminaciones)? Esta acción no modifica la base de datos.';
    
    empleadoAEliminar = 'restore_all';
    
    if (btnConfirmar) {
        btnConfirmar.textContent = 'Restaurar';
        btnConfirmar.className = 'btn-confirm-danger';
    }
    
    if (modal) modal.style.display = 'flex';
}

function confirmarLimpiar() {
    empleadosVisual = {
        deleted: new Set(),
        edited: {},
        added: [],
    };
    guardarEmpleadosLocales();
    cargarEmpleados();
    mostrarNotificacion('success', 'Cambios restaurados', 'Todos los cambios visuales han sido eliminados. Se muestran los datos de la base de datos.');
    cerrarModalConfirmacion();
}

async function obtenerHorarioEmpleado(empleadoId) {
    const modalContent = document.getElementById('modal-horario-content');
    if (!modalContent) return;

    modalContent.innerHTML = `<p style="color:#4b5563;">Cargando horario...</p>`;
    abrirModalHorario();

    try {
        const response = await fetch(`${API_URL}/api/empleados/${empleadoId}/horario`);
        if (!response.ok) {
            throw new Error(`No se pudo cargar el horario (${response.status})`);
        }

        const horario = await response.json();
        if (!Array.isArray(horario) || horario.length === 0) {
            modalContent.innerHTML = `<p style="color:#475569;">No se encontró horario configurado para este empleado.</p>`;
            return;
        }

        modalContent.innerHTML = `
            <table class="horario-table">
                <thead>
                    <tr>
                        <th>Día</th>
                        <th>Horario</th>
                        <th>Horas extra (últimos 30 días)</th>
                    </tr>
                </thead>
                <tbody>
                    ${horario.map(item => `
                        <tr>
                            <td>${item.dia}</td>
                            <td>${item.horario || 'No configurado'}</td>
                            <td>${item.horas_extra.toFixed(2)} hrs</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error('Error al cargar el horario del empleado:', error);
        modalContent.innerHTML = `<p style="color:#b91c1c;">No se pudo cargar el horario. Intenta de nuevo.</p>`;
    }
}

function abrirModalHorario() {
    const modal = document.getElementById('modal-horario');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function cerrarModalHorario() {
    const modal = document.getElementById('modal-horario');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function cargarDashboard() {
    try {
        const response = await fetch(`${API_URL}/api/dashboard-resumen`);
        if (!response.ok) {
            throw new Error(`Error al cargar resumen (${response.status})`);
        }

        const data = await response.json();
        document.getElementById('kpi-total').textContent = `${data.total_horas.toFixed(2)} hrs`;
        document.getElementById('kpi-pendientes').textContent = `${data.empleados_pendientes}`;
        document.getElementById('kpi-aprobadas').textContent = `${data.empleados_aprobadas}`;
        document.getElementById('kpi-eficiencia').textContent = `${data.eficiencia.toFixed(2)}%`;
    } catch (err) {
        console.error('No se pudieron cargar los datos del servidor:', err);
        document.getElementById('kpi-total').textContent = 'Error';
        document.getElementById('kpi-pendientes').textContent = 'Error';
        document.getElementById('kpi-aprobadas').textContent = 'Error';
        document.getElementById('kpi-eficiencia').textContent = 'Error';
    }

    cargarDashboardEmpleados();
}

async function cargarDashboardEmpleados() {
    const tabla = document.getElementById('dashboard-empleados-table');
    if (!tabla) return;

    const tbody = tabla.querySelector('tbody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="5" style="text-align:center; padding:16px;">Cargando resultados de empleados...</td>
        </tr>
    `;

    try {
        const response = await fetch(`${API_URL}/api/empleados?all=true`);
        if (!response.ok) {
            throw new Error(`Error al cargar empleados (${response.status})`);
        }

        const empleados = await response.json();
        if (!Array.isArray(empleados) || empleados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding:16px;">No se encontraron empleados.</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = '';
        empleados.slice(0, 8).forEach(emp => {
            const colorHoras = emp.total_horas >= 0 ? '#124416' : '#c0392b';
            tbody.innerHTML += `
                <tr>
                    <td>${emp.id}</td>
                    <td>${emp.nombre}</td>
                    <td style="color: ${colorHoras}; font-weight: bold;">${emp.total_horas.toFixed(2)} hrs</td>
                    <td>${emp.salidas_temprano || 0}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Error al cargar empleados en el dashboard:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="color: red; text-align: center; font-weight: bold;">No se pudieron cargar los resultados de empleados.</td>
            </tr>
        `;
    }
}

// Ejecutar al cargar la vista
// La función se llamará desde loadPage() cuando la vista dashboard se cargue.

async function cargarEmpleadosParaRegistro() {
    try {
        const respuesta = await fetch(`${API_URL}/api/empleados?all=true`);
        if (!respuesta.ok) {
            let mensajeError = `No se pudo cargar la lista de empleados para registrar horas (${respuesta.status})`;
            try {
                const errorJson = await respuesta.json();
                if (errorJson?.detail) {
                    mensajeError += `: ${errorJson.detail}`;
                }
            } catch (_e) {
                // Ignore JSON parse errors for non-JSON responses
            }
            throw new Error(mensajeError);
        }

        const empleados = await respuesta.json();
        // Aplicar cambios visuales locales igual que en la vista de empleados
        cargarEmpleadosLocales();
        empleadosCache = aplicarCambiosVisuales(Array.isArray(empleados) ? empleados : []);
        actualizarSelectEmpleados();
        configurarDropdownEmpleados();
    } catch (error) {
        console.error("Error al cargar empleados para registro:", error);
        const menuEmpleado = document.getElementById("reg-empleado-menu");
        if (menuEmpleado) {
            menuEmpleado.innerHTML = `<div style="padding: 12px; text-align: center; color: #999;">No se pudo cargar la lista de empleados</div>`;
        }
    }
}

function validarEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

function validarTelefono(telefono) {
    const regex = /^[\d\s\-\+\(\)]+$/;
    return regex.test(telefono) && telefono.length >= 10;
}

function evaluarFuerzaContraseña(password) {
    let fuerza = 0;
    if (password.length >= 8) fuerza++;
    if (/[A-Z]/.test(password)) fuerza++;
    if (/[0-9]/.test(password)) fuerza++;
    if (/[!@#$%^&*]/.test(password)) fuerza++;
    return fuerza;
}

function mostrarFuerzaContraseña(password) {
    const strengthDiv = document.getElementById('password-strength');
    if (!strengthDiv) return;
    
    if (!password) {
        strengthDiv.style.display = 'none';
        return;
    }
    
    const fuerza = evaluarFuerzaContraseña(password);
    const textos = ['Muy débil', 'Débil', 'Normal', 'Fuerte', 'Muy fuerte'];
    const colores = ['#e74c3c', '#e67e22', '#f39c12', '#27ae60', '#16a085'];
    
    strengthDiv.style.display = 'block';
    strengthDiv.textContent = textos[fuerza];
    strengthDiv.style.backgroundColor = colores[fuerza];
    strengthDiv.style.color = 'white';
}

async function cargarPerfil() {
    try {
        const response = await fetch(`${API_URL}/api/perfil`);
        if (!response.ok) {
            throw new Error(`No se pudo cargar el perfil (${response.status})`);
        }
        const perfil = await response.json();
        document.getElementById('nombre').value = perfil.nombre || '';
        document.getElementById('rol').value = perfil.rol || 'Empleado';
        document.getElementById('email').value = perfil.email || '';
        document.getElementById('telefono').value = perfil.telefono || '';
        document.getElementById('departamento').value = perfil.departamento || '';
        document.getElementById('sucursal').value = perfil.sucursal || '';
        document.getElementById('direccion').value = perfil.direccion || '';
        document.getElementById('perfil-nombre').textContent = perfil.nombre || 'Usuario';
        document.getElementById('perfil-rol').textContent = perfil.rol || 'Empleado';
    } catch (error) {
        console.warn('Perfil no disponible:', error);
    }
}

function inicializarPerfil() {
    const btnCambiarFoto = document.getElementById('btn-cambiar-foto');
    const inputFoto = document.getElementById('input-foto');
    const avatar = document.getElementById('perfil-avatar');
    const formPerfil = document.getElementById('form-perfil');
    const notice = document.getElementById('perfil-notice');

    const modalPassword = document.getElementById('modal-password');
    const btnEditarPassword = document.getElementById('btn-editar-password');
    const closeModalPassword = document.getElementById('close-modal-password');
    const cancelarModalPassword = document.getElementById('cancelar-modal-password');
    const formPassword = document.getElementById('form-password');
    const errorPassword = document.getElementById('error-password');
    const perfilNombreTitle = document.getElementById('perfil-nombre');
    const actualPassword = document.getElementById('actual-password');
    const nuevaPassword = document.getElementById('nueva-password');
    const confirmPassword = document.getElementById('confirm-password');

    const showModal = (modal) => modal?.classList.add('show');
    const hideModal = (modal) => modal?.classList.remove('show');
    const showNotice = (message) => {
        if (!notice) return;
        notice.textContent = message;
        notice.classList.add('show');
        setTimeout(() => notice.classList.remove('show'), 3200);
    };

    if (btnCambiarFoto && inputFoto) {
        btnCambiarFoto.addEventListener('click', () => inputFoto.click());
    }

    if (inputFoto && avatar) {
        inputFoto.addEventListener('change', () => {
            if (!inputFoto.files || !inputFoto.files[0]) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                avatar.style.backgroundImage = `url('${event.target.result}')`;
                avatar.textContent = '';
                avatar.style.backgroundSize = 'cover';
                avatar.style.backgroundPosition = 'center';
            };
            reader.readAsDataURL(inputFoto.files[0]);
        });
    }

    if (btnEditarPassword) {
        btnEditarPassword.addEventListener('click', () => {
            showModal(modalPassword);
            if (errorPassword) errorPassword.textContent = '';
            if (actualPassword) {
                actualPassword.value = '';
                actualPassword.focus();
            }
            if (nuevaPassword) {
                nuevaPassword.value = '';
                mostrarFuerzaContraseña('');
            }
            if (confirmPassword) confirmPassword.value = '';
        });
    }

    if (nuevaPassword) {
        nuevaPassword.addEventListener('input', () => mostrarFuerzaContraseña(nuevaPassword.value));
    }

    [closeModalPassword, cancelarModalPassword].forEach((button) => {
        if (button) button.addEventListener('click', () => hideModal(modalPassword));
    });

    if (formPassword) {
        formPassword.addEventListener('submit', async (event) => {
            event.preventDefault();
            const actual = actualPassword?.value.trim() || '';
            const nueva = nuevaPassword?.value.trim() || '';
            const confirmar = confirmPassword?.value.trim() || '';

            if (!actual || !nueva || !confirmar) {
                if (errorPassword) errorPassword.textContent = 'Completa todos los campos.';
                return;
            }
            if (nueva.length < 8) {
                if (errorPassword) errorPassword.textContent = 'La contraseña debe tener mínimo 8 caracteres.';
                return;
            }
            const fuerza = evaluarFuerzaContraseña(nueva);
            if (fuerza < 2) {
                if (errorPassword) errorPassword.textContent = 'La contraseña es muy débil. Incluye mayúsculas, números y símbolos.';
                return;
            }
            if (nueva !== confirmar) {
                if (errorPassword) errorPassword.textContent = 'Las contraseñas no coinciden.';
                return;
            }
            
            try {
                const response = await fetch(`${API_URL}/api/perfil-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        actual_password: actual,
                        new_password: nueva,
                    }),
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    if (errorPassword) errorPassword.textContent = error.detail || 'Error al cambiar contraseña.';
                    return;
                }
                
                hideModal(modalPassword);
                showNotice('Contraseña actualizada correctamente');
                formPassword.reset();
                mostrarFuerzaContraseña('');
            } catch (error) {
                console.error('Error al cambiar contraseña:', error);
                if (errorPassword) errorPassword.textContent = 'Error en la conexión. Intenta de nuevo.';
            }
        });
    }

    if (formPerfil) {
        formPerfil.addEventListener('submit', async (event) => {
            event.preventDefault();
            const nombre = document.getElementById('nombre')?.value.trim() || '';
            const rol = document.getElementById('rol')?.value.trim() || '';
            const email = document.getElementById('email')?.value.trim() || '';
            const telefono = document.getElementById('telefono')?.value.trim() || '';
            const departamento = document.getElementById('departamento')?.value.trim() || '';
            const sucursal = document.getElementById('sucursal')?.value.trim() || '';
            const direccion = document.getElementById('direccion')?.value.trim() || '';

            const emailError = document.getElementById('email-error');
            const telefonoError = document.getElementById('telefono-error');
            if (emailError) emailError.style.display = 'none';
            if (telefonoError) telefonoError.style.display = 'none';

            let tieneError = false;
            if (!nombre) {
                showNotice('Ingresa tu nombre completo.');
                return;
            }
            if (!validarEmail(email)) {
                if (emailError) emailError.style.display = 'block';
                tieneError = true;
            }
            if (!validarTelefono(telefono)) {
                if (telefonoError) telefonoError.style.display = 'block';
                tieneError = true;
            }

            if (tieneError) return;

            try {
                const response = await fetch(`${API_URL}/api/perfil`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nombre,
                        rol,
                        email,
                        telefono,
                        departamento,
                        sucursal,
                        direccion,
                    }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'No se pudo guardar el perfil.');
                }

                const perfil = await response.json();
                if (perfilNombreTitle) perfilNombreTitle.textContent = perfil.nombre || 'Usuario';
                showNotice('Perfil actualizado correctamente');
            } catch (error) {
                console.error('Error al guardar perfil:', error);
                showNotice(error.message);
            }
        });
    }

    cargarPerfil();
}

function actualizarSelectEmpleados() {
    const selectEmpleado = document.getElementById("reg-empleado");
    const menuEmpleado = document.getElementById("reg-empleado-menu");
    const btnEmpleado = document.getElementById("reg-empleado-btn");
    
    if (!selectEmpleado || !menuEmpleado || !btnEmpleado) return;

    if (!empleadosCache.length) {
        menuEmpleado.innerHTML = `<div style="padding: 12px; text-align: center; color: #999;">No hay empleados disponibles</div>`;
        return;
    }

    menuEmpleado.innerHTML = '';
    empleadosCache.forEach((emp, index) => {
        const totalHoras = Number(emp.total_horas || 0).toFixed(2);
        const label = `${emp.id} - ${emp.nombre}`;
        const item = document.createElement('div');
        item.style.cssText = `
            padding: 14px;
            cursor: pointer;
            border-bottom: 1px solid #f0f0f0;
            transition: all 0.2s ease;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        item.innerHTML = `
            <span style="color: #1f2d19; font-weight: 500;">${label}</span>
            <span style="color: #AA7F31; font-weight: 600; font-size: 0.9rem;">${totalHoras} hrs</span>
        `;
        item.addEventListener('mouseover', () => {
            item.style.background = '#f8faf8';
        });
        item.addEventListener('mouseout', () => {
            item.style.background = 'white';
        });
        item.addEventListener('click', () => {
            selectEmpleado.value = emp.id;
            document.getElementById("reg-empleado-label").textContent = label;
            menuEmpleado.style.display = 'none';
            btnEmpleado.style.borderColor = '#e0e0e0';
            mostrarHorasActuales();
        });
        menuEmpleado.appendChild(item);
    });
}

function configurarDropdownEmpleados() {
    const btnEmpleado = document.getElementById("reg-empleado-btn");
    const menuEmpleado = document.getElementById("reg-empleado-menu");
    
    if (!btnEmpleado || !menuEmpleado) return;
    
    btnEmpleado.addEventListener('click', (e) => {
        e.preventDefault();
        const isOpen = menuEmpleado.style.display === 'block';
        menuEmpleado.style.display = isOpen ? 'none' : 'block';
        btnEmpleado.style.borderColor = isOpen ? '#e0e0e0' : '#AA7F31';
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#reg-empleado-dropdown')) {
            menuEmpleado.style.display = 'none';
            btnEmpleado.style.borderColor = '#e0e0e0';
        }
    });
}

function mostrarHorasActuales() {
    const selectEmpleado = document.getElementById("reg-empleado");
    const horasActuales = document.getElementById("horas-actuales");
    if (!horasActuales) return;

    if (!selectEmpleado || !selectEmpleado.value) {
        horasActuales.textContent = 'Horas extra disponibles: 0.00 hrs';
        return;
    }

    const seleccionado = parseInt(selectEmpleado.value, 10);
    if (Number.isNaN(seleccionado)) {
        horasActuales.textContent = 'Horas extra disponibles: 0.00 hrs';
        return;
    }

    const empleado = Array.isArray(empleadosCache)
        ? empleadosCache.find(function(item) { return Number(item?.id) === seleccionado; })
        : null;
    const totalHoras = empleado ? Number(empleado.total_horas || 0).toFixed(2) : '0.00';
    horasActuales.textContent = `Horas extra disponibles: ${totalHoras} hrs`;
}

let registroFechasSeleccionadas = new Set();
let registroCalendarioMes = { year: new Date().getFullYear(), month: new Date().getMonth() };

function formatearFecha(date) {
    return date.toISOString().split('T')[0];
}

function actualizarResumenFechasRegistro() {
    const resumen = document.getElementById('reg-fechas-seleccionadas');
    if (!resumen) return;

    if (!registroFechasSeleccionadas.size) {
        resumen.textContent = 'No hay fechas seleccionadas.';
        return;
    }

    const fechas = Array.from(registroFechasSeleccionadas).sort();
    resumen.textContent = `Fechas seleccionadas: ${fechas.join(', ')}`;
}

function construirCalendarioRegistro(year, month) {
    const container = document.getElementById('reg-calendar-container');
    if (!container) return;

    const mesNombre = new Date(year, month).toLocaleString('es-ES', { month: 'long' });
    const primerDia = new Date(year, month, 1);
    const diasMes = new Date(year, month + 1, 0).getDate();
    const primerDiaSemana = (primerDia.getDay() + 6) % 7;

    container.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
            <button type="button" id="reg-calendar-prev" style="padding:8px 12px; border-radius:10px; border:1px solid #cbd5e1; background:#f8fafc; cursor:pointer;">Anterior</button>
            <div style="font-weight:700; color:#1f2937;">${mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)} ${year}</div>
            <button type="button" id="reg-calendar-next" style="padding:8px 12px; border-radius:10px; border:1px solid #cbd5e1; background:#f8fafc; cursor:pointer;">Siguiente</button>
        </div>
        <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap:6px; text-align:center; font-size:0.85rem; color:#475569; margin-bottom:8px;">
            <div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div><div>Dom</div>
        </div>
        <div id="reg-calendar-grid" style="display:grid; grid-template-columns: repeat(7, 1fr); gap:6px;"></div>
    `;

    const grid = document.getElementById('reg-calendar-grid');
    if (!grid) return;

    for (let i = 0; i < primerDiaSemana; i += 1) {
        const empty = document.createElement('div');
        empty.style.minHeight = '42px';
        grid.appendChild(empty);
    }

    for (let dia = 1; dia <= diasMes; dia += 1) {
        const fecha = new Date(year, month, dia);
        const fechaStr = formatearFecha(fecha);
        const celda = document.createElement('button');
        celda.type = 'button';
        celda.textContent = dia;
        celda.dataset.fecha = fechaStr;
        celda.style.border = '1px solid #cbd5e1';
        celda.style.borderRadius = '12px';
        celda.style.padding = '10px 0';
        celda.style.background = registroFechasSeleccionadas.has(fechaStr) ? '#ede9fe' : '#ffffff';
        celda.style.color = registroFechasSeleccionadas.has(fechaStr) ? '#340C51' : '#111827';
        celda.style.cursor = 'pointer';
        celda.style.minHeight = '42px';
        celda.style.fontWeight = registroFechasSeleccionadas.has(fechaStr) ? '700' : '400';

        if (registroFechasSeleccionadas.has(fechaStr)) {
            celda.style.borderColor = '#340C51';
        }

        celda.addEventListener('click', () => {
            if (registroFechasSeleccionadas.has(fechaStr)) {
                registroFechasSeleccionadas.delete(fechaStr);
            } else {
                registroFechasSeleccionadas.add(fechaStr);
            }
            construirCalendarioRegistro(year, month);
            actualizarResumenFechasRegistro();
        });

        grid.appendChild(celda);
    }

    const prev = document.getElementById('reg-calendar-prev');
    const next = document.getElementById('reg-calendar-next');

    if (prev) {
        prev.addEventListener('click', () => {
            const fechaNueva = new Date(year, month - 1, 1);
            registroCalendarioMes = { year: fechaNueva.getFullYear(), month: fechaNueva.getMonth() };
            construirCalendarioRegistro(registroCalendarioMes.year, registroCalendarioMes.month);
        });
    }

    if (next) {
        next.addEventListener('click', () => {
            const fechaNueva = new Date(year, month + 1, 1);
            registroCalendarioMes = { year: fechaNueva.getFullYear(), month: fechaNueva.getMonth() };
            construirCalendarioRegistro(registroCalendarioMes.year, registroCalendarioMes.month);
        });
    }
}

function inicializarCalendarioRegistro() {
    registroFechasSeleccionadas = new Set();
    registroCalendarioMes = { year: new Date().getFullYear(), month: new Date().getMonth() };
    construirCalendarioRegistro(registroCalendarioMes.year, registroCalendarioMes.month);
    actualizarResumenFechasRegistro();
}

function abrirModalRegistro() {
    const modal = document.getElementById("modal-registro");
    if (!modal) return;
    modal.style.display = "flex";
    cargarEmpleadosParaRegistro();
}

function cerrarModalRegistro() {
    const modal = document.getElementById("modal-registro");
    if (!modal) return;
    modal.style.display = "none";
}

async function enviarRegistroHoras(event) {
    event.preventDefault();

    const selectEmpleado = document.getElementById("reg-empleado");
    const inputHoras = document.getElementById("reg-horas");
    if (!selectEmpleado || !inputHoras) return;

    const numeroEmpleado = parseInt(selectEmpleado.value, 10);
    const cantidadHoras = parseFloat(inputHoras.value);
    const diasSeleccionados = Array.from(registroFechasSeleccionadas);

    if (Number.isNaN(numeroEmpleado) || Number.isNaN(cantidadHoras) || cantidadHoras <= 0) {
        mostrarNotificacion('warning', 'Campos incompletos', 'Selecciona un empleado válido e ingresa una cantidad de horas mayor a cero.');
        return;
    }

    // Validación: el empleado debe tener saldo de horas extra mayor a 0
    const empleadoSeleccionado = empleadosCache.find(e => Number(e?.id) === numeroEmpleado);
    if (!empleadoSeleccionado || Number(empleadoSeleccionado.total_horas || 0) <= 0) {
        mostrarNotificacion('warning', 'Sin saldo', 'No se pueden registrar horas: el empleado no tiene horas extra disponibles.');
        return;
    }

    if (!diasSeleccionados.length) {
        mostrarNotificacion('warning', 'Sin fechas', 'Selecciona al menos una fecha en el calendario.');
        return;
    }

    try {
        const respuesta = await fetch(`${API_URL}/api/registrar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                numero_empleado: numeroEmpleado,
                cantidad_horas: cantidadHoras,
                dias_semana: diasSeleccionados,
            }),
        });

        if (!respuesta.ok) {
            const error = await respuesta.json();
            throw new Error(error.detail || "Error al registrar las horas");
        }

        mostrarNotificacion('success', 'Éxito', 'Asignación de horas guardada correctamente.');
        agregarNotificacionSalida(empleadoSeleccionado?.id, empleadoSeleccionado?.nombre || `Empleado ${numeroEmpleado}`, cantidadHoras, diasSeleccionados);
        event.target.reset();
        registroFechasSeleccionadas.clear();
        actualizarResumenFechasRegistro();
        construirCalendarioRegistro(registroCalendarioMes.year, registroCalendarioMes.month);
        mostrarHorasActuales();
    } catch (error) {
        console.error("Error al registrar horas:", error);
        mostrarNotificacion('error', 'Error', `No se pudo guardar la asignación: ${error.message}`);
    }
}

function inicializarEmpleados() {
    const filtroIds = document.getElementById("filtro-ids");
    const btnBuscar = document.getElementById("btn-buscar-empleados");
    const btnReset = document.getElementById("btn-reset-empleados");
    const btnAgregarEmpleado = document.getElementById("btn-agregar-empleado");
    const btnRestaurarCambios = document.getElementById("btn-restaurar-cambios");
    const btnCerrarEmpleado = document.getElementById("btn-cerrar-empleado");
    const btnCancelarEmpleado = document.getElementById("btn-cancelar-empleado");
    const formEmpleado = document.getElementById("form-empleado");
    const formRegistro = document.getElementById("form-registrar-horas");

    console.log("Inicializando empleados...");
    console.log("filtroIds:", filtroIds, "btnBuscar:", btnBuscar, "btnReset:", btnReset, "btnAgregarEmpleado:", btnAgregarEmpleado, "btnCerrarEmpleado:", btnCerrarEmpleado, "formEmpleado:", formEmpleado);

    if (btnBuscar && btnReset && filtroIds) {
        btnBuscar.addEventListener("click", (event) => {
            event.preventDefault();
            const raw = filtroIds.value.trim();
            if (!raw) {
                mostrarNotificacion('warning', 'ID requerido', 'Ingresa un ID de empleado para buscar.');
                return;
            }

            const idsArray = raw.split(/[\s,;]+/).map(s => s.trim()).filter(s => /^\d+$/.test(s));
            if (!idsArray.length) {
                mostrarNotificacion('warning', 'IDs inválidos', 'Introduce IDs numéricos válidos (ejemplo: 55 o 55,56). Si quieres todos, deja el campo vacío y presiona Mostrar todos.');
                return;
            }

            // Sólo permitir IDs que estén actualmente visibles en la tabla (empleadosCache)
            const visibleIdsSet = new Set(empleadosCache.map(e => String(e.id)));
            const allowed = idsArray.filter(s => visibleIdsSet.has(s));
            if (!allowed.length) {
                mostrarNotificacion('info', 'Sin coincidencias', 'Ningún ID ingresado coincide con los empleados mostrados en pantalla.');
                return;
            }

            const idsParam = allowed.join(",");
            cargarEmpleados(idsParam);
        });

        filtroIds.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                btnBuscar.click();
            }
        });

        btnReset.addEventListener("click", (event) => {
            event.preventDefault();
            filtroIds.value = "";
            cargarEmpleados();
        });
    }

    if (btnAgregarEmpleado) {
        btnAgregarEmpleado.addEventListener("click", () => abrirModalEmpleado('add'));
    }

    if (btnRestaurarCambios) {
        btnRestaurarCambios.addEventListener("click", limpiarCambiosVisualesEmpleados);
    }

    if (btnCerrarEmpleado) {
        btnCerrarEmpleado.addEventListener("click", cerrarModalEmpleado);
    }

    if (btnCancelarEmpleado) {
        btnCancelarEmpleado.addEventListener("click", cerrarModalEmpleado);
    }

    const tablaEmpleados = document.getElementById("tabla-empleados");
    if (tablaEmpleados) {
        tablaEmpleados.addEventListener("click", (event) => {
            const horarioBtn = event.target.closest(".ver-horario-btn");
            const editarBtn = event.target.closest(".editar-empleado-btn");
            const eliminarBtn = event.target.closest(".eliminar-empleado-btn");

            if (horarioBtn) {
                const empleadoId = horarioBtn.getAttribute("data-emp-id");
                if (empleadoId) {
                    obtenerHorarioEmpleado(empleadoId);
                }
                return;
            }

            if (editarBtn) {
                const empleadoId = editarBtn.getAttribute("data-emp-id");
                const empleado = empleadosCache.find(emp => String(emp.id) === String(empleadoId));
                if (empleado) {
                    abrirModalEmpleado('edit', empleado);
                }
                return;
            }

            if (eliminarBtn) {
                const empleadoId = eliminarBtn.getAttribute("data-emp-id");
                if (empleadoId) {
                    eliminarEmpleadoVisual(empleadoId);
                }
                return;
            }
        });
    }

    const btnCerrarHorario = document.getElementById("btn-cerrar-horario");
    if (btnCerrarHorario) {
        btnCerrarHorario.addEventListener("click", cerrarModalHorario);
    }

    if (formEmpleado) {
        formEmpleado.addEventListener("submit", async (event) => {
            event.preventDefault();
            const idValue = document.getElementById('empleado-id')?.value;
            const nombreValue = document.getElementById('empleado-nombre')?.value.trim();
            const horasValue = parseFloat(document.getElementById('empleado-horas')?.value || '0');
            const salidasValue = parseInt(document.getElementById('empleado-salidas')?.value || '0', 10);

            if (!nombreValue) {
                mostrarNotificacion('warning', 'Nombre requerido', 'Ingresa el nombre del empleado.');
                return;
            }

            const empleado = {
                id: idValue ? (Number(idValue) || idValue) : obtenerSiguienteIdTemporal(),
                nombre: nombreValue,
                total_horas: Number.isNaN(horasValue) ? 0 : horasValue,
                salidas_temprano: Number.isNaN(salidasValue) ? 0 : salidasValue,
            };

            if (empleadoModalMode === 'edit' && empleadoModalEditingId !== null) {
                const resultado = await actualizarEmpleadoEnBD(empleado);
                if (!resultado) {
                    return;
                }
            }

            guardarEmpleadoVisual(empleado);
            cerrarModalEmpleado();
        });
    }

    if (formRegistro) {
        formRegistro.addEventListener("submit", enviarRegistroHoras);
    }

    const btnConfirmacionCancelar = document.getElementById("btn-confirmacion-cancelar");
    const btnConfirmacionConfirmar = document.getElementById("btn-confirmacion-confirmar");
    const modalConfirmacion = document.getElementById("modal-confirmacion");

    if (btnConfirmacionCancelar) {
        btnConfirmacionCancelar.addEventListener("click", cerrarModalConfirmacion);
    }

    if (btnConfirmacionConfirmar) {
        btnConfirmacionConfirmar.addEventListener("click", () => {
            if (empleadoAEliminar === 'restore_all') {
                confirmarLimpiar();
            } else {
                confirmarEliminacion();
            }
        });
    }

    if (modalConfirmacion) {
        modalConfirmacion.addEventListener("click", (event) => {
            if (event.target === modalConfirmacion) {
                cerrarModalConfirmacion();
            }
        });
    }

    // Cargar empleados en la tabla
    cargarEmpleados();
}

async function inicializarRegistros() {
    const registroForm = document.getElementById("registroForm");
    const selectEmpleado = document.getElementById("reg-empleado");

    console.log("Inicializando registros...");
    console.log("registroForm:", registroForm);
    console.log("selectEmpleado:", selectEmpleado);

    if (registroForm) {
        registroForm.addEventListener("submit", enviarRegistroHoras);
    }

    if (selectEmpleado) {
        selectEmpleado.addEventListener("change", mostrarHorasActuales);
    }

    inicializarCalendarioRegistro();
    await cargarEmpleadosParaRegistro();
}

const CONFIG_KEY = "sistema_horas_configuracion";
const DEFAULT_CONFIG = {
    maxHorasMes: 160,
    maxHorasDiarias: 12,
    minHorasCompensacion: 1,
    horasDescansoPorHoraExtra: 1,
    diasMaximosDescanso: 15,
    toleranciaTarde: 10,
    permitirRecuperacionOtroDia: true,
    alertasExceso: true,
};

function obtenerConfiguracionGuardada() {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) {
        return { ...DEFAULT_CONFIG };
    }

    try {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_CONFIG, ...parsed };
    } catch {
        return { ...DEFAULT_CONFIG };
    }
}

function cargarConfiguracion() {
    const config = obtenerConfiguracionGuardada();
    actualizarFormularioConfiguracion(config);
}

function guardarConfiguracion(event) {
    event.preventDefault();
    const config = obtenerConfiguracionFormulario();
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    actualizarFormularioConfiguracion(config);
    mostrarAvisoConfig('Preferencias guardadas correctamente.');
}

function resetConfiguracion() {
    window.localStorage.removeItem(CONFIG_KEY);
    cargarConfiguracion();
    mostrarAvisoConfig('Configuración restaurada a valores predeterminados.');
}

function exportarConfiguracion() {
    const config = obtenerConfiguracionGuardada();
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'configuracion-sistema.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function importarConfiguracion(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error('Formato inválido');
            }

            const config = { ...DEFAULT_CONFIG, ...parsed };
            window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
            cargarConfiguracion();
            mostrarAvisoConfig('Configuración importada correctamente.');
        } catch (error) {
            mostrarNotificacion('error', 'Error de importación', 'No se pudo importar el archivo de configuración. Asegúrate de que sea un JSON válido.');
            console.error(error);
        }
    };
    reader.readAsText(file);
}

function obtenerConfiguracionFormulario() {
    return {
        maxHorasMes: parseInt(document.getElementById('max-horas-mes').value, 10) || DEFAULT_CONFIG.maxHorasMes,
        maxHorasDiarias: parseFloat(document.getElementById('max-horas-diarias').value) || DEFAULT_CONFIG.maxHorasDiarias,
        minHorasCompensacion: parseFloat(document.getElementById('min-horas-compensacion').value) || DEFAULT_CONFIG.minHorasCompensacion,
        horasDescansoPorHoraExtra: parseFloat(document.getElementById('horas-descanso-por-hora').value) || DEFAULT_CONFIG.horasDescansoPorHoraExtra,
        diasMaximosDescanso: parseInt(document.getElementById('dias-maximos-descanso').value, 10) || DEFAULT_CONFIG.diasMaximosDescanso,
        toleranciaTarde: parseInt(document.getElementById('tolerancia-tarde').value, 10) || DEFAULT_CONFIG.toleranciaTarde,
        permitirRecuperacionOtroDia: document.getElementById('permitir-recuperacion-otro-dia').checked,
        alertasExceso: document.getElementById('alertas-exceso').checked,
    };
}

function aplicarTemaConfig(tema) {
    if (!document.body) return;
    document.body.classList.toggle("theme-dark", tema === "oscuro");
}

function actualizarFormularioConfiguracion(config) {
    document.getElementById("max-horas-mes").value = config.maxHorasMes;
    document.getElementById("max-horas-diarias").value = config.maxHorasDiarias;
    document.getElementById("min-horas-compensacion").value = config.minHorasCompensacion;
    document.getElementById("horas-descanso-por-hora").value = config.horasDescansoPorHoraExtra;
    document.getElementById("dias-maximos-descanso").value = config.diasMaximosDescanso;
    document.getElementById("tolerancia-tarde").value = config.toleranciaTarde;
    document.getElementById("permitir-recuperacion-otro-dia").checked = config.permitirRecuperacionOtroDia;
    document.getElementById("alertas-exceso").checked = config.alertasExceso;
}

function mostrarAvisoConfig(mensaje) {
    const notice = document.getElementById("config-notice");
    if (!notice) return;
    notice.textContent = mensaje;
    notice.classList.add("show");
    setTimeout(() => notice.classList.remove("show"), 3200);
}


async function inicializarConfiguracion() {
    const form = document.getElementById("config-form");
    const btnReset = document.getElementById("btn-reset-config");
    const btnExport = document.getElementById("btn-export-config");
    const btnImport = document.getElementById("btn-import-config");
    const inputImport = document.getElementById("import-config-file");

    await cargarConfiguracion();

    if (form) {
        form.addEventListener("submit", guardarConfiguracion);
    }

    if (btnReset) {
        btnReset.addEventListener("click", () => {
            if (confirm("¿Deseas restaurar los valores predeterminados de configuración?")) {
                resetConfiguracion();
            }
        });
    }

    if (btnExport) {
        btnExport.addEventListener("click", exportarConfiguracion);
    }

    if (btnImport && inputImport) {
        btnImport.addEventListener("click", () => inputImport.click());
        inputImport.addEventListener("change", importarConfiguracion);
    }
}

async function cargarReportes() {
    const inicio = document.getElementById('fechaInicio');
    const fin = document.getElementById('fechaFin');
    const tbody = document.getElementById('reportes-tbody');
    const totalRegistros = document.getElementById('reporte-total-registros');
    const empleadosRango = document.getElementById('reporte-empleados-rango');
    const alertasHoras = document.getElementById('reporte-alertas-horas');

    if (!inicio || !fin || !tbody || !totalRegistros || !empleadosRango || !alertasHoras) return;

    const fechaInicio = inicio.value;
    const fechaFin = fin.value;
    if (!fechaInicio || !fechaFin) {
        mostrarNotificacion('warning', 'Fechas requeridas', 'Selecciona un rango de fechas antes de filtrar.');
        return;
    }

    if (new Date(fechaInicio) > new Date(fechaFin)) {
        mostrarNotificacion('error', 'Rango inválido', 'La fecha de inicio no puede ser mayor que la fecha de fin.');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/reportes?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`);
        if (!response.ok) {
            throw new Error(`Error al cargar el reporte (${response.status})`);
        }

        const empleados = await response.json();
        ultimoReporteData = Array.isArray(empleados) ? empleados : [];

        if (!ultimoReporteData.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="reportes-empty">No se encontraron registros en el rango seleccionado.</td>
                </tr>
            `;
            totalRegistros.textContent = '0';
            empleadosRango.textContent = '0';
            alertasHoras.textContent = '0';
            return;
        }

        const alertasCount = ultimoReporteData.filter(emp => Number(emp.salidas_temprano) > 0).length;
        totalRegistros.textContent = String(ultimoReporteData.length);
        empleadosRango.textContent = String(ultimoReporteData.length);
        alertasHoras.textContent = String(alertasCount);

        tbody.innerHTML = '';
        ultimoReporteData.forEach(emp => {
            const horasTomadas = Math.abs(Number(emp.total_horas) || 0).toFixed(2);
            tbody.innerHTML += `
                <tr>
                    <td>${emp.nombre}</td>
                    <td>${horasTomadas} hrs</td>
                    <td>${emp.salidas_temprano}</td>
                    <td>
                        <button type="button" class="reportes-btn reportes-btn-secondary btn-detalle" data-id="${emp.id}" data-nombre="${emp.nombre}" data-fecha-inicio="${fechaInicio}" data-fecha-fin="${fechaFin}">Ver detalles</button>
                    </td>
                </tr>
            `;
        });

        tbody.querySelectorAll('.btn-detalle').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = Number(btn.dataset.id);
                const nombre = btn.dataset.nombre || '';
                const inicioSeleccionado = btn.dataset.fechaInicio;
                const finSeleccionado = btn.dataset.fechaFin;
                abrirDetalleEmpleado(id, nombre, inicioSeleccionado, finSeleccionado);
            });
        });
    } catch (error) {
        console.error('Error al cargar el reporte:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="reportes-empty">No se pudo cargar el reporte. Revisa la conexión con el backend.</td>
            </tr>
        `;
    }
}

async function abrirDetalleEmpleado(id, nombre, fechaInicio, fechaFin) {
    const modal = document.getElementById('reportes-detalle');
    const body = document.getElementById('reportes-detalle-body');
    if (!modal || !body) return;

    body.innerHTML = `<p>Cargando detalles de ${nombre}...</p>`;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');

    try {
        const response = await fetch(`${API_URL}/api/empleados/${id}/salidas-temprano?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`);
        if (!response.ok) {
            throw new Error(`Error al cargar detalle (${response.status})`);
        }

        const detalles = await response.json();
        if (!Array.isArray(detalles) || detalles.length === 0) {
            body.innerHTML = `<p>No se encontraron registros para ${nombre} en este rango de fechas.</p>`;
            return;
        }

        body.innerHTML = `
            <p style="font-weight:700; margin-bottom:16px;">Detalle de ${nombre}</p>
            <ul class="reportes-detalle-list">
                ${detalles.map(det => `
                    <li class="reportes-detalle-item">
                        <strong>${det.fecha}</strong>
                        <div>Horas tomadas: ${Math.abs(Number(det.horas || 0)).toFixed(2)} hrs</div>
                        <div>${det.observaciones || 'Sin observaciones'}</div>
                    </li>
                `).join('')}
            </ul>
        `;
    } catch (error) {
        console.error('Error al cargar el detalle del empleado:', error);
        body.innerHTML = `<p>No se pudo cargar el detalle. Intenta nuevamente.</p>`;
    }
}

function cerrarDetalleEmpleado() {
    const modal = document.getElementById('reportes-detalle');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
}

function descargarReporteCSV() {
    if (!ultimoReporteData.length) {
        mostrarNotificacion('warning', 'Sin datos', 'No hay datos de reporte disponibles para exportar.');
        return;
    }

    const csvRows = [
        ['Empleado', 'ID', 'Horas', 'Salidas tempranas', 'Estado'],
        ...ultimoReporteData.map(emp => [
            emp.nombre,
            emp.id,
            (Number(emp.total_horas) || 0).toFixed(2),
            emp.salidas_temprano,
            emp.salidas_temprano > 0 ? 'Revisar' : 'OK',
        ]),
    ];

    const csvContent = csvRows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reporte-horas.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function inicializarReportes() {
    const btnFiltrar = document.getElementById('btn-aplicar-reporte');
    const btnFiltrarTop = document.getElementById('btn-filtrar-reporte');
    const btnExportCsv = document.getElementById('btn-descargar-reporte-csv');
    const btnCerrarDetalle = document.getElementById('reportes-detalle-close');
    const modalDetalle = document.getElementById('reportes-detalle');

    if (btnFiltrar) {
        btnFiltrar.addEventListener('click', (event) => {
            event.preventDefault();
            cargarReportes();
        });
    }
    if (btnFiltrarTop) {
        btnFiltrarTop.addEventListener('click', (event) => {
            event.preventDefault();
            cargarReportes();
        });
    }
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', descargarReporteCSV);
    }
    if (btnCerrarDetalle) {
        btnCerrarDetalle.addEventListener('click', cerrarDetalleEmpleado);
    }
    if (modalDetalle) {
        modalDetalle.addEventListener('click', (event) => {
            if (event.target === modalDetalle) {
                cerrarDetalleEmpleado();
            }
        });
    }

    const inicio = document.getElementById('fechaInicio');
    const fin = document.getElementById('fechaFin');
    if (inicio && fin) {
        const hoy = new Date();
        const hace30 = new Date(hoy);
        hace30.setDate(hoy.getDate() - 30);
        inicio.value = hace30.toISOString().slice(0, 10);
        fin.value = hoy.toISOString().slice(0, 10);
        cargarReportes();
    }
}

async function loadPage(pageName, element) {
    const container = document.getElementById('content-area');
    const dynamicCard = document.getElementById('dynamic-card');
    
    container.classList.add('fade-out');
    
    try {
        const response = await fetch(`./screens/${pageName}.html`);
        const html = await response.text();
        
        setTimeout(async () => {
            dynamicCard.innerHTML = html;
            container.classList.remove('fade-out');
            console.log("loadPage loaded", pageName);
            
            document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
            if(element) element.classList.add('active');

            if (pageName === 'empleados') {
                inicializarEmpleados();
            }

            if (pageName === 'registros') {
                await inicializarRegistros();
            }

            if (pageName === 'notificaciones') {
                inicializarNotificaciones();
            }

            if (pageName === 'dashboard') {
                cargarDashboard();
            }

            if (pageName === 'reportes') {
                inicializarReportes();
            }

            if (pageName === 'perfil') {
                inicializarPerfil();
            }

            if (pageName === 'reportes') {
                inicializarReportes();
            }

            if (pageName === 'configuracion') {
                await inicializarConfiguracion();
            }

        }, 300);
    } catch (e) {
        dynamicCard.innerHTML = "<h1>Error</h1><p>No se pudo cargar la vista.</p>";
    }
}

// Carga inicial
document.addEventListener("DOMContentLoaded", () => {
    loadPage('dashboard', document.querySelector('.sidebar a'));
});
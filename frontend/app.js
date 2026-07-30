const API_URL = `http://172.16.6.50:8000`; // Cambia el puerto si tu backend está en otro puerto
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
const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';

function obtenerTokenAuth() {
    return sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

function obtenerUsuarioAuth() {
    const raw = sessionStorage.getItem(AUTH_USER_KEY) || localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (_error) {
        return null;
    }
}

function limpiarSesionAuth() {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
}

function construirHeadersAuth(extraHeaders = {}) {
    const token = obtenerTokenAuth();
    const headers = { ...extraHeaders };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

function esSesionValida() {
    return Boolean(obtenerTokenAuth());
}

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
    if (!tabla) return;

    const query = ids ? `?ids=${encodeURIComponent(ids)}` : "?all=true";
    tabla.innerHTML = `<tr><td colspan="5" style="padding:15px; text-align:center;">Cargando empleados...</td></tr>`;
    
    try {
        const [respuesta, resSubordinados] = await Promise.all([
            fetch(`${API_URL}/api/empleados${query}`, { headers: construirHeadersAuth() }),
            fetch(`${API_URL}/api/dashboard-empleados`, { headers: construirHeadersAuth() })
        ]);

        if (!respuesta.ok) throw new Error(`Error al obtener la lista de empleados (${respuesta.status})`);

        const empleados = await respuesta.json();
        const subordinados = resSubordinados.ok ? await resSubordinados.json() : [];

        const idsAutorizados = (Array.isArray(subordinados) ? subordinados : []).map(emp => {
            const idVal = emp.id !== undefined ? emp.id : emp.id_usuario_original;
            return String(idVal).trim();
        });

        cargarEmpleadosLocales();
        empleadosCache = aplicarCambiosVisuales(Array.isArray(empleados) ? empleados : []);

        const esAdmin = obtenerUsuarioAuth()?.rol?.toLowerCase() === 'administrador';
        
        if (!esAdmin) {
            empleadosCache = empleadosCache.filter(emp => {
                const idNomina = emp.id_usuario_original !== undefined 
                    ? emp.id_usuario_original 
                    : (emp.iEmployeeNum !== undefined ? emp.iEmployeeNum : emp.id);
                return idsAutorizados.includes(String(idNomina).trim());
            });
        }

        tabla.innerHTML = "";
        if (!empleadosCache.length) {
            tabla.innerHTML = `<tr><td colspan="5" style="text-align: center;">No se encontraron empleados a tu cargo.</td></tr>`;
            return;
        }

        renderEmpleadosTabla(tabla, empleadosCache);

    } catch (error) {
        console.error("Error al conectar con la API:", error);
        tabla.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center; font-weight: bold;">Error de conexión.</td></tr>`;
    }
}

async function cargarDropdownEmpleados() {
    const select = document.getElementById("reg-empleado");
    if (!select) return;

    try {
        const baseUrl = window.API_URL || "http://localhost:8000";

        let headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        };

        if (typeof construirHeadersAuth === 'function') {
            try {
                headers = Object.assign(headers, construirHeadersAuth());
            } catch(e) {}
        }

        const response = await fetch(`${baseUrl}/api/dashboard-empleados`, {
            method: 'GET',
            headers: headers,
            credentials: 'include'
        });

        let empleados = [];

        if (response.ok) {
            empleados = await response.json();
        }

        if (empleados && empleados.data && Array.isArray(empleados.data)) {
            empleados = empleados.data;
        }

        // ==========================================
        // 1. SI NO HAY EMPLEADOS A CARGO (Buscar usuario logueado)
        // ==========================================
        if (!Array.isArray(empleados) || empleados.length === 0) {
            let nombreMostrar = localStorage.getItem('nombre_completo') || localStorage.getItem('nombre');
            let idLogueado = 1;

            // Si no hay nombre completo en localStorage, intentar leer el objeto 'usuario'
            const rawUser = localStorage.getItem('usuario') || localStorage.getItem('user');
            if (rawUser) {
                try {
                    const u = JSON.parse(rawUser);
                    idLogueado = u.id || u.id_usuario || 1;
                    nombreMostrar = u.nombre_completo || u.nombre || nombreMostrar;
                } catch(e) {}
            }

            // Si sigue sin haber nombre real y solo tenemos 'ds' (username), consultamos la API de perfil
            if (!nombreMostrar || nombreMostrar === localStorage.getItem('username')) {
                try {
                    const resPerfil = await fetch(`${baseUrl}/api/perfil`, { headers, credentials: 'include' });
                    if (resPerfil.ok) {
                        const perfil = await resPerfil.json();
                        nombreMostrar = perfil.nombre_completo || perfil.nombre || perfil.nombres;
                        idLogueado = perfil.id || perfil.id_usuario || idLogueado;
                    }
                } catch(e) {
                    console.log("No se pudo obtener el perfil de la API");
                }
            }

            // Si después de todo solo queda 'ds', usamos 'ds' o un texto por defecto
            empleados = [{
                id: idLogueado,
                nombre: nombreMostrar || localStorage.getItem('username') || "Usuario Actual"
            }];
        }

        // ==========================================
        // 2. RENDERIZAR EN EL SELECT
        // ==========================================
        if (empleados.length > 1) {
            select.innerHTML = '<option value="" disabled selected hidden>Selecciona un empleado...</option>';
            
            empleados.forEach(emp => {
                const id = emp.id !== undefined ? emp.id : emp.id_usuario_sistema;
                const nombre = emp.nombre || emp.nombre_completo || emp.username || "Sin nombre";

                const opt = document.createElement("option");
                opt.value = id;
                opt.textContent = nombre;
                select.appendChild(opt);
            });

            select.value = "";
        } else if (empleados.length === 1) {
            const unico = empleados[0];
            const idUnico = unico.id !== undefined ? unico.id : unico.id_usuario_sistema;
            const nombreUnico = unico.nombre || unico.nombre_completo || unico.username;

            select.innerHTML = `<option value="${idUnico}" selected>${nombreUnico}</option>`;
            select.value = idUnico;

            if (typeof cargarHorasDisponibles === 'function') {
                cargarHorasDisponibles(idUnico);
            }
        }

        select.onchange = function() {
            if (typeof cargarHorasDisponibles === 'function') {
                cargarHorasDisponibles(this.value);
            }
        };

    } catch (err) {
        console.error("Error al obtener la lista de empleados:", err);
    }
}
function renderEmpleadosTabla(tabla, empleados) {
    tabla.innerHTML = '';
    if (!empleados.length) {
        tabla.innerHTML = `<tr><td colspan="5" style="text-align: center;">No se encontraron empleados.</td></tr>`;
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

    if (titulo) titulo.textContent = mode === 'edit' ? 'Editar empleado' : 'Agregar empleado';
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
            headers: construirHeadersAuth({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                nombre: empleado.nombre,
                total_horas: empleado.total_horas,
                salidas_temprano: empleado.salidas_temprano,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => null);
            mostrarNotificacion('error', 'Error de servidor', error?.detail || 'No se pudo actualizar.');
            return false;
        }

        const data = await response.json();
        mostrarNotificacion('success', 'Empleado actualizado', data.mensaje);
        return true;
    } catch (error) {
        mostrarNotificacion('error', 'Error de red', 'No se pudo conectar con el servidor.');
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

function limpiarCambiosVisualesEmpleados() {
    const modal = document.getElementById('modal-confirmacion');
    const titulo = document.getElementById('confirmacion-titulo');
    const mensaje = document.getElementById('confirmacion-mensaje');
    const btnConfirmar = document.getElementById('btn-confirmacion-confirmar');
    
    if (titulo) titulo.textContent = 'Restaurar todos los cambios';
    if (mensaje) mensaje.textContent = '¿Deseas limpiar todos los cambios visuales? Esta acción no modifica la base de datos.';
    
    empleadoAEliminar = 'restore_all';
    
    if (btnConfirmar) {
        btnConfirmar.textContent = 'Restaurar';
        btnConfirmar.className = 'btn-confirm-danger';
    }
    
    if (modal) modal.style.display = 'flex';
}

function confirmarLimpiar() {
    empleadosVisual = { deleted: new Set(), edited: {}, added: [] };
    guardarEmpleadosLocales();
    cargarEmpleados();
    mostrarNotificacion('success', 'Cambios restaurados', 'Todos los cambios visuales han sido eliminados.');
    cerrarModalConfirmacion();
}

async function obtenerHorarioEmpleado(empleadoId) {
    const modalContent = document.getElementById('modal-horario-content');
    if (!modalContent) return;

    modalContent.innerHTML = `<p style="color:#4b5563;">Cargando horario...</p>`;
    const modal = document.getElementById('modal-horario');
    if (modal) modal.style.display = 'flex';

    try {
        const response = await fetch(`${API_URL}/api/empleados/${empleadoId}/horario`);
        if (!response.ok) throw new Error('No se pudo cargar el horario');

        const horario = await response.json();
        if (!Array.isArray(horario) || horario.length === 0) {
            modalContent.innerHTML = `<p style="color:#475569;">No se encontró horario configurado para este empleado.</p>`;
            return;
        }

        modalContent.innerHTML = `
            <table class="horario-table">
                <thead>
                    <tr><th>Día</th><th>Horario</th><th>Horas extra (últimos 30 días)</th></tr>
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
        modalContent.innerHTML = `<p style="color:#b91c1c;">No se pudo cargar el horario. Intenta de nuevo.</p>`;
    }
}

function cerrarModalHorario() {
    const modal = document.getElementById('modal-horario');
    if (modal) modal.style.display = 'none';
}

// 🛡️ CORREGIDO: Blindaje con comprobación de nulos para evitar errores al cambiar de vista
async function cargarDashboard() {
    try {
        const response = await fetch(`${API_URL}/api/dashboard-resumen`, {
            headers: construirHeadersAuth()
        });

        if (!response.ok) {
            throw new Error(`Error al cargar resumen (${response.status})`);
        }

        const data = await response.json();
        
        const kpiTotal = document.getElementById('kpi-total');
        if (kpiTotal) kpiTotal.textContent = `${data.total_horas.toFixed(2)} hrs`;

        const kpiPendientes = document.getElementById('kpi-pendientes');
        if (kpiPendientes) kpiPendientes.textContent = `${data.empleados_pendientes}`;

        const kpiAprobadas = document.getElementById('kpi-aprobadas');
        if (kpiAprobadas) kpiAprobadas.textContent = `${data.empleados_aprobadas}`;

        const kpiEficiencia = document.getElementById('kpi-eficiencia');
        if (kpiEficiencia) kpiEficiencia.textContent = `${data.eficiencia.toFixed(2)}%`;

    } catch (err) {
        console.error('No se pudieron cargar los datos del servidor:', err);
        const kpiTotal = document.getElementById('kpi-total');
        if (kpiTotal) kpiTotal.textContent = 'Error';
        const kpiPendientes = document.getElementById('kpi-pendientes');
        if (kpiPendientes) kpiPendientes.textContent = 'Error';
        const kpiAprobadas = document.getElementById('kpi-aprobadas');
        if (kpiAprobadas) kpiAprobadas.textContent = 'Error';
        const kpiEficiencia = document.getElementById('kpi-eficiencia');
        if (kpiEficiencia) kpiEficiencia.textContent = 'Error';
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
        const response = await fetch(`${API_URL}/api/dashboard-empleados`, {
            headers: construirHeadersAuth()
        });

        if (!response.ok) {
            throw new Error(`Error al cargar empleados (${response.status})`);
        }

        const empleados = await response.json();
        if (!Array.isArray(empleados) || empleados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding:16px;">No se encontraron empleados a tu cargo.</td>
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

async function cargarEmpleadosParaRegistro() {
    try {
        const response = await fetch(`${API_URL}/api/perfil`, { headers: construirHeadersAuth() });
        if (!response.ok) throw new Error('No se pudo cargar el perfil');
        
        const perfil = await response.json();
        
        if(document.getElementById('nombre')) document.getElementById('nombre').value = perfil.nombre || '';
        if(document.getElementById('rol')) document.getElementById('rol').value = perfil.rol || 'Empleado';
        if(document.getElementById('email')) document.getElementById('email').value = perfil.correo || '';
        if(document.getElementById('perfil-nombre')) document.getElementById('perfil-nombre').textContent = perfil.nombre || 'Usuario';
        if(document.getElementById('perfil-rol')) document.getElementById('perfil-rol').textContent = perfil.rol || 'Empleado';

        const kpiValues = document.querySelectorAll('.kpi-value');
        if (kpiValues.length >= 3) {
            kpiValues[0].textContent = `${(perfil.horas_historicas || 0).toFixed(1)}h`;
            kpiValues[1].textContent = `${(perfil.horas_consumidas || 0).toFixed(1)}h`;
            kpiValues[2].textContent = `${(perfil.saldo_disponible || 0).toFixed(1)}h`;
        }

    } catch (error) {
        console.warn('Perfil no disponible:', error);
    }
}

function inicializarPerfil() {
    const btnCambiarFoto = document.getElementById('btn-cambiar-foto');
    const inputFoto = document.getElementById('input-foto');
    const avatar = document.getElementById('perfil-avatar');
    const formPerfil = document.getElementById('form-perfil');
    
    const btnSolicitar = document.querySelector('.btn-solicitar');
    if (btnSolicitar) {
        btnSolicitar.onclick = abrirModalSolicitudEmpleado;
    }

    if (btnCambiarFoto && inputFoto) btnCambiarFoto.addEventListener('click', () => inputFoto.click());

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

    if (formPerfil) {
        formPerfil.addEventListener('submit', async (event) => {
            event.preventDefault();
            const nombre = document.getElementById('nombre')?.value.trim() || '';
            const email = document.getElementById('email')?.value.trim() || '';

            if (!nombre || !email) return alert('Completa los campos');

            try {
                const response = await fetch(`${API_URL}/api/perfil/actualizar`, {
                    method: 'POST',
                    headers: construirHeadersAuth({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ nombre, correo: email }),
                });

                if (!response.ok) throw new Error('Error al guardar');
                alert('Perfil actualizado correctamente');
                cargarPerfil();
            } catch (error) {
                alert('Error al guardar perfil.');
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
    empleadosCache.forEach((emp) => {
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
    const inputMotivo = document.getElementById("reg-motivo");
    const inputJefeDirecto = document.getElementById("reg-jefe-directo");
    const inputJefeSuperior = document.getElementById("reg-jefe-superior");
    if (!selectEmpleado || !inputHoras || !inputMotivo || !inputJefeDirecto || !inputJefeSuperior) return;

    const numeroEmpleado = parseInt(selectEmpleado.value, 10);
    const cantidadHoras = parseFloat(inputHoras.value);
    const diasSeleccionados = Array.from(registroFechasSeleccionadas);
    const motivo = inputMotivo.value.trim();
    const idJefeDirectoRaw = (inputJefeDirecto.value || '').trim();
    const idJefeSuperiorRaw = (inputJefeSuperior.value || '').trim();
    const idJefeDirecto = idJefeDirectoRaw ? parseInt(idJefeDirectoRaw, 10) : null;
    const idJefeSuperior = idJefeSuperiorRaw ? parseInt(idJefeSuperiorRaw, 10) : null;

    if (Number.isNaN(numeroEmpleado) || Number.isNaN(cantidadHoras) || cantidadHoras <= 0) {
        mostrarNotificacion('warning', 'Campos incompletos', 'Selecciona un empleado válido e ingresa una cantidad de horas mayor a cero.');
        return;
    }

    if (motivo.length < 5) {
        mostrarNotificacion('warning', 'Motivo muy corto', 'Por favor, escribe un motivo más detallado (mínimo 5 caracteres).');
        return;
    }

    if (!diasSeleccionados.length) {
        mostrarNotificacion('warning', 'Sin fechas', 'Selecciona al menos una fecha en el calendario.');
        return;
    }

    try {
        let exitos = 0;
        let errores = 0;

        for (const fecha of diasSeleccionados) {
            const payload = {
                id_empleado: Number(numeroEmpleado),
                fecha: fecha,
                horas_solicitadas: parseFloat(cantidadHoras),
                motivo: motivo,
                id_jefe_directo: idJefeDirecto,
                id_jefe_superior: idJefeSuperior
            };

            const respuesta = await fetch(`${API_URL}/api/registros/solicitudes`, {
                method: "POST",
                headers: construirHeadersAuth({ "Content-Type": "application/json" }),
                body: JSON.stringify(payload),
            });

            if (!respuesta.ok) {
                errores += 1;
                continue;
            }

            exitos += 1;
        }

        if (exitos && !errores) {
            mostrarNotificacion('success', 'Éxito', 'Asignación de horas guardada correctamente.');
        } else if (exitos && errores) {
            mostrarNotificacion('warning', 'Registro parcial', `Se crearon ${exitos} solicitud(es) correctamente, pero fallaron ${errores}.`);
        } else if (errores) {
            mostrarNotificacion('error', 'Errores en registro', `No se pudieron crear las solicitudes.`);
        }

        if (exitos > 0) {
            event.target.reset();
            registroFechasSeleccionadas.clear();
            actualizarResumenFechasRegistro();
            construirCalendarioRegistro(registroCalendarioMes.year, registroCalendarioMes.month);
            mostrarHorasActuales();
            if (typeof cargarSolicitudesReposicion === 'function') {
                await cargarSolicitudesReposicion();
            }
        }
    } catch (error) {
        console.error("Error al registrar horas:", error);
        mostrarNotificacion('error', 'Error', `No se pudo guardar la solicitud: ${error.message}`);
    }
}

function obtenerColorEstado(estado) {
    if (estado === 'aprobada') return '#15803d';
    if (estado === 'rechazada') return '#b91c1c';
    return '#b45309';
}

function renderSolicitudesReposicion(solicitudes) {
    const tbody = document.getElementById('registros-solicitudes-body');
    if (!tbody) return;

    if (!Array.isArray(solicitudes) || !solicitudes.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:14px;">No hay solicitudes para mostrar.</td>
            </tr>
        `;
        return;
    }

    let usuarioLogueado = null;
    try {
        const authUserRaw = sessionStorage.getItem("auth_user");
        if (authUserRaw) {
            usuarioLogueado = JSON.parse(authUserRaw);
        }
    } catch (e) {
        console.error("Error al leer el usuario de la sesión:", e);
    }

    const rolActual = String(usuarioLogueado?.rol || "").toLowerCase();
    const idUsuarioActual = Number(usuarioLogueado?.id || 0);

    tbody.innerHTML = '';
    solicitudes.forEach((sol) => {
        const estadoJD = String(sol.estado_jefe_directo || 'pendiente').toLowerCase();
        const estadoJS = String(sol.estado_jefe_superior || 'pendiente').toLowerCase();
        const estadoFinal = String(sol.estado_final || 'pendiente').toLowerCase();
        
        const idCreador = Number(sol.id_empleado); 

        const esJefeOAdmin = rolActual === 'jefe' || rolActual === 'admin';
        const esAutorizador = idUsuarioActual > 0 && idUsuarioActual !== idCreador;

        const puedeAccionar = estadoFinal === 'pendiente' && (esJefeOAdmin || esAutorizador);

        tbody.innerHTML += `
            <tr>
                <td>${sol.id_solicitud}</td>
                <td>${sol.id_empleado}</td>
                <td>${sol.fecha_solicitud || sol.fecha || ''}</td>
                <td>${Number(sol.horas_solicitadas || 0).toFixed(2)}</td>
                <td style="font-weight:600; color:${obtenerColorEstado(estadoJD)};">${estadoJD}</td>
                <td style="font-weight:600; color:${obtenerColorEstado(estadoJS)};">${estadoJS}</td>
                <td style="font-weight:700; color:${obtenerColorEstado(estadoFinal)};">${estadoFinal}</td>
                    <td>
                        ${puedeAccionar ? `
                        <button type="button" 
                                class="btn-autorizar-sol" 
                                onclick="procesarAutorizacion(${sol.id_solicitud}, 'aprobar')" 
                                style="margin-right:6px; border:none; border-radius:8px; padding:6px 10px; background:#166534; color:#fff; cursor:pointer;">
                            Aprobar
                        </button>
                        <button type="button" 
                                class="btn-autorizar-sol" 
                                onclick="procesarAutorizacion(${sol.id_solicitud}, 'rechazar')" 
                                style="border:none; border-radius:8px; padding:6px 10px; background:#b91c1c; color:#fff; cursor:pointer;">
                            Rechazar
                        </button>
                        ` : `<span style="color:#64748b;">Sin acciones</span>`}
                    </td>
            </tr>
        `;
    });
}

window.procesarAutorizacion = async function(idSolicitud, accion) {
    const confirmacion = confirm(`¿Estás seguro de que deseas ${accion} la solicitud #${idSolicitud}?`);
    if (!confirmacion) return;

    try {
        const response = await fetch(`${API_URL}/api/registros/solicitudes/${idSolicitud}/estado`, {
            method: 'PUT', 
            headers: construirHeadersAuth({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ estado: accion }) 
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Error del servidor`);
        }

        alert(`La solicitud ha sido procesada con éxito.`);
        if (typeof cargarAutorizacionesJefe === 'function') {
            await cargarAutorizacionesJefe(); 
        }
    } catch (error) {
        alert(`No se pudo procesar. Error: ${error.message}`);
    }
};

function inicializarEmpleados() {
    const btnRestaurarCambios = document.getElementById("btn-restaurar-cambios");
    if (btnRestaurarCambios) btnRestaurarCambios.addEventListener("click", limpiarCambiosVisualesEmpleados);

    cargarEmpleados();
    if (typeof cargarAutorizacionesJefe === 'function') {
    cargarAutorizacionesJefe();
}

// 👉 Agrega esta comprobación para el desplegable de solicitudes:
if (typeof cargarDropdownEmpleados === 'function') {
    cargarDropdownEmpleados();
}
}

async function inicializarRegistros() {
    const registroForm = document.getElementById("registroForm");
    const filtroEstado = document.getElementById('registros-filtro-estado');

    if (registroForm) registroForm.addEventListener("submit", enviarRegistroHoras);
    if (filtroEstado) filtroEstado.addEventListener('change', () => {
        if (typeof cargarSolicitudesReposicion === 'function') cargarSolicitudesReposicion();
    });

    if (typeof cargarSolicitudesReposicion === 'function') {
        await cargarSolicitudesReposicion();
    }
}

async function cargarReportes() {
    const inicio = document.getElementById('fechaInicio');
    const fin = document.getElementById('fechaFin');
    const tbody = document.getElementById('reportes-tbody');

    if (!inicio || !fin || !tbody) return;

    const fechaInicio = inicio.value;
    const fechaFin = fin.value;

    try {
        const response = await fetch(`${API_URL}/api/reportes?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`);
        if (!response.ok) throw new Error(`Error al cargar el reporte`);

        const empleados = await response.json();
        ultimoReporteData = Array.isArray(empleados) ? empleados : [];

        if (!ultimoReporteData.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="reportes-empty">No se encontraron registros.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        ultimoReporteData.forEach(emp => {
            const horasTomadas = Math.abs(Number(emp.total_horas) || 0).toFixed(2);
            tbody.innerHTML += `
                <tr>
                    <td>${emp.nombre}</td>
                    <td>${horasTomadas} hrs</td>
                    <td>${emp.salidas_temprano}</td>
                    <td><button type="button" class="reportes-btn reportes-btn-secondary">Ver detalles</button></td>
                </tr>
            `;
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="reportes-empty">Error al cargar.</td></tr>`;
    }
}

function inicializarReportes() {
    const btnFiltrar = document.getElementById('btn-aplicar-reporte');
    const btnExportCsv = document.getElementById('btn-descargar-reporte-csv');

    if (btnFiltrar) btnFiltrar.addEventListener('click', (e) => { e.preventDefault(); cargarReportes(); });
    if (btnExportCsv && typeof descargarReporteCSV === 'function') {
        btnExportCsv.addEventListener('click', descargarReporteCSV);
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

async function loadPage(page, element = null) {
    try {
        if (element) {
            document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
            element.classList.add('active');
        }

        let pageFile = page.endsWith('.html') ? page : `${page}.html`;
        let path = pageFile.startsWith('screens/') ? pageFile : `screens/${pageFile}`;

        const response = await fetch(path);
        if (!response.ok) throw new Error(`No se pudo cargar la vista: ${path}`);

        const html = await response.text();
        
        setTimeout(async () => {
            const dynamicCard = document.getElementById('dynamic-card');
            const container = document.body;

            if (dynamicCard) {
                dynamicCard.innerHTML = html;
                dynamicCard.querySelectorAll('script').forEach(script => {
                    try {
                        eval(script.innerText);
                    } catch (err) {
                        console.error("Error al ejecutar script de la vista:", err);
                    }
                });
            }
            if (container) container.classList.remove('fade-out');
            console.log("loadPage loaded", page);

            // Normalizamos 'page' quitándole 'screens/' y '.html' para comparar seguro
            const pageClean = page.replace('screens/', '').replace('.html', '');

            // 💾 GUARDA LA PÁGINA ACTUAL EN LOCALSTORAGE
            localStorage.setItem('active_screen', pageClean);

            // Resaltar el botón activo en el sidebar (incluso si element era null al recargar)
            document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
            if (element) {
                element.classList.add('active');
            } else {
                // Intenta buscar el enlace correspondiente en el sidebar si no se pasó el 'element'
                const currentLink = document.querySelector(`.sidebar a[onclick*="${pageClean}"]`);
                if (currentLink) currentLink.classList.add('active');
            }

            if (pageClean === 'empleados') {
                inicializarEmpleados();
            }

            if (pageClean === 'registros') {
                // 1. Ejecutar inicializarRegistros si existe
                if (typeof inicializarRegistros === 'function') {
                    await inicializarRegistros();
                }
                
                // 2. 👉 LLAMADA CLAVE: Llenar el select de empleados automáticamente
                if (typeof cargarDropdownEmpleados === 'function') {
                    await cargarDropdownEmpleados();
                }
            }

            if (pageClean === 'notificaciones') {
                inicializarNotificaciones();
            }

            if (pageClean === 'dashboard') {
                cargarDashboard();
            }

            if (pageClean === 'reportes') {
                inicializarReportes();
            }

            if (pageClean === 'perfil') {
                inicializarPerfil();
            }

            if (pageClean === 'configuracion' && typeof inicializarConfiguracion === 'function') {
                await inicializarConfiguracion();
            }
            
            if (pageClean === 'inicio') {
                // Inicializaciones para inicio si fueran necesarias
            }

        }, 300);
    } catch (e) {
        console.error(e);
        const dynamicCard = document.getElementById('dynamic-card');
        if (dynamicCard) dynamicCard.innerHTML = "<h1>Error</h1><p>No se pudo cargar la vista.</p>";
    }
}
document.addEventListener('DOMContentLoaded', () => {
    // 1. Obtiene la última pantalla visitada; si no existe, usa 'dashboard' o 'inicio'
    const savedPage = localStorage.getItem('active_screen') || 'dashboard';

    // 2. Carga la página guardada automáticamente
    loadPage(savedPage);
});

document.addEventListener("DOMContentLoaded", () => {
    if (!esSesionValida()) {
        window.location.href = 'login.html';
        return;
    }

<<<<<<< HEAD
   const logoutLink = document.getElementById('logout-link');
if (logoutLink) {
    logoutLink.addEventListener('click', (event) => {
        event.preventDefault();
        limpiarSesionAuth();
        
        // Redirigir a la vista de login dentro de la carpeta frontend
        window.location.href = '/frontend/login.html'; 
        // Nota: Si tu pantalla de login se llama index.html, usa '/frontend/index.html'
    });
}
=======
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', (event) => {
            event.preventDefault();
            limpiarSesionAuth();
            window.location.href = 'login.html';
        });
    }
>>>>>>> b1499a9b10f3ee00a97ebe587e134d792acfb9ce

    loadPage('dashboard', document.querySelector('.sidebar a'));
});

async function loadPageUsuario(pageName, element = null) {
    try {
        // 1. Resaltar la opción seleccionada en el menú lateral de usuarios
        if (element) {
            document.querySelectorAll('aside nav a').forEach(a => {
                a.classList.remove('active');
                a.style.backgroundColor = 'transparent';
                a.style.color = '#475569';
                a.style.borderLeft = 'none';
            });

            element.classList.add('active');
            element.style.backgroundColor = '#e3efe3';
            element.style.color = '#2f582f';
            element.style.borderLeft = '4px solid #2f582f';
        }

        // 2. Construir la ruta apuntando a screenUsuarios/
        const fileName = pageName.endsWith('.html') ? pageName : `${pageName}.html`;
        const path = `screenUsuarios/${fileName}`;

        // 3. Obtener el archivo HTML
        const response = await fetch(path);
        if (!response.ok) throw new Error(`No se pudo cargar la vista de usuario: ${path}`);

        const html = await response.text();

        // 4. Inyectar en el contenedor dinámico
        const dynamicCard = document.getElementById('dynamic-card');
        if (dynamicCard) {
            dynamicCard.innerHTML = html;

            // Ejecutar los scripts que vengan dentro del HTML cargado (ej. el calendario)
            const scripts = dynamicCard.getElementsByTagName('script');
            for (let script of scripts) {
                try {
                    eval(script.innerText);
                } catch (err) {
                    console.error("Error al ejecutar script de la vista:", err);
                }
            }
        }

        console.log("Cargada vista de usuario:", pageName);

    } catch (e) {
        console.error("Error en loadPageUsuario:", e);
        const dynamicCard = document.getElementById('dynamic-card');
        if (dynamicCard) {
            dynamicCard.innerHTML = "<h2>Error</h2><p>No se pudo cargar la vista solicitada.</p>";
        }
    }
}
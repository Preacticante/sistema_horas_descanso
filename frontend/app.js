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
            fetch(`${API_URL}/api/empleados${query}`),
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
        
        // Si no es admin, filtramos su equipo
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

async function cargarDashboard() {
    try {
        const response = await fetch(`${API_URL}/api/dashboard-resumen`, { headers: construirHeadersAuth() });
        if (!response.ok) throw new Error('Error al cargar resumen');

        const data = await response.json();
        document.getElementById('kpi-total').textContent = `${data.total_horas.toFixed(2)} hrs`;
        document.getElementById('kpi-pendientes').textContent = `${data.empleados_pendientes}`;
        document.getElementById('kpi-aprobadas').textContent = `${data.empleados_aprobadas}`;
        document.getElementById('kpi-eficiencia').textContent = `${data.eficiencia.toFixed(2)}%`;
    } catch (err) {
        document.getElementById('kpi-total').textContent = 'Error';
    }
    cargarDashboardEmpleados();
}

async function cargarDashboardEmpleados() {
    const tabla = document.getElementById('dashboard-empleados-table');
    if (!tabla) return;
    const tbody = tabla.querySelector('tbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:16px;">Cargando...</td></tr>`;

    try {
        const response = await fetch(`${API_URL}/api/dashboard-empleados`, { headers: construirHeadersAuth() });
        if (!response.ok) throw new Error('Error al cargar empleados');

        const empleados = await response.json();
        if (!Array.isArray(empleados) || empleados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:16px;">No se encontraron empleados a tu cargo.</td></tr>`;
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
        tbody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center; font-weight: bold;">Error al cargar.</td></tr>`;
    }
}

// ----------------------------------------------------
// 🚀 LÓGICA DEL PERFIL ACTUALIZADA PARA CONECTAR KPIs
// ----------------------------------------------------
async function cargarPerfil() {
    try {
        const response = await fetch(`${API_URL}/api/perfil`, { headers: construirHeadersAuth() });
        if (!response.ok) throw new Error('No se pudo cargar el perfil');
        
        const perfil = await response.json();
        
        // Formularios básicos
        if(document.getElementById('nombre')) document.getElementById('nombre').value = perfil.nombre || '';
        if(document.getElementById('rol')) document.getElementById('rol').value = perfil.rol || 'Empleado';
        if(document.getElementById('email')) document.getElementById('email').value = perfil.correo || '';
        if(document.getElementById('perfil-nombre')) document.getElementById('perfil-nombre').textContent = perfil.nombre || 'Usuario';
        if(document.getElementById('perfil-rol')) document.getElementById('perfil-rol').textContent = perfil.rol || 'Empleado';

        // Llenar las nuevas tarjetas KPI que diseñamos
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
    
    // Conexión del botón Solicitar Salida del Perfil
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
                cargarPerfil(); // Recargamos para reflejar cambios
            } catch (error) {
                alert('Error al guardar perfil.');
            }
        });
    }

    cargarPerfil();
}

// ----------------------------------------------------
// 🚀 MODAL DINÁMICO DE SOLICITUD DEL EMPLEADO (Desde Perfil)
// ----------------------------------------------------
function abrirModalSolicitudEmpleado(e) {
    e.preventDefault();
    
    // Si ya existe el modal, lo removemos para evitar duplicados
    let oldModal = document.getElementById('modal-solicitud-rapida');
    if(oldModal) oldModal.remove();

    const html = `
        <div id="modal-solicitud-rapida" class="modal-overlay show" style="display:flex;">
            <div class="modal-card" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>Solicitar Salida Anticipada</h2>
                    <button class="modal-close" onclick="document.getElementById('modal-solicitud-rapida').remove()">✕</button>
                </div>
                <form id="form-solicitud-rapida" class="modal-body">
                    <div style="margin-bottom: 15px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Fecha de la salida</label>
                        <input type="date" id="sol-rapida-fecha" required style="width:100%; padding:10px; border-radius:10px; border:1px solid #ccc;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Horas a consumir (Ej: 2.5)</label>
                        <input type="number" id="sol-rapida-horas" step="0.5" min="0.5" required style="width:100%; padding:10px; border-radius:10px; border:1px solid #ccc;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Motivo (Mínimo 5 caracteres)</label>
                        <textarea id="sol-rapida-motivo" required style="width:100%; padding:10px; border-radius:10px; border:1px solid #ccc;"></textarea>
                    </div>
                    <button type="submit" style="width:100%; background:var(--gold, #AA7F31); color:white; padding:12px; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">Enviar a mis jefes</button>
                </form>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('form-solicitud-rapida').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fecha = document.getElementById('sol-rapida-fecha').value;
        const horas = document.getElementById('sol-rapida-horas').value;
        const motivo = document.getElementById('sol-rapida-motivo').value;

        try {
            const response = await fetch(`${API_URL}/api/registros/solicitudes`, {
                method: "POST",
                headers: construirHeadersAuth({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    id_empleado: 0, // El backend de Python lo auto-detecta por la sesión
                    fecha: fecha,
                    horas_solicitadas: parseFloat(horas),
                    motivo: motivo
                })
            });

            if(!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Error en el servidor');
            }

            alert("Solicitud enviada correctamente. Tus jefes han sido notificados.");
            document.getElementById('modal-solicitud-rapida').remove();
            cargarPerfil(); // Actualiza los saldos si es necesario
        } catch(error) {
            alert(`Error: ${error.message}`);
        }
    });
}

// ----------------------------------------------------
// 🚀 INICIALIZADOR DE LA PANTALLA DEL JEFE (Autorizaciones)
// ----------------------------------------------------
async function cargarAutorizacionesJefe() {
    const tbody = document.getElementById('tabla-solicitudes');
    if (!tbody) return;

    try {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:18px;">Buscando solicitudes en tu equipo...</td></tr>';
        
        const response = await fetch(`${API_URL}/api/registros/solicitudes?estado=pendiente`, {
            headers: construirHeadersAuth()
        });
        
        if (!response.ok) throw new Error('Error al cargar');
        
        const solicitudes = await response.json();

        if(!solicitudes.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:18px;">No hay solicitudes pendientes de tu equipo. ¡Buen trabajo!</td></tr>';
            return;
        }

        tbody.innerHTML = solicitudes.map(sol => `
            <tr>
                <td style="font-weight: 700;">Empleado ID: ${sol.id_empleado}</td>
                <td>${sol.fecha}</td>
                <td><span class="badge badge-gold">${sol.horas_solicitadas} h</span></td>
                <td style="font-weight: 600; color:#475569;">Ver perfil</td>
                <td style="text-align: center; white-space: nowrap;">
                    <button class="btn-icon-action btn-aprobar" onclick="procesarAutorizacion(${sol.id_solicitud}, 'aprobar')" title="Aprobar Solicitud">✓</button>
                    <button class="btn-icon-action btn-rechazar" onclick="procesarAutorizacion(${sol.id_solicitud}, 'rechazar')" title="Rechazar Solicitud">✕</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red; padding:18px;">Error al conectar con la bandeja de autorización.</td></tr>';
    }
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
        await cargarAutorizacionesJefe(); 
    } catch (error) {
        alert(`No se pudo procesar. Error: ${error.message}`);
    }
};

function inicializarEmpleados() {
    const btnRestaurarCambios = document.getElementById("btn-restaurar-cambios");
    
    if (btnRestaurarCambios) btnRestaurarCambios.addEventListener("click", limpiarCambiosVisualesEmpleados);

    // Cargar la vista de tabla de equipo general que ya tenías
    cargarEmpleados();
    
    // Cargar la nueva bandeja de autorizaciones
    cargarAutorizacionesJefe();
}

async function inicializarRegistros() {
    const registroForm = document.getElementById("registroForm");
    const filtroEstado = document.getElementById('registros-filtro-estado');

    if (registroForm) registroForm.addEventListener("submit", enviarRegistroHoras);
    if (filtroEstado) filtroEstado.addEventListener('change', () => cargarSolicitudesReposicion());

    await cargarSolicitudesReposicion();
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
    if (btnExportCsv) btnExportCsv.addEventListener('click', descargarReporteCSV);

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
            
            document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
            if(element) element.classList.add('active');

            if (pageName === 'empleados') inicializarEmpleados();
            if (pageName === 'registros') await inicializarRegistros();
            if (pageName === 'dashboard') cargarDashboard();
            if (pageName === 'reportes') inicializarReportes();
            if (pageName === 'perfil') inicializarPerfil();

        }, 300);
    } catch (e) {
        dynamicCard.innerHTML = "<h1>Error</h1><p>No se pudo cargar la vista.</p>";
    }
}

// ==========================================
// 🔥 FUNCIÓN PARA CONTROLAR PERMISOS (RBAC) 
// ==========================================
function aplicarPermisosVisuales() {
    const usuarioActual = obtenerUsuarioAuth();
    if (!usuarioActual || !usuarioActual.rol) return;

    const rol = String(usuarioActual.rol).toLowerCase();

    // 1. Permisos para EMPLEADO
    if (rol === 'empleado' || rol === 'empleados') {
        // Ocultamos opciones avanzadas
        const navEmpleados = document.getElementById('nav-empleados');
        const navNotificaciones = document.getElementById('nav-notificaciones');
        const navReportes = document.getElementById('nav-reportes');
        const navConfiguracion = document.getElementById('nav-configuracion');
        const navDashboard = document.getElementById('nav-dashboard');

        if (navEmpleados) navEmpleados.style.display = 'none';
        if (navNotificaciones) navNotificaciones.style.display = 'none';
        if (navReportes) navReportes.style.display = 'none';
        if (navConfiguracion) navConfiguracion.style.display = 'none';
        if (navDashboard) navDashboard.style.display = 'none';
    }

    // 2. Permisos para JEFE
    else if (rol === 'jefe') {
        // El Jefe puede ver a su equipo y autorizar, pero no mueve la configuración global
        const navConfiguracion = document.getElementById('nav-configuracion');
        if (navConfiguracion) navConfiguracion.style.display = 'none';
    }

    // 3. Permisos para ADMINISTRADOR
    // Si es admin, no ocultamos nada, tiene acceso total.
}

// ==========================================
// 🔥 CARGA INICIAL Y RUTEO INTELIGENTE (VERSIÓN SEGURA) 🔥
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    if (!esSesionValida()) {
        window.location.href = 'login.html';
        return;
    }

    // 1. Ocultamos el cuerpo de la página un instante para evitar "parpadeos" visuales
    document.body.style.opacity = '0';

    try {
        // 2. Le preguntamos directamente a la BD quién es este usuario para estar 100% seguros
        const respuesta = await fetch(`${API_URL}/api/perfil`, { 
            headers: construirHeadersAuth() 
        });
        
        if (respuesta.ok) {
            const perfilReal = await respuesta.json();
            
            // 3. Forzamos a guardar el rol real dictado por la Base de Datos
            let usuarioActualizado = obtenerUsuarioAuth() || {};
            usuarioActualizado.rol = perfilReal.rol || 'empleado';
            usuarioActualizado.id = perfilReal.id;
            
            sessionStorage.setItem('auth_user', JSON.stringify(usuarioActualizado));
        }
    } catch(error) {
        console.warn("No se pudo verificar el perfil en el arranque", error);
    }

    // 4. Ahora sí, ejecutamos los permisos con el rol 100% verificado
    aplicarPermisosVisuales();

    // Mostramos la página suavemente
    document.body.style.transition = 'opacity 0.4s ease';
    document.body.style.opacity = '1';

    // 5. Botón de cerrar sesión
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', (event) => {
            event.preventDefault();
            limpiarSesionAuth();
            window.location.href = 'login.html';
        });
    }

    // 6. Ruteo inteligente
    const usuarioFinal = obtenerUsuarioAuth();
    const rol = String(usuarioFinal?.rol || '').toLowerCase();

    if (rol === 'empleado' || rol === 'empleados') {
        // Si es empleado, lo mandamos directo a su perfil
        loadPage('perfil', document.getElementById('nav-perfil'));
    } else {
        // Si es jefe o admin, lo mandamos al panel de control
        loadPage('dashboard', document.getElementById('nav-dashboard'));
    }
});
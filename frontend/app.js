const API_URL = `http://${window.location.hostname}:8000`; // Cambia el puerto si tu backend está en otro puerto
let empleadosCache = [];

async function cargarEmpleados(ids = null) {
    const tabla = document.getElementById("tabla-empleados");
    if (!tabla) {
        console.error("tabla-empleados no encontrada");
        return;
    }

    const query = ids ? `?ids=${encodeURIComponent(ids)}` : "";
    tabla.innerHTML = `
        <tr>
            <td colspan="4" style="padding:15px; text-align:center;">Cargando empleados...</td>
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
        empleadosCache = Array.isArray(empleados) ? empleados : [];
        tabla.innerHTML = "";

        if (!empleadosCache.length) {
            tabla.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center;">No se encontraron empleados.</td>
                </tr>
            `;
            return;
        }

        empleadosCache.forEach(emp => {
            const colorHoras = emp.total_horas >= 0 ? "#124416" : "#c0392b";
            tabla.innerHTML += `
                <tr>
                    <td>${emp.id}</td>
                    <td>${emp.nombre}</td>
                    <td style="color: ${colorHoras}; font-weight: bold;">${emp.total_horas.toFixed(2)} hrs</td>
                    <td>${emp.salidas_temprano}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error("Error al conectar con la API:", error);
        tabla.innerHTML = `
            <tr>
                <td colspan="4" style="color: red; text-align: center; font-weight: bold;">Error de conexión: Asegúrate de que el backend esté encendido.</td>
            </tr>
        `;
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
        const response = await fetch(`${API_URL}/api/empleados`);
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
                    <td>${emp.llegadas_tarde}</td>
                    <td>${emp.salidas_temprano}</td>
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
        empleadosCache = Array.isArray(empleados) ? empleados : [];
        actualizarSelectEmpleados();
    } catch (error) {
        console.error("Error al cargar empleados para registro:", error);
    }
}

async function cargarPerfil() {
    try {
        const response = await fetch(`${API_URL}/api/perfil`);
        if (!response.ok) {
            throw new Error(`No se pudo cargar el perfil (${response.status})`);
        }
        const perfil = await response.json();
        document.getElementById('nombre').value = perfil.nombre || '';
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

    const modalNombre = document.getElementById('modal-nombre');
    const modalPassword = document.getElementById('modal-password');
    const btnEditarNombre = document.getElementById('btn-editar-nombre');
    const btnEditarPassword = document.getElementById('btn-editar-password');
    const closeModalNombre = document.getElementById('close-modal-nombre');
    const closeModalPassword = document.getElementById('close-modal-password');
    const cancelarModalNombre = document.getElementById('cancelar-modal-nombre');
    const cancelarModalPassword = document.getElementById('cancelar-modal-password');
    const formNombre = document.getElementById('form-nombre');
    const formPassword = document.getElementById('form-password');
    const errorNombre = document.getElementById('error-nombre');
    const errorPassword = document.getElementById('error-password');
    const nombreInput = document.getElementById('nombre');
    const perfilNombreTitle = document.getElementById('perfil-nombre');
    const nuevoNombreInput = document.getElementById('nuevo-nombre');
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

    if (btnEditarNombre) {
        btnEditarNombre.addEventListener('click', () => {
            showModal(modalNombre);
            if (nuevoNombreInput) {
                nuevoNombreInput.value = nombreInput?.value || '';
                errorNombre.textContent = '';
                nuevoNombreInput.focus();
            }
        });
    }

    if (btnEditarPassword) {
        btnEditarPassword.addEventListener('click', () => {
            showModal(modalPassword);
            if (errorPassword) {
                errorPassword.textContent = '';
            }
            if (actualPassword) {
                actualPassword.value = '';
                actualPassword.focus();
            }
            if (nuevaPassword) nuevaPassword.value = '';
            if (confirmPassword) confirmPassword.value = '';
        });
    }

    [closeModalNombre, cancelarModalNombre].forEach((button) => {
        if (button) button.addEventListener('click', () => hideModal(modalNombre));
    });
    [closeModalPassword, cancelarModalPassword].forEach((button) => {
        if (button) button.addEventListener('click', () => hideModal(modalPassword));
    });

    if (formNombre) {
        formNombre.addEventListener('submit', (event) => {
            event.preventDefault();
            const nuevoNombre = nuevoNombreInput?.value.trim() || '';
            if (!nuevoNombre) {
                if (errorNombre) errorNombre.textContent = 'Ingresa un nombre válido.';
                nuevoNombreInput?.focus();
                return;
            }
            if (nombreInput) nombreInput.value = nuevoNombre;
            if (perfilNombreTitle) perfilNombreTitle.textContent = nuevoNombre;
            hideModal(modalNombre);
            showNotice('Nombre actualizado con éxito');
        });
    }

    if (formPassword) {
        formPassword.addEventListener('submit', (event) => {
            event.preventDefault();
            const actual = actualPassword?.value.trim() || '';
            const nueva = nuevaPassword?.value.trim() || '';
            const confirmar = confirmPassword?.value.trim() || '';

            if (!actual || !nueva || !confirmar) {
                if (errorPassword) errorPassword.textContent = 'Completa todos los campos para cambiar la contraseña.';
                return;
            }
            if (nueva.length < 8) {
                if (errorPassword) errorPassword.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
                return;
            }
            if (nueva !== confirmar) {
                if (errorPassword) errorPassword.textContent = 'Las contraseñas no coinciden.';
                return;
            }
            hideModal(modalPassword);
            showNotice('Contraseña actualizada correctamente');
        });
    }

    if (formPerfil) {
        formPerfil.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = document.getElementById('email')?.value.trim() || '';
            const telefono = document.getElementById('telefono')?.value.trim() || '';
            const departamento = document.getElementById('departamento')?.value.trim() || '';
            const sucursal = document.getElementById('sucursal')?.value.trim() || '';
            const direccion = document.getElementById('direccion')?.value.trim() || '';
            const nombre = document.getElementById('nombre')?.value.trim() || '';

            if (!email) {
                showNotice('Ingresa un correo electrónico válido.');
                return;
            }
            if (!telefono) {
                showNotice('Ingresa un teléfono válido.');
                return;
            }

            try {
                const response = await fetch(`${API_URL}/api/perfil`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nombre,
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
    if (!selectEmpleado) return;

    selectEmpleado.innerHTML = `<option value="">Selecciona un empleado...</option>`;
    empleadosCache.forEach(emp => {
        const label = `${emp.id} - ${emp.nombre} (${emp.total_horas.toFixed(2)} hrs)`;
        selectEmpleado.innerHTML += `<option value="${emp.id}">${label}</option>`;
    });
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
        celda.style.background = registroFechasSeleccionadas.has(fechaStr) ? '#e0f2fe' : '#ffffff';
        celda.style.color = '#111827';
        celda.style.cursor = 'pointer';
        celda.style.minHeight = '42px';
        celda.style.fontWeight = registroFechasSeleccionadas.has(fechaStr) ? '700' : '400';

        if (registroFechasSeleccionadas.has(fechaStr)) {
            celda.style.borderColor = '#38bdf8';
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
        alert("Selecciona un empleado válido e ingresa una cantidad de horas mayor a cero.");
        return;
    }

    if (!diasSeleccionados.length) {
        alert("Selecciona al menos una fecha en el calendario.");
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

        alert("Asignación de horas guardada correctamente.");
        event.target.reset();
        registroFechasSeleccionadas.clear();
        actualizarResumenFechasRegistro();
        construirCalendarioRegistro(registroCalendarioMes.year, registroCalendarioMes.month);
        mostrarHorasActuales();
    } catch (error) {
        console.error("Error al registrar horas:", error);
        alert(`No se pudo guardar la asignación: ${error.message}`);
    }
}

function inicializarEmpleados() {
    const filtroIds = document.getElementById("filtro-ids");
    const btnBuscar = document.getElementById("btn-buscar-empleados");
    const btnReset = document.getElementById("btn-reset-empleados");
    const btnAbrirModal = document.getElementById("btn-abrir-modal");
    const btnCerrarModal = document.getElementById("btn-cerrar-modal");
    const formRegistro = document.getElementById("form-registrar-horas");

    console.log("Inicializando empleados...");
    console.log("filtroIds:", filtroIds, "btnBuscar:", btnBuscar, "btnReset:", btnReset, "btnAbrirModal:", btnAbrirModal, "modalForm:", formRegistro);

    if (btnBuscar && btnReset && filtroIds) {
        btnBuscar.addEventListener("click", (event) => {
            event.preventDefault();
            const raw = filtroIds.value.trim();
            if (!raw) {
                alert("Ingresa un ID de empleado para buscar.");
                return;
            }

            const idsArray = raw.split(/[\s,;]+/).map(s => s.trim()).filter(s => /^\d+$/.test(s));
            if (!idsArray.length) {
                alert("Introduce IDs numéricos válidos (ejemplo: 55 o 55,56).\nSi quieres todos, deja el campo vacío y presiona Mostrar todos.");
                return;
            }

            // Sólo permitir IDs que estén actualmente visibles en la tabla (empleadosCache)
            const visibleIdsSet = new Set(empleadosCache.map(e => String(e.id)));
            const allowed = idsArray.filter(s => visibleIdsSet.has(s));
            if (!allowed.length) {
                alert("Ningún ID ingresado coincide con los empleados mostrados en pantalla.");
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

    if (btnAbrirModal) {
        btnAbrirModal.addEventListener("click", abrirModalRegistro);
    }

    if (btnCerrarModal) {
        btnCerrarModal.addEventListener("click", cerrarModalRegistro);
    }

    if (formRegistro) {
        formRegistro.addEventListener("submit", enviarRegistroHoras);
    }

    // Cargar empleados en la tabla
    cargarEmpleados();
}

function inicializarRegistros() {
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
    cargarEmpleadosParaRegistro();
}

function mostrarHorasActuales() {
    const selectEmpleado = document.getElementById("reg-empleado");
    const horasActuales = document.getElementById("horas-actuales");
    if (!selectEmpleado || !horasActuales) return;

    const empleadoId = parseInt(selectEmpleado.value, 10);
    const empleado = empleadosCache.find(emp => emp.id === empleadoId);

    if (empleado) {
        horasActuales.textContent = `Horas extra disponibles: ${empleado.total_horas.toFixed(2)} hrs`;
    } else {
        horasActuales.textContent = "Horas extra disponibles: 0.00 hrs";
    }
}


function generarResumenReporte(datos) {
    const totalRegistros = datos.length;
    const empleadosRango = new Set(datos.map(item => item.id)).size;
    const alertasHoras = datos.filter(item => item.total_horas < 0 || item.salidas_temprano > 0).length;

    return { totalRegistros, empleadosRango, alertasHoras };
}

function mostrarResumenReporte(datos) {
    const tarjetas = document.querySelectorAll('.reportes-summary .summary-card strong');
    const resumen = generarResumenReporte(datos);

    if (tarjetas.length >= 3) {
        tarjetas[0].textContent = `${resumen.totalRegistros}`;
        tarjetas[1].textContent = `${resumen.empleadosRango}`;
        tarjetas[2].textContent = `${resumen.alertasHoras}`;
    }
}

function renderizarReporte(datos) {
    const tbody = document.getElementById('reportes-table-body');
    const detalle = document.getElementById('reportes-detalle');
    if (!tbody) return;

    if (!Array.isArray(datos) || datos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="reportes-empty">No se encontraron resultados para ese rango de fechas.</td>
            </tr>
        `;
        detalle.classList.remove('show');
        return;
    }

    tbody.innerHTML = '';
    datos.forEach(emp => {
        const colorHoras = emp.total_horas >= 0 ? '#124416' : '#c0392b';
        tbody.innerHTML += `
            <tr>
                <td>${emp.id} - ${emp.nombre}</td>
                <td style="color: ${colorHoras}; font-weight: bold;">${emp.total_horas.toFixed(2)} hrs</td>
                <td>${emp.salidas_temprano}</td>
                <td><button class="reportes-btn reportes-btn-secondary btn-detalle" data-id="${emp.id}" data-nombre="${emp.nombre}">Ver detalles</button></td>
            </tr>
        `;
    });

    mostrarResumenReporte(datos);
}

function renderizarDetalleEmpleado(detalle, nombreEmpleado) {
    console.log('renderizarDetalleEmpleado llamado con:', detalle, nombreEmpleado);
    const contenido = document.getElementById('reportes-detalle-body');
    const panel = document.getElementById('reportes-detalle');
    console.log('Panel:', panel, 'Contenido:', contenido);
    if (!contenido || !panel) {
        console.error('Panel o contenido no encontrado');
        return;
    }

    if (!detalle || !detalle.salidas_detalle || detalle.salidas_detalle.length === 0) {
        panel.classList.add('show');
        contenido.innerHTML = `<p>No se encontraron registros de salida temprana en el rango seleccionado para ${nombreEmpleado}.</p>`;
        console.log('Panel mostrado (sin detalles)');
        return;
    }

    contenido.innerHTML = `
        <p><strong>Empleado:</strong> ${nombreEmpleado}</p>
        <p><strong>Período:</strong> ${detalle.fecha_inicio} a ${detalle.fecha_fin}</p>
        <ul class="reportes-detalle-list">
            ${detalle.salidas_detalle.map(item => `
                <li class="reportes-detalle-item">
                    <strong>${item.fecha_afectacion}</strong>
                    <div>Horas: ${item.horas.toFixed(2)}</div>
                    <div>${item.observaciones}</div>
                </li>
            `).join('')}
        </ul>
    `;
    panel.classList.add('show');
    console.log('Panel mostrado con detalles');
}

async function cargarReporte(fechaInicio, fechaFin) {
    const tbody = document.getElementById('reportes-table-body');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" class="reportes-empty">Cargando reporte...</td>
        </tr>
    `;

    try {
        const response = await fetch(`${API_URL}/api/reportes?fecha_inicio=${encodeURIComponent(fechaInicio)}&fecha_fin=${encodeURIComponent(fechaFin)}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Error al cargar el reporte');
        }

        const datos = await response.json();
        renderizarReporte(datos);
    } catch (error) {
        console.error('Error al cargar el reporte:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="reportes-empty">No se pudo cargar el reporte. Revisa la consola.</td>
            </tr>
        `;
    }
}

async function cargarDetalleEmpleado(empleadoId, empleadoNombre, fechaInicio, fechaFin) {
    console.log('Cargando detalle para empleado:', empleadoId, empleadoNombre, fechaInicio, fechaFin);
    try {
        const url = `${API_URL}/api/empleados/${empleadoId}/detalle?fecha_inicio=${encodeURIComponent(fechaInicio)}&fecha_fin=${encodeURIComponent(fechaFin)}`;
        console.log('URL del detalle:', url);
        const response = await fetch(url);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Error al cargar detalle');
        }

        const detalle = await response.json();
        console.log('Detalle recibido:', detalle);
        renderizarDetalleEmpleado(detalle, empleadoNombre);
    } catch (error) {
        console.error('Error al cargar detalle del empleado:', error);
        alert('Error al cargar detalles: ' + error.message);
    }
}

function inicializarReportes() {
    const btnFiltro = document.getElementById('btn-aplicar-filtro-reportes');
    const fechaInicioInput = document.getElementById('fechaInicio');
    const fechaFinInput = document.getElementById('fechaFin');
    const tablaBody = document.getElementById('reportes-table-body');

    const btnFiltroTop = document.getElementById('btn-filtrar-datos-reportes');

    const aplicarFiltro = (event) => {
        event.preventDefault();
        const fechaInicio = fechaInicioInput.value;
        const fechaFin = fechaFinInput.value;

        if (!fechaInicio || !fechaFin) {
            alert('Selecciona un rango de fechas antes de filtrar.');
            return;
        }

        if (fechaInicio > fechaFin) {
            alert('La fecha de inicio no puede ser posterior a la fecha de fin.');
            return;
        }

        cargarReporte(fechaInicio, fechaFin);
    };

    if (btnFiltro && fechaInicioInput && fechaFinInput) {
        btnFiltro.addEventListener('click', aplicarFiltro);
    }

    if (btnFiltroTop && fechaInicioInput && fechaFinInput) {
        btnFiltroTop.addEventListener('click', aplicarFiltro);
    }

    if (tablaBody) {
        tablaBody.addEventListener('click', (event) => {
            console.log('Click en tabla detectado');
            const target = event.target;
            console.log('Target:', target, 'Clases:', target.className);
            if (target.matches('.btn-detalle')) {
                console.log('Botón de detalle clickeado');
                const empleadoId = target.dataset.id;
                const empleadoNombre = target.dataset.nombre;
                const fechaInicio = document.getElementById('fechaInicio')?.value || '';
                const fechaFin = document.getElementById('fechaFin')?.value || '';

                console.log('Datos del botón - ID:', empleadoId, 'Nombre:', empleadoNombre);

                if (!fechaInicio || !fechaFin) {
                    alert('Selecciona un rango de fechas para ver los detalles de empleado.');
                    return;
                }

                cargarDetalleEmpleado(empleadoId, empleadoNombre, fechaInicio, fechaFin);
            }
        });
    }

    const modal = document.getElementById('reportes-detalle');
    const btnCerrar = document.getElementById('reportes-detalle-close');
    const modalContenido = document.getElementById('reportes-detalle-contenido');

    if (btnCerrar) {
        btnCerrar.addEventListener('click', () => {
            modal?.classList.remove('show');
        });
    }

    if (modal && modalContenido) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.classList.remove('show');
            }
        });
    }
}

async function loadPage(pageName, element) {
    const container = document.getElementById('content-area');
    const dynamicCard = document.getElementById('dynamic-card');
    
    container.classList.add('fade-out');
    
    try {
        const response = await fetch(`./screens/${pageName}.html`);
        const html = await response.text();
        
        setTimeout(() => {
            dynamicCard.innerHTML = html;
            container.classList.remove('fade-out');
            console.log("loadPage loaded", pageName);
            
            document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
            if(element) element.classList.add('active');

            if (pageName === 'empleados') {
                inicializarEmpleados();
            }

            if (pageName === 'registros') {
                inicializarRegistros();
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

        }, 300);
    } catch (e) {
        dynamicCard.innerHTML = "<h1>Error</h1><p>No se pudo cargar la vista.</p>";
    }
}

// Carga inicial
document.addEventListener("DOMContentLoaded", () => {
    loadPage('dashboard', document.querySelector('.sidebar a'));
});
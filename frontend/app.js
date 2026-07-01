const API_URL = `http://${window.location.hostname}:8000`; // Cambia el puerto si tu backend está en otro puerto
let empleadosCache = [];
let ultimoReporteData = [];

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
    if (!selectEmpleado) return;

    selectEmpleado.innerHTML = `<option value="">Selecciona un empleado...</option>`;
    empleadosCache.forEach(emp => {
        const label = `${emp.id} - ${emp.nombre} (${emp.total_horas.toFixed(2)} hrs)`;
        selectEmpleado.innerHTML += `<option value="${emp.id}">${label}</option>`;
    });
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
            alert('No se pudo importar el archivo de configuración. Asegúrate de que sea un JSON válido.');
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
        alert('Selecciona un rango de fechas antes de filtrar.');
        return;
    }

    if (new Date(fechaInicio) > new Date(fechaFin)) {
        alert('La fecha de inicio no puede ser mayor que la fecha de fin.');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/empleados?all=true&fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`);
        if (!response.ok) {
            throw new Error(`Error al cargar el reporte (${response.status})`);
        }

        const empleados = await response.json();
        ultimoReporteData = Array.isArray(empleados) ? empleados : [];

        if (!ultimoReporteData.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="reportes-empty">No se encontraron registros en el rango seleccionado.</td>
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
            tbody.innerHTML += `
                <tr>
                    <td>${emp.nombre}</td>
                    <td>${emp.id}</td>
                    <td>${(Number(emp.total_horas) || 0).toFixed(2)} hrs</td>
                    <td>${emp.salidas_temprano}</td>
                    <td>${emp.salidas_temprano > 0 ? 'Revisar' : 'OK'}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Error al cargar el reporte:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="reportes-empty">No se pudo cargar el reporte. Revisa la conexión con el backend.</td>
            </tr>
        `;
    }
}

function descargarReporteCSV() {
    if (!ultimoReporteData.length) {
        alert('No hay datos de reporte disponibles para exportar.');
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
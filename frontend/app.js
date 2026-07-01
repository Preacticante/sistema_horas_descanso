const API_URL = `http://${window.location.hostname}:8000`; // Cambia el puerto si tu backend está en otro puerto
let empleadosCache = [];

async function cargarEmpleados(ids = null) {
    const tabla = document.getElementById("tabla-empleados");
    if (!tabla) return;

    const query = ids ? `?ids=${encodeURIComponent(ids)}` : "";
    tabla.innerHTML = `
        <tr>
            <td colspan="5" style="padding:15px; text-align:center;">Cargando empleados...</td>
        </tr>
    `;

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
                    <td colspan="5" style="text-align: center;">No se encontraron empleados.</td>
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
                    <td>${emp.llegadas_tarde}</td>
                    <td>${emp.salidas_temprano}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error("Error al conectar con la API:", error);
        tabla.innerHTML = `
            <tr>
                <td colspan="5" style="color: red; text-align: center; font-weight: bold;">Error de conexión: Asegúrate de que el backend esté encendido.</td>
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
    const diaCheckboxes = Array.from(document.querySelectorAll("input[name='reg-dias']:checked"));
    if (!selectEmpleado || !inputHoras) return;

    const numeroEmpleado = parseInt(selectEmpleado.value, 10);
    const cantidadHoras = parseFloat(inputHoras.value);
    const diasSeleccionados = diaCheckboxes.map(checkbox => checkbox.value);

    if (Number.isNaN(numeroEmpleado) || Number.isNaN(cantidadHoras) || cantidadHoras <= 0) {
        alert("Selecciona un empleado válido e ingresa una cantidad de horas mayor a cero.");
        return;
    }

    if (!diasSeleccionados.length) {
        alert("Selecciona al menos un día de la semana para asignar las horas.");
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
        mostrarHorasActuales();
    } catch (error) {
        console.error("Error al registrar horas:", error);
        alert(`No se pudo guardar la asignación: ${error.message}`);
    }
}

function inicializarEmpleados() {
    const filtroIds = document.getElementById("filtro-ids");
    const btnFiltrar = document.getElementById("btn-filtrar-empleados");
    const btnReset = document.getElementById("btn-reset-empleados");
    const btnAbrirModal = document.getElementById("btn-abrir-modal");
    const btnCerrarModal = document.getElementById("btn-cerrar-modal");
    const formRegistro = document.getElementById("form-registrar-horas");

    if (btnFiltrar && btnReset && filtroIds) {
        btnFiltrar.addEventListener("click", () => {
            const ids = filtroIds.value.trim();
            cargarEmpleados(ids || null);
        });

        btnReset.addEventListener("click", () => {
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

    cargarEmpleadosParaRegistro();
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
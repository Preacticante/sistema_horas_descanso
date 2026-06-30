const API_URL = "http://172.16.6.86:8000";

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
            throw new Error("No se pudo obtener la lista de empleados");
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

async function cargarEmpleadosParaRegistro() {
    try {
        const respuesta = await fetch(`${API_URL}/api/empleados?all=true`);
        if (!respuesta.ok) {
            throw new Error("No se pudo cargar la lista de empleados para registrar horas");
        }

        const empleados = await respuesta.json();
        empleadosCache = Array.isArray(empleados) ? empleados : [];
        actualizarSelectEmpleados();
    } catch (error) {
        console.error("Error al cargar empleados para registro:", error);
    }
}

function actualizarSelectEmpleados() {
    const selectEmpleado = document.getElementById("reg-emp");
    if (!selectEmpleado) return;

    selectEmpleado.innerHTML = `<option value="">Selecciona un empleado...</option>`;
    empleadosCache.forEach(emp => {
        const label = `${emp.id} - ${emp.nombre} (${emp.total_horas.toFixed(2)} hrs)`;
        selectEmpleado.innerHTML += `<option value="${emp.id}">${label}</option>`;
    });
}

function mostrarHorasActuales() {
    const selectEmpleado = document.getElementById("reg-emp");
    const horasActuales = document.getElementById("registroHorasActuales");
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

    const selectEmpleado = document.getElementById("reg-emp");
    const inputHoras = document.getElementById("horas");
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
    const selectEmpleado = document.getElementById("reg-empleado");

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

    if (selectEmpleado) {
        selectEmpleado.addEventListener("change", mostrarHorasActuales);
    }

    cargarEmpleados();
}

function inicializarRegistros() {
    const registroForm = document.getElementById("registroForm");
    const selectEmpleado = document.getElementById("reg-emp");

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

        }, 300);
    } catch (e) {
        dynamicCard.innerHTML = "<h1>Error</h1><p>No se pudo cargar la vista.</p>";
    }
}

// Carga inicial
document.addEventListener("DOMContentLoaded", () => {
    loadPage('dashboard', document.querySelector('.sidebar a'));
});
const API_URL = "http://127.0.0.1:8000";
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
            console.log("loadPage loaded", pageName);
            
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
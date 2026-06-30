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
        tabla.innerHTML = "";

        if (!Array.isArray(empleados) || empleados.length === 0) {
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

function inicializarEmpleados() {
    const filtroIds = document.getElementById("filtro-ids");
    const btnFiltrar = document.getElementById("btn-filtrar-empleados");
    const btnReset = document.getElementById("btn-reset-empleados");

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

    cargarEmpleados();
}

async function loadPage(pageName, element) {
    const container = document.getElementById('content-area');
    const dynamicCard = document.getElementById('dynamic-card');
    
    // Animación
    container.classList.add('fade-out');
    
    try {
        const response = await fetch(`./screens/${pageName}.html`);
        const html = await response.text();
        
        setTimeout(() => {
            dynamicCard.innerHTML = html;
            container.classList.remove('fade-out');
            
            // UI Update
            document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
            if(element) element.classList.add('active');

            if (pageName === 'empleados') {
                inicializarEmpleados();
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
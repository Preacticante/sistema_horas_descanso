const API_URL = "http://172.16.6.86:8000";

function aplicarCambiosVisualesLocal(empleados) {
    try {
        const raw = localStorage.getItem('empleados_visual_changes');
        if (!raw) return empleados;
        const parsed = JSON.parse(raw);
        const deleted = new Set(parsed.deleted || []);
        const edited = parsed.edited || {};
        const added = parsed.added || [];
        const result = empleados
            .filter(emp => !deleted.has(String(emp.id)))
            .map(emp => {
                const e = edited[String(emp.id)];
                return e ? { ...emp, ...e } : emp;
            })
            .concat(added || []);
        return result;
    } catch (e) {
        console.warn('No se pudieron aplicar cambios visuales locales:', e);
        return empleados;
    }
}

async function obtenerDatosDashboard() {
    const tablaBody = document.querySelector("#dashboard-empleados-table tbody");

    try {
        // Cargamos KPIs del dashboard resumen
        const resumenResp = await fetch(`${API_URL}/api/dashboard-resumen`);
        if (resumenResp.ok) {
            const resumen = await resumenResp.json();
            document.getElementById("kpi-total").textContent = `${resumen.total_horas.toFixed(2)} hrs`;
            document.getElementById("kpi-pendientes").textContent = resumen.empleados_pendientes;
            document.getElementById("kpi-aprobadas").textContent = resumen.empleados_aprobadas;
            document.getElementById("kpi-eficiencia").textContent = `${resumen.eficiencia.toFixed(2)}%`;
        }

        // Hacemos la petición a la ruta de empleados con all=true
        const respuesta = await fetch(`${API_URL}/api/empleados?all=true`);
        
        if (!respuesta.ok) {
            throw new Error("No se pudo obtener la lista de empleados");
        }

        let empleados = await respuesta.json();
        empleados = aplicarCambiosVisualesLocal(Array.isArray(empleados) ? empleados : []);
        
        // Limpiamos la tabla (quitamos el mensaje de "Cargando datos...")
        tablaBody.innerHTML = "";

        // Si la base de datos está vacía, mostramos un mensaje
        if (empleados.length === 0) {
            tablaBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 16px;">No hay empleados registrados en el sistema.</td>
                </tr>
            `;
            return;
        }

        // Recorremos cada empleado y creamos su fila dinámicamente
        empleados.forEach(emp => {
            const colorHoras = emp.total_horas >= 0 ? "#124416" : "#c0392b";
            
            tablaBody.innerHTML += `
                <tr>
                    <td>${emp.id}</td>
                    <td>${emp.nombre}</td>
                    <td style="color: ${colorHoras}; font-weight: bold;">${(emp.total_horas || 0).toFixed(2)} hrs</td>
                    <td>${emp.salidas_temprano || 0}</td>
                </tr>
            `;
        });

    } catch (error) {
        console.error("Error al conectar con la API:", error);
        tablaBody.innerHTML = `
            <tr>
                <td colspan="5" style="color: red; text-align: center; font-weight: bold; padding: 16px;">
                    Error de conexión: Asegúrate de que el backend de Python esté encendido.
                </td>
            </tr>
        `;
    }
}

// Escuchamos cuando la pantalla termine de cargar para ejecutar la función
document.addEventListener("DOMContentLoaded", obtenerDatosDashboard);
const API_URL = "http://127.0.0.1:8000";

async function obtenerDatosDashboard() {
    const tabla = document.getElementById("tabla-empleados");

    try {
        // Hacemos la petición a la nueva ruta real del Backend
        const respuesta = await fetch(`${API_URL}/api/empleados`);
        
        if (!respuesta.ok) {
            throw new Error("No se pudo obtener la lista de empleados");
        }

        const empleados = await respuesta.json();
        
        // Limpiamos la tabla (quitamos el mensaje de "Cargando datos...")
        tabla.innerHTML = "";

        // Si la base de datos está vacía, mostramos una alerta sutil
        if (empleados.length === 0) {
            tabla.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center;">No hay empleados registrados en el sistema.</td>
                </tr>
            `;
            return;
        }

        // Recorremos cada empleado y creamos su fila dinámicamente con etiquetas reales
        empleados.forEach(emp => {
            // Ponemos el saldo en verde si es positivo, o rojo si es menor o igual a cero
            const colorSaldo = emp.saldo_horas > 0 ? "#124416" : "#c0392b";
            
            tabla.innerHTML += `
                <tr>
                    <td>${emp.id}</td>
                    <td>${emp.nombre}</td>
                    <td><strong>${emp.numero_empleado}</strong></td>
                    <td style="color: ${colorSaldo}; font-weight: bold;">${emp.saldo_horas} hrs</td>
                </tr>
            `;
        });

    } catch (error) {
        console.error("Error al conectar con la API:", error);
        tabla.innerHTML = `
            <tr>
                <td colspan="4" style="color: red; text-align: center; font-weight: bold;">
                    Error de conexión: Asegúrate de que el backend de Python esté encendido.
                </td>
            </tr>
        `;
    }
}

// Escuchamos cuando la pantalla termine de cargar para ejecutar la función
document.addEventListener("DOMContentLoaded", obtenerDatosDashboard);
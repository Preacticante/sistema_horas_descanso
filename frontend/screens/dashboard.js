const API_URL = "http://127.0.0.1:8000";

async function obtenerDatosDashboard() {
    try {
        // Hacemos la petición a tu FastAPI en segundo plano
        const respuesta = await fetch(`${API_URL}/`);
        const datos = await respuesta.json();
        
        // Colocamos un renglón real usando los datos recibidos
        const tabla = document.getElementById("tabla-empleados");
        tabla.innerHTML = `
            <tr>
                <td>1</td>
                <td>Empleado de Prueba (Conectado)</td>
                <td>EMP001</td>
                <td style="color: #124416; font-weight: bold;">${datos.mensaje}</td>
            </tr>
        `;
    } catch (error) {
        console.error("Error al conectar con la API:", error);
        document.getElementById("tabla-empleados").innerHTML = `
            <tr>
                <td colspan="4" style="color: red; text-align: center; font-weight: bold;">
                    Error de conexión: Enciende el backend con uvicorn.
                </td>
            </tr>
        `;
    }
}

// Escuchamos cuando la pantalla termine de cargar para ejecutar la función
document.addEventListener("DOMContentLoaded", obtenerDatosDashboard);
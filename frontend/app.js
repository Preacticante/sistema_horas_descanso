// --- Contenido de las pantallas (SPA) ---
const pages = {
    'perfil': `
        <div class="card">
            <h1>Perfil de Usuario</h1>
            <form id="profile-form">
                <div style="margin-bottom: 20px;">
                    <label>Nombre Completo</label>
                    <input type="text" value="Alexis Hernández" style="width: 100%; padding: 10px; margin-top: 5px; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: white;">
                </div>
                <div style="margin-bottom: 20px;">
                    <label>Correo Institucional</label>
                    <input type="email" value="alex.hernandez@upq.edu.mx" style="width: 100%; padding: 10px; margin-top: 5px; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: white;">
                </div>
                <div style="margin-bottom: 20px;">
                    <label>Horario Preferencial</label>
                    <select style="width: 100%; padding: 10px; margin-top: 5px; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: white;">
                        <option>Matutino</option>
                        <option>Vespertino</option>
                    </select>
                </div>
                <button type="button" class="btn" onclick="alert('Datos guardados')">Actualizar Perfil</button>
            </form>
        </div>`, 
    dashboard: `
        <div class="card">
            <h1>Bienvenido, Alex</h1>
            <p>Estado actual de tus horas extra.</p>
            <div style="font-size: 2rem; font-weight: 700; color: var(--primary-color); margin-top: 10px;">+8.5 Horas</div>
        </div>`,
    registro: `
        <div class="card">
            <h1>Nuevo Registro</h1>
            <form onsubmit="event.preventDefault(); alert('Guardado exitosamente');">
                <div class="form-group">
                    <label>Horas:</label>
                    <input type="number" required placeholder="Ej: 2.5">
                </div>
                <button class="btn" style="margin-top:1rem;">Registrar</button>
            </form>
        </div>`,
    config: `
        <div class="card">
            <h1>Configuración</h1>
            <p>Opciones generales del sistema.</p>
        </div>`
};

// --- Función para cargar páginas dinámicamente ---
function loadPage(page) {
    const contentArea = document.getElementById('content-area');
    if (contentArea) {
        contentArea.innerHTML = pages[page] || '<h1>Página no encontrada</h1>';
    }
    
    // Resaltar botón activo en sidebar
    document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
    const btn = document.getElementById('btn-' + page);
    if (btn) btn.classList.add('active');
}

// Añade esto a tu función loadPage para un efecto "teclado" o "carga"
function loadPage(page) {
    const contentArea = document.getElementById('content-area');
    contentArea.style.opacity = '0';
    
    setTimeout(() => {
        contentArea.innerHTML = pages[page];
        contentArea.style.opacity = '1';
        // Agrega un pequeño log estilo consola
        console.log(`[SYSTEM] Loaded module: ${page}`);
    }, 200);
}
// --- Función para cerrar sesión ---
function cerrarSesion() {
    localStorage.removeItem("isAuth");
    // Al ser un link href="login.html", la redirección ocurre automáticamente
}
function loadPage(page) {
    const contentArea = document.getElementById('content-area');
    
    // 1. Aplicamos el efecto de salida
    contentArea.classList.add('fade-out');
    
    // 2. Esperamos a que la animación termine (300ms) para cambiar el contenido
    setTimeout(() => {
        contentArea.innerHTML = pages[page] || '<h1>Página no encontrada</h1>';
        
        // 3. Aplicamos el efecto de entrada
        contentArea.classList.remove('fade-out');
        
        // Resaltar botón activo
        document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
        document.getElementById('btn-' + page)?.classList.add('active');
    }, 20);
}

// --- Inicialización ---
document.addEventListener("DOMContentLoaded", () => {
    // Si estamos en index.html, cargamos el dashboard
    if (document.getElementById('content-area')) {
        loadPage('dashboard');
    }

    // Si estamos en login.html, manejamos el formulario
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", (e) => {
            e.preventDefault();
            localStorage.setItem("isAuth", "true");
            window.location.href = "index.html";
        });
    }
});
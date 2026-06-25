document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");

    // Validamos si estamos parados en la pantalla de Login (index.html)
    if (loginForm) {
        loginForm.addEventListener("submit", (e) => {
            e.preventDefault(); // Evita que la página se recargue de golpe

            // Aquí capturamos los datos por si los necesitas en el futuro
            const usuario = document.getElementById("username").value;
            const contrasena = document.getElementById("password").value;

            console.log("Intentando iniciar sesión con:", usuario);

            // ¡La redirección mágica! Como estamos en la raíz, entramos a la carpeta screens
            window.location.href = "screens/dashboard.html";
        });
    }
});
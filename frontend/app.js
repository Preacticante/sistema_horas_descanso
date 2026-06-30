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
        }, 300);
    } catch (e) {
        dynamicCard.innerHTML = "<h1>Error</h1><p>No se pudo cargar la vista.</p>";
    }
}

// Carga inicial
document.addEventListener("DOMContentLoaded", () => {
    loadPage('dashboard', document.querySelector('.sidebar a'));
});
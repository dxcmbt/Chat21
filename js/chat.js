const socket = io();

// =====================================================
//  SISTEMA DE AUDIO — notificaciones
// =====================================================
const _sfx = {
    entrar:  new Audio('/audio/entrar.mp3'),
    irse:    new Audio('/audio/irse.mp3'),
    mensaje: new Audio('/audio/mensaje.mp3')
};
// Precargar y establecer volumen
Object.values(_sfx).forEach(a => { a.preload = 'auto'; a.volume = 0.6; });

function reproducir(sonido) {
    const audio = _sfx[sonido];
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {}); // silencia error de autoplay
}

const form           = document.getElementById('form-container');
const input          = document.getElementById('input-mensaje');
const chatContainer  = document.getElementById('chat-container');
const salasList      = document.getElementById('salas-list');
const salaNombreTexto = document.getElementById('sala-nombre-texto');
const crearSalaForm  = document.getElementById('crear-sala-form');
const nuevaSalaInput = document.getElementById('nueva-sala-input');
const emojiButton    = document.getElementById('emoji-button');
const emojiPanel     = document.getElementById('emoji-panel');
const imageButton    = document.getElementById('image-button');
const audioButton    = document.getElementById('audio-button');
const imageInput     = document.getElementById('image-input');
const audioInput     = document.getElementById('audio-input');
const membersList    = document.getElementById('members-list');
const membersCount   = document.getElementById('members-count');

let miNombre  = sessionStorage.getItem('usuarioChat') || '';
let salaActual = null;
let miembrosActuales = [];

// Show current user in sidebar
function mostrarUsuarioActual() {
    const existing = document.getElementById('user-info-bar');
    if (existing) existing.remove();
    if (!miNombre) return;

    const bar = document.createElement('div');
    bar.id = 'user-info-bar';
    bar.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border-top: 1px solid var(--separator);
        background: var(--bg-sidebar);
        flex-shrink: 0;
    `;

    const avatar = document.createElement('div');
    avatar.style.cssText = `
        width: 28px; height: 28px;
        border-radius: 50%;
        background: linear-gradient(135deg, #007aff, #5ac8fa);
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0;
    `;
    avatar.textContent = miNombre.charAt(0).toUpperCase();

    const nameEl = document.createElement('span');
    nameEl.style.cssText = 'font-size: 13px; font-weight: 600; color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    nameEl.textContent = miNombre;

    const logoutBtn = document.createElement('button');
    logoutBtn.title = 'Cerrar sesión';
    logoutBtn.style.cssText = `
        width: 26px; height: 26px;
        border-radius: 50%; border: none;
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.2s;
        flex-shrink: 0;
    `;
    logoutBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
    logoutBtn.onmouseover = () => { logoutBtn.style.background = 'rgba(255,59,48,0.12)'; logoutBtn.style.color = '#ff3b30'; };
    logoutBtn.onmouseout  = () => { logoutBtn.style.background = 'transparent'; logoutBtn.style.color = 'var(--text-secondary)'; };
    logoutBtn.addEventListener('click', () => {
        sessionStorage.clear();
        window.location.href = '/login';
    });

    bar.appendChild(avatar);
    bar.appendChild(nameEl);
    bar.appendChild(logoutBtn);

    const sidebar = document.getElementById('sidebar');
    sidebar.appendChild(bar);
}

// Función para cargar y mostrar las salas
function cargarSalas() {
    socket.emit('obtener-salas');
}

// Recibir lista de salas
socket.on('lista-salas', (salas) => {
    salasList.innerHTML = '';
    salas.forEach(sala => {
        const item = document.createElement('div');
        item.className = 'sala-item';

        const btn = document.createElement('button');
        btn.textContent = sala.nombre || sala.id || 'Sala';
        btn.className = 'sala-btn';
        if (sala.id === salaActual) btn.classList.add('active');
        btn.addEventListener('click', () => unirseASala(sala.id, sala.nombre || sala.id));

        const btnEliminar = document.createElement('button');
        btnEliminar.className = 'eliminar-sala-btn';
        btnEliminar.title = 'Eliminar sala';
        btnEliminar.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
        btnEliminar.addEventListener('click', (e) => {
            e.stopPropagation();
            eliminarSala(sala.id);
        });

        item.appendChild(btn);
        item.appendChild(btnEliminar);
        salasList.appendChild(item);
    });
});

// Unirse a una sala
function unirseASala(salaId, nombre) {
    salaActual = salaId;
    salaNombreTexto.textContent = nombre || salaId;
    chatContainer.innerHTML = '';
    socket.emit('unirse-sala', { salaId, uid: miNombre });
    socket.emit('cargar-mensajes', salaId);
    input.focus();
    cargarSalas();
}

// Eliminar una sala
function eliminarSala(salaId) {
    if (confirm(`¿Estás seguro de que quieres eliminar la sala "${salaId}"? Esto no se puede deshacer.`)) {
        socket.emit('eliminar-sala', { salaId, uid: miNombre });
        if (salaActual === salaId) {
            salaActual = null;
            chatContainer.innerHTML = '';
            salaNombreTexto.textContent = 'Bienvenido';
        }
    }
}

// Crear una nueva sala
crearSalaForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nombreSala = nuevaSalaInput.value.trim();
    if (nombreSala) {
        socket.emit('crear-sala', { nombre: nombreSala, uid: miNombre });
        nuevaSalaInput.value = '';
        setTimeout(() => cargarSalas(), 300);
    }
});

// Conectar y obtener usuario
function iniciarChat(nombre) {
    miNombre = nombre;
    sessionStorage.setItem('usuarioChat', nombre);
    mostrarUsuarioActual();
    cargarSalas();
    // Agregar al usuario actual como primer miembro visible
    agregarMiembro(nombre);
}

// Obtener nombre del usuario
if (miNombre) {
    iniciarChat(miNombre);
} else {
    // No hay sesión — redirigir al login
    window.location.href = '/login';
}

function enviarMensajeTexto(texto) {
    if (!texto || !salaActual) return;
    socket.emit('enviar-mensaje', {
        salaId: salaActual,
        uid: miNombre,
        tipo: 'texto',
        texto,
        timestamp: Date.now()
    });
}

function enviarMensajeEmoji(emoji) {
    if (!emoji || !salaActual) return;
    socket.emit('enviar-mensaje', {
        salaId: salaActual,
        uid: miNombre,
        tipo: 'emoji',
        texto: emoji,
        timestamp: Date.now()
    });
}

function enviarMensajeArchivo(tipo, url, nombreArchivo) {
    if (!url || !salaActual) return;
    socket.emit('enviar-mensaje', {
        salaId: salaActual,
        uid: miNombre,
        tipo,
        url,
        texto: nombreArchivo || '',
        nombreArchivo,
        timestamp: Date.now()
    });
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value && salaActual) {
        enviarMensajeTexto(input.value.trim());
        reproducir('mensaje'); // sonido al ENVIAR
        input.value = '';
    }
});

emojiButton.addEventListener('click', () => {
    emojiPanel.classList.toggle('hidden');
});

emojiPanel.addEventListener('click', (event) => {
    const button = event.target.closest('.emoji');
    if (button) {
        enviarMensajeEmoji(button.textContent);
        emojiPanel.classList.add('hidden');
    }
});

imageButton.addEventListener('click', () => {
    imageInput.click();
});

audioButton.addEventListener('click', () => {
    audioInput.click();
});

imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        enviarMensajeArchivo('imagen', reader.result, file.name);
        imageInput.value = '';
    };
    reader.readAsDataURL(file);
});

audioInput.addEventListener('change', () => {
    const file = audioInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        enviarMensajeArchivo('audio', reader.result, file.name);
        audioInput.value = '';
    };
    reader.readAsDataURL(file);
});

function renderMensaje(data) {
    const div = document.createElement('div');
    div.classList.add('mensaje');
    const usuario = data.uid || data.usuario || 'Usuario';
    if (usuario === miNombre) {
        div.classList.add('propio');
    }

    const autor = document.createElement('span');
    autor.className = 'autor';
    autor.textContent = usuario;
    div.appendChild(autor);

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (data.tipo === 'imagen' && data.url) {
        const img = document.createElement('img');
        img.src = data.url;
        img.alt = data.nombreArchivo || 'Imagen enviada';
        img.className = 'mensaje-imagen';
        bubble.appendChild(img);
    } else if (data.tipo === 'audio' && data.url) {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = data.url;
        audio.className = 'mensaje-audio';
        bubble.appendChild(audio);
        if (data.nombreArchivo) {
            const nombre = document.createElement('div');
            nombre.className = 'archivo-nombre';
            nombre.textContent = data.nombreArchivo;
            bubble.appendChild(nombre);
        }
    } else {
        const texto = document.createElement('div');
        texto.className = 'mensaje-texto';
        texto.textContent = data.texto || '';
        bubble.appendChild(texto);
    }

    div.appendChild(bubble);

    const hora = document.createElement('span');
    hora.className = 'hora';
    const ts = data.timestamp ? new Date(data.timestamp) : new Date();
    hora.textContent = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.appendChild(hora);

    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

socket.on('nuevo-mensaje', (data) => {
    renderMensaje(data);
    // Sonido al RECIBIR (solo si es de otro)
    if (data.uid !== miNombre) {
        reproducir('mensaje');
    }
});

socket.on('mensajes-cargados', (mensajes) => {
    chatContainer.innerHTML = '';
    mensajes.forEach(m => renderMensaje(m));
});

// Mensajes del sistema
socket.on('mensaje_sistema', (msg) => {
    const div = document.createElement('div');
    div.classList.add('mensaje', 'sistema');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg;
    div.appendChild(bubble);
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
});

socket.on('usuario-conectado', (info) => {
    const div = document.createElement('div');
    div.classList.add('mensaje', 'sistema');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = `${info.uid} se unió a la sala`;
    div.appendChild(bubble);
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    // Sonido al ENTRAR (solo si es otro usuario)
    if (info.uid !== miNombre) {
        reproducir('entrar');
    }
    // Add member to panel
    agregarMiembro(info.uid);
});

socket.on('usuario-desconectado', (info) => {
    if (!salaActual) return;
    // Mostrar mensaje de sistema
    const div = document.createElement('div');
    div.classList.add('mensaje', 'sistema');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = `${info.uid || info.id || 'Alguien'} salió de la sala`;
    div.appendChild(bubble);
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    // Sonido al SALIR
    reproducir('irse');
    // Quitar del panel de miembros
    miembrosActuales = miembrosActuales.filter(u => u !== (info.uid || info.id));
    renderizarMiembros();
});

// Members panel
function agregarMiembro(uid) {
    if (miembrosActuales.includes(uid)) return;
    miembrosActuales.push(uid);
    renderizarMiembros();
}

function renderizarMiembros() {
    membersList.innerHTML = '';
    membersCount.textContent = miembrosActuales.length;
    miembrosActuales.forEach(uid => {
        const item = document.createElement('div');
        item.className = 'member-item';

        const avatar = document.createElement('div');
        avatar.className = 'member-avatar';
        avatar.textContent = uid.charAt(0).toUpperCase();

        const name = document.createElement('span');
        name.className = 'member-name';
        name.textContent = uid;

        const dot = document.createElement('span');
        dot.className = 'member-online-dot';

        item.appendChild(avatar);
        item.appendChild(name);
        item.appendChild(dot);
        membersList.appendChild(item);
    });
}

// Manejo de errores
socket.on('connect_error', (error) => {
    console.error('Error de conexión:', error);
    Swal.fire({
        icon: 'error',
        title: 'Error de conexión',
        text: 'No se pudo conectar al servidor'
    });
});

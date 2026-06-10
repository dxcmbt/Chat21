import { db } from './firebaseInit.js';
import {
    collection, addDoc, onSnapshot, query, orderBy, limit,
    doc, updateDoc, arrayUnion, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =====================================================
//  SISTEMA DE AUDIO — notificaciones
// =====================================================
const _sfx = {
    entrar:  new Audio('audio/entrar.mp3'),
    irse:    new Audio('audio/irse.mp3'),
    mensaje: new Audio('audio/mensaje.mp3')
};
Object.values(_sfx).forEach(a => { a.preload = 'auto'; a.volume = 0.6; });

function reproducir(sonido) {
    const audio = _sfx[sonido];
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

const form            = document.getElementById('form-container');
const input           = document.getElementById('input-mensaje');
const chatContainer   = document.getElementById('chat-container');
const salasList       = document.getElementById('salas-list');
const salaNombreTexto = document.getElementById('sala-nombre-texto');
const crearSalaForm   = document.getElementById('crear-sala-form');
const nuevaSalaInput  = document.getElementById('nueva-sala-input');
const emojiButton     = document.getElementById('emoji-button');
const emojiPanel      = document.getElementById('emoji-panel');
const imageButton     = document.getElementById('image-button');
const audioButton     = document.getElementById('audio-button');
const imageInput      = document.getElementById('image-input');
const audioInput      = document.getElementById('audio-input');
const membersList     = document.getElementById('members-list');
const membersCount    = document.getElementById('members-count');

let miNombre          = sessionStorage.getItem('usuarioChat') || '';
let salaActual        = null;
let miembrosActuales  = [];
let unsubscribeMensajes = null;
let unsubscribeSalas    = null;
let mensajesPrevios   = 0;

// ─── Mostrar usuario actual en sidebar ──────────────
function mostrarUsuarioActual() {
    const existing = document.getElementById('user-info-bar');
    if (existing) existing.remove();
    if (!miNombre) return;

    const bar = document.createElement('div');
    bar.id = 'user-info-bar';
    bar.style.cssText = `
        display: flex; align-items: center; gap: 8px;
        padding: 10px 16px; border-top: 1px solid var(--separator);
        background: var(--bg-sidebar); flex-shrink: 0;
    `;

    const avatar = document.createElement('div');
    avatar.style.cssText = `
        width: 28px; height: 28px; border-radius: 50%;
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
        width: 26px; height: 26px; border-radius: 50%; border: none;
        background: transparent; color: var(--text-secondary); cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.2s; flex-shrink: 0;
    `;
    logoutBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
    logoutBtn.onmouseover = () => { logoutBtn.style.background = 'rgba(255,59,48,0.12)'; logoutBtn.style.color = '#ff3b30'; };
    logoutBtn.onmouseout  = () => { logoutBtn.style.background = 'transparent'; logoutBtn.style.color = 'var(--text-secondary)'; };
    logoutBtn.addEventListener('click', () => {
        sessionStorage.clear();
        window.location.href = 'login.html';
    });

    bar.appendChild(avatar);
    bar.appendChild(nameEl);
    bar.appendChild(logoutBtn);
    document.getElementById('sidebar').appendChild(bar);
}

// ─── Salas: listener en tiempo real ─────────────────
function cargarSalas() {
    if (unsubscribeSalas) unsubscribeSalas();
    unsubscribeSalas = onSnapshot(collection(db, 'salas'), (snapshot) => {
        salasList.innerHTML = '';
        snapshot.forEach(docSnap => {
            const sala = { id: docSnap.id, ...docSnap.data() };
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
                eliminarSala(sala.id, sala.nombre || sala.id);
            });

            item.appendChild(btn);
            item.appendChild(btnEliminar);
            salasList.appendChild(item);
        });
    }, (err) => {
        console.error('Error cargando salas:', err);
    });
}

// ─── Unirse a una sala ───────────────────────────────
async function unirseASala(salaId, nombre) {
    salaActual = salaId;
    salaNombreTexto.textContent = nombre || salaId;
    chatContainer.innerHTML = '';
    miembrosActuales = [];
    mensajesPrevios  = 0;
    renderizarMiembros();
    agregarMiembro(miNombre);

    try {
        await updateDoc(doc(db, 'salas', salaId), {
            miembros: arrayUnion(miNombre)
        });
    } catch (e) {}

    // Mensajes en tiempo real
    if (unsubscribeMensajes) unsubscribeMensajes();
    const q = query(
        collection(db, 'salas', salaId, 'mensajes'),
        orderBy('timestamp', 'asc'),
        limit(100)
    );
    unsubscribeMensajes = onSnapshot(q, (snapshot) => {
        const total = snapshot.size;
        if (total > mensajesPrevios && mensajesPrevios > 0) {
            // Hay mensaje nuevo
            const cambios = snapshot.docChanges();
            cambios.forEach(change => {
                if (change.type === 'added') {
                    const data = { id: change.doc.id, ...change.doc.data() };
                    if (data.uid !== miNombre) reproducir('mensaje');
                }
            });
        }
        mensajesPrevios = total;

        chatContainer.innerHTML = '';
        snapshot.forEach(docSnap => {
            renderMensaje({ id: docSnap.id, ...docSnap.data() });
        });
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, (err) => {
        console.error('Error en mensajes:', err);
    });

    input.focus();
}

// ─── Eliminar sala ───────────────────────────────────
async function eliminarSala(salaId, nombre) {
    if (confirm(`¿Eliminar la sala "${nombre}"? Esto no se puede deshacer.`)) {
        try {
            await deleteDoc(doc(db, 'salas', salaId));
            if (salaActual === salaId) {
                salaActual = null;
                chatContainer.innerHTML = '';
                salaNombreTexto.textContent = 'Bienvenido';
                if (unsubscribeMensajes) { unsubscribeMensajes(); unsubscribeMensajes = null; }
            }
        } catch (e) { console.error('Error eliminando sala:', e); }
    }
}

// ─── Crear sala ──────────────────────────────────────
crearSalaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombreSala = nuevaSalaInput.value.trim();
    if (!nombreSala) return;
    try {
        await addDoc(collection(db, 'salas'), {
            nombre: nombreSala,
            creador: miNombre,
            fechaCreacion: serverTimestamp(),
            miembros: [miNombre]
        });
        nuevaSalaInput.value = '';
    } catch (err) {
        console.error('Error creando sala:', err);
        alert('No se pudo crear la sala. Revisa las reglas de Firestore.');
    }
});

// ─── Iniciar chat ────────────────────────────────────
function iniciarChat(nombre) {
    miNombre = nombre;
    sessionStorage.setItem('usuarioChat', nombre);
    mostrarUsuarioActual();
    cargarSalas();
    agregarMiembro(nombre);
}

if (miNombre) {
    iniciarChat(miNombre);
} else {
    window.location.href = 'login.html';
}

// ─── Enviar mensajes ─────────────────────────────────
async function enviarMensajeTexto(texto) {
    if (!texto || !salaActual) return;
    try {
        await addDoc(collection(db, 'salas', salaActual, 'mensajes'), {
            uid: miNombre,
            tipo: 'texto',
            texto,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error('Error enviando mensaje:', e);
        alert('No se pudo enviar el mensaje. Revisa las reglas de Firestore.');
    }
}

async function enviarMensajeEmoji(emoji) {
    if (!emoji || !salaActual) return;
    await addDoc(collection(db, 'salas', salaActual, 'mensajes'), {
        uid: miNombre, tipo: 'emoji', texto: emoji, timestamp: serverTimestamp()
    });
}

async function enviarMensajeArchivo(tipo, url, nombreArchivo) {
    if (!url || !salaActual) return;
    await addDoc(collection(db, 'salas', salaActual, 'mensajes'), {
        uid: miNombre, tipo, url,
        texto: nombreArchivo || '',
        nombreArchivo,
        timestamp: serverTimestamp()
    });
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = input.value.trim();
    if (texto && salaActual) {
        input.value = '';
        await enviarMensajeTexto(texto);
        reproducir('mensaje');
    }
});

emojiButton.addEventListener('click', () => { emojiPanel.classList.toggle('hidden'); });

emojiPanel.addEventListener('click', (event) => {
    const button = event.target.closest('.emoji');
    if (button) {
        enviarMensajeEmoji(button.textContent);
        emojiPanel.classList.add('hidden');
    }
});

imageButton.addEventListener('click', () => { imageInput.click(); });
audioButton.addEventListener('click', () => { audioInput.click(); });

imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        await enviarMensajeArchivo('imagen', reader.result, file.name);
        imageInput.value = '';
    };
    reader.readAsDataURL(file);
});

audioInput.addEventListener('change', () => {
    const file = audioInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        await enviarMensajeArchivo('audio', reader.result, file.name);
        audioInput.value = '';
    };
    reader.readAsDataURL(file);
});

// ─── Renderizar mensajes ─────────────────────────────
function renderMensaje(data) {
    const div = document.createElement('div');
    div.classList.add('mensaje');
    const usuario = data.uid || data.usuario || 'Usuario';
    if (usuario === miNombre) div.classList.add('propio');

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
    const ts = data.timestamp?.toDate
        ? data.timestamp.toDate()
        : (data.timestamp ? new Date(data.timestamp) : new Date());
    hora.textContent = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.appendChild(hora);

    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ─── Panel de miembros ───────────────────────────────
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

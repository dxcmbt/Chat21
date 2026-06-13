import { auth, db } from './firebaseInit.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getDoc, doc, setDoc,
    collection, addDoc, onSnapshot,
    query, orderBy, limit,
    updateDoc, arrayUnion, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ─── ESTADO GLOBAL ───────────────────────────────────
let miNombre          = '';
let salaActual        = null;
let mensajesPrevios   = 0;
let unsubMensajes     = null;
let unsubSalas        = null;
let unsubSala         = null; // listener del doc de sala (para miembros)

// ══════════════════════════════════════════════════════
//  ROUTER DE VISTAS
// ══════════════════════════════════════════════════════
function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-' + name).classList.remove('hidden');
}

// ══════════════════════════════════════════════════════
//  DARK MODE
// ══════════════════════════════════════════════════════
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chat21-theme', theme);
    const sun  = document.getElementById('icon-sun');
    const moon = document.getElementById('icon-moon');
    if (sun && moon) {
        sun.style.display  = theme === 'dark' ? 'none'  : 'block';
        moon.style.display = theme === 'dark' ? 'block' : 'none';
    }
}
applyTheme(localStorage.getItem('chat21-theme') || 'light');

document.getElementById('dark-mode-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ══════════════════════════════════════════════════════
//  NAVEGACIÓN ENTRE VISTAS
// ══════════════════════════════════════════════════════
document.getElementById('ir-registro').addEventListener('click', (e) => {
    e.preventDefault();
    showView('registro');
});
document.getElementById('ir-login').addEventListener('click', (e) => {
    e.preventDefault();
    showView('login');
});
document.getElementById('members-toggle-btn').addEventListener('click', () => {
    document.getElementById('members-panel').classList.toggle('hidden');
});

// ══════════════════════════════════════════════════════
//  AUDIO
// ══════════════════════════════════════════════════════
const _sfx = {
    mensaje: new Audio('audio/mensaje.mp3'),
    entrar:  new Audio('audio/Unirse.mp3'),
    irse:    new Audio('audio/Salida.mp3')
};
Object.values(_sfx).forEach(a => { a.preload = 'auto'; a.volume = 0.6; });
function play(s) {
    const a = _sfx[s];
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
}

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════
function clearErrors(ids) {
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
}
function setError(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
}

// ══════════════════════════════════════════════════════
//  AUTH — LOGIN
// ══════════════════════════════════════════════════════
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(['login-email-error', 'login-password-error']);

    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-btn');

    if (!email)    { setError('login-email-error', 'Ingresa tu email'); return; }
    if (!password) { setError('login-password-error', 'Ingresa tu contraseña'); return; }

    btn.disabled    = true;
    btn.textContent = 'Iniciando sesión...';

    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const user = cred.user;

        let nombre = user.displayName || null;
        if (!nombre) {
            const snap = await getDoc(doc(db, 'usuarios', user.uid));
            if (snap.exists()) nombre = snap.data().nombre || null;
        }
        if (!nombre) nombre = email.split('@')[0];

        sessionStorage.setItem('usuarioChat', nombre);
        sessionStorage.setItem('uidUsuario', user.uid);
        iniciarChat(nombre);

    } catch (err) {
        btn.disabled    = false;
        btn.textContent = 'Iniciar sesión';
        const c = err.code;
        if (c === 'auth/user-not-found' || c === 'auth/invalid-credential' || c === 'auth/wrong-password') {
            setError('login-email-error', 'Email o contraseña incorrectos');
        } else if (c === 'auth/invalid-email') {
            setError('login-email-error', 'Email inválido');
        } else if (c === 'auth/too-many-requests') {
            setError('login-email-error', 'Demasiados intentos. Intenta más tarde');
        } else {
            console.error('Login error:', err);
            setError('login-email-error', 'Error: ' + err.message);
        }
    }
});

// ══════════════════════════════════════════════════════
//  AUTH — REGISTRO
// ══════════════════════════════════════════════════════
document.getElementById('registro-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errIds = ['reg-nombre-error','reg-email-error','reg-edad-error','reg-pais-error','reg-password-error','reg-password-confirm-error'];
    clearErrors(errIds);

    const nombre          = document.getElementById('reg-nombre').value.trim();
    const email           = document.getElementById('reg-email').value.trim();
    const edad            = parseInt(document.getElementById('reg-edad').value, 10);
    const pais            = document.getElementById('reg-pais').value.trim();
    const telefono        = document.getElementById('reg-telefono').value.trim();
    const password        = document.getElementById('reg-password').value;
    const passwordConfirm = document.getElementById('reg-password-confirm').value;
    const btn             = document.getElementById('registro-btn');

    if (!nombre || nombre.length < 3)           { setError('reg-nombre-error', 'Mínimo 3 caracteres'); return; }
    if (!email || !email.includes('@'))          { setError('reg-email-error', 'Email inválido'); return; }
    if (isNaN(edad) || edad < 17 || edad > 99)  { setError('reg-edad-error', 'Edad entre 17 y 99'); return; }
    if (!pais)                                   { setError('reg-pais-error', 'Ingresa tu país'); return; }
    if (password.length < 6)                     { setError('reg-password-error', 'Mínimo 6 caracteres'); return; }
    if (password !== passwordConfirm)            { setError('reg-password-confirm-error', 'Las contraseñas no coinciden'); return; }

    btn.disabled    = true;
    btn.textContent = 'Creando cuenta...';

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const user = cred.user;
        await updateProfile(user, { displayName: nombre });
        await setDoc(doc(db, 'usuarios', user.uid), {
            nombre, email, edad, pais, telefono,
            uid: user.uid,
            fechaRegistro: new Date().toISOString(),
            estado: 'activo'
        });

        sessionStorage.setItem('usuarioChat', nombre);
        sessionStorage.setItem('uidUsuario', user.uid);
        iniciarChat(nombre);

    } catch (err) {
        btn.disabled    = false;
        btn.textContent = 'Crear cuenta';
        const c = err.code;
        if (c === 'auth/email-already-in-use') {
            setError('reg-email-error', 'Este email ya está registrado');
        } else if (c === 'auth/weak-password') {
            setError('reg-password-error', 'Contraseña muy débil');
        } else if (c === 'auth/invalid-email') {
            setError('reg-email-error', 'Email inválido');
        } else {
            console.error('Registro error:', err);
            setError('reg-nombre-error', 'Error: ' + err.message);
        }
    }
});

// ══════════════════════════════════════════════════════
//  CHAT — INIT
// ══════════════════════════════════════════════════════
function iniciarChat(nombre) {
    miNombre = nombre;
    showView('chat');
    applyTheme(localStorage.getItem('chat21-theme') || 'light');
    mostrarUsuarioActual();
    cargarSalas();
}

function mostrarUsuarioActual() {
    document.getElementById('user-info-bar')?.remove();

    const bar = document.createElement('div');
    bar.id = 'user-info-bar';
    bar.style.cssText = `
        display:flex; align-items:center; gap:8px;
        padding:10px 16px; border-top:1px solid var(--separator);
        background:var(--bg-sidebar); flex-shrink:0;
    `;

    const avatar = document.createElement('div');
    avatar.style.cssText = `
        width:28px; height:28px; border-radius:50%;
        background:linear-gradient(135deg,#007aff,#5ac8fa);
        display:flex; align-items:center; justify-content:center;
        font-size:12px; font-weight:700; color:#fff; flex-shrink:0;
    `;
    avatar.textContent = miNombre.charAt(0).toUpperCase();

    const nameEl = document.createElement('span');
    nameEl.style.cssText = 'font-size:13px;font-weight:600;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    nameEl.textContent = miNombre;

    const logoutBtn = document.createElement('button');
    logoutBtn.title = 'Cerrar sesión';
    logoutBtn.style.cssText = `
        width:26px; height:26px; border-radius:50%; border:none;
        background:transparent; color:var(--text-secondary); cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        transition:all 0.2s; flex-shrink:0;
    `;
    logoutBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
    logoutBtn.onmouseover = () => { logoutBtn.style.background = 'rgba(255,59,48,0.12)'; logoutBtn.style.color = '#ff3b30'; };
    logoutBtn.onmouseout  = () => { logoutBtn.style.background = 'transparent'; logoutBtn.style.color = 'var(--text-secondary)'; };

    logoutBtn.addEventListener('click', async () => {
        if (unsubMensajes) { unsubMensajes(); unsubMensajes = null; }
        if (unsubSalas)    { unsubSalas();    unsubSalas    = null; }
        if (unsubSala)     { unsubSala();     unsubSala     = null; }
        miNombre = ''; salaActual = null;
        sessionStorage.clear();
        try { await signOut(auth); } catch (_) {}
        // Reset UI
        document.getElementById('chat-container').innerHTML = '';
        document.getElementById('sala-nombre-texto').textContent = 'Bienvenido';
        document.getElementById('salas-list').innerHTML = '';
        document.getElementById('members-list').innerHTML = '';
        document.getElementById('members-count').textContent = '0';
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('login-btn').disabled = false;
        document.getElementById('login-btn').textContent = 'Iniciar sesión';
        showView('login');
    });

    bar.append(avatar, nameEl, logoutBtn);
    document.getElementById('sidebar').appendChild(bar);
}

// ══════════════════════════════════════════════════════
//  CHAT — SALAS
// ══════════════════════════════════════════════════════
function cargarSalas() {
    if (unsubSalas) unsubSalas();
    unsubSalas = onSnapshot(collection(db, 'salas'), (snapshot) => {
        const list = document.getElementById('salas-list');
        list.innerHTML = '';
        snapshot.forEach(docSnap => {
            const sala = { id: docSnap.id, ...docSnap.data() };

            const item = document.createElement('div');
            item.className = 'sala-item';

            const btn = document.createElement('button');
            btn.textContent = sala.nombre || sala.id;
            btn.className = 'sala-btn' + (sala.id === salaActual ? ' active' : '');
            btn.addEventListener('click', () => unirseASala(sala.id, sala.nombre || sala.id));

            const delBtn = document.createElement('button');
            delBtn.className = 'eliminar-sala-btn';
            delBtn.title = 'Eliminar sala';
            delBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
            delBtn.addEventListener('click', (e) => { e.stopPropagation(); eliminarSala(sala.id, sala.nombre || sala.id); });

            item.append(btn, delBtn);
            list.appendChild(item);
        });
    }, err => console.error('Salas error:', err));
}

async function unirseASala(salaId, nombre) {
    salaActual = salaId;
    document.getElementById('sala-nombre-texto').textContent = nombre;
    document.getElementById('chat-container').innerHTML = '';
    mensajesPrevios = 0;

    // Agregar usuario a la sala en Firestore
    try { await updateDoc(doc(db, 'salas', salaId), { miembros: arrayUnion(miNombre) }); } catch (_) {}

    // ── Listener de miembros (sala doc en tiempo real) ──
    let miembrosAnteriores = null;
    if (unsubSala) unsubSala();
    unsubSala = onSnapshot(doc(db, 'salas', salaId), (snap) => {
        if (!snap.exists()) return;
        const miembros = snap.data().miembros || [];
        renderizarMiembros(miembros);

        // Detectar entradas y salidas para reproducir sonido
        if (miembrosAnteriores !== null) {
            const entraron = miembros.filter(m => !miembrosAnteriores.includes(m));
            const salieron = miembrosAnteriores.filter(m => !miembros.includes(m));
            // Solo reproducir si NO soy yo quien entró (ya que yo mismo acabo de unirme)
            entraron.forEach(m => { if (m !== miNombre) play('entrar'); });
            salieron.forEach(() => play('irse'));
        }
        miembrosAnteriores = [...miembros];
    }, err => console.error('Sala doc error:', err));

    // ── Listener de mensajes ─────────────────────────────
    if (unsubMensajes) unsubMensajes();
    const q = query(collection(db, 'salas', salaId, 'mensajes'), orderBy('timestamp', 'asc'), limit(100));
    unsubMensajes = onSnapshot(q, (snap) => {
        if (snap.size > mensajesPrevios && mensajesPrevios > 0) {
            snap.docChanges().forEach(ch => {
                if (ch.type === 'added' && ch.doc.data().uid !== miNombre) play('mensaje');
            });
        }
        mensajesPrevios = snap.size;
        const container = document.getElementById('chat-container');
        container.innerHTML = '';
        snap.forEach(d => renderMensaje({ id: d.id, ...d.data() }));
        container.scrollTop = container.scrollHeight;
    }, err => console.error('Mensajes error:', err));

    document.getElementById('input-mensaje').focus();
}

async function eliminarSala(salaId, nombre) {
    if (!confirm(`¿Eliminar la sala "${nombre}"?`)) return;
    try {
        await deleteDoc(doc(db, 'salas', salaId));
        if (salaActual === salaId) {
            salaActual = null;
            document.getElementById('chat-container').innerHTML = '';
            document.getElementById('sala-nombre-texto').textContent = 'Bienvenido';
            document.getElementById('members-list').innerHTML = '';
            document.getElementById('members-count').textContent = '0';
            if (unsubMensajes) { unsubMensajes(); unsubMensajes = null; }
            if (unsubSala)     { unsubSala();     unsubSala     = null; }
        }
    } catch (e) { console.error(e); }
}

document.getElementById('crear-sala-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('nueva-sala-input');
    const nombre = input.value.trim();
    if (!nombre) return;
    try {
        await addDoc(collection(db, 'salas'), {
            nombre,
            creador: miNombre,
            fechaCreacion: serverTimestamp(),
            miembros: [miNombre]
        });
        input.value = '';
    } catch (err) {
        console.error(err);
        alert('No se pudo crear la sala. Revisa las reglas de Firestore.');
    }
});

// ══════════════════════════════════════════════════════
//  CHAT — MENSAJES
// ══════════════════════════════════════════════════════
async function enviarMensaje(datos) {
    if (!salaActual) return;
    try {
        await addDoc(collection(db, 'salas', salaActual, 'mensajes'), {
            uid: miNombre,
            timestamp: serverTimestamp(),
            ...datos
        });
    } catch (e) {
        console.error('Error enviando mensaje:', e);
        alert('No se pudo enviar. Revisa las reglas de Firestore en Firebase Console.');
    }
}

// Enviar texto
document.getElementById('form-container').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('input-mensaje');
    const texto = input.value.trim();
    if (!texto) return;
    if (!salaActual) { alert('Selecciona una sala primero'); return; }
    input.value = '';
    await enviarMensaje({ tipo: 'texto', texto });
    play('mensaje');
});

// ── Emojis — inserta en el campo de texto, NO envía el mensaje ──
(function setupEmojis() {
    const emojiBtn   = document.getElementById('emoji-button');
    const emojiPanel = document.getElementById('emoji-panel');
    const inputMsg   = document.getElementById('input-mensaje');

    // Abrir / cerrar panel
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPanel.classList.toggle('hidden');
    });

    // Al hacer clic en un emoji: insertar en el campo de texto
    emojiPanel.addEventListener('click', (e) => {
        e.stopPropagation();          // evita que llegue al document
        const btn = e.target.closest('.emoji');
        if (!btn) return;

        // Insertar en la posición del cursor
        const start = inputMsg.selectionStart ?? inputMsg.value.length;
        const end   = inputMsg.selectionEnd   ?? inputMsg.value.length;
        const emoji = btn.dataset.emoji || btn.textContent.trim();
        inputMsg.value = inputMsg.value.slice(0, start) + emoji + inputMsg.value.slice(end);
        // Dejar el cursor después del emoji
        const newPos = start + emoji.length;
        inputMsg.setSelectionRange(newPos, newPos);
        // NO cerrar el panel, NO enviar
        // El usuario presiona Enter o el botón Enviar cuando quiera
    });

    // Cerrar si se hace clic fuera del panel o del botón
    document.addEventListener('click', (e) => {
        if (!emojiPanel.classList.contains('hidden') &&
            !emojiPanel.contains(e.target) &&
            !emojiBtn.contains(e.target)) {
            emojiPanel.classList.add('hidden');
        }
    });
})();


// Imágenes
document.getElementById('image-button').addEventListener('click', () => document.getElementById('image-input').click());
document.getElementById('image-input').addEventListener('change', () => {
    const file = document.getElementById('image-input').files[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = async (ev) => {
        await enviarMensaje({ tipo: 'imagen', url: ev.target.result, texto: file.name, nombreArchivo: file.name });
        document.getElementById('image-input').value = '';
    };
    fr.readAsDataURL(file);
});

// ── Grabación de audio con micrófono (clic para grabar / clic para enviar) ──
(function setupAudioRecording() {
    let mediaRecorder = null;
    let audioChunks   = [];
    let isRecording   = false;
    let recordStream  = null;

    const audioBtn      = document.getElementById('audio-button');
    const recIndicator  = document.getElementById('rec-indicator');

    audioBtn.addEventListener('click', async () => {
        if (!isRecording) {
            // ── INICIAR grabación
            try {
                recordStream  = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioChunks   = [];
                mediaRecorder = new MediaRecorder(recordStream);

                mediaRecorder.ondataavailable = (ev) => {
                    if (ev.data && ev.data.size > 0) audioChunks.push(ev.data);
                };

                mediaRecorder.onstop = async () => {
                    recordStream.getTracks().forEach(t => t.stop());
                    if (audioChunks.length === 0) return;
                    const blob = new Blob(audioChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        await enviarMensaje({
                            tipo: 'audio',
                            url: e.target.result,
                            texto: 'Audio',
                            nombreArchivo: 'audio.webm'
                        });
                        play('mensaje');
                    };
                    reader.readAsDataURL(blob);
                };

                mediaRecorder.start();
                isRecording = true;
                audioBtn.classList.add('recording');
                audioBtn.title = 'Clic para detener y enviar';
                if (recIndicator) recIndicator.classList.remove('hidden');

            } catch (err) {
                console.error('Micrófono error:', err);
                alert('⚠️ No se pudo acceder al micrófono.\n\nPor favor permite el acceso al micrófono en tu navegador:\nClic en el candado 🔒 de la barra de dirección > Permisos > Micrófono > Permitir');
            }
        } else {
            // ── DETENER y enviar
            mediaRecorder.stop();
            isRecording = false;
            audioBtn.classList.remove('recording');
            audioBtn.title = 'Clic para grabar audio';
            if (recIndicator) recIndicator.classList.add('hidden');
        }
    });
})();


// ── Render mensaje ────────────────────────────────────
function renderMensaje(data) {
    const div = document.createElement('div');
    div.classList.add('mensaje');
    const usuario = data.uid || 'Usuario';
    if (usuario === miNombre) div.classList.add('propio');

    const autor = document.createElement('span');
    autor.className = 'autor';
    autor.textContent = usuario;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (data.tipo === 'imagen' && data.url) {
        const img = document.createElement('img');
        img.src = data.url; img.alt = data.nombreArchivo || 'imagen'; img.className = 'mensaje-imagen';
        bubble.appendChild(img);
    } else if (data.tipo === 'audio' && data.url) {
        const audio = document.createElement('audio');
        audio.controls = true; audio.src = data.url; audio.className = 'mensaje-audio';
        bubble.appendChild(audio);
        if (data.nombreArchivo) {
            const n = document.createElement('div');
            n.className = 'archivo-nombre'; n.textContent = data.nombreArchivo;
            bubble.appendChild(n);
        }
    } else {
        const txt = document.createElement('div');
        txt.className = 'mensaje-texto';
        txt.textContent = data.texto || '';
        bubble.appendChild(txt);
    }

    const hora = document.createElement('span');
    hora.className = 'hora';
    const ts = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
    hora.textContent = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.append(autor, bubble, hora);
    document.getElementById('chat-container').appendChild(div);
    document.getElementById('chat-container').scrollTop = 99999;
}

// ══════════════════════════════════════════════════════
//  CHAT — MIEMBROS (datos desde Firestore)
// ══════════════════════════════════════════════════════
function renderizarMiembros(miembros = []) {
    const list = document.getElementById('members-list');
    list.innerHTML = '';
    document.getElementById('members-count').textContent = miembros.length;
    miembros.forEach(uid => {
        const item = document.createElement('div'); item.className = 'member-item';
        const avatar = document.createElement('div'); avatar.className = 'member-avatar';
        avatar.textContent = (uid || '?').charAt(0).toUpperCase();
        const name = document.createElement('span'); name.className = 'member-name'; name.textContent = uid || 'Usuario';
        const dot = document.createElement('span'); dot.className = 'member-online-dot';
        item.append(avatar, name, dot);
        list.appendChild(item);
    });
}

// ══════════════════════════════════════════════════════
//  INIT — Verificar sesión al cargar
// ══════════════════════════════════════════════════════
const sesionGuardada = sessionStorage.getItem('usuarioChat');
if (sesionGuardada) {
    iniciarChat(sesionGuardada);
} else {
    showView('login');
}

import { auth, db } from './firebaseInit.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const form      = document.getElementById('login-form');
const btnSubmit = form.querySelector('button[type="submit"]');

function clearErrors() {
    ['email-error', 'password-error'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    });
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email) {
        document.getElementById('email-error').textContent = 'Ingresa tu email';
        return;
    }
    if (!password) {
        document.getElementById('password-error').textContent = 'Ingresa tu contraseña';
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Iniciando sesión...';

    try {
        // 1. Autenticar con Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Obtener nombre real desde Firestore
        let nombre = user.displayName || null;

        if (!nombre) {
            // Fallback: buscar en Firestore si no tiene displayName
            const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
            if (userDoc.exists()) {
                nombre = userDoc.data().nombre || null;
            }
        }

        // 3. Si no tiene nombre en ningún lado, usar parte del email
        if (!nombre) {
            nombre = email.split('@')[0];
        }

        // 4. Guardar en sessionStorage
        sessionStorage.setItem('usuarioChat', nombre);
        sessionStorage.setItem('emailUsuario', user.email);
        sessionStorage.setItem('uidUsuario', user.uid);

        // 5. Redirigir al chat
        window.location.href = '/';

    } catch (error) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Iniciar sesión';

        const code = error.code;
        if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
            document.getElementById('email-error').textContent = 'Email o contraseña incorrectos';
        } else if (code === 'auth/wrong-password') {
            document.getElementById('password-error').textContent = 'Contraseña incorrecta';
        } else if (code === 'auth/invalid-email') {
            document.getElementById('email-error').textContent = 'Email inválido';
        } else if (code === 'auth/too-many-requests') {
            document.getElementById('email-error').textContent = 'Demasiados intentos. Intenta más tarde';
        } else {
            console.error('Error en login:', error.message);
            alert('Error: ' + error.message);
        }
    }
});

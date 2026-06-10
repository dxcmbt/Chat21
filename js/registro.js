import { auth, db } from './firebaseInit.js';
import { createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { setDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const form       = document.getElementById('registro-form');
const btnSubmit  = form.querySelector('button[type="submit"]');

// Clear error helper
function clearErrors() {
    ['nombre-error','email-error','edad-error','pais-error','password-error','password-confirm-error']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '';
        });
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const nombre          = document.getElementById('nombre').value.trim();
    const email           = document.getElementById('email').value.trim();
    const edad            = parseInt(document.getElementById('edad').value, 10);
    const pais            = document.getElementById('pais').value.trim();
    const telefono        = document.getElementById('telefono').value.trim();
    const password        = document.getElementById('password').value;
    const passwordConfirm = document.getElementById('password-confirm').value;

    // Validaciones locales
    if (!nombre || nombre.length < 3 || nombre.length > 50) {
        document.getElementById('nombre-error').textContent = 'El nombre debe tener entre 3 y 50 caracteres';
        document.getElementById('nombre').focus();
        return;
    }
    if (!email || !email.includes('@')) {
        document.getElementById('email-error').textContent = 'Ingresa un email válido';
        document.getElementById('email').focus();
        return;
    }
    if (isNaN(edad) || edad < 17 || edad > 99) {
        document.getElementById('edad-error').textContent = 'La edad debe ser entre 17 y 99';
        document.getElementById('edad').focus();
        return;
    }
    if (!pais) {
        document.getElementById('pais-error').textContent = 'Ingresa tu país';
        document.getElementById('pais').focus();
        return;
    }
    if (password.length < 6) {
        document.getElementById('password-error').textContent = 'La contraseña debe tener al menos 6 caracteres';
        document.getElementById('password').focus();
        return;
    }
    if (password !== passwordConfirm) {
        document.getElementById('password-confirm-error').textContent = 'Las contraseñas no coinciden';
        document.getElementById('password-confirm').focus();
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Creando cuenta...';

    try {
        // 1. Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Guardar displayName en Firebase Auth
        await updateProfile(user, { displayName: nombre });

        // 3. Guardar perfil completo en Firestore
        await setDoc(doc(db, 'usuarios', user.uid), {
            nombre,
            email,
            edad,
            pais,
            telefono,
            uid: user.uid,
            fechaRegistro: new Date().toISOString(),
            estado: 'activo'
        });

        // 4. Guardar nombre en sessionStorage para uso inmediato
        sessionStorage.setItem('usuarioChat', nombre);
        sessionStorage.setItem('emailUsuario', email);
        sessionStorage.setItem('uidUsuario', user.uid);

        // Redirigir al chat directamente
        window.location.href = 'index.html';

    } catch (error) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Crear cuenta';

        const code = error.code;
        if (code === 'auth/email-already-in-use') {
            document.getElementById('email-error').textContent = 'Este email ya está registrado';
        } else if (code === 'auth/weak-password') {
            document.getElementById('password-error').textContent = 'La contraseña debe tener al menos 6 caracteres';
        } else if (code === 'auth/invalid-email') {
            document.getElementById('email-error').textContent = 'Email inválido';
        } else {
            console.error('Error en registro:', error.message);
            alert('Error: ' + error.message);
        }
    }
});

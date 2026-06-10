const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Inicializar Firebase Admin
let db = null;

try {
    const serviceAccount = require(path.join(__dirname, 'chat21-b25b2-firebase-adminsdk-key.json'));

    initializeApp({
        credential: cert(serviceAccount),
        projectId: 'chat21-b25b2'
    });

    db = getFirestore();
    console.log('✅ Firebase Admin inicializado correctamente');
} catch (error) {
    console.log('⚠️  Error al inicializar Firebase Admin:');
    console.log('   ', error.message);
}

// Middleware — sirve toda la carpeta public/ como raíz
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Rutas para páginas HTML
app.get('/registro', (req, res) => {
    res.sendFile(path.join(__dirname, 'registro.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Mapa: socketId => { uid, salas: Set<salaId> }
const socketUsers = new Map();

// Socket.IO conexiones
io.on('connection', (socket) => {
    console.log(`Nuevo usuario conectado (ID: ${socket.id})`);
    socketUsers.set(socket.id, { uid: null, salas: new Set() });

    // Obtener lista de salas
    socket.on('obtener-salas', async () => {
        try {
            if (!db) {
                socket.emit('lista-salas', []);
                return;
            }
            const salasSnapshot = await db.collection('salas').get();
            const salas = [];
            salasSnapshot.forEach(doc => {
                salas.push({ id: doc.id, ...doc.data() });
            });
            socket.emit('lista-salas', salas);
        } catch (error) {
            console.error('Error obteniendo salas:', error);
            socket.emit('error', 'Error al obtener salas');
        }
    });

    // Crear una nueva sala
    socket.on('crear-sala', async (datos) => {
        try {
            if (!db) {
                socket.emit('error', 'Firebase no está configurado');
                return;
            }
            const { nombre, uid } = datos;

            const nuevaSala = {
                nombre,
                creador: uid,
                fechaCreacion: new Date(),
                miembros: [uid]
            };

            const docRef = await db.collection('salas').add(nuevaSala);
            console.log(`Sala creada: ${nombre} (ID: ${docRef.id})`);

            // Notificar a todos los clientes
            const salasSnapshot = await db.collection('salas').get();
            const salas = [];
            salasSnapshot.forEach(doc => {
                salas.push({ id: doc.id, ...doc.data() });
            });
            io.emit('lista-salas', salas);

        } catch (error) {
            console.error('Error creando sala:', error);
            socket.emit('error', 'Error al crear sala');
        }
    });

    // Unirse a una sala
    socket.on('unirse-sala', async (datos) => {
        try {
            if (!db) {
                socket.emit('error', 'Firebase no está configurado');
                return;
            }
            const { salaId, uid } = datos;
            socket.join(salaId);

            // Rastrear usuario
            const info = socketUsers.get(socket.id);
            if (info) { info.uid = uid; info.salas.add(salaId); }

            // Agregar usuario a la sala si no está
            const salaRef = db.collection('salas').doc(salaId);
            await salaRef.update({
                miembros: FieldValue.arrayUnion(uid)
            });

            console.log(`Usuario ${uid} se unió a sala ${salaId}`);
            io.to(salaId).emit('usuario-conectado', { uid, salaId });

        } catch (error) {
            console.error('Error uniéndose a sala:', error);
            socket.emit('error', 'Error al unirse a sala');
        }
    });

    // Enviar mensaje
    socket.on('enviar-mensaje', async (datos) => {
        try {
            if (!db) {
                socket.emit('error', 'Firebase no está configurado');
                return;
            }
            const { salaId, uid, texto, timestamp } = datos;

            const mensaje = {
                uid,
                texto,
                timestamp: new Date(timestamp),
                leido: false
            };

            await db.collection('salas').doc(salaId).collection('mensajes').add(mensaje);
            console.log(`Mensaje en sala ${salaId}: ${texto.substring(0, 30)}...`);

            // Broadcast a la sala
            io.to(salaId).emit('nuevo-mensaje', {
                id: Date.now(),
                ...mensaje
            });

        } catch (error) {
            console.error('Error enviando mensaje:', error);
            socket.emit('error', 'Error al enviar mensaje');
        }
    });

    // Cargar mensajes de una sala
    socket.on('cargar-mensajes', async (salaId) => {
        try {
            if (!db) {
                socket.emit('mensajes-cargados', []);
                return;
            }
            const mensajesSnapshot = await db
                .collection('salas')
                .doc(salaId)
                .collection('mensajes')
                .orderBy('timestamp', 'asc')
                .limit(50)
                .get();

            const mensajes = [];
            mensajesSnapshot.forEach(doc => {
                mensajes.push({ id: doc.id, ...doc.data() });
            });

            socket.emit('mensajes-cargados', mensajes);

        } catch (error) {
            console.error('Error cargando mensajes:', error);
            socket.emit('error', 'Error al cargar mensajes');
        }
    });

    socket.on('disconnect', () => {
        console.log(`Usuario desconectado (ID: ${socket.id})`);
        const info = socketUsers.get(socket.id);
        if (info && info.uid) {
            // Notificar a cada sala donde estaba el usuario
            info.salas.forEach(salaId => {
                io.to(salaId).emit('usuario-desconectado', { uid: info.uid, salaId });
            });
        }
        socketUsers.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
});

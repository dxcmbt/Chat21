// Inicializar Firebase en el cliente
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCT8sNrEqPjjCYVIZnyaOz5kaXsIxVeiF4",
  authDomain: "chat21-b25b2.firebaseapp.com",
  projectId: "chat21-b25b2",
  storageBucket: "chat21-b25b2.firebasestorage.app",
  messagingSenderId: "1054849430973",
  appId: "1:1054849430973:web:a601bbce50683d5e5b8ed4",
  measurementId: "G-QPLLEQYZHK"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };

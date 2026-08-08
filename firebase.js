import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================================================================
   FIREBASE CONFIG
   ========================================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyCmS8AsUKTqSZmeRjZkAnQDpgVmf168ZGY",
  authDomain: "auramaxxing-3d4bb.firebaseapp.com",
  projectId: "auramaxxing-3d4bb",
  storageBucket: "auramaxxing-3d4bb.firebasestorage.app",
  messagingSenderId: "634364008045",
  appId: "1:634364008045:web:6e982579ecb217750e5164",
  measurementId: "G-2Q07XYJPYY"
};

export let auth, db, configOk = true;
try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  configOk = false;
}

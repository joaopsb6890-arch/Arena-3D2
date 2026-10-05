// ============================================================
// FIREBASE AUTH — Login por Google (opcional, assíncrono)
// Não bloqueia o boot do jogo; se o Google Provider não estiver
// ativado no Firebase Console, mostra erro amigável.
// ============================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyCSC1cgB1vJRF5BkdD4WjH4ia9EFyQNs6M",
  authDomain: "arena3d-ade5e.firebaseapp.com",
  projectId: "arena3d-ade5e",
  storageBucket: "arena3d-ade5e.firebasestorage.app",
  messagingSenderId: "738663234681",
  appId: "1:738663234681:web:01c163b2b828e5065568a8",
  measurementId: "G-FCJ3CK02NK"
};

let app = null, auth = null, provider = null, initialized = false;

export function initFirebase(){
  if(initialized) return auth;
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    initialized = true;
  } catch(e){
    console.warn('Firebase init falhou:', e);
  }
  return auth;
}

export async function loginWithGoogle(){
  if(!initialized) initFirebase();
  if(!auth || !provider){
    return { ok: false, error: 'Firebase não inicializado. Verifica a configuração no Firebase Console.' };
  }
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    return { ok: true, user: { name: user.displayName || user.email || 'Jogador', email: user.email, uid: user.uid, photo: user.photoURL } };
  } catch(e){
    if(e.code === 'auth/popup-blocked' || e.code === 'auth/cancelled-popup-request'){
      // fallback para redirect
      try { await signInWithRedirect(auth, provider); return { ok: true, redirect: true }; }
      catch(e2){ return { ok: false, error: 'Login cancelado ou bloqueado pelo navegador.' }; }
    }
    if(e.code === 'auth/unauthorized-domain'){
      return { ok: false, error: 'Domínio não autorizado. Adiciona o domínio no Firebase Console → Authentication → Settings → Authorized domains.' };
    }
    return { ok: false, error: 'Erro no login: ' + (e.message || e.code || 'desconhecido') };
  }
}

export function logout(){
  if(!auth) return Promise.resolve();
  return signOut(auth);
}

export function onAuthChange(cb){
  if(!initialized) initFirebase();
  if(!auth){ cb(null); return; }
  onAuthStateChanged(auth, (user) => {
    cb(user ? { name: user.displayName || user.email || 'Jogador', email: user.email, uid: user.uid, photo: user.photoURL } : null);
  });
}

export function isFirebaseReady(){ return initialized && !!auth; }

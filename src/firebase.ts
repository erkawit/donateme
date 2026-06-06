/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot, query, where, getDocs, addDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
export { doc, getDoc, setDoc, updateDoc, collection, onSnapshot, query, where, getDocs, addDoc, serverTimestamp, deleteDoc };
import firebaseConfigDefault from "../firebase-applet-config.json";

// Support dynamic fallback to Environment Variables when exporting to Vercel/production
// Vite statically replaces import.meta.env.VITE_* references at build time.
// Writing import.meta.env literally is mandatory for this replacement to occur properly.
const isProduction = !!import.meta.env.VITE_FIREBASE_PROJECT_ID;

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigDefault.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigDefault.appId,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigDefault.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigDefault.authDomain,
  // Safeguard: In production, do not fall back to the AI Studio custom database ID. Default to standard database ID.
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || (isProduction ? "" : firebaseConfigDefault.firestoreDatabaseId),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigDefault.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigDefault.messagingSenderId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigDefault.measurementId || "",
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore
// Standard production Firestore databases must be initialized using `getFirestore(app)` without a second parameter.
// AI Studio preview databases use a custom database ID (e.g., "ai-studio-407b25b8-...").
const hasCustomDbId = 
  firebaseConfig.firestoreDatabaseId && 
  firebaseConfig.firestoreDatabaseId !== "(default)" && 
  firebaseConfig.firestoreDatabaseId !== "default" &&
  firebaseConfig.firestoreDatabaseId !== "";

export const db = hasCustomDbId 
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId) 
  : getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

// Google Sign-In Provider
export const googleProvider = new GoogleAuthProvider();

// Standard Auth Listener caching inside memory
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    return { user: result.user };
  } catch (error: any) {
    console.error("Firebase Sign-In Error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

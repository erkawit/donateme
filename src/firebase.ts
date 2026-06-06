/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot, query, where, getDocs, addDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
export { doc, getDoc, setDoc, updateDoc, collection, onSnapshot, query, where, getDocs, addDoc, serverTimestamp, deleteDoc };
import firebaseConfigDefault from "../firebase-applet-config.json";

// Support dynamic fallback to Environment Variables when exporting to Vercel/production
// Strip any double/single quotes that might be preserved when copying variables directly from .env files

const cleanEnvVar = (value: string | undefined): string => {
  if (!value) return "";
  return value.replace(/^["']|["']$/g, "").trim();
};

const envProjectId = cleanEnvVar(import.meta.env.VITE_FIREBASE_PROJECT_ID);
const envAppId = cleanEnvVar(import.meta.env.VITE_FIREBASE_APP_ID);
const envApiKey = cleanEnvVar(import.meta.env.VITE_FIREBASE_API_KEY);
const envAuthDomain = cleanEnvVar(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN);
const envDbId = cleanEnvVar(import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID);
const envStorageBucket = cleanEnvVar(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET);
const envMessagingSenderId = cleanEnvVar(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID);
const envMeasurementId = cleanEnvVar(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID);

// Detect if we are running in an external production environment (e.g. Vercel)
const isProduction = !!(
  envProjectId || 
  (typeof window !== "undefined" && 
   !window.location.hostname.includes("asia-east1.run.app") && 
   !window.location.hostname.includes("cloudrun.app") && 
   window.location.hostname !== "localhost" && 
   window.location.hostname !== "127.0.0.1")
);

// Safeguard: If the user explicitly provided a custom Firestore Project ID in their environment variables,
// we MUST NOT fall back to AI Studio's preview database ID under any circumstances (as their custom project only contains standard/default databases).
const isUsingCustomProject = !!(envProjectId && envProjectId !== firebaseConfigDefault.projectId);

const firebaseConfig = {
  projectId: envProjectId || firebaseConfigDefault.projectId,
  appId: envAppId || firebaseConfigDefault.appId,
  apiKey: envApiKey || firebaseConfigDefault.apiKey,
  authDomain: envAuthDomain || firebaseConfigDefault.authDomain,
  // Safeguard: In production (Vercel) or when using a custom project ID, do not fall back to the AI Studio custom database ID. Default to standard database ID.
  firestoreDatabaseId: envDbId || (isProduction || isUsingCustomProject ? "" : firebaseConfigDefault.firestoreDatabaseId),
  storageBucket: envStorageBucket || firebaseConfigDefault.storageBucket,
  messagingSenderId: envMessagingSenderId || firebaseConfigDefault.messagingSenderId,
  measurementId: envMeasurementId || firebaseConfigDefault.measurementId || "",
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore
// Standard production Firestore databases must be initialized using `getFirestore(app)` without a second parameter.
// AI Studio preview databases use a custom database ID (e.g., "ai-studio-407b25b8-...").
const cleanDbId = firebaseConfig.firestoreDatabaseId.replace(/^["']|["']$/g, "").trim();
const hasCustomDbId = 
  cleanDbId && 
  cleanDbId !== "(default)" && 
  cleanDbId !== "default" &&
  cleanDbId !== "";

export const db = hasCustomDbId 
  ? getFirestore(app, cleanDbId) 
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

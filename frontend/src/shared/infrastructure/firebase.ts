import { initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import type { Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

// Firebase configuration - matches the existing config
const firebaseConfig = {
  apiKey: "AIzaSyCWl_9BKdLPO6yNCDOLJBiFfRPrWDlMPek",
  authDomain: "policrm-5f60f.firebaseapp.com",
  projectId: "policrm-5f60f",
  storageBucket: "policrm-5f60f.firebasestorage.app",
  messagingSenderId: "1079954899714",
  appId: "1:1079954899714:web:aa1e4369bcbe16ea2df81b",
  measurementId: "G-2WBECTC946",
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// Set persistence to LOCAL
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Error setting auth persistence:", error);
});

export default app;

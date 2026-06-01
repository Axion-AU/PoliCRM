import { atom, computed } from "nanostores";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "@shared/infrastructure/firebase";
import { setAuthTokenProvider } from "@shared/infrastructure/httpClient";

// Auth state atoms
export const $user = atom<User | null>(null);
export const $loading = atom<boolean>(true);
export const $idToken = atom<string | null>(null);

// Computed values
export const $isAuthenticated = computed($user, (user) => user !== null);
export const $userEmail = computed($user, (user) => user?.email || null);
setAuthTokenProvider(() => $idToken.get());

// Initialize auth state listener
onAuthStateChanged(auth, async (user) => {
  $user.set(user);
  $loading.set(false);

  if (user) {
    try {
      const token = await user.getIdToken();
      $idToken.set(token);
    } catch (error) {
      console.error("Failed to get ID token:", error);
      $idToken.set(null);
    }
  } else {
    $idToken.set(null);
  }
});

// Auth actions
export async function signOut() {
  try {
    await firebaseSignOut(auth);
    $user.set(null);
    $idToken.set(null);
  } catch (error) {
    console.error("Sign out error:", error);
    throw error;
  }
}

// Refresh ID token
export async function refreshToken() {
  const user = $user.get();
  if (user) {
    try {
      const token = await user.getIdToken(true);
      $idToken.set(token);
      return token;
    } catch (error) {
      console.error("Token refresh error:", error);
      return null;
    }
  }
  return null;
}

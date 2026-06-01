import { useStore } from "@nanostores/react";
import { $isAuthenticated, $loading, $user } from "../state/authStore";

export function useAuth() {
  return {
    user: useStore($user),
    isAuthenticated: useStore($isAuthenticated),
    loading: useStore($loading),
  };
}

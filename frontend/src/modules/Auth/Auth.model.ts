import type { User } from "firebase/auth";

export interface AuthState {
  user: User | null;
  loading: boolean;
  idToken: string | null;
}

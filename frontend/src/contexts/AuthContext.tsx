import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "sys_admin" | "state_secretary" | "branch_organiser" | "volunteer" | "read_only";
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  getToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

const AUTH_WORKER_URL = import.meta.env.VITE_AUTH_WORKER_URL || "";
const TOKEN_KEY = "policrm_auth_token";
const USER_KEY = "policrm_user";

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function setStoredUser(user: User | null) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser);
  const [isLoading, setIsLoading] = useState(true);
  const tokenRef = useRef<string | null>(getStoredToken());
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const token = tokenRef.current;
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetch(`${AUTH_WORKER_URL}/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Session invalid");
        return res.json();
      })
      .then((data) => {
        if (data.user) {
          const resolved: User = {
            id: data.user.id,
            name: data.user.name || data.user.email,
            email: data.user.email,
            role: data.user.role,
          };
          setUser(resolved);
          setStoredUser(resolved);
        } else {
          setUser(null);
          setStoredToken(null);
          setStoredUser(null);
        }
      })
      .catch(() => {
        setUser(null);
        setStoredToken(null);
        setStoredUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${AUTH_WORKER_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Login failed");
    }

    const data = await res.json();
    tokenRef.current = data.token;
    setStoredToken(data.token);

    const loggedInUser: User = {
      id: data.user.id,
      name: data.user.name || data.user.email,
      email: data.user.email,
      role: data.user.role,
    };
    setUser(loggedInUser);
    setStoredUser(loggedInUser);
  }, []);

  const logout = useCallback(() => {
    tokenRef.current = null;
    setStoredToken(null);
    setStoredUser(null);
    setUser(null);
    fetch(`${AUTH_WORKER_URL}/auth/logout`, { method: "POST" }).catch(() => {});
  }, []);

  const getToken = useCallback(() => tokenRef.current, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        login,
        logout,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

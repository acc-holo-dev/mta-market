// Global auth state (Zustand)
// TASK A-001/D-006 browser token policy:
// - refresh token: HttpOnly cookie only (never enters JS, never stored here);
// - access token: memory only (this store) — survives SPA navigation,
//   dies with the page; a page reload silently re-authenticates via
//   the refresh cookie (see lib/api.ts bootstrap);
// - nothing auth-related is persisted to localStorage/sessionStorage.
import { create } from "zustand";

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  role: string;
  status: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  /** Login: store user + in-memory access token. */
  setAuth: (user: User, accessToken: string) => void;
  /** Replace the in-memory access token after a silent refresh. */
  setAccessToken: (accessToken: string) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  accessToken: null,

  setAuth: (user, accessToken) => {
    set({ user, accessToken });
  },

  setAccessToken: (accessToken) => {
    set({ accessToken });
  },

  setUser: (user) => {
    set({ user });
  },

  clearAuth: () => {
    set({ user: null, accessToken: null });
  },

  isAuthenticated: () => {
    return get().accessToken !== null;
  },
}));
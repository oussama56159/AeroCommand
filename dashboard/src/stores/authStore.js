import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TOKEN_KEY, REFRESH_TOKEN_KEY, ROLE_HIERARCHY } from '@/config/constants';
import { authAPI } from '@/lib/api/endpoints';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await authAPI.login(credentials);
          localStorage.setItem(TOKEN_KEY, data.access_token);
          localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
          set({ user: data.user, isAuthenticated: true, isLoading: false });
          return data;
        } catch (err) {
          const msg = err.response?.data?.detail || 'Login failed';
          set({ error: msg, isLoading: false });
          throw err;
        }
      },

      register: async (userData) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await authAPI.register(userData);
          set({ isLoading: false });
          return data;
        } catch (err) {
          const msg = err.response?.data?.detail || 'Registration failed';
          set({ error: msg, isLoading: false });
          throw err;
        }
      },

      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        set({ user: null, isAuthenticated: false, error: null });
      },

      fetchUser: async () => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return;
        set({ isLoading: true });
        try {
          const { data } = await authAPI.me();
          set({ user: data, isAuthenticated: true, isLoading: false });
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(REFRESH_TOKEN_KEY);
        }
      },

      hasRole: (requiredRole) => {
        const { user } = get();
        if (!user) return false;
        return (ROLE_HIERARCHY[user.role] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0);
      },

      hasAnyRole: (roles) => {
        const { user } = get();
        if (!user) return false;
        return roles.includes(user.role);
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'aero-auth-store',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      merge: (persistedState, currentState) => {
        // If tokens are missing, ignore any persisted "authenticated" flag.
        // This avoids redirect loops when a previous session was persisted but JWTs were cleared/expired.
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return currentState;
        return { ...currentState, ...(persistedState || {}) };
      },
    }
  )
);


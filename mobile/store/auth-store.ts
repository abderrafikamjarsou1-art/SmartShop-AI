import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import type { AuthUser } from "../services/auth-service";
import { getCurrentUserRequest } from "../services/auth-service";

export type { AuthUser };

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (user: AuthUser, token: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
};

const TOKEN_KEY = "smartshop_token";
const USER_KEY = "smartshop_user";

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (user, token) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));

    set({
      user,
      token,
      isLoading: false,
      isAuthenticated: true,
    });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);

    set({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
    });
  },

  restoreSession: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const storedUser = await SecureStore.getItemAsync(USER_KEY);

      if (!token || !storedUser) {
        set({
          user: null,
          token: null,
          isLoading: false,
          isAuthenticated: false,
        });

        return;
      }

      // Optimistically restore from SecureStore first so the UI doesn't
      // flash a login screen, then confirm the token is still valid.
      set({
        token,
        user: JSON.parse(storedUser) as AuthUser,
        isLoading: false,
        isAuthenticated: true,
      });

      try {
        const { user } = await getCurrentUserRequest();
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
        set({ user });
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;

        // Only a confirmed 401 (expired/revoked token) signs the user out.
        // A network error/timeout means we're offline -> keep the
        // optimistic session from SecureStore instead of logging out.
        if (status === 401) {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          await SecureStore.deleteItemAsync(USER_KEY);

          set({
            user: null,
            token: null,
            isLoading: false,
            isAuthenticated: false,
          });
        }
      }
    } catch {
      set({
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  },
}));

import { create } from "zustand";
import type { AuthUser, TenantInfo } from "./api";
import {
  getToken,
  getStoredUser,
  getStoredTenant,
  login as apiLogin,
  logout as apiLogout,
} from "./api";

interface AuthState {
  isLoading: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  tenant: TenantInfo | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string, tenantSlug?: string, totp?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoading: true,
  isSignedIn: false,
  user: null,
  tenant: null,

  initialize: async () => {
    try {
      const token = await getToken();
      const user = await getStoredUser();
      const tenant = await getStoredTenant();

      if (token && user) {
        set({ isLoading: false, isSignedIn: true, user, tenant });
      } else {
        set({ isLoading: false, isSignedIn: false, user: null, tenant: null });
      }
    } catch {
      set({ isLoading: false, isSignedIn: false, user: null, tenant: null });
    }
  },

  signIn: async (email, password, tenantSlug, totp) => {
    const data = await apiLogin(email, password, tenantSlug, totp);
    set({
      isSignedIn: true,
      user: data.user,
      tenant: data.tenant,
    });
  },

  signOut: async () => {
    await apiLogout();
    set({ isSignedIn: false, user: null, tenant: null });
  },
}));

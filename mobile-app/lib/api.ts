import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "web"
    ? "http://localhost:3000"
    : "https://ecol-pro-ace391.netlify.app");

const TOKEN_KEY = "ecolpro_token";
const USER_KEY = "ecolpro_user";
const TENANT_KEY = "ecolpro_tenant";

const isWeb = Platform.OS === "web";

async function secureGet(key: string): Promise<string | null> {
  if (isWeb) return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (isWeb) { localStorage.setItem(key, value); return; }
  await SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (isWeb) { localStorage.removeItem(key); return; }
  await SecureStore.deleteItemAsync(key);
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  currentYear: string;
  notationMax: number;
}

export async function getToken(): Promise<string | null> {
  try {
    return await secureGet(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await secureSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await secureDelete(TOKEN_KEY);
  await secureDelete(USER_KEY);
  await secureDelete(TENANT_KEY);
}

export async function getStoredUser(): Promise<AuthUser | null> {
  try {
    const raw = await secureGet(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: AuthUser): Promise<void> {
  await secureSet(USER_KEY, JSON.stringify(user));
}

export async function getStoredTenant(): Promise<TenantInfo | null> {
  try {
    const raw = await secureGet(TENANT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setStoredTenant(tenant: TenantInfo): Promise<void> {
  await secureSet(TENANT_KEY, JSON.stringify(tenant));
}

interface FetchOptions extends RequestInit {
  auth?: boolean;
}

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { auth = true, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(customHeaders as Record<string, string>),
  };

  if (auth) {
    const token = await getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_URL}${path}`, {
    headers,
    ...rest,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Erreur ${res.status}`);
  }

  return res.json();
}

export async function login(
  email: string,
  password: string,
  tenantSlug?: string
): Promise<{ token: string; user: AuthUser; tenant: TenantInfo | null }> {
  const data = await apiFetch<{
    token: string;
    user: AuthUser;
    tenant: TenantInfo | null;
  }>("/api/auth/mobile", {
    auth: false,
    method: "POST",
    body: JSON.stringify({ email, password, tenantSlug }),
  });

  await setToken(data.token);
  await setStoredUser(data.user);
  if (data.tenant) {
    await setStoredTenant(data.tenant);
  }

  return data;
}

export async function logout(): Promise<void> {
  await clearToken();
}

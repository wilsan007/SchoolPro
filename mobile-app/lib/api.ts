import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const TOKEN_KEY = "ecolpro_token";
const USER_KEY = "ecolpro_user";
const TENANT_KEY = "ecolpro_tenant";

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
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  await SecureStore.deleteItemAsync(TENANT_KEY);
}

export async function getStoredUser(): Promise<AuthUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: AuthUser): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getStoredTenant(): Promise<TenantInfo | null> {
  try {
    const raw = await SecureStore.getItemAsync(TENANT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setStoredTenant(tenant: TenantInfo): Promise<void> {
  await SecureStore.setItemAsync(TENANT_KEY, JSON.stringify(tenant));
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

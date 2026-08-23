import { api } from "./api";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin" | "super_admin";
  is_active: boolean;
  organization_id: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
}

export function saveToken(token: string) {
  localStorage.setItem("sentraai_token", token);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sentraai_token");
}

export function clearToken() {
  localStorage.removeItem("sentraai_token");
}

export function decodeTokenPayload(token: string): {
  sub: string;
  role: string;
  org: string;
  exp: number;
} | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<string> {
  const data = await api.post<TokenResponse>("/auth/login", {
    email,
    password,
  });
  saveToken(data.access_token);
  return data.access_token;
}

export async function register(
  email: string,
  password: string,
  name: string
): Promise<string> {
  const data = await api.post<TokenResponse>("/auth/register", {
    email,
    password,
    name,
  });
  saveToken(data.access_token);
  return data.access_token;
}

export async function fetchCurrentUser(): Promise<User> {
  return api.get<User>("/auth/me");
}

export function getDashboardPath(role: string): string {
  switch (role) {
    case "super_admin":
      return "/super-admin";
    case "admin":
      return "/admin/dashboard";
    default:
      return "/dashboard";
  }
}

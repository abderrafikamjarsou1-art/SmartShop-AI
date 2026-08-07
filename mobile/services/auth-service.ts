import { api } from "./api";

export type AuthUser = {
  id: string;
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  role: string | null;
  businessId: string | null;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type LoginResponse = {
  message: string;
  token: string;
  refreshToken: string | null;
  expiresAt: number | null;
  user: AuthUser;
};

export type RegisterInput = {
  fullName: string;
  email: string;
  password: string;
};

export type RegisterResponse = {
  message: string;
  needsVerification: boolean;
  token: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  user: AuthUser;
};

export type CurrentUserResponse = {
  user: AuthUser;
};

/** Extracts a readable message from a backend error response, with a safe fallback. */
export function getAuthErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data
    ?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

export async function loginRequest(input: LoginInput): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>("/auth/login", input);
  return response.data;
}

export async function registerRequest(input: RegisterInput): Promise<RegisterResponse> {
  const response = await api.post<RegisterResponse>("/auth/register", input);
  return response.data;
}

export async function getCurrentUserRequest(): Promise<CurrentUserResponse> {
  const response = await api.get<CurrentUserResponse>("/auth/me");
  return response.data;
}

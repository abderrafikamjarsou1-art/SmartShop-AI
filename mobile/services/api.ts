import axios from "axios";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "smartshop_token";

export const API_BASE_URL = "http://192.168.8.10:3000/api";

/** For requests that can't go through the axios instance (e.g. streaming fetch). */
export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync("smartshop_user");
    }

    return Promise.reject(error);
  }
);
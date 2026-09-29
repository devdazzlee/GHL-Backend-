import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_URL } from '../config/config';

export interface ApiErrorBody {
  success?: boolean;
  error?: { message?: string; code?: string };
  message?: string;
}

/** Fired when the backend says "sign in required"; AuthContext sends the user to /login. */
export const SESSION_EXPIRED_EVENT = 'peakwa:session-expired';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  // The sign-in session is an httpOnly cookie set by the backend; send it with every call.
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => {
    if (response.data && response.data.success === false) {
      const message =
        response.data.error?.message ?? response.data.message ?? 'Request failed';
      return Promise.reject(new Error(message));
    }
    return response;
  },
  (error: AxiosError<ApiErrorBody>) => {
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(
        new Error(
          'Request timed out. Long-running jobs like the daily publisher can take 1-3 minutes. Try again or check the server logs.',
        ),
      );
    }
    const code = error.response?.data?.error?.code;
    const isSessionCall = String(error.config?.url ?? '').startsWith('/session/');
    if (error.response?.status === 401 && code === 'AUTH_REQUIRED' && !isSessionCall) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    const message =
      error.response?.data?.error?.message ??
      error.response?.data?.message ??
      error.message ??
      'Request failed';
    return Promise.reject(new Error(message));
  },
);

export default api;

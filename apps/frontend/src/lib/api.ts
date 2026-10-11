export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export class ApiError extends Error {
  code?: string;
  status?: number;
  details?: unknown;

  constructor(message: string, code?: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Normalizes API base URL and endpoint to prevent broken URLs or duplicate slashes.
 */
export function getApiUrl(endpoint: string): string {
  const baseUrl = API_BASE_URL.replace(/\/+$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}${path}`;
}

/**
 * Supplies the current Clerk session token.
 *
 * Registered once by StudentProvider from Clerk's `useAuth().getToken`, so every
 * caller of `fetchApi` picks up the bearer token without threading a hook through
 * the component tree.
 *
 * Bearer tokens replace the old cross-origin `auth_token` cookie on purpose: the
 * Clerk session cookie stays first-party on the frontend origin, so the API never
 * needs SameSite=None third-party cookies between Vercel and Render.
 */
type TokenGetter = () => Promise<string | null>;

let tokenGetter: TokenGetter | null = null;

export function registerTokenGetter(getter: TokenGetter | null): void {
  tokenGetter = getter;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!tokenGetter) return {};
  try {
    const token = await tokenGetter();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    // A failed token refresh must surface as a 401 from the API, not as a crash here.
    return {};
  }
}

/** Auth headers for callers that drive `fetch` themselves, such as the SSE reader. */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  return authHeaders();
}

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = getApiUrl(endpoint);

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  for (const [key, value] of Object.entries(await authHeaders())) {
    headers.set(key, value);
  }

  const response = await fetch(url, { ...options, headers });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = data?.error?.message || response.statusText || 'Something went wrong';
    throw new ApiError(message, data?.error?.code, response.status, data?.error?.details);
  }

  return data?.data as T;
}

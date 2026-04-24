/**
 * Safe API Fetch Wrapper
 * - Enforces HTTP status checking
 * - Adds timeout handling
 * - Provides typed responses
 * - Consistent error messages
 */

export class ApiError extends Error {
  status: number;
  statusText: string;

  constructor(status: number, statusText: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
  }
}

export class TimeoutError extends Error {
  timeoutMs: number;

  constructor(timeoutMs: number, url: string) {
    super(`Request timeout after ${timeoutMs}ms: ${url}`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  parseAs?: 'json' | 'text' | 'blob';
}

/**
 * Safe fetch wrapper with required error handling
 * @throws {ApiError} on HTTP error status (4xx, 5xx)
 * @throws {TimeoutError} on timeout
 * @throws {Error} on network or parsing error
 */
export async function apiFetch<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const { timeoutMs = 15000, parseAs = 'json', ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Check HTTP status - REQUIRED
    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        errorBody = '(unable to read error body)';
      }

      throw new ApiError(
        response.status,
        response.statusText,
        `HTTP ${response.status} ${response.statusText}: ${errorBody.slice(0, 100)}`
      );
    }

    // Parse response based on type
    if (parseAs === 'text') {
      return (await response.text()) as T;
    }
    if (parseAs === 'blob') {
      return (await response.blob()) as T;
    }

    // Default: JSON
    try {
      return await response.json() as T;
    } catch {
      throw new Error(`Invalid JSON response from ${url}`);
    }
  } catch (error) {
    clearTimeout(timeoutId);

    // Distinguish timeout from other errors
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(timeoutMs, url);
    }

    // Re-throw API and custom errors as-is
    if (error instanceof ApiError || error instanceof TimeoutError) {
      throw error;
    }

    // Wrap other errors
    if (error instanceof Error) {
      throw new Error(`Fetch failed: ${error.message}`);
    }

    throw new Error(`Fetch failed: unknown error`);
  }
}

/**
 * Helper for POST with JSON body
 */
export async function apiPost<T = any>(
  url: string,
  body: any,
  options: FetchOptions = {}
): Promise<T> {
  return apiFetch<T>(url, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: JSON.stringify(body),
  });
}

/**
 * Helper for GET requests
 */
export async function apiGet<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  return apiFetch<T>(url, {
    ...options,
    method: 'GET',
  });
}

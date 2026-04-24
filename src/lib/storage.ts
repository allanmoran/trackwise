/**
 * Safe localStorage Access
 * Prevents crashes from corrupted data
 */

const DEBUG = import.meta.env.DEV;

/**
 * Safely parse JSON with fallback
 * @returns parsed value or fallback if parse fails
 */
export function safeJsonParse<T>(json: string | null, fallback: T): T {
  if (!json) {
    return fallback;
  }

  try {
    return JSON.parse(json) as T;
  } catch (error) {
    if (DEBUG) {
      console.warn(
        'Failed to parse JSON (using fallback):',
        json.slice(0, 100),
        error
      );
    }
    return fallback;
  }
}

/**
 * Safely get from localStorage
 */
export function getStorage<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return safeJsonParse(item, fallback);
  } catch {
    if (DEBUG) {
      console.warn(`Failed to read from localStorage: ${key}`);
    }
    return fallback;
  }
}

/**
 * Safely set to localStorage
 */
export function setStorage(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (DEBUG) {
      console.warn(`Failed to write to localStorage: ${key}`, error);
    }
    return false;
  }
}

/**
 * Safely remove from localStorage
 */
export function removeStorage(...keys: string[]): void {
  keys.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch {
      if (DEBUG) {
        console.warn(`Failed to remove from localStorage: ${key}`);
      }
    }
  });
}

/**
 * Safely clear all localStorage
 */
export function clearAllStorage(): void {
  try {
    localStorage.clear();
  } catch {
    if (DEBUG) {
      console.warn('Failed to clear localStorage');
    }
  }
}

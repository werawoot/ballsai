"use client";

/**
 * Options for configuring loading behavior
 */
export interface WithLoadingOptions {
  loadingMessage?: string;
  onStart?: () => void;
  onFinish?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Result type for withLoading operations
 */
export interface WithLoadingResult<T> {
  execute: (...args: unknown[]) => Promise<T>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Wraps an async function with loading state management.
 * This utility can be used with React hooks to manage loading states.
 *
 * @param asyncFn - The async function to wrap
 * @param setLoading - Function to set loading state
 * @param options - Optional configuration for loading behavior
 * @returns A wrapped async function that manages loading state
 *
 * @example
 * ```tsx
 * const [loading, setLoading] = useState(false)
 *
 * const saveData = withLoading(
 *   async (data: FormData) => {
 *     await api.save(data)
 *   },
 *   setLoading,
 *   {
 *     loadingMessage: 'Saving your data...',
 *     onError: (err) => toast.error(err.message)
 *   }
 * )
 *
 * // Usage
 * await saveData(formData)
 * ```
 */
export function withLoading<T = unknown>(
  asyncFn: (...args: unknown[]) => Promise<T>,
  setLoading: (loading: boolean) => void,
  options?: WithLoadingOptions,
): (...args: unknown[]) => Promise<T> {
  return async (...args: unknown[]): Promise<T> => {
    try {
      setLoading(true);
      options?.onStart?.();

      const result = await asyncFn(...args);

      options?.onFinish?.();
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options?.onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };
}

/**
 * Creates a complete loading state manager with execute function.
 * This is useful when you need both the loading state and the wrapped function.
 *
 * @param asyncFn - The async function to wrap
 * @param options - Optional configuration for loading behavior
 * @returns An object with execute function, isLoading, and error state
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { execute: submitForm, isLoading } = createWithLoading(
 *     async (formData: FormData) => {
 *       await api.submit(formData)
 *     },
 *     {
 *       loadingMessage: 'Submitting...',
 *       onError: (err) => console.error(err)
 *     }
 *   )
 *
 *   return (
 *     <button onClick={() => submitForm(formData)} disabled={isLoading}>
 *       {isLoading ? 'Loading...' : 'Submit'}
 *     </button>
 *   )
 * }
 * ```
 */
export function createWithLoading<T = unknown>(
  asyncFn: (...args: unknown[]) => Promise<T>,
  options?: WithLoadingOptions,
): WithLoadingResult<T> {
  let isLoading = false;
  let error: Error | null = null;
  const listeners = new Set<(state: WithLoadingResult<T>) => void>();

  const notify = () => {
    const state = { isLoading, error, execute: wrappedFn };
    listeners.forEach((listener) => listener(state));
  };

  const wrappedFn = async (...args: unknown[]): Promise<T> => {
    try {
      isLoading = true;
      error = null;
      notify();
      options?.onStart?.();

      const result = await asyncFn(...args);

      options?.onFinish?.();
      return result;
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      options?.onError?.(error);
      throw error;
    } finally {
      isLoading = false;
      notify();
    }
  };

  return {
    execute: wrappedFn,
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
  };
}

/**
 * Executes multiple async functions in parallel with loading state.
 *
 * @param tasks - Array of async functions to execute
 * @param setLoading - Function to set loading state
 * @returns Promise that resolves when all tasks complete
 *
 * @example
 * ```tsx
 * const [loading, setLoading] = useState(false)
 *
 * const loadAll = withLoadingAll(
 *   [
 *     () => fetchUser(),
 *     () => fetchSettings(),
 *     () => fetchNotifications()
 *   ],
 *   setLoading
 * )
 *
 * await loadAll()
 * ```
 */
export async function withLoadingAll<T = unknown>(
  tasks: Array<() => Promise<T>>,
  setLoading: (loading: boolean) => void,
): Promise<T[]> {
  try {
    setLoading(true);
    const results = await Promise.all(tasks.map((task) => task()));
    return results;
  } finally {
    setLoading(false);
  }
}

/**
 * Wraps async operations with retry logic and loading state.
 *
 * @param asyncFn - The async function to wrap
 * @param setLoading - Function to set loading state
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param options - Optional configuration
 * @returns A wrapped async function with retry capability
 */
export function withLoadingAndRetry<T = unknown>(
  asyncFn: (...args: unknown[]) => Promise<T>,
  setLoading: (loading: boolean) => void,
  maxRetries: number = 3,
  options?: WithLoadingOptions & { retryDelay?: number },
): (...args: unknown[]) => Promise<T> {
  return async (...args: unknown[]): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        setLoading(true);

        const result = await asyncFn(...args);
        options?.onFinish?.();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          const delay = options?.retryDelay || 1000 * attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } finally {
        if (attempt === maxRetries || !lastError) {
          setLoading(false);
        }
      }
    }

    options?.onError?.(lastError!);
    throw lastError!;
  };
}

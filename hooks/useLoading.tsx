"use client";

import { useState, useCallback, ReactNode } from "react";
import LoadingModal from "@/components/LoadingModal";

export interface UseLoadingOptions {
  initialLoading?: boolean;
  showLoadingModal?: boolean;
  loadingMessage?: string;
  loadingSubMessage?: string;
  onError?: (error: Error) => void;
  onSuccess?: (result?: unknown) => void;
  onFinally?: () => void;
}

export interface UseLoadingReturn {
  loading: boolean;
  error: Error | null;
  execute: <T>(
    asyncFn: () => Promise<T>,
    options?: {
      loadingMessage?: string;
      loadingSubMessage?: string;
      successMessage?: string;
      onSuccess?: (result: T) => void;
      onError?: (error: Error) => void;
    },
  ) => Promise<T>;
  reset: () => void;
  loadingMessage: string;
  loadingSubMessage: string | undefined;
  LoadingModal: ReactNode;
}

/**
 * Custom hook for managing loading states with optional LoadingModal.
 * Perfect for use with async/await functions that need loading feedback.
 *
 * @param options - Configuration options
 * @returns Object with loading state, execute function, and optional LoadingModal
 *
 * Basic usage:
 * function MyComponent() {
 *   const { loading, execute } = useLoading()
 *   const handleClick = async () => {
 *     await execute(async () => {
 *       await api.saveData()
 *     })
 *   }
 *   return <button onClick={handleClick} disabled={loading}>Save</button>
 * }
 *
 * With LoadingModal:
 * function MyComponent() {
 *   const { loading, execute, LoadingModal } = useLoading({
 *     showLoadingModal: true,
 *     loadingMessage: 'กำลังบันทึกข้อมูล',
 *     loadingSubMessage: 'กรุณารอสักครู่...'
 *   })
 *   const handleSubmit = async (formData: FormData) => {
 *     await execute(
 *       async () => {
 *         await api.submitForm(formData)
 *       },
 *       {
 *         loadingMessage: 'กำลังส่งข้อมูล',
 *         loadingSubMessage: 'อาจใช้เวลา 3-5 วินาที',
 *         onSuccess: () => toast.success('บันทึกสำเร็จ')
 *       }
 *     )
 *   }
 *   return (
 *     <div>
 *       <button onClick={handleSubmit} disabled={loading}>
 *         {loading ? 'กำลังส่ง...' : 'ส่งข้อมูล'}
 *       </button>
 *       {LoadingModal}
 *     </div>
 *   )
 * }
 *
 * With error handling:
 * function MyComponent() {
 *   const { loading, execute, error } = useLoading({
 *     onError: (err) => toast.error(err.message)
 *   })
 *   const handleFetch = async () => {
 *     try {
 *       await execute(async () => {
 *         const data = await api.fetchData()
 *         return data
 *       })
 *     } catch (err) {
 *       // Already handled by onError option
 *     }
 *   }
 *   return <button onClick={handleFetch}>Fetch</button>
 * }
 */
export function useLoading(options: UseLoadingOptions = {}): UseLoadingReturn {
  const {
    initialLoading = false,
    showLoadingModal = false,
    loadingMessage: defaultMessage = "กำลังโหลด",
    loadingSubMessage: defaultSubMessage,
    onError: globalOnError,
    onSuccess: globalOnSuccess,
    onFinally: globalOnFinally,
  } = options;

  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState<Error | null>(null);
  const [currentMessage, setCurrentMessage] = useState(defaultMessage);
  const [currentSubMessage, setCurrentSubMessage] = useState<
    string | undefined
  >(defaultSubMessage);

  const execute = useCallback(
    async <T,>(
      asyncFn: () => Promise<T>,
      executeOptions: {
        loadingMessage?: string;
        loadingSubMessage?: string;
        successMessage?: string;
        onSuccess?: (result: T) => void;
        onError?: (error: Error) => void;
      } = {},
    ): Promise<T> => {
      const { loadingMessage, loadingSubMessage, onSuccess, onError } =
        executeOptions;

      if (loadingMessage) setCurrentMessage(loadingMessage);
      if (loadingSubMessage !== undefined)
        setCurrentSubMessage(loadingSubMessage);

      setLoading(true);
      setError(null);

      try {
        const result = await asyncFn();

        onSuccess?.(result);
        globalOnSuccess?.(result);

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);

        executeOptions.onError?.(error);
        globalOnError?.(error);

        throw error;
      } finally {
        setLoading(false);
        setTimeout(() => {
          setCurrentMessage(defaultMessage);
          setCurrentSubMessage(defaultSubMessage);
        }, 500);
        globalOnFinally?.();
      }
    },
    [
      defaultMessage,
      defaultSubMessage,
      globalOnError,
      globalOnSuccess,
      globalOnFinally,
    ],
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setCurrentMessage(defaultMessage);
    setCurrentSubMessage(defaultSubMessage);
  }, [defaultMessage, defaultSubMessage]);

  const LoadingModalComponent = showLoadingModal ? (
    <LoadingModal
      isOpen={loading}
      message={currentMessage}
      subMessage={currentSubMessage}
    />
  ) : null;

  return {
    loading,
    error,
    execute,
    reset,
    loadingMessage: currentMessage,
    loadingSubMessage: currentSubMessage,
    LoadingModal: LoadingModalComponent,
  };
}

/**
 * Simplified hook for quick loading state without modal.
 * Useful when you just need boolean loading state.
 *
 * Usage:
 * function MyComponent() {
 *   const { loading, execute } = useSimpleLoading()
 *   return <button onClick={() => execute(myAsyncFunction)} disabled={loading}>
 *     {loading ? 'Loading...' : 'Submit'}
 *   </button>
 * }
 */
export function useSimpleLoading() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async <T,>(asyncFn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        return await asyncFn();
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
  }, []);

  return { loading, error, execute, reset };
}

/**
 * Advanced hook for managing multiple loading states.
 * Useful when you have multiple async operations and need to track each separately.
 *
 * Usage:
 * function MyComponent() {
 *   const { loading, setLoading } = useMultiLoading({
 *     fetchUser: false,
 *     fetchPosts: false,
 *     fetchSettings: false
 *   })
 *   const loadAll = async () => {
 *     setLoading('fetchUser', true)
 *     setLoading('fetchPosts', true)
 *     try {
 *       await Promise.all([
 *         fetchUser().then(() => setLoading('fetchUser', false)),
 *         fetchPosts().then(() => setLoading('fetchPosts', false))
 *       ])
 *     } catch (err) {
 *       setLoading('fetchUser', false)
 *       setLoading('fetchPosts', false)
 *     }
 *   }
 *   return (
 *     <div>
 *       <button onClick={loadAll} disabled={loading.fetchUser || loading.fetchPosts}>
 *         Load All
 *       </button>
 *     </div>
 *   )
 * }
 */
export function useMultiLoading<T extends Record<string, boolean>>(
  initialStates: T,
): {
  loading: T;
  setLoading: (key: keyof T, value: boolean) => void;
  setMultipleLoading: (states: Partial<T>) => void;
  isLoading: () => boolean;
} {
  const [loading, setLoadingState] = useState<T>(initialStates);

  const setLoading = useCallback((key: keyof T, value: boolean) => {
    setLoadingState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setMultipleLoading = useCallback((states: Partial<T>) => {
    setLoadingState((prev) => ({ ...prev, ...states }));
  }, []);

  const isLoading = useCallback(() => {
    return Object.values(loading).some((v) => v);
  }, [loading]);

  return { loading, setLoading, setMultipleLoading, isLoading };
}

export default useLoading;

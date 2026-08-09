import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError } from '../lib/api';

type Status = 'loading' | 'refreshing' | 'ready' | 'error';

export interface Resource<T> {
  data: T | null;
  error: string | null;
  status: Status;
  /** Só no primeiro carregamento — em refetch mantemos o conteúdo anterior. */
  isInitialLoading: boolean;
  isRefreshing: boolean;
  reload: () => void;
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  console.error('[recurso] erro inesperado', error);
  return 'Não foi possível carregar os dados. Tente novamente.';
}

/**
 * Busca dados da API mantendo o conteúdo anterior visível durante o refetch
 * (evita o "piscar" de skeleton a cada atualização).
 */
export function useApiResource<T>(fetcher: () => Promise<T>, deps: DependencyList): Resource<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [nonce, setNonce] = useState(0);

  const hasDataRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setStatus(hasDataRef.current ? 'refreshing' : 'loading');

    fetcherRef
      .current()
      .then((result) => {
        if (cancelled) return;
        hasDataRef.current = true;
        setData(result);
        setError(null);
        setStatus('ready');
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(toMessage(cause));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return {
    data,
    error,
    status,
    isInitialLoading: status === 'loading',
    isRefreshing: status === 'refreshing',
    reload,
  };
}

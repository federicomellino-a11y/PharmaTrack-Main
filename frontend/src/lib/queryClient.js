import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // dati "freschi" per 30s: niente refetch su navigazione
      gcTime: 5 * 60_000,          // resta in cache 5 min
      refetchOnWindowFocus: false, // niente flash quando torni sulla tab
      retry: 1,
    },
  },
});

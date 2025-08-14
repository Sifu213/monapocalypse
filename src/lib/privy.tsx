import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Client React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

interface Web3ProvidersProps {
  children: ReactNode;
}

export function Web3Providers({ children }: Web3ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <PrivyProvider
        appId={import.meta.env.VITE_PRIVY_APP_ID || ''}
        config={{
          appearance: {
            theme: 'dark',
            accentColor: '#8B5CF6',
          },
          loginMethods: ['email', 'wallet', 'google'],
          embeddedWallets: {
            createOnLogin: 'users-without-wallets',
          },
        }}
      >
        {children}
      </PrivyProvider>
    </QueryClientProvider>
  );
}
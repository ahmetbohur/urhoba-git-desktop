import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App';
import { AppShell } from './app/AppShell';
import './index.css';

/**
 * Git sorguları ucuz değil ama sonuçları da uzun süre geçerli kalmıyor.
 * Tazeleme işini dosya izleyicisinin olaylarına bıraktığımız için pencere
 * odağında otomatik yeniden çekmeyi kapatıyoruz — aksi hâlde her alt+tab
 * bir dizi git komutu tetikliyor.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('#root bulunamadı');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <App />
      </AppShell>
    </QueryClientProvider>
  </StrictMode>,
);

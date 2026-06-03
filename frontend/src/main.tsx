import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './index.css';
import { RecipeEditor } from './inventory/RecipeEditor';
import { CompleteExecutionButton } from './inventory/CompleteExecutionButton';

// Sample identifiers for the demo page. In a real app these come from routing
// / the selected service + scheduled execution. Relations are ID-based only.
const SAMPLE_SERVICE_ID = '00000000-0000-4000-8000-000000000001';
const SAMPLE_SERVICE_NAME = 'Композитная реставрация';
const SAMPLE_EXECUTION_ID = '00000000-0000-4000-8000-000000000002';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

function App() {
  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">
          Dental OS
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">
          Склад и составы услуг
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-slate-500">
          Настраивайте материалы услуги без кода и завершайте процедуры —
          списание со склада произойдёт автоматически.
        </p>
      </header>

      {/* Feature A — no-code recipe editor, opened via the pencil icon. */}
      <section className="rounded-2xl border border-slate-200/70 bg-white p-7 shadow-soft">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {SAMPLE_SERVICE_NAME}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Нажмите на карандаш, чтобы изменить состав материалов.
            </p>
          </div>
          <RecipeEditor
            serviceId={SAMPLE_SERVICE_ID}
            serviceName={SAMPLE_SERVICE_NAME}
          />
        </div>
      </section>

      {/* Feature B — optimistic completion with auto-deduction. */}
      <section className="rounded-2xl border border-slate-200/70 bg-white p-7 shadow-soft">
        <h2 className="text-base font-semibold text-slate-900">
          Выполнение процедуры
        </h2>
        <p className="mt-1 mb-5 text-sm text-slate-500">
          При завершении система спишет материалы согласно текущему составу.
        </p>
        <CompleteExecutionButton executionId={SAMPLE_EXECUTION_ID} />
      </section>
    </main>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);

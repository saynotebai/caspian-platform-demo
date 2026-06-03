import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCompleteExecution } from './useCompleteExecution';

interface CompleteExecutionButtonProps {
  executionId: string;
  /** Optional label override; defaults to the Russian copy. */
  label?: string;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Small optimistic "complete procedure" control.
 *
 * On click it fires the mutation immediately (the UI updates optimistically via
 * the hook's cache writes). On success we show an inline animated check; on
 * error we surface a toast-like banner using only the API's safe message — no
 * technical or DB details ever reach the user.
 */
export function CompleteExecutionButton({
  executionId,
  label = 'Завершить процедуру'
}: CompleteExecutionButtonProps) {
  const mutation = useCompleteExecution();
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss the error toast after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const handleClick = () => {
    setToast(null);
    mutation.mutate(executionId, {
      onError: (error) => {
        // error.message is a user-safe string (see api.ts).
        setToast(error.message);
      }
    });
  };

  const done = mutation.isSuccess;

  return (
    <div className="relative inline-flex flex-col items-start gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={mutation.isPending || done}
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.span
              key="done"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.18 }}
              className="inline-flex items-center gap-2"
            >
              <CheckIcon className="h-4 w-4" />
              Завершено
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {mutation.isPending ? 'Завершаем…' : label}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {toast ? (
          <motion.div
            key="toast"
            role="alert"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
            className="max-w-xs rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600 shadow-soft"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default CompleteExecutionButton;

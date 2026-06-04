import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

// =============================================================================
// Optimistic "complete execution" hook.
//
// Marking a procedure completed triggers backend auto-deduction of the service
// recipe's materials. We update the UI instantly (optimistic), roll back on
// error, and surface only the API's safe `message` to the caller for a toast.
// =============================================================================

export type ServiceExecutionStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'DONE'
  | 'CANCELLED';

export interface ServiceExecution {
  id: string;
  status: ServiceExecutionStatus;
  completedAt?: string | null;
}

export const executionsKey = ['executions'] as const;
export const itemsKey = ['items'] as const;

interface MutationContext {
  previousExecutions?: ServiceExecution[];
}

/**
 * Returns a TanStack mutation. Callers pass an `executionId` to `mutate`.
 *
 * - onMutate: cancels in-flight queries, snapshots ['executions'] (if present)
 *   and optimistically marks the execution COMPLETED.
 * - onError: rolls back the snapshot. The thrown Error.message is a safe,
 *   user-facing string (see api.ts) — callers should toast `error.message`.
 * - onSettled: invalidates ['executions'] and ['items'] (stock changed).
 */
export function useCompleteExecution() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string, MutationContext>({
    mutationFn: (executionId: string) => api.completeExecution(executionId),

    onMutate: async (executionId) => {
      await queryClient.cancelQueries({ queryKey: executionsKey });

      const previousExecutions =
        queryClient.getQueryData<ServiceExecution[]>(executionsKey);

      // Optimistically mark this execution completed, if the list is cached.
      if (previousExecutions) {
        queryClient.setQueryData<ServiceExecution[]>(
          executionsKey,
          previousExecutions.map((exec) =>
            exec.id === executionId
              ? {
                  ...exec,
                  status: 'COMPLETED',
                  completedAt: new Date().toISOString()
                }
              : exec
          )
        );
      }

      return { previousExecutions };
    },

    onError: (_error, _executionId, context) => {
      // Roll back to the pre-mutation snapshot.
      if (context?.previousExecutions) {
        queryClient.setQueryData(executionsKey, context.previousExecutions);
      }
      // _error.message is safe to show; the caller toasts it.
    },

    onSettled: () => {
      // Refetch the source of truth: executions changed status, stock changed.
      void queryClient.invalidateQueries({ queryKey: executionsKey });
      void queryClient.invalidateQueries({ queryKey: itemsKey });
    }
  });
}

export default useCompleteExecution;

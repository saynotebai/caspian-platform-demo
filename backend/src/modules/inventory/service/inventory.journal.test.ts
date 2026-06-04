import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as repo from '../model/inventory.repository.js';
import { InventoryService } from './inventory.service.js';
import { NotFoundError } from '../../../lib/errors.js';

// =============================================================================
// Unit tests for the journal-history and low-stock methods. These delegate to
// the repository with the default Prisma client, so we mock the repo module
// (the deduct tests in inventory.service.test.ts instead pass a fake tx and
// keep the real repo — different strategy, kept in a separate file on purpose).
// =============================================================================

vi.mock('../model/inventory.repository.js');

describe('InventoryService — journal & low-stock', () => {
  let service: InventoryService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new InventoryService();
  });

  it('getTransactionHistory forwards the validated query to the repository', async () => {
    const rows = [{ id: 'tx-1' }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(repo.listTransactions).mockResolvedValue(rows as any);

    const query = { limit: 25, offset: 10, type: 'CONSUMPTION' as const };
    await expect(service.getTransactionHistory(query)).resolves.toBe(rows);
    expect(repo.listTransactions).toHaveBeenCalledWith(query);
  });

  it('listLowStockNotifications coerces the resolved string to a boolean', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(repo.listLowStockNotifications).mockResolvedValue([] as any);

    await service.listLowStockNotifications({ resolved: 'false' });
    expect(repo.listLowStockNotifications).toHaveBeenLastCalledWith({ resolved: false });

    await service.listLowStockNotifications({});
    expect(repo.listLowStockNotifications).toHaveBeenLastCalledWith({ resolved: undefined });
  });

  it('resolveLowStockNotification maps P2025 to a friendly NotFoundError', async () => {
    const p2025 = Object.assign(new Error('record not found'), { code: 'P2025' });
    vi.mocked(repo.resolveLowStockNotification).mockRejectedValue(p2025);

    await expect(service.resolveLowStockNotification('missing-id')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

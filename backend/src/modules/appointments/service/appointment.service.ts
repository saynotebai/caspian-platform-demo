import prisma from '../../../lib/prisma.js';
import { inventoryService } from '../../inventory/service/inventory.service.js';

export class AppointmentService {
  // ---------------------------------------------------------------------------
  // Mark a service execution COMPLETED and auto-deduct its recipe materials.
  //
  // ATOMICITY: the status change, every stock deduction, and every journal row
  // run inside ONE prisma.$transaction. If the deduction throws (e.g.
  // InsufficientStockError) the ENTIRE transaction rolls back — the execution
  // is NOT marked completed, no stock is moved, and no journal rows persist.
  // Either everything commits or nothing does.
  // ---------------------------------------------------------------------------
  async completeServiceExecution(serviceExecutionId: string, actorUserId?: string) {
    return prisma.$transaction(async (tx) => {
      // Deduct first: if stock is insufficient this throws and rolls back the
      // status update below, so we never report COMPLETED without the stock move.
      await inventoryService.deductForServiceExecution(tx, serviceExecutionId, actorUserId);

      return tx.serviceExecution.update({
        where: { id: serviceExecutionId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    });
  }
}

export const appointmentService = new AppointmentService();
export default appointmentService;

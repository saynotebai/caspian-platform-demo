import { Router } from 'express';
import * as controller from '../controller/appointment.controller.js';
import { requireRole } from '../../../lib/auth.js';

// =============================================================================
// Appointments / service-execution routes. Mounted under /api in server.ts.
// =============================================================================

export const appointmentRouter: Router = Router();

// Completing an execution auto-deducts recipe materials atomically.
// Restricted to the clinician performing the work (or an admin).
appointmentRouter.post(
  '/executions/:id/complete',
  requireRole('ADMIN', 'DOCTOR'),
  controller.completeServiceExecution,
);

export default appointmentRouter;

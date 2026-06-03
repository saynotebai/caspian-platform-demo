import { Router } from 'express';
import * as controller from '../controller/appointment.controller.js';

// =============================================================================
// Appointments / service-execution routes. Mounted at the app root in server.ts.
// =============================================================================

export const appointmentRouter: Router = Router();

// Completing an execution auto-deducts recipe materials atomically.
appointmentRouter.post('/executions/:id/complete', controller.completeServiceExecution);

export default appointmentRouter;

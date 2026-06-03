import express, { type Application } from 'express';
import { inventoryRouter } from './modules/inventory/routes/inventory.routes.js';
import { appointmentRouter } from './modules/appointments/routes/appointment.routes.js';
import { errorHandler } from './lib/error-handler.js';

// =============================================================================
// Express application wiring.
//   json body parser → feature routers → central error handler (LAST).
// The error handler must be registered after the routers so that any error
// passed to next(err) is funneled through it.
// =============================================================================

export const app: Application = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, data: { status: 'ok' } });
});

app.use(inventoryRouter);
app.use(appointmentRouter);

// Central error handler — MUST be mounted last.
app.use(errorHandler);

// Only start listening when this module is run directly (not when imported,
// e.g. by tests). Detect direct execution via argv match against this file.
const isDirectRun = process.argv[1]
  ? import.meta.url === `file://${process.argv[1]}`
  : false;

if (isDirectRun) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`[server] Dental OS backend listening on port ${port}`);
  });
}

export default app;

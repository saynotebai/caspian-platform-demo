# Dental OS — Inventory Backend

Production-grade backend for the Dental OS **Inventory** module.
Stack: Node.js + TypeScript (strict) + Express + Prisma + PostgreSQL + Zod.

## What it does

When a service execution is marked **COMPLETED**, the materials defined by the
service's recipe are auto-deducted from stock. The status change, every stock
deduction, and every journal row all happen inside **one** `prisma.$transaction`
— so it is:

- **Atomic** — the status update + all deductions + all journal rows commit or
  roll back as a single unit. If any ingredient is short, nothing is persisted
  and the execution is *not* marked completed.
- **Race-safe** — stock is decremented with a conditional `updateMany`:
  `where: { id, currentStock: { gte: quantity } }, data: { currentStock: { decrement } }`.
  If `count === 0`, there was not enough stock (no negative balances possible
  even under concurrent completions).
- **Idempotent** — each CONSUMPTION journal row is unique per
  `(serviceExecutionId, inventoryItemId)`. A duplicate completion hits a P2002
  unique violation, which is caught and skipped, so re-running is a no-op.
- **Recipe-driven** — recipes are data (`ServiceRecipe` + `RecipeIngredient`),
  never hardcoded.
- **Stock-aware** — after each deduction, if the new stock drops below `minStock`
  a `LowStockNotification` row is created (exposed via the low-stock feed for
  admin / manager).
- **Auditable** — every movement is journaled; the history endpoint reconstructs
  the full trail (date, type, material, quantity, service, patient).
- **Friendly errors** — insufficient stock returns HTTP 409 with a Russian
  message: `Недостаточно материала: <name>. Остаток: <available>. Требуется: <required>.`
  Internal/DB errors are logged server-side and never leaked to the client.

## Structure

```
backend/
  prisma/schema.prisma                  Prisma models (migrations via prisma migrate dev)
  src/
    lib/
      prisma.ts                          Singleton PrismaClient
      errors.ts                          AppError / NotFound / InsufficientStock / Validation / Auth / Forbidden
      error-handler.ts                   Central Express error middleware
      auth.ts                            JWT authenticate + requireAuth / requireRole (+ tests)
    types/express.d.ts                   Request.auth augmentation
    modules/
      inventory/
        types/inventory.types.ts         Zod DTO schemas + inferred types
        model/inventory.repository.ts    Thin Prisma data-access helpers
        service/inventory.service.ts     Core business logic (deductForServiceExecution, etc.)
        service/inventory.service.test.ts  Vitest: deduction (fake tx, no DB)
        service/inventory.journal.test.ts  Vitest: journal + low-stock (mocked repo)
        controller/inventory.controller.ts
        routes/inventory.routes.ts
      appointments/
        service/appointment.service.ts   completeServiceExecution (atomic complete + deduct)
        controller/appointment.controller.ts
        routes/appointment.routes.ts
    server.ts                            Express app wiring
```

## Routes

Feature routers are mounted under **`/api`** (matching the frontend client base
`VITE_API_URL ?? '/api'`).

| Method | Path                                       | Roles            | Description                              |
| ------ | ------------------------------------------ | ---------------- | ---------------------------------------- |
| GET    | `/api/inventory/items`                     | any authed       | List inventory items                     |
| POST   | `/api/inventory/items`                     | ADMIN / MANAGER  | Create an inventory item                 |
| POST   | `/api/inventory/restock`                   | ADMIN / MANAGER  | Increment stock (+ RESTOCK journal)      |
| GET    | `/api/inventory/transactions`              | ADMIN / MANAGER  | Stock-movement journal (filters: `inventoryItemId`, `serviceExecutionId`, `type`, `limit`, `offset`) |
| GET    | `/api/inventory/low-stock`                 | ADMIN / MANAGER  | Low-stock notifications (filter: `resolved`) |
| PATCH  | `/api/inventory/low-stock/:id/resolve`     | ADMIN / MANAGER  | Mark a low-stock notification resolved   |
| GET    | `/api/services/:serviceId/recipe`          | any authed       | Get a service recipe                      |
| PUT    | `/api/services/:serviceId/recipe`          | ADMIN / MANAGER  | Upsert a service recipe (replace ingredients) |
| POST   | `/api/executions/:id/complete`             | ADMIN / DOCTOR   | Complete execution + auto-deduct materials |
| GET    | `/health`                                  | public           | Health check                             |

All responses use the envelope `{ ok: boolean, data?, message? }`.

## Authentication & roles

Auth is JWT-based. A `Bearer` token is verified by the `authenticate` middleware
(soft: a missing token is allowed through; an invalid/expired one → 401). The
decoded identity is attached to `req.auth = { userId, role }`. Per-route guards
enforce access:

- `requireAuth` → 401 unless authenticated.
- `requireRole(...roles)` → 401 unless authenticated, 403 unless the role matches.

Roles: `ADMIN`, `MANAGER`, `DOCTOR`, `RECEPTION`. Identity lives entirely in the
JWT claims (`sub` = userId, `role`) — no User table, consistent with
`InventoryTransaction.userId` being a plain id. The acting user for restocks and
completions is taken from the token, **never** from the request body.

Set `AUTH_JWT_SECRET` in the environment. Issue a token with the `signToken`
helper (`src/lib/auth.ts`) from your real login flow / for local testing:

```ts
import { signToken } from './lib/auth.js';
const token = signToken({ userId: 'u-123', role: 'MANAGER' });
// → Authorization: Bearer <token>
```

## Setup

```bash
npm install
cp .env.example .env        # then set DATABASE_URL
npm run prisma:migrate      # generate + apply migrations (prisma migrate dev)
npm run prisma:generate     # generate the Prisma client (run by migrate too)
npm run dev                 # tsx watch src/server.ts
```

Build / run / test:

```bash
npm run build   # tsc -p .
npm start       # node dist/server.js
npm test        # vitest run
```

> Migrations MUST be generated via `prisma migrate dev`. Do not hand-edit the
> generated SQL in production — treat `schema.prisma` as the source of truth.

## Integration point

Other modules trigger the atomic flow by calling:

```ts
import { appointmentService } from './modules/appointments/service/appointment.service.js';

await appointmentService.completeServiceExecution(serviceExecutionId, actorUserId);
```

This wraps `inventoryService.deductForServiceExecution(tx, ...)` and the status
update in a single transaction. To embed deduction in a larger transaction of
your own, call `inventoryService.deductForServiceExecution(tx, executionId, userId)`
directly with your transaction client.

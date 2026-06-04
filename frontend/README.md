# Dental OS — Inventory Frontend

Greenfield frontend for the Dental OS **Inventory** module. Built with React +
TypeScript (strict), Vite, Tailwind CSS, Framer Motion, TanStack Query, React
Hook Form, and Zod. The design language is intentionally minimal and breathing —
white cards, soft shadows, rounded corners, generous spacing, a single cyan
accent (`#06b6d4`).

## Running locally

```bash
npm install
# Point the app at your backend (defaults to a same-origin /api proxy):
echo 'VITE_API_URL=http://localhost:3000' > .env.local
npm run dev
```

Other scripts: `npm run build` (typecheck + production build) and
`npm run preview`.

The frontend talks to the backend in `../backend`, which exposes:

- `GET  /inventory/items` — list inventory items (with their unit)
- `GET  /services/:serviceId/recipe` — current recipe for a service
- `PUT  /services/:serviceId/recipe` — replace a service's recipe
- `POST /executions/:executionId/complete` — complete a procedure (auto-deducts stock)

All responses use the envelope `{ ok: true, data }` on success and
`{ ok: false, message }` on error, where `message` is always a user-safe string.
The API client (`src/inventory/api.ts`) unwraps `data` and, on any non-2xx,
throws an `Error` carrying only that safe `message` — internal/DB details never
reach the UI.

## Features

### A) No-code recipe editor

`src/inventory/RecipeEditor.tsx`. A pencil icon opens a soft, animated panel
(Framer Motion `AnimatePresence`, not a heavy modal). It fetches inventory items
and the current recipe via TanStack Query, and uses React Hook Form +
`useFieldArray` with a `zodResolver(UpsertRecipeDto)`. Each ingredient row is a
`<select>` of materials (value is **always the item id**, never a name), a
numeric quantity input, and the read-only unit code derived from the selected
item. Saving runs an optimistic mutation against `['recipe', serviceId]`, rolls
back on error with an inline safe message, and invalidates the query on settle
so the system uses the new config. Relations are strictly ID-based.

### B) Optimistic completion + auto-deduction

`src/inventory/useCompleteExecution.ts` and
`src/inventory/CompleteExecutionButton.tsx`. Completing a procedure triggers the
backend's atomic auto-deduction. The hook optimistically marks the execution
`COMPLETED` in the `['executions']` cache, rolls back on error, and invalidates
both `['executions']` and `['items']` (stock changed) on settle. The button
shows an animated check on success and a toast-like banner on error using only
the API's safe `message`.

## Design notes

- Optimistic UI everywhere; rollback on failure.
- Only safe, server-provided messages are shown — never technical details.
- ID-only relations (no name strings persisted or sent).
- Tailwind theme extends an `accent` color and a `soft` shadow; Inter font.

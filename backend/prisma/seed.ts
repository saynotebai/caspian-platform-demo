import { PrismaClient } from '@prisma/client';

// =============================================================================
// Idempotent demo seed. Re-runnable: every row is upserted by a stable id /
// unique key, so `npm run db:seed` can be applied repeatedly without dupes.
//
// IDs match the frontend demo (frontend/src/main.tsx), so the seeded database
// drives the recipe editor, completion button, journal and low-stock views.
// =============================================================================

const prisma = new PrismaClient();

// -- Stable identifiers -------------------------------------------------------
const UNIT = {
  G: '00000000-0000-4000-8000-000000000010',
  ML: '00000000-0000-4000-8000-000000000011',
  PCS: '00000000-0000-4000-8000-000000000012',
  PACK: '00000000-0000-4000-8000-000000000013',
} as const;

const ITEM = {
  COMPOSITE: '00000000-0000-4000-8000-000000000020',
  ADHESIVE: '00000000-0000-4000-8000-000000000021',
  GLOVES: '00000000-0000-4000-8000-000000000022',
  ANESTHETIC: '00000000-0000-4000-8000-000000000023',
  BUR: '00000000-0000-4000-8000-000000000024',
} as const;

const SERVICE_ID = '00000000-0000-4000-8000-000000000001'; // SAMPLE_SERVICE_ID
const RECIPE_ID = '00000000-0000-4000-8000-000000000030';
const EXECUTION_ID = '00000000-0000-4000-8000-000000000002'; // SAMPLE_EXECUTION_ID
const PATIENT_ID = '00000000-0000-4000-8000-000000000040';

async function main(): Promise<void> {
  // Units ---------------------------------------------------------------------
  const units: Array<{ id: string; name: string; code: string }> = [
    { id: UNIT.G, name: 'Грамм', code: 'г' },
    { id: UNIT.ML, name: 'Миллилитр', code: 'мл' },
    { id: UNIT.PCS, name: 'Штука', code: 'шт' },
    { id: UNIT.PACK, name: 'Упаковка', code: 'уп' },
  ];
  for (const u of units) {
    await prisma.unit.upsert({
      where: { code: u.code },
      create: u,
      update: { name: u.name },
    });
  }

  // Inventory items -----------------------------------------------------------
  const items: Array<{
    id: string;
    sku: string;
    name: string;
    unitId: string;
    currentStock: number;
    minStock: number;
  }> = [
    { id: ITEM.COMPOSITE, sku: 'COMP-FILTEK-Z250', name: 'Композит Filtek Z250', unitId: UNIT.G, currentStock: 25, minStock: 5 },
    { id: ITEM.ADHESIVE, sku: 'ADH-SINGLEBOND', name: 'Адгезив Single Bond', unitId: UNIT.ML, currentStock: 12, minStock: 3 },
    { id: ITEM.GLOVES, sku: 'GLV-NITRILE-M', name: 'Перчатки нитриловые, M', unitId: UNIT.PCS, currentStock: 400, minStock: 100 },
    { id: ITEM.ANESTHETIC, sku: 'AN-ULTRACAINE', name: 'Анестетик Ультракаин', unitId: UNIT.ML, currentStock: 50, minStock: 10 },
    { id: ITEM.BUR, sku: 'BUR-DIAMOND', name: 'Боры алмазные', unitId: UNIT.PCS, currentStock: 60, minStock: 20 },
  ];
  for (const it of items) {
    await prisma.inventoryItem.upsert({
      where: { sku: it.sku },
      create: it,
      update: { name: it.name, unitId: it.unitId, minStock: it.minStock },
    });
  }

  // Service + recipe ----------------------------------------------------------
  await prisma.service.upsert({
    where: { id: SERVICE_ID },
    create: { id: SERVICE_ID, name: 'Композитная реставрация' },
    update: { name: 'Композитная реставрация' },
  });

  await prisma.serviceRecipe.upsert({
    where: { serviceId: SERVICE_ID },
    create: { id: RECIPE_ID, serviceId: SERVICE_ID },
    update: {},
  });

  const ingredients: Array<{ inventoryItemId: string; quantity: number }> = [
    { inventoryItemId: ITEM.COMPOSITE, quantity: 2.5 },
    { inventoryItemId: ITEM.ADHESIVE, quantity: 0.3 },
    { inventoryItemId: ITEM.GLOVES, quantity: 1 },
  ];
  for (const ing of ingredients) {
    await prisma.recipeIngredient.upsert({
      where: {
        recipeId_inventoryItemId: { recipeId: RECIPE_ID, inventoryItemId: ing.inventoryItemId },
      },
      create: { recipeId: RECIPE_ID, inventoryItemId: ing.inventoryItemId, quantity: ing.quantity },
      update: { quantity: ing.quantity },
    });
  }

  // A scheduled execution to complete from the demo UI -------------------------
  await prisma.serviceExecution.upsert({
    where: { id: EXECUTION_ID },
    create: { id: EXECUTION_ID, serviceId: SERVICE_ID, patientId: PATIENT_ID, status: 'PENDING' },
    update: { status: 'PENDING', completedAt: null },
  });

  // A couple of RESTOCK rows so the journal has history out of the box ---------
  const restocks: Array<{ id: string; inventoryItemId: string; quantity: number }> = [
    { id: '00000000-0000-4000-8000-000000000050', inventoryItemId: ITEM.COMPOSITE, quantity: 10 },
    { id: '00000000-0000-4000-8000-000000000051', inventoryItemId: ITEM.ANESTHETIC, quantity: 20 },
  ];
  for (const tx of restocks) {
    await prisma.inventoryTransaction.upsert({
      where: { id: tx.id },
      create: { id: tx.id, inventoryItemId: tx.inventoryItemId, quantity: tx.quantity, type: 'RESTOCK' },
      update: {},
    });
  }

  console.log('[seed] done — units, items, recipe, execution and journal rows are in place.');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

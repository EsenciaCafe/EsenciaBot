import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.Deno = {
  env: { get: () => '' },
  serve: () => undefined
};

const {
  aggregateProductModifiers,
  compareProductModifiers,
  summarizePancakeToppings
} = await import('../supabase/functions/telegram-sales-bot/index.ts');

const sales = [{ id: 'sale-1', type: 'sale' }];
const saleLines = [
  {
    sale_id: 'sale-1',
    name: 'MiniPancakes',
    quantity: 1,
    selected_options: []
  },
  {
    sale_id: 'sale-1',
    name: 'MiniPancakes',
    quantity: 2,
    selected_options: [{ name: 'Chocolate', qty: 1, price: 0.5 }]
  },
  {
    sale_id: 'sale-1',
    name: 'Latte',
    quantity: 1,
    selected_options: [{ name: 'Leche Avena', qty: 1, price: 0.4 }]
  }
];
const voidLines = [
  {
    event_id: 'void-1',
    name: 'MiniPancakes',
    quantity: 3,
    selected_options: [{ name: 'Plane', qty: 1, price: 0 }]
  },
  {
    event_id: 'void-1',
    name: 'Latte',
    quantity: 2,
    selected_options: [{ name: 'Leche de Avena', qty: 1, price: 0.4 }]
  }
];

test('los toppings combinan vendidos y vaciados y unifican Plane como Sin Topping', () => {
  const result = summarizePancakeToppings(sales, saleLines, voidLines);
  assert.equal(result.soldPancakeServings, 3);
  assert.equal(result.voidPancakeServings, 3);
  assert.equal(result.pancakeServings, 6);

  const plain = result.items.find(item => item.name === 'Sin Topping');
  assert.deepEqual(
    { sold: plain?.soldUnits, voided: plain?.voidUnits, total: plain?.units },
    { sold: 1, voided: 3, total: 4 }
  );
});

test('los modificadores combinan vendidos y vaciados conservando el desglose', () => {
  const current = aggregateProductModifiers(sales, saleLines, voidLines);
  const products = compareProductModifiers(current, new Map());
  const latte = products.find(product => product.name === 'Latte');
  const oatMilk = latte?.modifiers.find(modifier => modifier.name === 'Leche de Avena');

  assert.deepEqual(
    { sold: latte?.soldUnits, voided: latte?.voidUnits, total: latte?.units },
    { sold: 1, voided: 2, total: 3 }
  );
  assert.deepEqual(
    { sold: oatMilk?.soldUnits, voided: oatMilk?.voidUnits, total: oatMilk?.units },
    { sold: 1, voided: 2, total: 3 }
  );
});

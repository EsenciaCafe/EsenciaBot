import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.Deno = {
  env: {
    get: (name) => ({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'publishable-test-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-test-key'
    })[name] || ''
  },
  serve: () => undefined
};

const {
  aggregateProductModifiers,
  compareProductModifiers,
  summarizePancakeToppings
} = await import('../supabase/functions/telegram-sales-bot/index.ts');
const {
  configureWebAccount,
  validateWebAccount
} = await import('../supabase/functions/esencia-panel-api/index.ts');

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

test('la cuenta web solo autoriza app_metadata asignado por el servidor', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: 'user-1',
    email: 'owner@example.com',
    app_metadata: { esencia_panel: true }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const identity = await validateWebAccount(new Request('https://panel.example', {
      headers: { Authorization: 'Bearer valid-user-token' }
    }));
    assert.equal(identity.kind, 'account');
    assert.equal(identity.userId, 'user-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('la creación de la cuenta web queda vinculada al Telegram autorizado', async () => {
  const originalFetch = globalThis.fetch;
  let receivedBody;
  globalThis.fetch = async (_url, init) => {
    receivedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'user-2', email: receivedBody.email }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    const result = await configureWebAccount(
      { kind: 'telegram', userId: 'telegram-1', user: {} },
      'OWNER@EXAMPLE.COM',
      'a-secure-password'
    );
    assert.equal(result.email, 'owner@example.com');
    assert.deepEqual(receivedBody.app_metadata, {
      esencia_panel: true,
      telegram_user_id: 'telegram-1'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

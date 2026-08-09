'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY ||= 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET ||= 'whsec_test_dummy';
process.env.EMAIL_PASS ||= 'dummy';

const {
  createStripeWebhookHandler,
  fulfillPaidCheckout,
  fulfillPaidInvoice,
  isAchzodLabInvoice,
} = require('./index');
const { MemoryFulfillmentStore, RedisFulfillmentStore } = require('./fulfillment-store');

const LAB_PRICE_ID = 'price_1SYP2XINPqlywHW9cRnHOUmq';
const OTHER_PRICE_ID = 'price_other_product';

const clone = (value) => JSON.parse(JSON.stringify(value));

function createFakeStripe({ sessions = [], invoices = [], event = null } = {}) {
  const sessionState = new Map(sessions.map((item) => [item.id, clone(item)]));
  const invoiceState = new Map(invoices.map((item) => [item.id, clone(item)]));
  return {
    checkout: { sessions: {
      async retrieve(id) { return clone(sessionState.get(id)); },
      async listLineItems(id) { return { data: clone(sessionState.get(id).line_items || []) }; },
    } },
    invoices: { async retrieve(id) { return clone(invoiceState.get(id)); } },
    paymentIntents: {},
    subscriptions: {},
    webhooks: { constructEvent() { return clone(event); } },
  };
}

function paymentCheckoutFixture(id) {
  return {
    id, mode: 'payment', payment_status: 'paid', invoice: null,
    payment_intent: { id: `pi_${id}`, metadata: {} }, subscription: null, metadata: {},
    customer_details: { email: 'client@example.com', name: 'Client Test' }, amount_total: 9900,
    line_items: [{ description: 'Coaching sans suivi', quantity: 1 }],
  };
}

function subscriptionCheckoutFixture(id) {
  return {
    id, mode: 'subscription', payment_status: 'paid', invoice: null,
    payment_intent: null, subscription: 'sub_test', metadata: {},
    customer_details: { email: 'client@example.com', name: 'Client Test' }, amount_total: 900,
    line_items: [{ description: 'Achzod Lab', quantity: 1, price: { id: LAB_PRICE_ID } }],
  };
}

function invoiceFixture(id, priceId = LAB_PRICE_ID, metadata = {}, subscriptionShape = 'legacy') {
  const invoice = {
    id, paid: true, status: 'paid', amount_paid: 900,
    customer_email: 'client@example.com', customer_name: 'Client Test', metadata,
    lines: { data: [{
      description: 'Achzod Lab', quantity: 1,
      price: { id: priceId, nickname: null, product: { name: 'Achzod Lab' } },
    }] },
  };
  if (subscriptionShape === 'legacy') invoice.subscription = `sub_${id}`;
  if (subscriptionShape === 'current') {
    invoice.parent = { subscription_details: { subscription: `sub_${id}` } };
  }
  return invoice;
}

function options(store, sendAdmin = async () => true) {
  return {
    store,
    now: () => new Date('2026-08-09T08:00:00.000Z'),
    sendOrderNotification: sendAdmin,
    sendCustomerOrderEmail: async () => true,
  };
}

async function testReplayRestartAndConcurrency() {
  const shared = new Map();
  const stripe = createFakeStripe({ invoices: [invoiceFixture('in_once')] });
  let sends = 0;
  const send = async () => { sends += 1; return true; };
  await Promise.all(Array.from({ length: 20 }, () =>
    fulfillPaidInvoice(stripe, 'in_once', 'Klarna abonnement', options(new MemoryFulfillmentStore(shared), send))));
  await fulfillPaidInvoice(stripe, 'in_once', 'replay', options(new MemoryFulfillmentStore(shared), send));
  assert.equal(sends, 1, 'concurrence et restart ne doivent envoyer qu’une fois');
}

async function testCrashBeforeAndAfterSmtp() {
  const beforeState = new Map();
  await new MemoryFulfillmentStore(beforeState).claim({
    key: 'invoice:in_before:admin_notification', owner: 'crashed', nowMs: Date.now(),
  });
  let beforeSends = 0;
  const beforeStripe = createFakeStripe({ invoices: [invoiceFixture('in_before')] });
  const before = await fulfillPaidInvoice(beforeStripe, 'in_before', 'replay', options(
    new MemoryFulfillmentStore(beforeState), async () => { beforeSends += 1; return true; },
  ));
  assert.equal(beforeSends, 0);
  assert.equal(before.adminNotification.skipped, true);

  const afterState = new Map();
  const afterStripe = createFakeStripe({ invoices: [invoiceFixture('in_after')] });
  let afterSends = 0;
  const ambiguousSmtp = async () => { afterSends += 1; throw new Error('connexion perdue après DATA'); };
  const failed = await fulfillPaidInvoice(afterStripe, 'in_after', 'Klarna', options(
    new MemoryFulfillmentStore(afterState), ambiguousSmtp,
  ));
  assert.equal(failed.delivered, false);
  assert.equal(failed.adminNotification.retrySuppressed, true);
  await fulfillPaidInvoice(afterStripe, 'in_after', 'replay', options(
    new MemoryFulfillmentStore(afterState), ambiguousSmtp,
  ));
  assert.equal(afterSends, 1, 'échec SMTP ambigu ne doit jamais être retenté');
}

async function testSubscriptionAndStrictFilter() {
  const checkout = subscriptionCheckoutFixture('cs_subscription');
  const allowed = invoiceFixture('in_allowed', LAB_PRICE_ID, {}, 'legacy');
  const allowedCurrent = invoiceFixture('in_allowed_current', LAB_PRICE_ID, {}, 'current');
  const oneOff = invoiceFixture('in_one_off', LAB_PRICE_ID, {}, 'none');
  const metadataOnly = invoiceFixture('in_metadata', OTHER_PRICE_ID, { notification_flow: 'achzodlab' });
  assert.equal(isAchzodLabInvoice(allowed), true);
  assert.equal(isAchzodLabInvoice(metadataOnly), false, 'metadata ne doit pas contourner le Price ID');
  let sends = 0;
  const store = new MemoryFulfillmentStore();
  assert.deepEqual(
    await fulfillPaidCheckout(createFakeStripe({ sessions: [checkout] }), checkout.id, 'Klarna', options(store)),
    { awaitingInvoiceNotification: true },
  );
  await fulfillPaidInvoice(createFakeStripe({ invoices: [allowed] }), allowed.id, 'Klarna', options(
    store, async () => { sends += 1; return true; },
  ));
  await fulfillPaidInvoice(
    createFakeStripe({ invoices: [allowedCurrent] }),
    allowedCurrent.id,
    'Klarna',
    options(store, async () => { sends += 1; return true; }),
  );
  const rejectedOneOff = await fulfillPaidInvoice(
    createFakeStripe({ invoices: [oneOff] }), oneOff.id, 'Klarna', options(store),
  );
  assert.deepEqual(rejectedOneOff, { ignored: true, reason: 'invoice_not_subscription' });
  const oneOffStripe = createFakeStripe({
    invoices: [oneOff],
    event: { id: 'evt_one_off', type: 'invoice.paid', data: { object: { id: oneOff.id } } },
  });
  const oneOffHandler = createStripeWebhookHandler(oneOffStripe, 'STRIPE_WEBHOOK_SECRET', 'Klarna', {
    fulfillment: options(store),
  });
  const oneOffResponse = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
  await oneOffHandler(
    { body: Buffer.from('{}'), headers: { 'stripe-signature': 'test' } },
    oneOffResponse,
  );
  assert.equal(oneOffResponse.statusCode, 200);
  assert.equal(oneOffResponse.body.ignored, true);
  assert.equal(oneOffResponse.body.reason, 'invoice_not_subscription');
  const ignored = await fulfillPaidInvoice(createFakeStripe({ invoices: [metadataOnly] }), metadataOnly.id, 'Klarna', options(store));
  assert.equal(ignored.ignored, true);
  assert.equal(sends, 2, 'formes subscription legacy et API récente acceptées');
}

async function requestJson(port) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      port, method: 'POST', path: '/', headers: {
        'content-type': 'application/json', 'stripe-signature': 'test', 'content-length': 2,
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end('{}');
  });
}

async function testRealHttpAlwaysAcknowledgesDeliveryFailure() {
  const invoice = invoiceFixture('in_http');
  const stripe = createFakeStripe({
    invoices: [invoice], event: { id: 'evt_http', type: 'invoice.paid', data: { object: { id: invoice.id } } },
  });
  const handler = createStripeWebhookHandler(stripe, 'STRIPE_WEBHOOK_SECRET', 'Klarna', {
    path: '/test',
    fulfillment: options(new MemoryFulfillmentStore(), async () => { throw new Error('SMTP down'); }),
  });
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => handler({ body: Buffer.concat(chunks), headers: req.headers }, {
      status(code) { res.statusCode = code; return this; },
      json(body) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); },
      send(body) { res.end(body); },
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await requestJson(server.address().port);
    assert.equal(response.status, 200);
    assert.equal(response.body.retrySuppressed, undefined);
    assert.equal(response.body.delivered, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function testRealRedisMultiProcessWhenAvailable() {
  if (spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status !== 0) {
    console.log('test-webhook-idempotency: redis-server absent, test Redis réel ignoré');
    return;
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'achzod-redis-'));
  const port = await freePort();
  const server = spawn('redis-server', ['--port', String(port), '--save', '', '--appendonly', 'no', '--dir', directory], {
    stdio: 'ignore',
  });
  const url = `redis://127.0.0.1:${port}`;
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const probe = net.createConnection({ host: '127.0.0.1', port });
      const ready = await new Promise((resolve) => {
        probe.once('connect', () => { probe.destroy(); resolve(true); });
        probe.once('error', () => resolve(false));
      });
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const workerCode = `const {RedisFulfillmentStore}=require('./fulfillment-store');(async()=>{const s=new RedisFulfillmentStore(process.argv[1]);const r=await s.claim({key:'multiprocess',owner:process.pid});console.log(r.status);await s.close()})().catch(e=>{console.error(e);process.exit(1)})`;
    const outputs = await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', workerCode, url], { cwd: __dirname });
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.on('exit', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`worker exit ${code}`)));
    })));
    assert.equal(outputs.filter((value) => value === 'acquired').length, 1);
    assert.equal(outputs.filter((value) => value === 'duplicate').length, 7);
    const store = new RedisFulfillmentStore(url);
    await store.close();
  } finally {
    server.kill('SIGTERM');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function testRedisStoreUsesAtomicSetNxWithTtl() {
  const calls = [];
  const fakeClient = {
    isReady: true,
    isOpen: true,
    on() {},
    async set(...args) { calls.push(args); return calls.length === 1 ? 'OK' : null; },
    async close() { this.isOpen = false; },
  };
  const store = new RedisFulfillmentStore('redis://unused', {
    client: fakeClient,
    claimTtlMs: 123_456,
    prefix: 'test',
  });
  assert.equal((await store.claim({ key: 'invoice:in_1:admin_notification', owner: 'one', nowMs: 1 })).status, 'acquired');
  assert.equal((await store.claim({ key: 'invoice:in_1:admin_notification', owner: 'two', nowMs: 2 })).status, 'duplicate');
  assert.deepEqual(calls[0].slice(0, 2), [
    'test:invoice:in_1:admin_notification',
    JSON.stringify({ status: 'claimed', owner: 'one', claimedAt: '1970-01-01T00:00:00.001Z' }),
  ]);
  assert.deepEqual(calls[0][2], { NX: true, PX: 123_456 });
  await store.close();
}

Promise.resolve()
  .then(testReplayRestartAndConcurrency)
  .then(testCrashBeforeAndAfterSmtp)
  .then(testSubscriptionAndStrictFilter)
  .then(testRealHttpAlwaysAcknowledgesDeliveryFailure)
  .then(testRedisStoreUsesAtomicSetNxWithTtl)
  .then(testRealRedisMultiProcessWhenAvailable)
  .then(() => console.log('test-webhook-idempotency: OK (at-most-once, crash, HTTP 2xx, filtre strict)'))
  .catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
  });

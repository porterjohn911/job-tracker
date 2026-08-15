// Firebase rules for the contracts node.
//
// These run in Node, not the browser: they parse database.rules.json and assert
// its shape. That is weaker than exercising the real rules engine — there is no
// emulator wired up here — but it catches the failures that actually happen to
// a hand-maintained rules file: a node quietly dropped in a merge, an access
// predicate loosened by copy-paste, or an enum that stopped constraining
// anything.
//
// Rules are not deployed by merging. firebase.json has no "database" key, so
// database.rules.json only reaches production when someone runs
// `firebase deploy --only database` or pastes it into the console. Until then
// the contracts node inherits the root's ".read": false / ".write": false and
// contract writes are simply denied.

const { expect, test } = require('@playwright/test');
const { readFileSync } = require('fs');
const { join } = require('path');

const RULES = JSON.parse(readFileSync(join(__dirname, '..', 'database.rules.json'), 'utf8')).rules;
const CONTRACTS = RULES['$company'].contracts;
const CONTRACT = CONTRACTS['$contractId'];

const isOwner = "root.child('users').child(auth.uid).child('role').val() === 'owner'";
const isManager = "root.child('users').child(auth.uid).child('role').val() === 'manager'";

test.describe('access', () => {
  // A contract creates invoices, so it is financial data. It follows payrates
  // (manager/owner) rather than jobs and customers, which any company-matched
  // worker can write.
  test('contracts are manager/owner only, like payrates', async () => {
    for (const op of ['.read', '.write']) {
      expect(CONTRACTS[op]).toContain('auth != null');
      expect(CONTRACTS[op]).toContain(isOwner);
      expect(CONTRACTS[op]).toContain(isManager);
      // The company-match clause that lets workers into jobs must NOT be here.
      expect(CONTRACTS[op]).not.toContain("child('company').val() === $company");
    }
  });

  test('the worker-accessible nodes were not tightened by this change', async () => {
    for (const node of ['jobs', 'customers', 'time']) {
      expect(RULES['$company'][node]['.write']).toContain("child('company').val() === $company");
    }
  });

  test('the owner-only bank node was not loosened', async () => {
    expect(RULES['$company'].transactions['.read']).toContain(isOwner);
    expect(RULES['$company'].transactions['.read']).not.toContain(isManager);
  });
});

test.describe('validation', () => {
  test('a contract must carry its own id and a status', async () => {
    expect(CONTRACT['.validate']).toContain("newData.hasChildren(['id', 'status'])");
    expect(CONTRACT.id['.validate']).toContain('newData.val() === $contractId');
  });

  // Status is the field that decides whether anything generates, so the rules
  // constrain it server-side too rather than trusting the client normalizer.
  test('status is constrained to the three known values', async () => {
    const v = CONTRACT.status['.validate'];
    expect(v).toContain('active');
    expect(v).toContain('paused');
    expect(v).toContain('ended');
    expect(v).toMatch(/matches\(\/\^\(active\|paused\|ended\)\$\//);
  });

  test('frequencies are constrained on both schedules', async () => {
    for (const kind of ['visits', 'billing']) {
      const v = CONTRACT[kind].freq['.validate'];
      ['weekly', 'biweekly', 'monthly', 'quarterly', 'annual'].forEach(f => expect(v).toContain(f));
      expect(CONTRACT[kind]['.validate']).toContain("hasChildren(['freq'])");
    }
  });

  test('intervals are bounded numbers, not arbitrary input', async () => {
    for (const kind of ['visits', 'billing']) {
      const v = CONTRACT[kind].interval['.validate'];
      expect(v).toContain('isNumber()');
      expect(v).toContain('>= 1');
      expect(v).toContain('<= 52');
    }
  });

  test('money cannot be negative', async () => {
    expect(CONTRACT.billing.amount['.validate']).toContain('isNumber()');
    expect(CONTRACT.billing.amount['.validate']).toContain('>= 0');
    expect(CONTRACT.addons.$addonId.amount['.validate']).toContain('>= 0');
    expect(CONTRACT.billing.items.$itemId.rate['.validate']).toContain('>= 0');
  });

  test('dates are either empty or YYYY-MM-DD', async () => {
    for (const v of [CONTRACT.startDate['.validate'], CONTRACT.endDate['.validate'],
      CONTRACT.visitsThrough['.validate'], CONTRACT.addons.$addonId.date['.validate']]) {
      expect(v).toContain("newData.val() === ''");
      expect(v).toContain('[0-9]{4}-[0-9]{2}-[0-9]{2}');
    }
  });

  test('add-ons carry their own id, matching their key', async () => {
    expect(CONTRACT.addons.$addonId['.validate']).toContain("hasChildren(['id'])");
    expect(CONTRACT.addons.$addonId.id['.validate']).toContain('newData.val() === $addonId');
  });

  // Unknown fields are rejected everywhere rather than stored. Contracts are
  // the one record here that turns into money, so nothing unrecognized should
  // be able to ride along inside one.
  test('unknown fields are rejected at every level', async () => {
    const paths = [CONTRACT, CONTRACT.visits, CONTRACT.billing, CONTRACT.billing.items.$itemId, CONTRACT.addons.$addonId];
    paths.forEach(p => expect(p.$other['.validate']).toBe(false));
  });

  // Every field ctNormalizeContract() produces must be writable, or the client
  // will silently fail to sync. This is the check most likely to catch a
  // mismatch introduced later on either side.
  test('every field the client writes is permitted', async () => {
    const written = ['id', 'name', 'customerId', 'status', 'startDate', 'endDate', 'visitsThrough',
      'visits', 'billing', 'addons', 'notes', 'created', 'updatedAt', 'updatedBy'];
    written.forEach(f => expect(CONTRACT[f], `missing rule for "${f}"`).toBeTruthy());

    const addon = ['id', 'desc', 'amount', 'date', 'billedInvoiceId', 'created'];
    addon.forEach(f => expect(CONTRACT.addons.$addonId[f], `missing addon rule for "${f}"`).toBeTruthy());

    ['freq', 'interval', 'amount', 'items'].forEach(f => expect(CONTRACT.billing[f], `missing billing rule for "${f}"`).toBeTruthy());
    ['desc', 'qty', 'rate'].forEach(f => expect(CONTRACT.billing.items.$itemId[f]).toBeTruthy());
  });
});

test.describe('company type', () => {
  test('type is optional and constrained to the three profiles', async () => {
    const v = RULES.companies.$companyId['.validate'];
    expect(v).toContain("!newData.child('type').exists()");
    expect(v).toContain('project|maintenance|management');
  });

  test('the company registry is still owner-only to write', async () => {
    expect(RULES.companies['.write']).toContain(isOwner);
    expect(RULES.companies['.write']).not.toContain(isManager);
  });
});

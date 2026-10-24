import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { createWorkoutHealthSync, type HealthExportJob } from '../healthExportEngine';

function fixture() {
  let enabled = true;
  let account = 'alice';
  let idempotent = true;
  let writeFails = false;
  let markFails = false;
  let writes = 0;
  let job: HealthExportJob = { workoutId: 'stable-id', status: 'pending', externalId: null };
  const receipts = new Map<string, string>();
  const statuses: HealthExportJob['status'][] = [];
  const sync = createWorkoutHealthSync({
    async jobs() { return job.status === 'exported' ? [] : [{ ...job }]; },
    async canExport() { return enabled; },
    currentAccount: () => account,
    supportsIdempotency: () => idempotent,
    async receipt(_, id) { return receipts.get(id) ?? null; },
    async saveReceipt(_, id, receipt) { receipts.set(id, receipt); },
    async mark(_, target, status, error, externalId) {
      if (markFails && status === 'exported') throw new Error('receipt sync failed');
      job = { ...target, status, externalId: externalId ?? target.externalId };
      statuses.push(status);
    },
    async write() {
      writes++;
      if (writeFails) throw new Error('permission denied');
      return 'health-native-id';
    },
  });
  return {
    sync, receipts, statuses, writes: () => writes,
    enabled: (value: boolean) => { enabled = value; },
    account: (value: string) => { account = value; },
    idempotent: (value: boolean) => { idempotent = value; },
    writeFails: (value: boolean) => { writeFails = value; },
    markFails: (value: boolean) => { markFails = value; },
    job: (value: HealthExportJob) => { job = value; },
  };
}

describe('reliable optional workout health exports', () => {
  it('passes stable client IDs through both native drivers and uses HealthKit raw metadata keys', () => {
    const ios = readFileSync(new URL('../../health/ios.ts', import.meta.url), 'utf8');
    const android = readFileSync(new URL('../../health/android.ts', import.meta.url), 'utf8');
    const legacy = readFileSync(new URL('../../health/index.ts', import.meta.url), 'utf8');
    assert.match(ios, /withMetadataKey: 'HKSyncIdentifier'/);
    assert.match(ios, /HKSyncIdentifier: syncId, HKSyncVersion: 1/);
    assert.doesNotMatch(ios, /HKMetadataKeySyncIdentifier:/);
    assert.match(android, /clientRecordId: healthWorkoutClientRecordId\(w\.clientId\), clientRecordVersion: 1/);
    assert.match(legacy, /clientId: w\.id/);
  });
  it('rechecks current consent and never writes after consent is disabled or the account changes', async () => {
    const f = fixture();
    f.enabled(false);
    const result = await f.sync('alice');
    assert.equal(result.pending, 1);
    assert.match(result.error!, /paused/);
    assert.equal(f.writes(), 0);
    f.account('bob');
    await assert.rejects(f.sync('alice'), /account changed/);
  });
  it('stores a durable native receipt and avoids another native write if server confirmation fails', async () => {
    const f = fixture();
    f.markFails(true);
    const failed = await f.sync('alice');
    assert.equal(failed.pending, 1);
    assert.equal(f.receipts.get('stable-id'), 'health-native-id');
    f.markFails(false);
    f.enabled(false);
    assert.deepEqual(await f.sync('alice'), { pending: 0 });
    assert.equal(f.writes(), 1);
  });
  it('reuses an already exported server link without re-exporting', async () => {
    const f = fixture();
    f.job({ workoutId: 'stable-id', status: 'failed', externalId: 'existing-health-id' });
    assert.deepEqual(await f.sync('alice'), { pending: 0 });
    assert.equal(f.writes(), 0);
  });
  it('returns explicit native failure and retries only with a platform idempotency guarantee', async () => {
    const f = fixture();
    f.writeFails(true);
    assert.match((await f.sync('alice')).error!, /permission denied/);
    assert.equal(f.statuses.at(-1), 'failed');
    f.writeFails(false);
    assert.deepEqual(await f.sync('alice'), { pending: 0 });
    assert.equal(f.writes(), 2);
    const ambiguous = fixture();
    ambiguous.idempotent(false);
    ambiguous.writeFails(true);
    await ambiguous.sync('alice');
    assert.equal(ambiguous.statuses.at(-1), 'needs_review');
    ambiguous.writeFails(false);
    assert.match((await ambiguous.sync('alice')).error!, /duplicate/);
    assert.equal(ambiguous.writes(), 1);
  });
  it('does not blindly replay an interrupted non-idempotent native operation', async () => {
    const f = fixture();
    f.idempotent(false);
    f.job({ workoutId: 'stable-id', status: 'writing', externalId: null });
    assert.match((await f.sync('alice')).error!, /interrupted/);
    assert.equal(f.writes(), 0);
  });
});

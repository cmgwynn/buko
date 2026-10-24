import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readPhoto } from '../../../supabase/functions/account/assets';
import { serializeAccountExport } from './serialization';

describe('durable bounded photo export', () => {
  it('preserves actual binary bytes and the image content type without response credentials', async () => {
    const bytes = new Uint8Array([0, 127, 128, 255, 10]);
    const photo = await readPhoto(new Response(bytes, {
      headers: { 'Content-Type': 'image/jpeg; charset=binary', Authorization: 'secret' },
    }), 100);
    assert.deepEqual([...Buffer.from(photo.base64, 'base64')], [...bytes]);
    assert.equal(photo.contentType, 'image/jpeg');
    assert.equal(photo.byteLength, bytes.length);
    assert.ok(!JSON.stringify(photo).includes('secret'));
  });
  it('enforces the actual streamed byte count even without Content-Length', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(4)); },
      cancel() { cancelled = true; },
    });
    await assert.rejects(readPhoto(new Response(body, { headers: { 'Content-Type': 'image/png' } }), 6), /No partial export/);
    assert.equal(cancelled, true);
  });
  it('fails a truncated or interrupted body rather than creating a partial asset', async () => {
    await assert.rejects(readPhoto(new Response(new Uint8Array([1, 2]), {
      headers: { 'Content-Type': 'image/png', 'Content-Length': '3' },
    }), 100), /download was incomplete/);
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new Error('download interrupted')); },
    });
    await assert.rejects(readPhoto(new Response(body, { headers: { 'Content-Type': 'image/png' } }), 100), /download interrupted/);
  });
  it('caps the final compact device archive, including base64 expansion and local data', () => {
    const data = { assets: [{ path: 'owner/photo.jpg', base64: 'AA==' }], device: { recipe_draft: {} } };
    assert.deepEqual(JSON.parse(serializeAccountExport(data)), data);
    assert.throws(() => serializeAccountExport({ device: { unsaved: 'x'.repeat(20 * 1024 * 1024) } }), /exceeds 20 MiB.*No partial file/);
  });
});

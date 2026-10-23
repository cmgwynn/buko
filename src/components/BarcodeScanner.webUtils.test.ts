import assert from 'node:assert/strict';
import test from 'node:test';
import { BarcodeFormat, BinaryBitmap, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from '@zxing/library';
import { createBarcodeHints, getCameraErrorMessage, getCameraSupportMessage, stopMediaStream } from './BarcodeScanner.webUtils';

test('camera support requires a secure context and getUserMedia', () => {
  assert.match(getCameraSupportMessage(false, true) ?? '', /HTTPS/);
  assert.match(getCameraSupportMessage(true, false) ?? '', /does not support camera access/);
  assert.equal(getCameraSupportMessage(true, true), undefined);
});

test('camera errors explain permission, unavailable-camera, and in-use cases', () => {
  assert.match(getCameraErrorMessage(new DOMException('denied', 'NotAllowedError')), /access was blocked/);
  assert.match(getCameraErrorMessage(new DOMException('missing', 'NotFoundError')), /No camera was found/);
  assert.match(getCameraErrorMessage(new DOMException('busy', 'NotReadableError')), /other apps using the camera/);
  assert.match(getCameraErrorMessage(new Error('unexpected')), /Safari camera permissions/);
});

test('stream cleanup is safe without MediaStream and stops tracks when available', () => {
  let stopped = 0;
  stopMediaStream(undefined);
  stopMediaStream({ getTracks: () => [{ stop: () => { stopped += 1; } }] });
  assert.equal(stopped, 1);
});

test('restricted ZXing decoder reads a synthetic UPC-A barcode', () => {
  // ZXing has no UPC-A/EAN-13 writer. Render UPC-A's L digits and complementary R digits.
  const leftPatterns = [
    '0001101', '0011001', '0010011', '0111101', '0100011',
    '0110001', '0101111', '0111011', '0110111', '0001011',
  ];
  const upc = '036000291452';
  const left = [...upc.slice(0, 6)].map(digit => leftPatterns[Number(digit)]).join('');
  const right = [...upc.slice(6)].map(digit =>
    [...leftPatterns[Number(digit)]].map(bit => bit === '0' ? '1' : '0').join('')
  ).join('');
  const modules = `${'0'.repeat(12)}101${left}01010${right}101${'0'.repeat(12)}`;
  const scale = 3;
  const width = modules.length * scale;
  const height = 100;
  const pixels = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels[y * width + x] = modules[Math.floor(x / scale)] === '1' ? 0 : 255;
    }
  }

  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)));
  const result = new MultiFormatReader().decode(bitmap, createBarcodeHints());
  assert.equal(result.getText(), '036000291452');
  assert.equal(result.getBarcodeFormat(), BarcodeFormat.UPC_A);
});

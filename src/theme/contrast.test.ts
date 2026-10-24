import assert from 'node:assert/strict';
import test from 'node:test';
import { colors } from './index';

function rgb(hex: string) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}
function luminance(values: number[]) {
  const linear = values.map((n) => n / 255 <= 0.04045 ? n / 255 / 12.92 : ((n / 255 + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
test('score numbers meet normal-text contrast on each translucent score background', () => {
  for (const color of Object.values(colors.score)) {
    const background = rgb(color).map((n) => n * (31 / 255) + 255 * (224 / 255));
    const contrast = (luminance(background) + 0.05) / (luminance(rgb(colors.text)) + 0.05);
    assert.ok(contrast >= 4.5, `${color}: ${contrast}`);
  }
});

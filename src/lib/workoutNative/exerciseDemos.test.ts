import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PATTERNS, type Pose, type Pt } from './demoPoses';
import { BUILTIN_EXERCISE_DEMOS, getExerciseDemo, hasBuiltinDemo } from './exerciseDemos';

function seededBuiltinNames(): string[] {
  const sql = readFileSync(join(__dirname, '../../../supabase/migrations/0003_fitness.sql'), 'utf8');
  const start = sql.indexOf('insert into public.exercises');
  assert.ok(start >= 0, 'seed insert found');
  const block = sql.slice(start, sql.indexOf(';', start));
  return [...block.matchAll(/^\s*\('((?:[^']|'')+)',\s*'(?:strength|cardio)'/gm)].map((m) => m[1].replace(/''/g, "'"));
}

describe('built-in exercise demos', () => {
  const names = seededBuiltinNames();

  it('parses the full seeded library', () => {
    assert.ok(names.length >= 80, `expected the full library, got ${names.length}`);
  });

  it('has an original demo with cues for every built-in exercise and nothing extra', () => {
    const missing = names.filter((n) => !hasBuiltinDemo(n));
    assert.deepEqual(missing, []);
    const extra = BUILTIN_EXERCISE_DEMOS.map((d) => d.name).filter((n) => !names.includes(n));
    assert.deepEqual(extra, []);
    assert.equal(new Set(BUILTIN_EXERCISE_DEMOS.map((d) => d.name.toLowerCase())).size, BUILTIN_EXERCISE_DEMOS.length);
  });

  it('gives each demo a valid pattern and three short cues', () => {
    for (const demo of BUILTIN_EXERCISE_DEMOS) {
      assert.ok(PATTERNS[demo.pattern], `${demo.name} pattern ${demo.pattern}`);
      assert.equal(demo.cues.length, 3, demo.name);
      for (const cue of demo.cues) assert.ok(cue.trim().length > 5 && cue.length <= 120, `${demo.name}: ${cue}`);
    }
  });

  it('keeps every pose inside the drawing area', () => {
    const inside = (p: Pt) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] >= 0 && p[0] <= 100 && p[1] >= -8 && p[1] <= 98;
    for (const [key, pattern] of Object.entries(PATTERNS)) {
      assert.equal(pattern.frames.length, 2, key);
      assert.equal(pattern.labels.length, 2, key);
      for (const frame of pattern.frames) {
        for (const [part, point] of Object.entries(frame as Pose)) {
          if (point) assert.ok(inside(point as Pt), `${key}.${part} = ${String(point)}`);
        }
      }
    }
  });

  it('matches names case-insensitively and falls back for custom exercises', () => {
    assert.equal(getExerciseDemo({ name: ' back squat ' }).generic, false);
    const custom = getExerciseDemo({ name: 'Back Squat', user_id: 'u1' });
    assert.equal(custom.generic, true, 'user exercises with a built-in name still get the generic demo');
    assert.equal(getExerciseDemo({ name: 'My sled push', category: 'cardio', user_id: 'u1' }).demo.pattern, 'walk');
    assert.equal(getExerciseDemo({ name: 'Zercher thing', category: 'strength' }).generic, true);
  });
});

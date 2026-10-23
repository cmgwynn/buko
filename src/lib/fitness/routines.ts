import type { Units } from '../../types';
import { distanceUnit, fromDisplayDistance, fromDisplayWeight, parseNum, toDisplayDistance, toDisplayWeight, weightUnit } from './format';
import type { Exercise } from './types';

export interface RoutineExercise {
  id?: string;
  exercise: Exercise;
  sets: number;
  reps: number | null;
  weightKg: number | null;
  durationS: number | null;
  distanceM: number | null;
}

export interface RoutineExerciseForm {
  key: string;
  original: RoutineExercise;
  sets: string;
  reps: string;
  weight: string;
  minutes: string;
  distance: string;
}

export function routineExerciseForm(item: RoutineExercise, units: Units, key: string): RoutineExerciseForm {
  return {
    key, original: item, sets: String(item.sets), reps: item.reps == null ? '' : String(item.reps),
    weight: item.weightKg == null ? '' : String(toDisplayWeight(item.weightKg, units)),
    minutes: item.durationS == null ? '' : String(item.durationS / 60),
    distance: item.distanceM == null ? '' : String(toDisplayDistance(item.distanceM, units)),
  };
}

export function validateRoutine(name: string, items: RoutineExerciseForm[], units: Units): RoutineExercise[] {
  if (!name.trim() || name.trim().length > 100) throw new Error('Use a routine name between 1 and 100 characters.');
  if (items.length === 0) throw new Error('Add at least one exercise.');
  return items.map((item) => {
    const read = (text: string, label: string, min: number, max: number, integer = false): number | null => {
      if (!text.trim()) return null;
      const value = parseNum(text);
      if (value === null || value < min || value > max || (integer && !Number.isInteger(value))) {
        throw new Error(`${item.original.exercise.name}: ${label} must be ${integer ? 'a whole number ' : ''}between ${min} and ${max}.`);
      }
      return value;
    };
    const sets = read(item.sets, 'sets', 1, 50, true);
    if (sets === null) throw new Error(`${item.original.exercise.name}: enter a set count.`);
    const cardio = item.original.exercise.category === 'cardio';
    const initial = routineExerciseForm(item.original, units, item.key);
    const reps = cardio ? null : read(item.reps, 'reps', 1, 1000, true);
    const weightText = item.weight === initial.weight && item.original.weightKg !== null
      ? String(item.original.weightKg / fromDisplayWeight(1, units)) : item.weight;
    const weight = cardio ? null : read(weightText, `weight (${weightUnit(units)})`, 0, 1500 / fromDisplayWeight(1, units));
    const minutes = read(item.minutes, 'minutes per set', 1 / 60, 1440);
    const distanceText = item.distance === initial.distance && item.original.distanceM !== null
      ? String(item.original.distanceM / fromDisplayDistance(1, units)) : item.distance;
    const distance = cardio ? read(distanceText, `distance (${distanceUnit(units)})`, 0, 1000) : null;
    if (distance === 0) throw new Error(`${item.original.exercise.name}: distance must be greater than zero, or left blank.`);
    if (cardio && minutes === null && distance === null) throw new Error(`${item.original.exercise.name}: enter a duration or distance target.`);
    return {
      ...item.original, sets, reps,
      weightKg: cardio ? null : item.weight === initial.weight ? item.original.weightKg : weight === null ? null : fromDisplayWeight(weight, units),
      durationS: item.minutes === initial.minutes ? item.original.durationS : minutes === null ? null : Math.round(minutes * 60),
      distanceM: !cardio ? null : item.distance === initial.distance ? item.original.distanceM : distance === null ? null : fromDisplayDistance(distance, units),
    };
  });
}

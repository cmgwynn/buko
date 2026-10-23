import type { RoutineExercise } from './routines';
import type { Exercise } from './types';

export interface StarterWorkout {
  id: string;
  name: string;
  category: 'Bodyweight' | 'Dumbbells' | 'Gym' | 'Cardio';
  description: string;
  items: { name: string; sets: number; reps?: number; minutes?: number }[];
}

/** Original ideas, not individualized training prescriptions. No fixed lifting weights. */
export const STARTER_WORKOUTS: StarterWorkout[] = [
  { id: 'bodyweight-basics', name: 'Bodyweight basics', category: 'Bodyweight', description: 'A short home session. Use an incline for push-ups if needed; rest 60-90 seconds between sets.',
    items: [{ name: 'Walking', sets: 1, minutes: 5 }, { name: 'Push-Up', sets: 2, reps: 6 }, { name: 'Glute Bridge', sets: 2, reps: 10 }, { name: 'Crunch', sets: 2, reps: 8 }] },
  { id: 'dumbbell-full-body', name: 'Dumbbell full body', category: 'Dumbbells', description: 'Choose a comfortable load and leave a few reps in reserve. Rest 60-90 seconds between sets.',
    items: [{ name: 'Walking', sets: 1, minutes: 5 }, { name: 'Goblet Squat', sets: 2, reps: 8 }, { name: 'Dumbbell Row', sets: 2, reps: 8 }, { name: 'Dumbbell Shoulder Press', sets: 2, reps: 8 }] },
  { id: 'gym-push', name: 'Gym push day', category: 'Gym', description: 'Chest, shoulders and triceps. Warm up with light practice sets and rest 90 seconds between working sets.',
    items: [{ name: 'Stationary Bike', sets: 1, minutes: 5 }, { name: 'Machine Chest Press', sets: 3, reps: 8 }, { name: 'Dumbbell Shoulder Press', sets: 2, reps: 8 }, { name: 'Triceps Pushdown', sets: 2, reps: 10 }] },
  { id: 'gym-pull', name: 'Gym pull day', category: 'Gym', description: 'Back and arms. Use controlled movement and a manageable load. Rest 60-90 seconds between sets.',
    items: [{ name: 'Walking', sets: 1, minutes: 5 }, { name: 'Lat Pulldown', sets: 3, reps: 8 }, { name: 'Seated Cable Row', sets: 2, reps: 10 }, { name: 'Dumbbell Curl', sets: 2, reps: 10 }] },
  { id: 'easy-cardio', name: 'Easy cardio break', category: 'Cardio', description: 'Keep a conversational pace and adjust the duration to your comfort.',
    items: [{ name: 'Walking', sets: 1, minutes: 5 }, { name: 'Stationary Bike', sets: 1, minutes: 10 }, { name: 'Walking', sets: 1, minutes: 5 }] },
  { id: 'walk-yoga', name: 'Walk and unwind', category: 'Cardio', description: 'An easy walk followed by familiar, gentle yoga movements within your comfortable range.',
    items: [{ name: 'Walking', sets: 1, minutes: 15 }, { name: 'Yoga', sets: 1, minutes: 10 }] },
];

export function starterWorkoutExercises(workout: StarterWorkout, exercises: Exercise[]): RoutineExercise[] {
  return workout.items.map((item) => {
    const exercise = exercises.find((row) => row.user_id === null && row.name === item.name);
    if (!exercise) throw new Error(`The built-in exercise "${item.name}" is missing. Apply the fitness database migration before using this template.`);
    return { exercise, sets: item.sets, reps: item.reps ?? null, weightKg: null, durationS: item.minutes ? item.minutes * 60 : null, distanceM: null };
  });
}

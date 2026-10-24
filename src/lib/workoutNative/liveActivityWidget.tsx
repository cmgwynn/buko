import type { LiveActivityFactory } from 'expo-widgets';
import type { WorkoutActivityProps } from './types';

/** Live Activities exist only in iOS native builds; see liveActivityWidget.ios.tsx. */
export const workoutLiveActivity: LiveActivityFactory<WorkoutActivityProps> | null = null;

/** Snapshot of the in-progress workout that the native layer mirrors. Never leaves the device. */
export interface WorkoutNativeState {
  sessionId: string;
  name: string;
  exerciseName: string | null;
  completedSets: number;
  totalSets: number;
  /** Epoch milliseconds when the current rest ends, or null when not resting. */
  restEndsAt: number | null;
  active: boolean;
  /** Optional: show the Live Activity as paused and hold rest alerts. Passing restEndsAt null with active true also works. */
  paused?: boolean;
}

export type LiveActivityStatus = 'unavailable' | 'idle' | 'active' | 'error';
export type AlertStatus = 'unknown' | 'granted' | 'denied' | 'unavailable';

export interface WorkoutNativeHandle {
  liveActivity: { status: LiveActivityStatus; reason?: string };
  alerts: { status: AlertStatus; reason?: string };
  /** Ask for notification permission. Call only from an explicit user action (e.g. an "Enable rest alerts" button). */
  enableAlerts(): Promise<boolean>;
  /** Cancel the pending rest alert/cue for the current rest (rest skipped or finished early). */
  dismissRest(): Promise<void>;
  /** Cancel pending rest alerts and show the Live Activity as paused until the state's restEndsAt changes. */
  pause(): Promise<void>;
  /** End the Live Activity and cancel every pending alert for the session. */
  end(): Promise<void>;
}

/** Props sent to the Live Activity. Kept JSON-serializable: dates are epoch milliseconds. */
export interface WorkoutActivityProps {
  workoutName: string;
  exerciseName: string;
  setsLabel: string;
  restStartMs: number | null;
  restEndMs: number | null;
  paused: boolean;
}

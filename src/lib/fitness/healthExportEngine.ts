export interface HealthExportJob {
  workoutId: string;
  status: 'pending' | 'writing' | 'failed' | 'needs_review' | 'exported';
  externalId: string | null;
}

export function createWorkoutHealthSync(deps: {
  jobs(userId: string): Promise<HealthExportJob[]>;
  canExport(userId: string): Promise<boolean>;
  currentAccount(): string | null;
  supportsIdempotency(): boolean;
  receipt(userId: string, workoutId: string): Promise<string | null>;
  saveReceipt(userId: string, workoutId: string, externalId: string): Promise<void>;
  mark(userId: string, job: HealthExportJob, status: HealthExportJob['status'], error: string | null, externalId?: string): Promise<void>;
  write(userId: string, job: HealthExportJob): Promise<string>;
}) {
  const pending = new Map<string, Promise<{ pending: number; error?: string }>>();
  function assertAccount(userId: string) {
    if (deps.currentAccount() !== userId) throw new Error('The workout account changed before health export.');
  }
  return function sync(userId: string): Promise<{ pending: number; error?: string }> {
    const running = pending.get(userId);
    if (running) return running;
    const operation = (async () => {
      assertAccount(userId);
      const jobs = await deps.jobs(userId);
      let completed = 0;
      for (const job of jobs) {
        assertAccount(userId);
        const receipt = job.externalId ?? await deps.receipt(userId, job.workoutId);
        if (receipt) {
          await deps.mark(userId, job, 'exported', null, receipt);
          completed++;
          continue;
        }
        if (job.status === 'needs_review' || job.status === 'writing' && !deps.supportsIdempotency()) {
          const error = 'A previous Health write was interrupted before confirmation. Check the health app before requesting another export; Buko will not risk adding a duplicate.';
          await deps.mark(userId, job, 'needs_review', error);
          return { pending: jobs.length - completed, error };
        }
        if (!await deps.canExport(userId)) return {
          pending: jobs.length - completed,
          error: 'Health export is paused. Turn on Save workouts to Health and allow access on a supported device to retry.',
        };
        assertAccount(userId);
        await deps.mark(userId, job, 'writing', null);
        try {
          const externalId = await deps.write(userId, job);
          if (!externalId) throw new Error('The health app did not confirm a saved workout.');
          await deps.saveReceipt(userId, job.workoutId, externalId);
          assertAccount(userId);
          await deps.mark(userId, job, 'exported', null, externalId);
          completed++;
        } catch (cause) {
          const error = cause instanceof Error ? cause.message : 'Workout export to Health failed.';
          const status = deps.supportsIdempotency() ? 'failed' : 'needs_review';
          await deps.mark(userId, job, status, error);
          return { pending: jobs.length - completed, error: `Health export needs attention: ${error}` };
        }
      }
      return { pending: 0 };
    })();
    pending.set(userId, operation);
    return operation.finally(() => { if (pending.get(userId) === operation) pending.delete(userId); });
  };
}

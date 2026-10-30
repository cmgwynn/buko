import { Notice, Screen } from '../../src/components/ui';
import { WeeklyTrainingPlan } from '../../src/components/workout/WeeklyTrainingPlan';
import { useWorkoutRecovery, useWorkoutSession } from '../../src/lib/fitness/session';

export default function TrainingPlanScreen() {
  const active = useWorkoutSession();
  const recovery = useWorkoutRecovery();
  return <Screen variant="form">
    {active.active ? <Notice tone="info">Finish or discard your live workout before changing training plans.</Notice> : null}
    <WeeklyTrainingPlan autoOpen disabled={active.active || !recovery.ready} />
  </Screen>;
}

import { Text } from 'react-native';
import { Heading, Notice, Screen } from '../../src/components/ui';
import { WeeklyTrainingPlan } from '../../src/components/workout/WeeklyTrainingPlan';
import { useWorkoutRecovery, useWorkoutSession } from '../../src/lib/fitness/session';
import { spacing, typography } from '../../src/theme';

export default function TrainingPlanScreen() {
  const active = useWorkoutSession();
  const recovery = useWorkoutRecovery();
  return <Screen variant="form">
    <Heading>Your 4-week plan</Heading>
    <Text style={[typography.body, { marginVertical: spacing.sm }]}>Pick your run days and how long feels comfortable. Buko ramps you up gently, then you review before anything is saved.</Text>
    {active.active ? <Notice tone="info">Finish or discard your live workout before changing training plans.</Notice> : null}
    <WeeklyTrainingPlan autoOpen disabled={active.active || !recovery.ready} />
  </Screen>;
}

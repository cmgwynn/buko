import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, Card, CardGrid, Heading, Notice, Screen } from '../../src/components/ui';
import { STARTER_WORKOUTS } from '../../src/lib/fitness/library';
import { spacing, typography } from '../../src/theme';

export default function WorkoutLibrary() {
  const router = useRouter();
  return (
    <Screen>
      <Heading>A little inspiration for your next session</Heading>
      <Notice tone="info">These are general ideas, not individualized training plans. Warm up, choose comfortable loads and stop if you feel pain or unwell. Adjust to your abilities and ask a qualified professional if unsure.</Notice>
      <CardGrid>
        {STARTER_WORKOUTS.map((workout) => (
          <Card key={workout.id}>
            <Text style={typography.label}>{workout.category}</Text>
            <Heading>{workout.name}</Heading>
            <Body muted>{workout.description}</Body>
            <View style={{ height: spacing.md }} />
            {workout.items.map((item, index) => <Text key={index} style={[typography.body, { marginBottom: spacing.xs }]}>{item.name} · {item.sets} {item.sets === 1 ? 'set' : 'sets'} {item.reps ? `of ${item.reps} reps` : `of ${item.minutes} min`}</Text>)}
            <Button title={`Customize ${workout.name}`} onPress={() => router.push({ pathname: '/routine/edit', params: { template: workout.id } })} />
          </Card>
        ))}
      </CardGrid>
      <Body muted>Customize opens an editable routine. Save it to your routines before starting; it does not log a workout.</Body>
    </Screen>
  );
}

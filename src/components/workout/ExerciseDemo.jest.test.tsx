import { render, screen } from '@testing-library/react-native';
import { expect, test } from '@jest/globals';
import { ExerciseDemo } from './ExerciseDemo';
import { BUILTIN_EXERCISE_DEMOS } from '../../lib/workoutNative/exerciseDemos';

test('every built-in exercise renders an original two-step demo with cues', async () => {
  for (const demo of BUILTIN_EXERCISE_DEMOS) {
    const view = await render(<ExerciseDemo exercise={{ name: demo.name, muscle_groups: ['chest'] }} />);
    expect(screen.getByLabelText(new RegExp(`^${demo.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} demonstration`))).toBeTruthy();
    expect(screen.getByText(demo.cues[0])).toBeTruthy();
    expect(screen.queryByText(/Custom exercises don’t have a specific demo/)).toBeNull();
    await view.unmount();
  }
});

test('custom exercises get a labelled generic demo or the user photo', async () => {
  const view = await render(<ExerciseDemo exercise={{ name: 'Sled push', category: 'strength', user_id: 'u1' }} />);
  expect(screen.getByText(/Custom exercises don’t have a specific demo/)).toBeTruthy();
  await view.unmount();
  await render(<ExerciseDemo exercise={{ name: 'Sled push', user_id: 'u1' }} imageUri="file:///photo.jpg" compact />);
  expect(screen.getByLabelText('Your photo for Sled push')).toBeTruthy();
  expect(screen.queryByText(/Original Buko illustration/)).toBeNull();
});

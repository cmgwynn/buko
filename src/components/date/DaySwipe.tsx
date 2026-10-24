import { useEffect, useRef, type PropsWithChildren } from 'react';
import { TextInput } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { addLocalDays } from '../../lib/dates';
import { useSelectedDate } from '../../providers/SelectedDateProvider';
import { DaySwipeContext } from './DaySwipeContext';
import { swipeDayDelta, SWIPE_LONG_PRESS_MS } from './swipe';

export function DaySwipe({ children }: PropsWithChildren) {
  const { selectedDate, setSelectedDate } = useSelectedDate();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const touchStarted = useRef(0);
  const blocked = useRef(false);
  const activated = useRef(false);
  const priorDate = useRef(selectedDate);
  const moveDate = (delta: number) => setSelectedDate(addLocalDays(selectedDate, delta));
  const gesture = Gesture.Pan()
    .runOnJS(true)
    .maxPointers(1)
    .activeOffsetX([-24, 24])
    .failOffsetY([-12, 12])
    .onTouchesDown((_event, manager) => {
      touchStarted.current = Date.now();
      activated.current = false;
      blocked.current = TextInput.State.currentlyFocusedInput() != null;
      if (blocked.current) manager.fail();
    })
    .onStart(() => { activated.current = true; })
    .onTouchesMove((_event, manager) => {
      if ((!activated.current && Date.now() - touchStarted.current >= SWIPE_LONG_PRESS_MS) || TextInput.State.currentlyFocusedInput() != null) {
        blocked.current = true;
        manager.fail();
      }
    })
    .onEnd((event, successful) => {
      const delta = swipeDayDelta(event, successful, blocked.current);
      if (delta) moveDate(delta);
    });

  useEffect(() => {
    if (priorDate.current === selectedDate) return;
    priorDate.current = selectedDate;
    opacity.value = reducedMotion ? 1 : withTiming(0.92, { duration: 70, reduceMotion: ReduceMotion.System }, () => {
      opacity.value = withTiming(1, { duration: 100, reduceMotion: ReduceMotion.System });
    });
  }, [selectedDate, opacity, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <DaySwipeContext.Provider value={gesture}>
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ flex: 1 }, animatedStyle]}>{children}</Animated.View>
    </GestureDetector>
    </DaySwipeContext.Provider>
  );
}

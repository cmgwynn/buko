import { createContext } from 'react';
import type { PanGesture } from 'react-native-gesture-handler';

export const DaySwipeContext = createContext<PanGesture | null>(null);

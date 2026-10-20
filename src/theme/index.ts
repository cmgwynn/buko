export const colors = {
  background: '#F7F6F2',
  surface: '#FFFFFF',
  surfaceMuted: '#EFEEE8',
  border: '#E3E5DF',
  text: '#1F2A26',
  textMuted: '#66736D',
  primary: '#4F7F6B',
  primaryPressed: '#3F6857',
  primarySoft: '#E3EEE8',
  onPrimary: '#FFFFFF',
  danger: '#C2503F',
  dangerSoft: '#F8E6E2',
  warning: '#B7791F',
  warningSoft: '#FAF0DC',

  // Health score ratings (see src/lib/scoring/config.ts for the bands)
  score: {
    excellent: '#3E9B6A',
    good: '#8DB255',
    mediocre: '#E0A13A',
    poor: '#D2604F',
    unknown: '#9AA39E',
  },

  macro: {
    calories: '#4F7F6B',
    protein: '#6C8EBF',
    carbs: '#E0A13A',
    fat: '#C98B7A',
  },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

export const typography = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  subheading: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text, lineHeight: 21 },
  small: { fontSize: 13, fontWeight: '400' as const, color: colors.textMuted, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted },
};

export const shadow = {
  card: {
    shadowColor: '#1F2A26',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
};

export const theme = { colors, spacing, radius, typography, shadow };
export type Theme = typeof theme;

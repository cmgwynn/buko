import { useState } from 'react';
import { Text as RNText, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors, typography } from '../theme';

const H = 160;
const PAD = { l: 38, r: 10, t: 10, b: 22 };

function niceRange(min: number, max: number): [number, number] {
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.15;
  return [min - pad, max + pad];
}

const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000);
const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export interface ChartPoint {
  date: string;
  value: number;
}

/** Faint dots for raw readings plus an optional bold line (e.g. the 7-day average). */
export function LineChart({ dots, line, unit }: { dots?: ChartPoint[]; line?: ChartPoint[]; unit: string }) {
  const [w, setW] = useState(0);
  const all = [...(dots ?? []), ...(line ?? [])];
  if (all.length === 0) return null;
  const xs = all.map((p) => dayNum(p.date));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const [y0, y1] = niceRange(Math.min(...all.map((p) => p.value)), Math.max(...all.map((p) => p.value)));
  const iw = Math.max(1, w - PAD.l - PAD.r);
  const ih = H - PAD.t - PAD.b;
  const px = (d: string) => PAD.l + (x1 === x0 ? iw / 2 : ((dayNum(d) - x0) / (x1 - x0)) * iw);
  const py = (v: number) => PAD.t + ih - ((v - y0) / (y1 - y0)) * ih;
  const path = line && line.length > 1 ? line.map((p, i) => `${i ? 'L' : 'M'}${px(p.date).toFixed(1)},${py(p.value).toFixed(1)}`).join(' ') : null;
  const ticks = [y0, (y0 + y1) / 2, y1];
  const first = all.reduce((a, b) => (a.date < b.date ? a : b)).date;
  const last = all.reduce((a, b) => (a.date > b.date ? a : b)).date;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityLabel={`Chart in ${unit}`}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          {ticks.map((t, i) => (
            <G key={i}>
              <Line x1={PAD.l} x2={w - PAD.r} y1={py(t)} y2={py(t)} stroke={colors.border} strokeWidth={1} />
              <SvgText x={PAD.l - 6} y={py(t) + 4} fontSize={10} fill={colors.textMuted} textAnchor="end">
                {(Math.round(t * 10) / 10).toString()}
              </SvgText>
            </G>
          ))}
          {(dots ?? []).map((p, i) => (
            <Circle key={i} cx={px(p.date)} cy={py(p.value)} r={3} fill={colors.primary} opacity={0.3} />
          ))}
          {path ? <Path d={path} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {line && line.length === 1 ? <Circle cx={px(line[0].date)} cy={py(line[0].value)} r={4} fill={colors.primary} /> : null}
          <SvgText x={PAD.l} y={H - 6} fontSize={10} fill={colors.textMuted}>{shortDate(first)}</SvgText>
          <SvgText x={w - PAD.r} y={H - 6} fontSize={10} fill={colors.textMuted} textAnchor="end">{shortDate(last)}</SvgText>
        </Svg>
      ) : (
        <View style={{ height: H }} />
      )}
      <RNText style={[typography.small, { textAlign: 'right' }]}>{unit}</RNText>
    </View>
  );
}

export interface Bar {
  label: string;
  value: number;
}

export function BarChart({ bars, unit }: { bars: Bar[]; unit: string }) {
  const [w, setW] = useState(0);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const ih = H - PAD.t - PAD.b;
  const slot = (w - PAD.l - PAD.r) / Math.max(1, bars.length);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          <Line x1={PAD.l} x2={w - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke={colors.border} strokeWidth={1} />
          <SvgText x={PAD.l - 6} y={PAD.t + 8} fontSize={10} fill={colors.textMuted} textAnchor="end">{Math.round(max).toLocaleString()}</SvgText>
          {bars.map((b, i) => {
            const bh = (b.value / max) * ih;
            return (
              <G key={i}>
                <Rect x={PAD.l + i * slot + slot * 0.2} y={PAD.t + ih - bh} width={slot * 0.6} height={Math.max(bh, b.value > 0 ? 2 : 0)} rx={4} fill={colors.primary} opacity={i === bars.length - 1 ? 1 : 0.55} />
                <SvgText x={PAD.l + i * slot + slot / 2} y={H - 6} fontSize={10} fill={colors.textMuted} textAnchor="middle">{b.label}</SvgText>
              </G>
            );
          })}
        </Svg>
      ) : (
        <View style={{ height: H }} />
      )}
      <RNText style={[typography.small, { textAlign: 'right' }]}>{unit}</RNText>
    </View>
  );
}

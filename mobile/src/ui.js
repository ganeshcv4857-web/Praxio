import { Component } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, useTheme } from './theme.js';

export function T({ kind = 'regular', size = 16, color, style, children, ...p }) {
  const t = useTheme();
  return (
    <Text style={[{ color: color ?? t.c.text, fontSize: size, lineHeight: Math.round(size * 1.4) }, font(t, kind), style]} {...p}>
      {children}
    </Text>
  );
}

/** Big headline with an italic serif accent, as on the website. */
export function Headline({ lead, accent, size = 40 }) {
  const t = useTheme();
  return (
    <Text style={[{ color: t.c.text, fontSize: size, lineHeight: Math.round(size * 1.05), letterSpacing: -1.2 }, font(t, 'regular')]}>
      {lead}{lead ? ' ' : ''}
      <Text style={[{ color: t.c.accent, fontSize: size * 1.05, letterSpacing: -0.4 }, font(t, 'serif')]}>{accent}</Text>
    </Text>
  );
}

/** Scrollable screen with safe-area padding and pull-to-refresh. */
export function Screen({ children, refreshing = false, onRefresh }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.c.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120, paddingHorizontal: 20, gap: 16 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.c.text3} colors={[t.c.text2]} /> : undefined}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, soft = false }) {
  const t = useTheme();
  return (
    <View
      style={[{
        backgroundColor: soft ? t.c.surface2 : t.c.surface,
        borderRadius: 24,
        padding: 20,
        shadowColor: t.c.shadow,
        shadowOpacity: soft ? 0 : 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: soft ? 0 : 2,
      }, style]}
    >
      {children}
    </View>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled = false, busy = false, style }) {
  const t = useTheme();
  const primary = kind === 'primary';
  const bg = primary ? t.c.accent : kind === 'ghost' ? t.c.surface2 : 'transparent';
  const fg = primary ? t.c.onAccent : kind === 'ghost' ? t.c.text : t.c.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      onPress={disabled || busy ? undefined : onPress}
      style={({ pressed }) => [{
        minHeight: 50, borderRadius: 999, paddingHorizontal: kind === 'link' ? 0 : 22, alignItems: 'center', justifyContent: 'center',
        backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1, flexDirection: 'row', gap: 8,
        alignSelf: kind === 'link' ? 'flex-start' : undefined,
      }, style]}
    >
      {busy && <ActivityIndicator color={fg} size="small" />}
      <T kind="medium" size={15} color={fg}>{title}</T>
    </Pressable>
  );
}

const TONE = (c) => ({
  good: [c.goodSoft, c.good], warn: [c.warnSoft, c.warn], bad: [c.badSoft, c.bad],
  info: [c.accentSoft, c.accent], muted: [c.surface2, c.text3],
});
export function Chip({ tone = 'muted', children }) {
  const t = useTheme();
  const [bg, fg] = TONE(t.c)[tone] ?? TONE(t.c).muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />
      <T kind="medium" size={13} color={fg}>{children}</T>
    </View>
  );
}

export function Label({ children }) {
  const t = useTheme();
  return <T size={14} color={t.c.text3}>{children}</T>;
}

export function Bar({ pct, color }) {
  const t = useTheme();
  const w = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.c.surface2, overflow: 'hidden' }}>
      <View style={{ height: 8, width: `${w}%`, borderRadius: 4, backgroundColor: color ?? t.c.accent }} />
    </View>
  );
}

export function Loading({ label = 'Loading…' }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.bg, gap: 12 }}>
      <ActivityIndicator color={t.c.text2} />
      <T color={t.c.text3}>{label}</T>
    </View>
  );
}

/** Small inline notice for partial failures (one module failed to load). */
export function Notice({ children, tone = 'warn' }) {
  const t = useTheme();
  const [bg, fg] = TONE(t.c)[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 16, padding: 14 }}>
      <T size={14} color={fg}>{children}</T>
    </View>
  );
}

/** Catches render errors in a screen so one bug never closes the app. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.warn('Praxio screen error', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Fallback
        message={this.state.error?.message}
        onRetry={() => { this.setState({ error: null }); this.props.onRetry?.(); }}
      />
    );
  }
}

function Fallback({ message, onRetry }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, padding: 24, justifyContent: 'center', gap: 16 }}>
      <Headline lead="Something went" accent="wrong." size={34} />
      <T color={t.c.text2}>This screen hit a problem. Your data is safe.</T>
      {message ? <T size={13} color={t.c.text3}>{message}</T> : null}
      <Button title="Try again" onPress={onRetry} />
    </View>
  );
}

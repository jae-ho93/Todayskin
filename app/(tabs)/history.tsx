import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { api } from '../../src/api/client';
import { Card } from '../../src/components/Card';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { HistoryEntry } from '../../src/types';

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

// 화면 8: 마이 히스토리 / 기록
export default function HistoryScreen() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getHistory().then((result) => {
      if (!cancelled) setHistory(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const scores = [...history].reverse();
  const width = 300;
  const height = 60;
  const max = Math.max(...scores.map((s) => s.overallScore));
  const min = Math.min(...scores.map((s) => s.overallScore));
  const range = max - min || 1;
  const step = width / Math.max(scores.length - 1, 1);
  const points = scores
    .map((s, i) => `${i * step},${height - ((s.overallScore - min) / range) * height}`)
    .join(' ');

  return (
    <ScreenContainer>
      <Text style={styles.title}>마이 히스토리</Text>

      {scores.length > 0 && (
        <Card style={styles.trendCard}>
          <Text style={styles.trendLabel}>스코어 변화 추이</Text>
          <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <Polyline points={points} fill="none" stroke={colors.sage} strokeWidth={2.5} />
          </Svg>
        </Card>
      )}

      {history.length > 0 ? (
        <View style={styles.list}>
          {history.map((h) => (
            <Card key={h.id} style={styles.row}>
              <View style={styles.thumb}>
                <Ionicons name="person-outline" size={20} color={colors.gray300} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.date}>{formatDate(h.capturedAt)}</Text>
              </View>
              <Text style={styles.score}>{h.overallScore}</Text>
            </Card>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>아직 기록이 없어요</Text>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.displaySm, color: colors.textPrimary },
  trendCard: { gap: spacing.sm },
  trendLabel: { ...typography.subtitle, color: colors.textPrimary },
  emptyText: { ...typography.bodySm, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.xl },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  date: { ...typography.body, color: colors.textPrimary },
  score: { ...typography.headline, color: colors.sageDark },
});

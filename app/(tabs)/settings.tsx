import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { api } from '../../src/api/client';
import { Card } from '../../src/components/Card';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { clearSession } from '../../src/lib/session';
import { colors, spacing, typography } from '../../src/theme';

function SettingsRow({
  icon,
  label,
  right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  right: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={18} color={colors.textSecondary} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      {right}
    </View>
  );
}

// 화면 9: 설정 / 개인정보 관리
export default function SettingsScreen() {
  const [weatherAlert, setWeatherAlert] = useState(true);
  const [recommendAlert, setRecommendAlert] = useState(true);

  return (
    <ScreenContainer>
      <Text style={styles.title}>설정</Text>

      <View>
        <Text style={styles.sectionTitle}>개인정보 관리</Text>
        <Card>
          <SettingsRow
            icon="body-outline"
            label="안면 이미지 처리방침 확인"
            right={<Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="close-circle-outline"
            label="데이터 처리 동의 철회"
            right={<Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
          />
        </Card>
      </View>

      <View>
        <Text style={styles.sectionTitle}>알림 설정</Text>
        <Card>
          <SettingsRow
            icon="thunderstorm-outline"
            label="날씨 경보 알림"
            right={
              <Switch
                value={weatherAlert}
                onValueChange={setWeatherAlert}
                trackColor={{ true: colors.sage, false: colors.gray200 }}
              />
            }
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="notifications-outline"
            label="추천 알림"
            right={
              <Switch
                value={recommendAlert}
                onValueChange={setRecommendAlert}
                trackColor={{ true: colors.sage, false: colors.gray200 }}
              />
            }
          />
        </Card>
      </View>

      <View>
        <Text style={styles.sectionTitle}>계정</Text>
        <Card>
          {/* N18: clearSession()이 루트 레이아웃의 세션 만료 콜백을 통해
              로그인 화면으로 안내하므로 여기서 별도로 이동하지 않는다. */}
          <Pressable
            onPress={async () => {
              await api.logout();
              await clearSession();
            }}
          >
            <SettingsRow
              icon="log-out-outline"
              label="로그아웃"
              right={<Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
            />
          </Pressable>
        </Card>
      </View>

      <View>
        <Text style={styles.sectionTitle}>구독 관리</Text>
        <View style={styles.planRow}>
          <Card style={styles.planCard}>
            <Text style={styles.planName}>무료</Text>
            <Text style={styles.planPrice}>₩0</Text>
            <Text style={styles.planDesc}>날씨 기반 알림{'\n'}기본 추천</Text>
          </Card>
          <Card style={[styles.planCard, styles.planCardActive]}>
            <Text style={[styles.planName, styles.planNameActive]}>프리미엄</Text>
            <Text style={[styles.planPrice, styles.planNameActive]}>₩4,900/월</Text>
            <Text style={[styles.planDesc, styles.planDescActive]}>
              정밀 지표{'\n'}개인화 패턴 분석
            </Text>
          </Card>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.displaySm, color: colors.textPrimary },
  sectionTitle: { ...typography.subtitle, color: colors.textSecondary, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  divider: { height: 1, backgroundColor: colors.border },
  planRow: { flexDirection: 'row', gap: spacing.md },
  planCard: { flex: 1, gap: spacing.xs },
  planCardActive: { backgroundColor: colors.sage },
  planName: { ...typography.subtitle, color: colors.textPrimary },
  planNameActive: { color: colors.textInverse },
  planPrice: { ...typography.headline, color: colors.textPrimary },
  planDesc: { ...typography.caption, color: colors.textSecondary },
  planDescActive: { color: colors.sageLight },
});

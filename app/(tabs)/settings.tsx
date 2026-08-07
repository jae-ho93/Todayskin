import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { api } from '../../src/api/client';
import { Card } from '../../src/components/Card';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { clearSession } from '../../src/lib/session';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { ConsentPurpose, ConsentPurposeInfo, ConsentRecord } from '../../src/types';

function SettingsRow({
  icon,
  label,
  right,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  right: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const content = (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={18} color={destructive ? colors.coralDark : colors.textSecondary} />
        <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>{label}</Text>
      </View>
      {right}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.rowPressed}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

// 화면 9: 설정 / 개인정보 관리 — N19에서 알림·동의·탈퇴를 실제 API와 동기화한다.
export default function SettingsScreen() {
  // ── 알림 설정 (서버 NotificationPreference 연동) ──
  const [weatherAlert, setWeatherAlert] = useState(false);
  const [recommendAlert, setRecommendAlert] = useState(false);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  // 낙관적 갱신 중 연타로 요청이 뒤섞이지 않도록 저장 완료까지 토글을 잠근다.
  const prefsSavingRef = useRef(false);

  // ── 동의/처리방침 모달 ──
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const [registry, setRegistry] = useState<ConsentPurposeInfo[] | null>(null);
  const [myConsents, setMyConsents] = useState<ConsentRecord[] | null>(null);
  const [consentsLoading, setConsentsLoading] = useState(false);
  const [revokingPurpose, setRevokingPurpose] = useState<ConsentPurpose | null>(null);

  const loadPreferences = useCallback(async () => {
    setPrefsLoading(true);
    setPrefsError(null);
    const prefs = await api.getNotificationPreferences();
    if (prefs) {
      // 날씨 경보 스위치는 자외선+미세먼지 경보를 함께 제어한다.
      // 둘 중 하나라도 켜져 있으면 on으로 표시해, 부분 설정이 "꺼짐"으로
      // 잘못 보였다가 토글이 다른 쪽 설정을 덮어쓰지 않게 한다.
      setWeatherAlert(prefs.uvAlertEnabled || prefs.dustAlertEnabled);
      setRecommendAlert(prefs.pushEnabled);
    } else {
      setPrefsError('알림 설정을 불러오지 못했어요');
    }
    setPrefsLoading(false);
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const toggleWeatherAlert = async (value: boolean) => {
    if (prefsSavingRef.current) return;
    prefsSavingRef.current = true;
    const prev = weatherAlert;
    setWeatherAlert(value);
    try {
      await api.updateNotificationPreferences({
        uvAlertEnabled: value,
        dustAlertEnabled: value,
      });
      setPrefsError(null);
    } catch {
      setWeatherAlert(prev); // 실패 시 롤백
      setPrefsError('알림 설정 저장에 실패했어요');
    } finally {
      prefsSavingRef.current = false;
    }
  };

  const toggleRecommendAlert = async (value: boolean) => {
    if (prefsSavingRef.current) return;
    prefsSavingRef.current = true;
    const prev = recommendAlert;
    setRecommendAlert(value);
    try {
      await api.updateNotificationPreferences({ pushEnabled: value });
      setPrefsError(null);
    } catch {
      setRecommendAlert(prev);
      setPrefsError('알림 설정 저장에 실패했어요');
    } finally {
      prefsSavingRef.current = false;
    }
  };

  const openPolicyModal = async () => {
    setPolicyModalOpen(true);
    if (!registry) {
      setRegistry(await api.getConsentRegistry());
    }
  };

  const openConsentModal = async () => {
    setConsentModalOpen(true);
    setConsentsLoading(true);
    if (!registry) setRegistry(await api.getConsentRegistry());
    setMyConsents(await api.getMyConsents());
    setConsentsLoading(false);
  };

  const revokeConsent = async (purpose: ConsentPurpose) => {
    if (revokingPurpose) return;
    setRevokingPurpose(purpose);
    try {
      await api.upsertConsent(purpose, false);
      setMyConsents(await api.getMyConsents());
    } catch {
      Alert.alert('철회 실패', '동의 철회에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setRevokingPurpose(null);
    }
  };

  const handleWithdraw = () => {
    Alert.alert(
      '회원 탈퇴',
      '탈퇴 시 개인정보가 즉시 삭제되고 진단 결과는 익명으로 보존돼요. 복구할 수 없어요. 계속할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.withdrawAccount();
              Alert.alert('탈퇴가 완료됐어요', '그동안 이용해주셔서 감사해요.', [
                {
                  text: '확인',
                  onPress: () => clearSession(), // 루트 레이아웃이 로그인 화면으로 안내
                },
              ]);
            } catch {
              Alert.alert('탈퇴 실패', '탈퇴 처리에 실패했어요. 잠시 후 다시 시도해주세요.');
            }
          },
        },
      ],
    );
  };

  const policy = registry?.find((r) => r.purpose === 'diagnosis_image_processing');

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
            onPress={openPolicyModal}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="close-circle-outline"
            label="데이터 처리 동의 철회"
            right={<Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
            onPress={openConsentModal}
          />
        </Card>
      </View>

      <View>
        <Text style={styles.sectionTitle}>알림 설정</Text>
        <Card>
          {prefsLoading ? (
            <View style={styles.prefsLoading}>
              <ActivityIndicator color={colors.sage} size="small" />
            </View>
          ) : (
            <>
              <SettingsRow
                icon="thunderstorm-outline"
                label="날씨 경보 알림"
                right={
                  <Switch
                    value={weatherAlert}
                    onValueChange={toggleWeatherAlert}
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
                    onValueChange={toggleRecommendAlert}
                    trackColor={{ true: colors.sage, false: colors.gray200 }}
                  />
                }
              />
            </>
          )}
          {prefsError && <Text style={styles.errorText}>{prefsError}</Text>}
        </Card>
      </View>

      <View>
        <Text style={styles.sectionTitle}>계정</Text>
        <Card>
          {/* N18: clearSession()이 루트 레이아웃의 세션 만료 콜백을 통해
              로그인 화면으로 안내하므로 여기서 별도로 이동하지 않는다. */}
          <SettingsRow
            icon="log-out-outline"
            label="로그아웃"
            right={<Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
            onPress={async () => {
              await api.logout();
              await clearSession();
            }}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="trash-outline"
            label="회원 탈퇴"
            right={<Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
            onPress={handleWithdraw}
            destructive
          />
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

      {/* 안면 이미지 처리방침 확인 */}
      <Modal
        visible={policyModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPolicyModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>안면 이미지 처리방침</Text>
              <Pressable onPress={() => setPolicyModalOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            {policy ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalPolicyTitle}>{policy.title}</Text>
                <Text style={styles.modalPolicyBody}>{policy.description}</Text>
                <Text style={styles.modalPolicyMeta}>
                  철회 정책: {policy.withdrawalPolicy === 'keep_results' ? '이미 보관된 결과는 유지' : '보관 이미지 삭제'}
                  {'\n'}현재 버전: {policy.currentVersion}
                </Text>
              </ScrollView>
            ) : (
              <View style={styles.modalEmpty}>
                <Text style={styles.modalEmptyText}>처리방침을 불러올 수 없어요</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* 데이터 처리 동의 철회 */}
      <Modal
        visible={consentModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setConsentModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>데이터 처리 동의</Text>
              <Pressable onPress={() => setConsentModalOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            {consentsLoading ? (
              <View style={styles.modalEmpty}>
                <ActivityIndicator color={colors.sage} />
              </View>
            ) : myConsents === null ? (
              <View style={styles.modalEmpty}>
                <Text style={styles.modalEmptyText}>동의 내역을 불러올 수 없어요</Text>
              </View>
            ) : myConsents.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Text style={styles.modalEmptyText}>저장된 동의 내역이 없어요</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
                {myConsents.map((c) => {
                  const info = registry?.find((r) => r.purpose === c.purpose);
                  return (
                    <View key={c.purpose} style={styles.consentItem}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.consentItemTitle}>{info?.title ?? c.purpose}</Text>
                        <Text style={styles.consentItemState}>
                          {c.agreed ? `동의 중 (v${c.version})` : '철회됨'}
                        </Text>
                      </View>
                      {c.agreed ? (
                        <Pressable
                          onPress={() => revokeConsent(c.purpose)}
                          disabled={revokingPurpose !== null}
                          style={({ pressed }) => [
                            styles.revokeButton,
                            pressed && styles.revokeButtonPressed,
                          ]}
                        >
                          {revokingPurpose === c.purpose ? (
                            <ActivityIndicator size="small" color={colors.coralDark} />
                          ) : (
                            <Text style={styles.revokeButtonText}>철회</Text>
                          )}
                        </Pressable>
                      ) : (
                        <Text style={styles.revokedBadge}>철회됨</Text>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  rowPressed: { opacity: 0.6 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  rowLabelDestructive: { ...typography.body, color: colors.coralDark },
  divider: { height: 1, backgroundColor: colors.border },
  prefsLoading: { paddingVertical: spacing.lg, alignItems: 'center' },
  errorText: { ...typography.caption, color: colors.coralDark, marginTop: spacing.sm },
  planRow: { flexDirection: 'row', gap: spacing.md },
  planCard: { flex: 1, gap: spacing.xs },
  planCardActive: { backgroundColor: colors.sage },
  planName: { ...typography.subtitle, color: colors.textPrimary },
  planNameActive: { color: colors.textInverse },
  planPrice: { ...typography.headline, color: colors.textPrimary },
  planDesc: { ...typography.caption, color: colors.textSecondary },
  planDescActive: { color: colors.sageLight },

  // 모달 공통
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    minHeight: 300,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  modalTitle: { ...typography.headline, color: colors.textPrimary },
  modalEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  modalEmptyText: { ...typography.bodySm, color: colors.textTertiary },

  // 처리방침
  modalPolicyTitle: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  modalPolicyBody: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  modalPolicyMeta: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.lg },

  // 동의 철회 목록
  consentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  consentItemTitle: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
  consentItemState: { ...typography.caption, color: colors.textTertiary },
  revokeButton: {
    borderWidth: 1,
    borderColor: colors.coral,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  revokeButtonPressed: { backgroundColor: colors.coralLight ?? colors.gray100 },
  revokeButtonText: { ...typography.bodySm, color: colors.coralDark, fontWeight: '600' },
  revokedBadge: { ...typography.caption, color: colors.textTertiary },
});

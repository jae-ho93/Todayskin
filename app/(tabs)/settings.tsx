import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
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
import { useToast } from '../../src/components/Toast';
import { clearSession } from '../../src/lib/session';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { ConsentPurpose, ConsentPurposeInfo, ConsentRecord, User } from '../../src/types';

function maskPhone(phone: string | null): string {
  if (!phone) return '전화번호 미연결';
  return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3');
}
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
        <Ionicons name={icon} size={20} color={destructive ? colors.coralDark : colors.textSecondary} />
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
  // F44: 버전은 하드코딩 대신 app.json(expo) 값과 동기화
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  // ── 알림 설정 (서버 NotificationPreference 연동) ──
  const [weatherAlert, setWeatherAlert] = useState(false);
  const [recommendAlert, setRecommendAlert] = useState(false);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [pushDeliveryAvailable, setPushDeliveryAvailable] = useState(false);
  const [user, setUser] = useState<User | null>(null);
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
      setPushDeliveryAvailable(prefs.pushDeliveryAvailable === true);
    } else {
      setPrefsError('알림 설정을 불러오지 못했어요');
    }
    setPrefsLoading(false);
  }, []);

  useEffect(() => {
  loadPreferences();
  api.getMe().then(setUser).catch(console.error);
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

  const { showToast } = useToast();

  const revokeConsent = async (purpose: ConsentPurpose) => {
    if (revokingPurpose) return;
    setRevokingPurpose(purpose);
    try {
      await api.upsertConsent(purpose, false);
      setMyConsents(await api.getMyConsents());
      showToast('동의를 철회했어요', { type: 'success' });
    } catch {
      showToast('동의 철회에 실패했어요. 잠시 후 다시 시도해주세요.', { type: 'error' });
    } finally {
      setRevokingPurpose(null);
    }
  };

  const agreeConsent = async (purpose: ConsentPurpose) => {
    if (revokingPurpose) return;
    setRevokingPurpose(purpose);
    try {
      await api.upsertConsent(purpose, true);
      setMyConsents(await api.getMyConsents());
      showToast('동의했어요', { type: 'success' });
    } catch {
      showToast('동의 상태를 저장하지 못했어요. 잠시 후 다시 시도해주세요.', { type: 'error' });
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

  const confirmLogout = () => {
    Alert.alert('로그아웃', '현재 계정에서 로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          await api.logout();
          await clearSession();
        },
      },
    ]);
  };

  const policy = registry?.find((r) => r.purpose === 'diagnosis_image_processing');

  return (
    <ScreenContainer>
      <Text style={styles.title}>설정</Text>
{/* 프로필 헤더 — 이니셜 아바타 + 이름/전화. 카드 전체가 탭 영역 → 내 정보 화면(/my-info) (F22/F28) */}
{user && (
  <Pressable onPress={() => router.push('/my-info')} accessibilityRole="button" accessibilityLabel="내 정보" style={({ pressed }) => pressed && styles.rowPressed}>
    <Card style={styles.profileCard}>
      <View style={styles.profileContent}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>{(user.name ?? '사').charAt(0)}</Text>
        </View>
        <View style={styles.profileText}>
          <Text style={styles.profileName}>{user.name}</Text>
          <Text style={styles.profilePhone}>{maskPhone(user.phoneNumber)}</Text>
        </View>
        <View style={styles.profileChevron}>
          <Text style={styles.profileEdit}>내 정보</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.sage} />
        </View>
      </View>
    </Card>
  </Pressable>
)}
      <View>
        <Text style={styles.sectionTitle}>개인정보 관리</Text>
        <Card style={styles.listCard}>
          <SettingsRow
            icon="shield-checkmark-outline"
            label="데이터 처리 동의 관리"
            right={<Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
            onPress={openConsentModal}
          />
        </Card>
      </View>

      <View>
        <Text style={styles.sectionTitle}>알림 설정</Text>
        <Card style={styles.listCard}>
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
                    disabled={!pushDeliveryAvailable}
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
                    disabled={!pushDeliveryAvailable}
                    trackColor={{ true: colors.sage, false: colors.gray200 }}
                  />
                }
              />
            </>
          )}
        </Card>
        {!prefsLoading && !pushDeliveryAvailable && (
          <Text style={styles.readyText}>푸시 알림은 준비 중이에요. 현재 설정은 변경할 수 없어요.</Text>
        )}
        {prefsError && <Text style={styles.errorText}>{prefsError}</Text>}
      </View>

      <View>
        <Text style={styles.sectionTitle}>계정</Text>
        <Card style={styles.listCard}>
          <SettingsRow
            icon="people-outline"
            label="소셜 계정"
            right={<Text style={styles.readyBadge}>로그인 화면에서 연결</Text>}
          />
          <View style={styles.divider} />
          {/* N18: clearSession()이 루트 레이아웃의 세션 만료 콜백을 통해
              로그인 화면으로 안내하므로 여기서 별도로 이동하지 않는다. */}
          <SettingsRow
            icon="log-out-outline"
            label="로그아웃"
            right={<Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
            onPress={confirmLogout}
          />
        </Card>
        {/* F28: 파괴적 액션(탈퇴)은 별도 구역에 경고색으로 분리 */}
        <Card style={styles.withdrawCard}>
          <SettingsRow
            icon="trash-outline"
            label="회원 탈퇴"
            right={<Ionicons name="chevron-forward" size={18} color={colors.coralDark} />}
            onPress={handleWithdraw}
            destructive
          />
        </Card>
      </View>

      <View>
        <Text style={styles.sectionTitle}>앱</Text>
        <Card style={styles.listCard}>
          <SettingsRow icon="information-circle-outline" label="버전" right={<Text style={styles.versionText}>{appVersion}</Text>} />
          <View style={styles.divider} />
          <SettingsRow
            icon="document-text-outline"
            label="이용약관"
            right={<Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
            onPress={() => router.push('/legal/terms')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="개인정보 처리방침"
            right={<Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
            onPress={() => router.push('/legal/privacy')}
          />
        </Card>
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
            ) : registry === null && myConsents === null ? (
              <View style={styles.modalEmpty}>
                <Text style={styles.modalEmptyText}>동의 내역을 불러올 수 없어요</Text>
              </View>
            ) : (registry ?? (myConsents ?? [])).length === 0 ? (
              <View style={styles.modalEmpty}>
                <Text style={styles.modalEmptyText}>저장된 동의 내역이 없어요</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
                {/* F26: registry 기준으로 전 항목 표시 — 아직 동의한 적 없는 항목도 "미동의"로 노출해 재동의 경로 제공 */}
                {(registry ?? (myConsents ?? []).map((c) => ({ purpose: c.purpose, title: c.purpose, description: '', required: false, currentVersion: c.version, withdrawalPolicy: 'keep_results' as const }))).map((info) => {
                  const purpose = info.purpose;
                  const record = myConsents?.find((c) => c.purpose === purpose);
                  const agreed = record?.agreed ?? false;
                  return (
                    <View key={purpose} style={styles.consentItem}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.consentItemTitle}>{info.title}</Text>
                        <Text style={styles.consentItemState}>
                          {record ? (agreed ? `동의 중 (v${record.version})` : '철회됨') : '미동의'}
                        </Text>
                        {info.description ? (
                          <Text style={styles.consentItemDesc} numberOfLines={2}>{info.description}</Text>
                        ) : null}
                      </View>
                      {agreed ? (
                        <Pressable
                          onPress={() => revokeConsent(purpose)}
                          disabled={revokingPurpose !== null}
                          style={({ pressed }) => [
                            styles.revokeButton,
                            pressed && styles.revokeButtonPressed,
                          ]}
                        >
                          {revokingPurpose === purpose ? (
                            <ActivityIndicator size="small" color={colors.coralDark} />
                          ) : (
                            <Text style={styles.revokeButtonText}>철회</Text>
                          )}
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() => agreeConsent(purpose)}
                          disabled={revokingPurpose !== null}
                          style={styles.agreeButton}
                        >
                          <Text style={styles.agreeButtonText}>{record ? '다시 동의' : '동의'}</Text>
                        </Pressable>
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
  // F55: 행 높이는 minHeight(터치 타겟)로만 고정 — 패딩 중복 제거로 뚱뚱함 해소
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  // F55: 설정 카드 — 카드 안 패딩 최소화 (토스식 리스트 질감)
  listCard: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  rowPressed: { opacity: 0.6 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  rowLabelDestructive: { ...typography.body, color: colors.coralDark },
  divider: { height: 1, backgroundColor: colors.border },
  prefsLoading: { paddingVertical: spacing.lg, alignItems: 'center' },
  errorText: { ...typography.caption, color: colors.coralDark, marginTop: spacing.sm },
  readyText: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },
  versionText: { ...typography.bodySm, color: colors.textSecondary },
  readyBadge: { ...typography.caption, color: colors.textTertiary },
  withdrawCard: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.coralLight ?? colors.coral,
  },
  planRow: { flexDirection: 'row', gap: spacing.md },
    profileCard: { marginBottom: spacing.md },
  profileContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: { ...typography.headline, color: colors.sageDark, fontWeight: '700' },
  profileText: { flex: 1, gap: 2 },
  profileName: { ...typography.subtitle, fontWeight: '600', color: colors.textPrimary },
  profilePhone: { ...typography.caption, color: colors.textTertiary },
  profileChevron: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  profileEdit: { ...typography.body, color: colors.sage },
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
  consentItemDesc: { ...typography.caption, color: colors.textTertiary },
  revokeButton: {
    borderWidth: 1,
    borderColor: colors.coral,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  revokeButtonPressed: { backgroundColor: colors.coralLight ?? colors.gray100 },
  revokeButtonText: { ...typography.bodySm, color: colors.coralDark, fontWeight: '600' },
  agreeButton: {
    borderWidth: 1,
    borderColor: colors.sage,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  agreeButtonText: { ...typography.bodySm, color: colors.sageDark, fontWeight: '600' },
  revokedBadge: { ...typography.caption, color: colors.textTertiary },
});

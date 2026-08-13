import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { RetryButton } from '../../src/components/RetryButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { useToast } from '../../src/components/Toast';
import { useConsents } from '../../src/features/settings/useConsents';
import { useNotificationPreferences } from '../../src/features/settings/useNotificationPreferences';
import {
  formatReminderTime,
  REMINDER_TIME_OPTIONS,
} from '../../src/features/settings/reminder';
import { useLabReport } from '../../src/features/settings/useLabReport';
import { useSkinReminder } from '../../src/features/settings/useSkinReminder';
import { clearSession } from '../../src/lib/session';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../../src/theme';
import type { ConsentPurpose, User } from '../../src/types';

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
      {/* F60: Switch 등 right 요소의 세로 정렬 보정 — 위쪽 쏠림 방지 */}
      <View style={styles.rowRight}>{right}</View>
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

  const [user, setUser] = useState<User | null>(null);
  const { showToast } = useToast();

  // ── 알림 설정 (서버 NotificationPreference 연동) ──
  const { state: prefsState, toggle: togglePreference } = useNotificationPreferences();
  const prefs = prefsState.status === 'ready' ? prefsState.prefs : null;

  // ── 피부 체크 리마인더 (F73: 로컬 알림 + 서버 morningReminder 동기) ──
  const {
    state: reminderState,
    setEnabled: setReminderEnabled,
    setTime: setReminderTime,
  } = useSkinReminder();
  const reminder = reminderState.status === 'ready' ? reminderState : null;

  // ── 실험실 (F79: AI 상세 리포트 옵트인 — 기본 숨김) ──
  const { state: labState, setEnabled: setLabEnabled } = useLabReport();

  // ── 동의/처리방침 모달 ──
  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const {
    state: consentsState,
    revokingPurpose,
    load: loadConsents,
    setAgreement,
  } = useConsents();
  const consents = consentsState.status === 'ready' ? consentsState.data : null;

  useEffect(() => {
    api.getMe().then(setUser).catch(console.error);
  }, []);

  const openConsentModal = async () => {
    setConsentModalOpen(true);
    await loadConsents();
  };

  const revokeConsent = async (purpose: ConsentPurpose) => {
    const result = await setAgreement(purpose, false);
    if (result === 'busy') return;
    showToast(
      result === 'ok' ? '동의를 철회했어요' : '동의 철회에 실패했어요. 잠시 후 다시 시도해주세요.',
      { type: result === 'ok' ? 'success' : 'error' },
    );
  };

  const agreeConsent = async (purpose: ConsentPurpose) => {
    const result = await setAgreement(purpose, true);
    if (result === 'busy') return;
    showToast(
      result === 'ok' ? '동의했어요' : '동의 상태를 저장하지 못했어요. 잠시 후 다시 시도해주세요.',
      { type: result === 'ok' ? 'success' : 'error' },
    );
  };

  const handleWithdraw = () => {
    Alert.alert(
      '회원 탈퇴',
      '탈퇴 시 개인정보와 모든 측정 기록·사진·추천이 즉시 삭제돼요. 복구할 수 없어요. 계속할까요?',
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
        <Text style={styles.sectionTitle}>알림 설정</Text>
        <Card style={styles.listCard}>
          {prefsState.status === 'loading' || reminderState.status === 'loading' ? (
            <View style={styles.prefsLoading}>
              <ActivityIndicator color={colors.sage} size="small" />
            </View>
          ) : (
            <>
              {reminder && (
                <>
                  <SettingsRow
                    icon="moon-outline"
                    label="피부 체크 리마인더"
                    right={
                      <Switch
                        value={reminder.enabled}
                        onValueChange={(value) => void setReminderEnabled(value)}
                        trackColor={{ true: colors.sage, false: colors.gray200 }}
                      />
                    }
                  />
                  {reminder.enabled && (
                    <View style={styles.reminderTimeRow}>
                      {REMINDER_TIME_OPTIONS.map((option) => {
                        const selected =
                          option.hour === reminder.time.hour &&
                          option.minute === reminder.time.minute;
                        return (
                          <Pressable
                            key={formatReminderTime(option)}
                            onPress={() => void setReminderTime(option)}
                            style={[styles.reminderChip, selected && styles.reminderChipSelected]}
                          >
                            <Text
                              style={[
                                styles.reminderChipText,
                                selected && styles.reminderChipTextSelected,
                              ]}
                              maxFontSizeMultiplier={MAX_FONT_SCALE}
                            >
                              {formatReminderTime(option)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                  <View style={styles.divider} />
                </>
              )}
              <SettingsRow
                icon="thunderstorm-outline"
                label="날씨 경보 알림"
                right={
                  <Switch
                    value={prefs?.weatherAlert ?? false}
                    onValueChange={(value) => void togglePreference('weatherAlert', value)}
                    disabled={!prefs?.pushDeliveryAvailable}
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
                    value={prefs?.recommendAlert ?? false}
                    onValueChange={(value) => void togglePreference('recommendAlert', value)}
                    disabled={!prefs?.pushDeliveryAvailable}
                    trackColor={{ true: colors.sage, false: colors.gray200 }}
                  />
                }
              />
            </>
          )}
        </Card>
        {reminder?.permissionDenied && (
          <Pressable onPress={() => void Linking.openSettings()}>
            <Text style={styles.errorText}>
              알림 권한이 꺼져 있어요. 여기를 눌러 기기 설정에서 허용해주세요.
            </Text>
          </Pressable>
        )}
        {reminder?.saveError && <Text style={styles.errorText}>{reminder.saveError}</Text>}
        {prefsState.status === 'ready' && !prefs?.pushDeliveryAvailable && (
          <Text style={styles.readyText}>푸시 알림은 준비 중이에요. 현재 설정은 변경할 수 없어요.</Text>
        )}
        {prefsState.status === 'error' && (
          <Text style={styles.errorText}>알림 설정을 불러오지 못했어요</Text>
        )}
        {prefsState.status === 'ready' && prefsState.saveError && (
          <Text style={styles.errorText}>{prefsState.saveError}</Text>
        )}
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

      {/* F79: 실험실 — 규제 경계 기능(질환·여드름 리포트)은 옵트인으로만 노출 */}
      <View>
        <Text style={styles.sectionTitle}>실험실</Text>
        <Card style={styles.listCard}>
          <SettingsRow
            icon="flask-outline"
            label="AI 상세 리포트 (베타)"
            right={
              <Switch
                value={labState.status === 'ready' ? labState.enabled : false}
                onValueChange={(value) => void setLabEnabled(value)}
                disabled={labState.status !== 'ready'}
                trackColor={{ true: colors.sage, false: colors.gray200 }}
              />
            }
          />
        </Card>
        <Text style={styles.readyText}>
          검증 중인 AI 분석(여드름·질환 분류)을 결과 화면에 표시해요. 참고용이며 의학적 진단이
          아니에요.
        </Text>
        {labState.status === 'ready' && labState.saveError && (
          <Text style={styles.errorText}>{labState.saveError}</Text>
        )}
      </View>

      {/* F61: 개인정보·동의 관리는 설정 최하단 (다른 앱 관례 — 카카오/토스/당근) */}
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

      {/* F28: 파괴적 액션(탈퇴)은 맨 마지막에 경고색으로 분리 */}
      <Card style={styles.withdrawCard}>
        <SettingsRow
          icon="trash-outline"
          label="회원 탈퇴"
          right={<Ionicons name="chevron-forward" size={18} color={colors.coralDark} />}
          onPress={handleWithdraw}
          destructive
        />
      </Card>

      {/* 데이터 처리 동의 철회 — 각 목적의 처리방침 본문도 이 모달에서 보여준다 */}
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
            {consentsState.status !== 'ready' ? (
              <View style={styles.modalEmpty}>
                <ActivityIndicator color={colors.sage} />
              </View>
            ) : consents?.registry === null && consents.records === null ? (
              <View style={styles.modalEmpty}>
                <Text style={styles.modalEmptyText}>동의 내역을 불러올 수 없어요</Text>
                <RetryButton onPress={() => void loadConsents()} />
              </View>
            ) : (consents?.registry ?? consents?.records ?? []).length === 0 ? (
              <View style={styles.modalEmpty}>
                <Text style={styles.modalEmptyText}>저장된 동의 내역이 없어요</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
                {/* F26: registry 기준으로 전 항목 표시 — 아직 동의한 적 없는 항목도 "미동의"로 노출해 재동의 경로 제공 */}
                {(consents?.registry ?? (consents?.records ?? []).map((c) => ({ purpose: c.purpose, title: c.purpose, description: '', required: false, currentVersion: c.version, withdrawalPolicy: 'keep_results' as const }))).map((info) => {
                  const purpose = info.purpose;
                  const record = consents?.records?.find((c) => c.purpose === purpose);
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
  rowRight: { alignItems: 'center', justifyContent: 'center' },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  rowLabelDestructive: { ...typography.body, color: colors.coralDark },
  divider: { height: 1, backgroundColor: colors.border },
  prefsLoading: { paddingVertical: spacing.lg, alignItems: 'center' },
  // F73: 리마인더 시간 프리셋 칩
  reminderTimeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  reminderChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reminderChipSelected: { borderColor: colors.sage, backgroundColor: colors.sageLight },
  reminderChipText: { ...typography.bodySm, color: colors.textSecondary },
  reminderChipTextSelected: { color: colors.sageDark, fontWeight: '700' },
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

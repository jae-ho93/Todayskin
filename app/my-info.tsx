import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api/client';
import { Card } from '../src/components/Card';
import { useToast } from '../src/components/Toast';
import { colors, radius, spacing, typography } from '../src/theme';
import type { Gender, User } from '../src/types';

function maskPhone(phone: string | null): string {
  if (!phone) return '전화번호 미연결';
  return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3');
}

function formatBirthDate(iso: string | null): string {
  if (!iso) return '미입력';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${y}.${m}.${d}` : iso;
}

function genderLabel(gender: Gender | undefined): string {
  if (gender === 'female') return '여성';
  if (gender === 'male') return '남성';
  return '미선택';
}

// 화면: 내 정보 — 설정 프로필 카드에서 진입 (F22).
// 이름·전화(마스킹)·생년월일·성별을 한 화면에 모으고, 이름/성별은 그 자리에서 수정한다.
// 전화번호 변경은 OTP 본인확인 흐름이 필요해 이번 범위 밖 (추후).
export default function MyInfoScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingGender, setSavingGender] = useState(false);

  const load = useCallback(async () => {
    const me = await api.getMe();
    setUser(me);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEditName = () => {
    if (!user) return;
    setDraftName(user.name);
    setEditingName(true);
  };

  const { showToast } = useToast();

  const saveName = async () => {
    const name = draftName.trim();
    if (!name || name.length > 20 || savingName) return;
    setSavingName(true);
    try {
      const updated = await api.updateMe({ name });
      setUser(updated);
      setEditingName(false);
      showToast('이름을 저장했어요', { type: 'success' });
    } catch {
      showToast('이름을 저장하지 못했어요. 잠시 후 다시 시도해주세요.', { type: 'error' });
    } finally {
      setSavingName(false);
    }
  };

  const changeGender = async (gender: Gender) => {
    if (savingGender || savingName) return;
    const prev = user;
    setSavingGender(true);
    setUser(prev ? { ...prev, gender } : prev); // 낙관적 갱신
    try {
      const updated = await api.updateMe({ gender });
      setUser(updated);
      showToast('성별을 저장했어요', { type: 'success' });
    } catch {
      setUser(prev); // 실패 시 롤백
      showToast('성별을 저장하지 못했어요. 잠시 후 다시 시도해주세요.', { type: 'error' });
    } finally {
      setSavingGender(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="뒤로">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>내 정보</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.sage} />
        </View>
      ) : !user ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>정보를 불러올 수 없어요</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* 이름 */}
            <Card>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>이름</Text>
                {editingName ? (
                  <View style={styles.editArea}>
                    <TextInput
                      value={draftName}
                      onChangeText={setDraftName}
                      maxLength={20}
                      placeholder="이름"
                      placeholderTextColor={colors.gray300}
                      style={styles.nameInput}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={saveName}
                    />
                    <View style={styles.editActions}>
                      <Pressable onPress={() => setEditingName(false)} hitSlop={8}>
                        <Text style={styles.cancelText}>취소</Text>
                      </Pressable>
                      <Pressable onPress={saveName} disabled={!draftName.trim() || savingName} hitSlop={8}>
                        {savingName ? (
                          <ActivityIndicator size="small" color={colors.sageDark} />
                        ) : (
                          <Text style={[styles.saveText, !draftName.trim() && styles.saveTextDisabled]}>저장</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.rowValueWrap}>
                    <Text style={styles.rowValue}>{user.name}</Text>
                    <Pressable onPress={startEditName} hitSlop={8}>
                      <Text style={styles.editLink}>수정</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </Card>

            {/* 전화번호 · 생년월일 */}
            <Card>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>전화번호</Text>
                <Text style={styles.rowValue}>{maskPhone(user.phoneNumber)}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>생년월일</Text>
                <Text style={styles.rowValue}>{formatBirthDate(user.birthDate)}</Text>
              </View>
            </Card>

            {/* 성별 */}
            <Card>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>성별</Text>
                <View style={styles.genderRow}>
                  {(
                    [
                      { value: 'female' as const, label: '여성' },
                      { value: 'male' as const, label: '남성' },
                    ]
                  ).map((option) => {
                    const selected = user.gender === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => changeGender(option.value)}
                        disabled={savingGender}
                        style={[styles.genderPill, selected && styles.genderPillSelected]}
                      >
                        <Text style={[styles.genderPillText, selected && styles.genderPillTextSelected]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {!user.gender && <Text style={styles.genderEmpty}>{genderLabel(undefined)}</Text>}
                </View>
              </View>
            </Card>

            <Text style={styles.note}>
              전화번호 변경은 본인 인증이 필요해 아직 준비 중이에요.{'\n'}이름과 성별만 변경할 수 있어요.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  keyboardAvoiding: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.headline, color: colors.textPrimary },
  headerSpacer: { width: 26 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...typography.body, color: colors.textTertiary },
  scrollContent: { padding: spacing.xl, gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  divider: { height: 1, backgroundColor: colors.border },
  rowLabel: { ...typography.body, color: colors.textSecondary },
  rowValueWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  rowValue: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  editLink: { ...typography.body, color: colors.sageDark, fontWeight: '700' },
  editArea: { flex: 1, gap: spacing.sm },
  nameInput: {
    borderBottomWidth: 2,
    borderBottomColor: colors.sage,
    paddingVertical: spacing.xs,
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xl },
  cancelText: { ...typography.body, color: colors.textSecondary },
  saveText: { ...typography.body, color: colors.sageDark, fontWeight: '700' },
  saveTextDisabled: { color: colors.gray300 },
  genderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  genderPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
  },
  genderPillSelected: {
    borderColor: colors.sage,
    backgroundColor: colors.sageLight,
  },
  genderPillText: { ...typography.subtitle, color: colors.textSecondary },
  genderPillTextSelected: { color: colors.sageDark, fontWeight: '700' },
  genderEmpty: { ...typography.bodySm, color: colors.textTertiary },
  note: { ...typography.caption, color: colors.textTertiary, lineHeight: 18, paddingHorizontal: spacing.xs },
});

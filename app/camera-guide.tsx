import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, DiagnosisCanceledError, DiagnosisQualityError } from '../src/api/client';
import type { DiagnosisQualityCode } from '../src/api/client';
import { useToast } from '../src/components/Toast';
import { useUserLocation } from '../src/hooks/useUserLocation';
import { prepareUploadImage } from '../src/lib/upload-image';
import { colors, radius, shadow, spacing, typography } from '../src/theme';
import type { ConsentPurposeInfo } from '../src/types';

const GUIDE_TEXT = '정면을 맞춰주세요';

const TIPS = [
  { icon: 'sunny-outline' as const, text: '밝은 곳에서 촬영해주세요' },
  { icon: 'scan-outline' as const, text: '가이드 선에 맞춰 정면을 응시해주세요' },
  { icon: 'water-outline' as const, text: '세안 후 맨 얼굴로 촬영하면 더 정확해요' },
  { icon: 'cut-outline' as const, text: '앞머리를 넘겨 이마가 보이게 촬영해주세요' },
];

// F78: 품질 게이트(N49) 사유 코드별 재촬영 안내.
const QUALITY_GUIDE: Record<
  DiagnosisQualityCode,
  { icon: keyof typeof Ionicons.glyphMap; title: string; tip: string }
> = {
  TOO_DARK: {
    icon: 'sunny-outline',
    title: '사진이 너무 어두워요',
    tip: '조명을 켜거나 밝은 곳으로 이동한 뒤 다시 촬영해주세요.',
  },
  BLURRY: {
    icon: 'scan-outline',
    title: '사진이 흔들렸어요',
    tip: '휴대폰을 고정하고, 초점이 얼굴에 맞은 걸 확인한 뒤 촬영해주세요.',
  },
  TOO_SMALL: {
    icon: 'image-outline',
    title: '사진 해상도가 낮아요',
    tip: '저장된 사진 대신 카메라로 직접 촬영하면 해상도가 충분해요.',
  },
  NO_FACE: {
    icon: 'person-outline',
    title: '얼굴을 찾지 못했어요',
    tip: '가이드 선 안에 얼굴 전체가 들어오게 정면을 응시해주세요.',
  },
};

// 화면 3: 얼굴 촬영 가이드
export default function CameraGuideScreen() {
  // F31: 닫기(X) 버튼이 상태바(다이나믹 아일랜드·배터리)와 겹치지 않도록 상단 인셋을 명시적으로 확보한다.
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [phase, setPhase] = useState<'intro' | 'capture' | 'analyzing'>('intro');
  // F81: 분석 대기 화면의 단계 표시. 업로드와 AI 분석은 단일 HTTP 요청이라
  // 구분할 수 없으므로(가짜 진행 금지) 실제로 구분되는 두 단계만 보여준다.
  const [analyzeStep, setAnalyzeStep] = useState<'prepare' | 'analyze'>('prepare');
  const abortRef = useRef<AbortController | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  // F78: 품질 게이트 거부(422 + code) — 사유별 재촬영 안내 모달로 보여준다.
  const [qualityIssue, setQualityIssue] = useState<DiagnosisQualityCode | null>(null);
  const [wentOutside, setWentOutside] = useState<boolean | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const { coords, permissionDenied } = useUserLocation();
  // submitPhoto는 렌더 시점 클로저라 coords를 그대로 읽으면 오래된 값을 볼 수 있다 —
  // "위치 준비될 때까지 잠깐 대기" 폴링에서 최신 값을 보게 ref로 같이 들고 있는다.
  const coordsRef = useRef(coords);
  const permissionDeniedRef = useRef(permissionDenied);
  useEffect(() => {
    coordsRef.current = coords;
    permissionDeniedRef.current = permissionDenied;
  }, [coords, permissionDenied]);

  // "외출했어요"를 골랐는데 위치가 아직 안 잡혔으면(막 앱을 켰거나 GPS fix가 느린 경우),
  // 좌표 없이 조용히 제출해 서버가 기본 지역(서울)으로 저장해버리는 대신 잠깐 기다려본다.
  // 권한이 아예 없으면 기다려도 소용없으니 바로 포기한다.
  const WAIT_FOR_COORDS_MS = 6000;
  const waitForCoords = async () => {
    const start = Date.now();
    while (!coordsRef.current && !permissionDeniedRef.current && Date.now() - start < WAIT_FOR_COORDS_MS) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return coordsRef.current;
  };

  // ── 필수 동의 확인 (F27) — 마운트 시점 + 진입 시점 양쪽에서 확인한다 ──
  const [consentCheck, setConsentCheck] = useState<'loading' | 'ok' | 'needed'>('loading');
  const [consentRegistry, setConsentRegistry] = useState<ConsentPurposeInfo[] | null>(null);
  const [consentModalVisible, setConsentModalVisible] = useState(false);
  const [consentPendingAction, setConsentPendingAction] = useState<'capture' | 'library' | null>(null);
  const [storageAgreed, setStorageAgreed] = useState(false);
  const [consentSubmitting, setConsentSubmitting] = useState(false);

  /** 필수 동의가 모두 체결됐는지 확인. true면 진행 가능. */
  const checkConsents = useCallback(async (): Promise<boolean> => {
    try {
      const [registryResult, myConsents] = await Promise.all([
        api.getConsentRegistry(),
        api.getMyConsents(),
      ]);
      const registry = registryResult.status === 'ok' ? registryResult.data : null;
      setConsentRegistry(registry);
      const agreed = new Set(
        (myConsents ?? []).filter((c) => c.agreed).map((c) => c.purpose),
      );
      const missing = (registry ?? []).some((r) => r.required && !agreed.has(r.purpose));
      setConsentCheck(missing ? 'needed' : 'ok');
      return !missing;
    } catch {
      // 확인 실패 시에는 진행을 막지 않는다 (실제 촬영 API에서 다시 검증됨).
      setConsentCheck('ok');
      return true;
    }
  }, []);

  useEffect(() => {
    void checkConsents();
  }, [checkConsents]);

  const runAction = (action: 'capture' | 'library') => {
    if (action === 'capture') {
      setPhase('capture');
    } else {
      void handlePickFromLibrary();
    }
  };

  const requireConsentThen = async (action: 'capture' | 'library') => {
    let ok = consentCheck === 'ok';
    if (consentCheck === 'loading') ok = await checkConsents();
    if (!ok) {
      setStorageAgreed(false);
      setConsentPendingAction(action);
      setConsentModalVisible(true);
      return;
    }
    runAction(action);
  };

  const handleConsentContinue = async () => {
    if (!consentRegistry) return;
    setConsentSubmitting(true);
    try {
      // 필수 항목은 항상 true, 선택 항목(이미지 저장)은 토글 값.
      await Promise.all(
        consentRegistry.map((item) =>
          api.upsertConsent(item.purpose, item.required ? true : storageAgreed),
        ),
      );
      setConsentCheck('ok');
      setConsentModalVisible(false);
      if (consentPendingAction) {
        const action = consentPendingAction;
        setConsentPendingAction(null);
        runAction(action);
      }
    } catch {
      showToast('동의를 저장하지 못했어요. 잠시 후 다시 시도해주세요.', { type: 'error' });
    } finally {
      setConsentSubmitting(false);
    }
  };

  const submitPhoto = async (photo: { uri: string; width?: number; height?: number }) => {
    const originPhase = phase;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('analyzing');
    setAnalyzeStep('prepare');
    setError(null);
    try {
      // F72: 원본(최대 10MB)을 그대로 올리면 업로드가 느리다 — 장변 1440px로 줄여 전송.
      // 리사이즈는 '분석 중' 화면에서 진행되고, 실패하면 원본으로 폴백한다.
      const [front, resolvedCoords] = await Promise.all([
        prepareUploadImage(photo.uri, photo.width, photo.height),
        wentOutside ? waitForCoords() : Promise.resolve(undefined),
      ]);
      // F81: 준비 단계에서 취소됐으면 사진을 서버로 보내지 않는다.
      if (controller.signal.aborted) {
        showToast('분석을 취소했어요');
        setPhase(originPhase);
        return;
      }
      setAnalyzeStep('analyze');
      await api.submitDiagnosis(
        {
          front,
          wentOutside: wentOutside ?? false,
          coords: wentOutside ? (resolvedCoords ?? undefined) : undefined,
        },
        { signal: controller.signal },
      );
      // F81: 취소 직전에 서버 응답이 먼저 도착한 레이스 — 이미 저장됐으므로 사실대로 알린다.
      if (controller.signal.aborted) {
        showToast('분석이 이미 끝나 기록에 저장됐어요');
        setPhase(originPhase);
        return;
      }
      router.replace('/diagnosis-result');
    } catch (e) {
      if (e instanceof DiagnosisCanceledError) {
        // F81: 사용자 취소는 오류가 아니다 — 토스트만 띄우고 원래 화면으로.
        showToast('분석을 취소했어요');
        setPhase(originPhase);
        return;
      }
      if (e instanceof DiagnosisQualityError) {
        // F78: "다시 시도"가 아니라 "다시 촬영"이 필요한 오류 — 사유별 안내로 분기.
        setQualityIssue(e.code);
        setPhase(originPhase);
        return;
      }
      setError(e instanceof Error ? e.message : '분석 결과를 저장하지 못했어요. 다시 시도해주세요.');
      setPhase(originPhase);
    } finally {
      abortRef.current = null;
    }
  };

  const handleCapture = async () => {
    if (phase !== 'capture') return;
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.5 });
    if (!photo) return;
    await submitPhoto({ uri: photo.uri, width: photo.width, height: photo.height });
  };

  const handlePickFromLibrary = async () => {
    if (phase === 'analyzing' || wentOutside === null) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError('사진첩 접근 권한이 필요해요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await submitPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
  };

  // F78: 품질 게이트 재촬영 안내 — intro/capture 어느 화면에서 실패했든 띄운다.
  const qualityModal = qualityIssue !== null && (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => setQualityIssue(null)}
    >
      <View style={styles.consentOverlay}>
        <View style={styles.consentCard}>
          <View style={styles.qualityIconWrap}>
            <Ionicons
              name={QUALITY_GUIDE[qualityIssue].icon}
              size={32}
              color={colors.sageDark}
            />
          </View>
          <Text style={styles.consentTitle}>{QUALITY_GUIDE[qualityIssue].title}</Text>
          <Text style={styles.consentBody}>{QUALITY_GUIDE[qualityIssue].tip}</Text>
          <Pressable
            onPress={() => {
              setQualityIssue(null);
              setError(null);
              setPhase('capture');
            }}
            style={styles.consentCta}
          >
            <Text style={styles.consentCtaText}>다시 촬영하기</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setQualityIssue(null);
              setError(null);
              void handlePickFromLibrary();
            }}
            style={styles.consentLater}
          >
            <Text style={styles.consentLaterText}>사진첩에서 다시 선택하기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  if (phase === 'intro') {
    return (
      <>
      <SafeAreaView style={styles.introSafeArea}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.introCloseButton, { marginTop: insets.top }]}
        >
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>

        <ScrollView
          contentContainerStyle={styles.introBody}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.introIllustration}>
            <Ionicons name="person-outline" size={48} color={colors.sageDark} />
          </View>

          <Text style={styles.introTitle}>촬영 전에{'\n'}이렇게 준비해주세요</Text>

          <View style={styles.tipList}>
            {TIPS.map((tip) => (
              <View key={tip.text} style={styles.tipRow}>
                <View style={styles.tipIconWrap}>
                  <Ionicons name={tip.icon} size={18} color={colors.sageDark} />
                </View>
                <Text style={styles.tipText}>{tip.text}</Text>
              </View>
            ))}
          </View>

          <View style={styles.outsideQuestion}>
            <Text style={styles.outsideQuestionLabel}>사진 찍기 전에 외출을 하셨나요?</Text>
            <Text style={styles.outsideQuestionHint}>
              외출하셨다면 오늘 날씨를 피부 상태와 함께 기록해요
            </Text>
            <View style={styles.outsideOptionRow}>
              {(
                [
                  { value: true, label: '예' },
                  { value: false, label: '아니오' },
                ] as const
              ).map((option) => {
                const selected = wentOutside === option.value;
                return (
                  <Pressable
                    key={String(option.value)}
                    onPress={() => setWentOutside(option.value)}
                    style={[styles.outsideOption, selected && styles.outsideOptionSelected]}
                  >
                    <Text
                      style={[
                        styles.outsideOptionText,
                        selected && styles.outsideOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {error && <Text style={styles.introErrorText}>{error}</Text>}

        {/* F27: 카메라 권한은 촬영 화면에서 요청 — 여기엔 동의 게이트만 둔다. */}
        <Pressable
          style={[styles.introCta, wentOutside === null && styles.introCtaDisabled]}
          onPress={() => requireConsentThen('capture')}
          disabled={wentOutside === null}
        >
          <Text style={styles.introCtaText}>촬영 시작하기</Text>
        </Pressable>
        <Pressable
          style={[styles.introSecondaryCta, wentOutside === null && styles.introSecondaryCtaDisabled]}
          onPress={() => requireConsentThen('library')}
          disabled={wentOutside === null}
        >
          <Ionicons name="images-outline" size={18} color={wentOutside === null ? colors.gray300 : colors.sageDark} />
          <Text
            style={[
              styles.introSecondaryCtaText,
              wentOutside === null && styles.introSecondaryCtaTextDisabled,
            ]}
          >
            사진첩에서 선택하기
          </Text>
        </Pressable>
      </SafeAreaView>

      {/* 촬영 전 필수 동의 팝업 (F27) — 미동의 항목이 있으면 촬영 진입 전에 표시 */}
      <Modal
        visible={consentModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!consentSubmitting) setConsentModalVisible(false);
        }}
      >
        <View style={styles.consentOverlay}>
          <View style={styles.consentCard}>
            <Text style={styles.consentTitle}>촬영 전 동의가 필요해요</Text>
            <Text style={styles.consentBody}>
              피부 측정에는 아래 동의가 필요해요. 미동의 시 촬영할 수 없어요.
            </Text>
            {consentRegistry?.map((item) => {
              const required = item.required;
              const checked = required || storageAgreed;
              return (
                <Pressable
                  key={item.purpose}
                  disabled={required || consentSubmitting}
                  onPress={() => setStorageAgreed((v) => !v)}
                  style={styles.consentItem}
                >
                  <View style={[styles.consentCheckbox, checked && styles.consentCheckboxChecked]}>
                    {checked && <Ionicons name="checkmark" size={14} color={colors.textInverse} />}
                  </View>
                  <View style={styles.consentItemTextWrap}>
                    <Text style={styles.consentItemTitle}>
                      ({required ? '필수' : '선택'}) {item.title}
                    </Text>
                    <Text style={styles.consentItemDesc}>{item.description}</Text>
                  </View>
                </Pressable>
              );
            })}
            <Pressable
              disabled={consentSubmitting}
              onPress={handleConsentContinue}
              style={[styles.consentCta, consentSubmitting && styles.consentCtaDisabled]}
            >
              {consentSubmitting ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.consentCtaText}>동의하고 계속하기</Text>
              )}
            </Pressable>
            <Pressable
              disabled={consentSubmitting}
              onPress={() => setConsentModalVisible(false)}
              style={styles.consentLater}
            >
              <Text style={styles.consentLaterText}>나중에</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {qualityModal}
    </>
  );
  }

  if (phase === 'analyzing') {
    // F81: 무엇을 기다리는지 단계로 보여주고, 언제든 취소할 수 있게 한다.
    const steps = [
      { key: 'prepare', label: '사진 준비', desc: '전송할 사진을 정리하고 있어요' },
      { key: 'analyze', label: 'AI 분석', desc: '피부 상태를 부위별로 살펴보고 있어요' },
    ] as const;
    const activeIdx = analyzeStep === 'prepare' ? 0 : 1;
    return (
      <View style={styles.analyzingWrap}>
        <View style={styles.analyzingIconWrap}>
          <ActivityIndicator size="large" color={colors.sageDark} />
        </View>
        <Text style={styles.analyzingTitle}>분석 중입니다</Text>
        <View style={styles.stepList}>
          {steps.map((step, idx) => {
            const done = idx < activeIdx;
            const active = idx === activeIdx;
            return (
              <View key={step.key} style={styles.stepRow}>
                <View style={styles.stepIcon}>
                  {done ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.sageDark} />
                  ) : active ? (
                    <ActivityIndicator size="small" color={colors.sageDark} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={18} color={colors.gray300} />
                  )}
                </View>
                <View style={styles.stepTextWrap}>
                  <Text
                    style={[
                      styles.stepLabel,
                      active && styles.stepLabelActive,
                      done && styles.stepLabelDone,
                    ]}
                  >
                    {step.label}
                  </Text>
                  {active && <Text style={styles.stepDesc}>{step.desc}</Text>}
                </View>
              </View>
            );
          })}
        </View>
        <Pressable
          onPress={() => abortRef.current?.abort()}
          hitSlop={8}
          style={styles.analyzeCancelButton}
        >
          <Text style={styles.analyzeCancelText}>취소</Text>
        </Pressable>
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.flex} />;
  }

  if (!permission?.granted) {
    return (
      <SafeAreaView style={[styles.flex, styles.permissionWrap]}>
        <Ionicons name="camera-outline" size={40} color={colors.textSecondary} />
        <Text style={styles.permissionTitle}>카메라 접근 권한이 필요해요</Text>
        <Text style={styles.permissionBody}>
          안면 사진 촬영을 위해 카메라 권한을 허용해 주세요.{'\n'}원본 이미지는 저장되지 않아요.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>권한 허용하기</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.flex}>
      {qualityModal}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />

      {/* 얼굴 윤곽 오버레이 */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.faceOval} />
      </View>

      <SafeAreaView style={styles.topBar} edges={['top']}>
        <View style={styles.topBarCenter}>
          <Text style={styles.guideText}>{GUIDE_TEXT}</Text>
        </View>
      </SafeAreaView>

      <SafeAreaView style={styles.bottomBar}>
        <Text style={styles.timingHint}>외출 후·자기 전, 세안을 마친 뒤 촬영하면 더 정확해요</Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
        {/* 좌측엔 사진첩 버튼, 우측엔 X 버튼을 같은 너비로 둬서 셔터 버튼이 화면 중앙에 오도록 맞춘다 */}
        <View style={styles.shutterRow}>
          <Pressable onPress={handlePickFromLibrary} hitSlop={12} style={styles.closeButton}>
            <Ionicons name="images-outline" size={22} color={colors.textInverse} />
          </Pressable>
          <Pressable style={styles.shutter} onPress={handleCapture}>
            <View style={styles.shutterInner} />
          </Pressable>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeButton}>
            <Ionicons name="close" size={22} color={colors.textInverse} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },

  // 촬영 전 안내 화면
  introSafeArea: { flex: 1, backgroundColor: colors.background, padding: spacing.xl },
  introCloseButton: { alignSelf: 'flex-end' },
  introBody: { flexGrow: 1, justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.sm },
  introIllustration: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    backgroundColor: colors.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    ...typography.displaySm,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  tipList: { gap: spacing.sm },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    ...shadow.card,
  },
  tipIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  outsideQuestion: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadow.card,
  },
  outsideQuestionLabel: { ...typography.subtitle, color: colors.textPrimary },
  outsideQuestionHint: { ...typography.bodySm, color: colors.textSecondary },
  outsideOptionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  outsideOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  outsideOptionSelected: {
    borderColor: colors.sage,
    backgroundColor: colors.sageLight,
  },
  outsideOptionText: { ...typography.subtitle, color: colors.textSecondary },
  outsideOptionTextSelected: { color: colors.sageDark, fontWeight: '700' },
  introCta: {
    backgroundColor: colors.sage,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  introCtaDisabled: { backgroundColor: colors.gray200 },
  introCtaText: { ...typography.headline, color: colors.textInverse },
  introSecondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  introSecondaryCtaDisabled: { opacity: 0.5 },
  introSecondaryCtaText: { ...typography.subtitle, color: colors.sageDark },
  introSecondaryCtaTextDisabled: { color: colors.gray300 },
  introErrorText: { ...typography.caption, color: colors.coral, textAlign: 'center' },

  // 촬영 권한 요청 화면
  permissionWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  permissionTitle: { ...typography.headline, color: colors.textPrimary },
  permissionBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  permissionButton: {
    marginTop: spacing.md,
    backgroundColor: colors.sage,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  permissionButtonText: { ...typography.subtitle, color: colors.textInverse },

  // 촬영 전 필수 동의 팝업 (F27)
  consentOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  consentCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  consentTitle: { ...typography.headline, color: colors.textPrimary, textAlign: 'center' },
  consentBody: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center' },
  consentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  consentCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentCheckboxChecked: { backgroundColor: colors.sage, borderColor: colors.sage },
  consentItemTextWrap: { flex: 1, gap: 2 },
  consentItemTitle: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
  consentItemDesc: { ...typography.caption, color: colors.textTertiary },
  consentCta: {
    backgroundColor: colors.sage,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  consentCtaDisabled: { opacity: 0.6 },
  consentCtaText: { ...typography.headline, color: colors.textInverse },
  consentLater: { alignItems: 'center', paddingVertical: spacing.sm },
  consentLaterText: { ...typography.bodySm, color: colors.textSecondary },

  // F78: 품질 게이트 재촬영 안내 모달
  qualityIconWrap: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 카메라 촬영 화면
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  faceOval: {
    width: 230,
    height: 300,
    borderRadius: 150,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderStyle: 'dashed',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  topBarCenter: {
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  guideText: {
    ...typography.headline,
    color: '#FFFFFF',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  timingHint: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.85)',
    paddingHorizontal: spacing.xl,
    textAlign: 'center',
  },
  errorText: {
    ...typography.caption,
    color: colors.coral,
    paddingHorizontal: spacing.xl,
    textAlign: 'center',
  },
  // 셔터 버튼이 화면 중앙에 오도록, X 버튼과 동일한 너비의 빈 스페이서를 반대쪽에 둔 3분할 행
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 분석 중 화면
  analyzingWrap: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  analyzingIconWrap: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    backgroundColor: colors.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  analyzingTitle: { ...typography.displaySm, color: colors.textPrimary },
  analyzingBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  // F81: 분석 단계 표시 + 취소
  stepList: { gap: spacing.md, marginTop: spacing.sm, minWidth: 220 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepIcon: { width: 24, alignItems: 'center', paddingTop: 1 },
  stepTextWrap: { flex: 1, gap: 2 },
  stepLabel: { ...typography.body, color: colors.textTertiary },
  stepLabelActive: { color: colors.textPrimary, fontWeight: '600' },
  stepLabelDone: { color: colors.sageDark },
  stepDesc: { ...typography.caption, color: colors.textSecondary },
  analyzeCancelButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  analyzeCancelText: { ...typography.subtitle, color: colors.textSecondary },
});

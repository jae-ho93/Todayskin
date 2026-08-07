import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api/client';
import { useUserLocation } from '../src/hooks/useUserLocation';
import { colors, radius, shadow, spacing, typography } from '../src/theme';

const GUIDE_TEXT = '정면을 맞춰주세요';

const TIPS = [
  { icon: 'sunny-outline' as const, text: '밝은 곳에서 촬영해주세요' },
  { icon: 'scan-outline' as const, text: '가이드 선에 맞춰 정면을 응시해주세요' },
  { icon: 'water-outline' as const, text: '세안 후 맨 얼굴로 촬영하면 더 정확해요' },
  { icon: 'cut-outline' as const, text: '앞머리를 넘겨 이마가 보이게 촬영해주세요' },
];

// 화면 3: 얼굴 촬영 가이드
export default function CameraGuideScreen() {
  const [phase, setPhase] = useState<'intro' | 'capture' | 'analyzing'>('intro');
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [wentOutside, setWentOutside] = useState<boolean | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const { coords } = useUserLocation();

  const submitPhoto = async (uri: string) => {
    const originPhase = phase;
    setPhase('analyzing');
    setError(null);
    try {
      await api.submitDiagnosis({
        front: uri,
        wentOutside: wentOutside ?? false,
        coords: wentOutside ? (coords ?? undefined) : undefined,
      });
      router.replace('/diagnosis-result');
    } catch (e) {
      setError(e instanceof Error ? e.message : '진단 저장에 실패했습니다. 다시 시도해주세요.');
      setPhase(originPhase);
    }
  };

  const handleCapture = async () => {
    if (phase !== 'capture') return;
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.5 });
    if (!photo) return;
    await submitPhoto(photo.uri);
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
    await submitPhoto(result.assets[0].uri);
  };

  if (phase === 'intro') {
    return (
      <SafeAreaView style={styles.introSafeArea}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.introCloseButton}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>

        <ScrollView
          contentContainerStyle={styles.introBody}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.introIllustration}>
            <Ionicons name="person-outline" size={72} color={colors.sageDark} />
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

        <Pressable
          style={[styles.introCta, wentOutside === null && styles.introCtaDisabled]}
          onPress={() => setPhase('capture')}
          disabled={wentOutside === null}
        >
          <Text style={styles.introCtaText}>촬영 시작하기</Text>
        </Pressable>
        <Pressable
          style={[styles.introSecondaryCta, wentOutside === null && styles.introSecondaryCtaDisabled]}
          onPress={handlePickFromLibrary}
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
    );
  }

  if (phase === 'analyzing') {
    return (
      <View style={styles.analyzingWrap}>
        <View style={styles.analyzingIconWrap}>
          <ActivityIndicator size="large" color={colors.sageDark} />
        </View>
        <Text style={styles.analyzingTitle}>분석 중입니다</Text>
        <Text style={styles.analyzingBody}>AI가 피부 상태를 분석하고 있어요.{'\n'}잠시만 기다려주세요.</Text>
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.flex} />;
  }

  if (!permission.granted) {
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
  introBody: { flexGrow: 1, justifyContent: 'center', gap: spacing.xl, paddingVertical: spacing.lg },
  introIllustration: {
    alignSelf: 'center',
    width: 140,
    height: 140,
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
  tipList: { gap: spacing.md },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  tipIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  outsideQuestion: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
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
});

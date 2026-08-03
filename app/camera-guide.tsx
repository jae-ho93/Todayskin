import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api/client';
import { colors, radius, shadow, spacing, typography } from '../src/theme';

const STEPS = [
  { key: 'front', title: '정면을 맞춰주세요' },
  { key: 'left', title: '왼쪽으로 살짝 돌려주세요' },
  { key: 'right', title: '오른쪽으로 살짝 돌려주세요' },
] as const;

const TIPS = [
  { icon: 'sunny-outline' as const, text: '밝은 곳에서 촬영해주세요' },
  { icon: 'scan-outline' as const, text: '가이드 선에 맞춰 정면을 응시해주세요' },
  { icon: 'water-outline' as const, text: '세안 후 맨 얼굴로 촬영하면 더 정확해요' },
];

// 화면 3: 얼굴 촬영 가이드
export default function CameraGuideScreen() {
  const [phase, setPhase] = useState<'intro' | 'capture'>('intro');
  const [permission, requestPermission] = useCameraPermissions();
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const photosRef = useRef<{ front?: string; left?: string; right?: string }>({});
  const step = STEPS[stepIndex];

  const handleCapture = async () => {
    if (submitting) return;
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.5 });
    if (!photo) return;
    photosRef.current[step.key] = photo.uri;

    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1);
      return;
    }

    const { front, left, right } = photosRef.current;
    if (!front || !left || !right) return;

    setSubmitting(true);
    setError(null);
    try {
      await api.submitDiagnosis({ front, left, right });
      router.replace('/diagnosis-result');
    } catch (e) {
      setError(e instanceof Error ? e.message : '진단 저장에 실패했습니다. 다시 시도해주세요.');
      setSubmitting(false);
    }
  };

  if (phase === 'intro') {
    return (
      <SafeAreaView style={styles.introSafeArea}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.introCloseButton}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>

        <View style={styles.introBody}>
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
        </View>

        <Pressable style={styles.introCta} onPress={() => setPhase('capture')}>
          <Text style={styles.introCtaText}>촬영 시작하기</Text>
        </Pressable>
      </SafeAreaView>
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
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={colors.textInverse} />
        </Pressable>
        <View style={styles.topBarCenter}>
          <Text style={styles.guideText}>{step.title}</Text>
          <View style={styles.feedbackBadge}>
            <Text style={styles.feedbackText}>조명이 충분해요</Text>
          </View>
        </View>
      </SafeAreaView>

      <SafeAreaView style={styles.bottomBar}>
        {stepIndex === 0 && (
          <Text style={styles.timingHint}>외출 후·자기 전, 세안을 마친 뒤 촬영하면 더 정확해요</Text>
        )}
        {error && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.stepRow}>
          {STEPS.map((s, i) => (
            <View key={s.key} style={[styles.stepDot, i <= stepIndex && styles.stepDotActive]} />
          ))}
        </View>
        <Pressable style={styles.shutter} onPress={handleCapture} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },

  // 촬영 전 안내 화면
  introSafeArea: { flex: 1, backgroundColor: colors.background, padding: spacing.xl },
  introCloseButton: { alignSelf: 'flex-end' },
  introBody: { flex: 1, justifyContent: 'center', gap: spacing.xl },
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
  introCta: {
    backgroundColor: colors.sage,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  introCtaText: { ...typography.headline, color: colors.textInverse },

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
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radius.full,
    padding: spacing.sm,
    zIndex: 1,
  },
  topBarCenter: {
    alignItems: 'center',
    paddingTop: spacing.xxl + spacing.md,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  guideText: {
    ...typography.headline,
    color: '#FFFFFF',
  },
  feedbackBadge: {
    backgroundColor: 'rgba(122,158,126,0.85)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  feedbackText: { ...typography.caption, color: '#FFFFFF' },
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
  stepRow: { flexDirection: 'row', gap: spacing.sm },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  stepDotActive: { backgroundColor: colors.coral },
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
});

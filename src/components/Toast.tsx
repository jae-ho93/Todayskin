import { Ionicons } from '@expo/vector-icons';
import { ReactNode, createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

// F43: 전역 토스트 — Alert 대신 성공/오류/정보 피드백을 흐름을 끊지 않고 표시한다.
type ToastType = 'success' | 'error' | 'info';

interface ToastOptions {
  type?: ToastType;
  durationMs?: number;
}

interface ToastState {
  message: string;
  type: ToastType;
  key: number;
}

const ToastContext = createContext<{
  showToast: (message: string, options?: ToastOptions) => void;
}>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICON: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

const COLOR: Record<ToastType, string> = {
  success: colors.statusGood,
  error: colors.statusBad,
  info: colors.sageDark,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
      () => setToast(null),
    );
  }, [opacity]);

  const showToast = useCallback(
    (message: string, options?: ToastOptions) => {
      const durationMs = options?.durationMs ?? 2500;
      setToast({ message, type: options?.type ?? 'info', key: Date.now() });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(hide, durationMs);
    },
    [hide, opacity],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Animated.View
          key={toast.key}
          pointerEvents="none"
          style={[styles.toast, { opacity }]}
          accessibilityLiveRegion="polite"
        >
          <Ionicons name={ICON[toast.type]} size={18} color={COLOR[toast.type]} />
          <Text style={styles.toastText}>{toast.message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: spacing.xl,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '88%',
    backgroundColor: colors.gray900,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    zIndex: 1000,
  },
  toastText: { ...typography.bodySm, color: colors.surface, flexShrink: 1 },
});

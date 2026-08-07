import { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

interface ScreenContainerProps {
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  // 둘 다 넘기면 당겨서 새로고침(pull-to-refresh) 활성화. scroll=false면 무시된다.
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function ScreenContainer({
  children,
  scroll = true,
  style,
  edges,
  refreshing,
  onRefresh,
}: ScreenContainerProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, style]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing ?? false}
                onRefresh={onRefresh}
                tintColor={colors.sage}
                colors={[colors.sage]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
});

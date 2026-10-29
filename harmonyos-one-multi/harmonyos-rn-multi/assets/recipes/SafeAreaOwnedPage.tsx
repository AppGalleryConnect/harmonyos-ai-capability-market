import type { PropsWithChildren } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = PropsWithChildren<{
  backgroundColor: string;
  consumeTop?: boolean;
  consumeBottom?: boolean;
  // Landscape cutouts and side navigation areas on foldables, tablets and 2in1.
  consumeHorizontal?: boolean;
}>;

// Requires one SafeAreaProvider above the navigation/portal root.
export function SafeAreaOwnedPage({
  backgroundColor,
  consumeTop = true,
  consumeBottom = true,
  consumeHorizontal = true,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  // Insets are physical edges. Map them to start/end explicitly so RN's
  // RTL left/right swap cannot move them to the wrong side.
  const startInset = I18nManager.isRTL ? insets.right : insets.left;
  const endInset = I18nManager.isRTL ? insets.left : insets.right;
  return (
    <View style={[styles.root, { backgroundColor }]}>
      <View
        style={[
          styles.content,
          consumeTop && { paddingTop: insets.top },
          consumeBottom && { paddingBottom: insets.bottom },
          consumeHorizontal && { paddingStart: startInset, paddingEnd: endInset },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});

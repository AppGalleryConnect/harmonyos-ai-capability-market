import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppBreakpoint } from './BreakpointProvider';

type Props = Readonly<{
  navigation: ReactNode;
  detail: ReactNode;
  hasSelection: boolean;
  onCompactBack: () => void;
  // From project tokens or measured content constraints; not a platform constant.
  navigationWidth: number;
  backLabel: string;
}>;

// Both panes stay mounted at fixed tree positions in every breakpoint, so
// crossing a breakpoint never remounts the list or the detail (scroll position,
// form input and media state survive). Only styles change.
export function AdaptiveNavigationPresentation({
  navigation,
  detail,
  hasSelection,
  onCompactBack,
  navigationWidth,
  backLabel,
}: Props) {
  const { value: breakpoint } = useAppBreakpoint();
  const expanded = breakpoint === 'expanded';
  const showNavigation = expanded || !hasSelection;
  const showDetail = expanded || hasSelection;

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.navigation,
          expanded ? { flexBasis: navigationWidth } : styles.fill,
          !showNavigation && styles.hidden,
        ]}
      >
        {navigation}
      </View>
      <View style={[styles.fill, !showDetail && styles.hidden]}>
        {/* Keep this slot even when null so `detail` keeps its child index. */}
        {!expanded && hasSelection ? (
          <Pressable
            accessibilityRole="button"
            onPress={onCompactBack}
            style={styles.backButton}
          >
            <Text>{backLabel}</Text>
          </Pressable>
        ) : null}
        {detail}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  navigation: { flexGrow: 0, flexShrink: 1, minWidth: 0 },
  fill: { flex: 1, minWidth: 0 },
  // Verify `display: 'none'` on the locked RNOH version; hidden panes stay mounted.
  hidden: { display: 'none' },
  backButton: { alignSelf: 'flex-start', padding: 12 },
});

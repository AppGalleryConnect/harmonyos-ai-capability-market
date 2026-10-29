import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBreakpoint } from './useBreakpoint';

type Props = PropsWithChildren<{
  navigation?: ReactNode;
  detail?: ReactNode;
  // From project content-width tokens; not a platform constant.
  maxContentWidth: number;
}>;

export function ResponsiveShell({ navigation, children, detail, maxContentWidth }: Props) {
  const breakpoint = useBreakpoint();
  const expanded = breakpoint === 'expanded';

  return (
    <View style={[styles.viewport, expanded && styles.expanded, { maxWidth: maxContentWidth }]}>
      {navigation ? <View style={styles.navigation}>{navigation}</View> : null}
      <View style={styles.content}>{children}</View>
      {expanded && detail ? <View style={styles.detail}>{detail}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
  expanded: {
    flexDirection: 'row',
  },
  navigation: {
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  detail: {
    flex: 1,
    minWidth: 0,
  },
});

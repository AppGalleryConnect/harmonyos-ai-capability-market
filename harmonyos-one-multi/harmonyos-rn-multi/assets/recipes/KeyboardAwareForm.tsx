import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';

type Props = PropsWithChildren<{
  // Required on purpose. Some RNOH hosts do not shrink the window for the
  // keyboard (see compatibility-matrix.md), and KeyboardAvoidingView with no
  // behavior does nothing, so an omitted value can leave inputs under the
  // keyboard. Measure the host on the locked version first:
  // - window height shrinks when the keyboard opens -> pass 'none' (scroll only);
  // - window height stays the same -> pick 'padding' or 'height' by device test.
  behavior: 'height' | 'padding' | 'position' | 'none';
  keyboardVerticalOffset?: number;
}>;

export function KeyboardAwareForm({
  behavior,
  keyboardVerticalOffset = 0,
  children,
}: Props) {
  return (
    <KeyboardAvoidingView
      behavior={behavior === 'none' ? undefined : behavior}
      enabled={behavior !== 'none'}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={styles.page}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        style={styles.viewport}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0 },
  viewport: { flex: 1 },
  content: { flexGrow: 1 },
});

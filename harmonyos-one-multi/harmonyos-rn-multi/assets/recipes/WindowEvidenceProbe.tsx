import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, LayoutRectangle } from 'react-native';
import { useWindowDimensions } from 'react-native';

export type LayoutEvidence = Readonly<{
  name: string;
  sequence: number;
  timestamp: number;
  window: Readonly<{ width: number; height: number; scale: number; fontScale: number }>;
  layout: LayoutRectangle;
  aspectRatio: number;
}>;

function sameLayout(a: LayoutRectangle | null, b: LayoutRectangle): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// Diagnostic hook. Attach the returned onLayout directly to the node under test
// (the Image itself, or the frame that owns aspectRatio). It inserts no wrapper
// View, so it neither changes that layout nor measures a different node.
// Records collected on the target device are runtime evidence; the hook itself
// proves nothing and must be removed after diagnosis.
export function useLayoutEvidence(
  name: string,
  onEvidence: (evidence: LayoutEvidence) => void,
): (event: LayoutChangeEvent) => void {
  const { width, height, scale, fontScale } = useWindowDimensions();
  const [layout, setLayout] = useState<LayoutRectangle | null>(null);
  const sequence = useRef(0);
  const sink = useRef(onEvidence);

  useEffect(() => {
    sink.current = onEvidence;
  }, [onEvidence]);

  // Emits when the measured layout or the window changes. A window change can
  // arrive before the matching onLayout; read the last record after each
  // window settles.
  useEffect(() => {
    if (!layout || layout.width === 0 || layout.height === 0) return;
    sequence.current += 1;
    sink.current({
      name,
      sequence: sequence.current,
      timestamp: Date.now(),
      window: { width, height, scale, fontScale },
      layout,
      aspectRatio: layout.width / layout.height,
    });
  }, [fontScale, height, layout, name, scale, width]);

  return useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout;
    setLayout((previous) => (sameLayout(previous, next) ? previous : next));
  }, []);
}

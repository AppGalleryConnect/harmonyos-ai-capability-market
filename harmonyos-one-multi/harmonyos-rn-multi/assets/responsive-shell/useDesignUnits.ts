import { useCallback, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

// Every field must come from the project's design system or acceptance criteria.
// There is deliberately no default: RN/HarmonyOS define no base width or scale range.
export type DesignScalePolicy = Readonly<{
  baseWidth: number;
  minScale: number;
  maxScale: number;
}>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolveLayoutScale(width: number, policy: DesignScalePolicy): number {
  return clamp(width / policy.baseWidth, policy.minScale, policy.maxScale);
}

// Pass a stable policy (module constant or token object), not an inline literal.
// Cap wide content with layout maxWidth, not by folding a content width into the scale.
export function useDesignUnits(policy: DesignScalePolicy) {
  const { width, height, fontScale } = useWindowDimensions();
  const { baseWidth, minScale, maxScale } = policy;
  const layoutScale = useMemo(
    () => resolveLayoutScale(width, { baseWidth, minScale, maxScale }),
    [baseWidth, maxScale, minScale, width],
  );
  const unit = useCallback(
    (designValue: number) => designValue * layoutScale,
    [layoutScale],
  );

  // fontScale is returned for text decisions only; never multiply it into layout.
  return { width, height, fontScale, layoutScale, unit } as const;
}

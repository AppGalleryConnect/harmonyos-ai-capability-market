import { useMemo } from 'react';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

import { useAppBreakpoint } from './BreakpointProvider';

// Presentation-only options for the app's single Tab.Navigator. Pass the result
// as navigator-level `screenOptions`; never override these keys per screen,
// because the focused screen's options decide where the bar is drawn.
//
// Only for a bottom-tabs version whose installed types declare `tabBarPosition`
// (check node_modules/@react-navigation/bottom-tabs). Otherwise follow the
// fallback in responsive-layout.md「底部 Tab 宽屏迁移：先判 Tab 栏 owner」.
//
// The variant/label pairing below matches the constraint asserted by the
// version this was written against: the side bar needs the 'material' variant
// (or a horizontal label), and 'material' is rejected at the bottom. Re-check
// the installed BottomTabBar source before copying.
//
// The built-in side bar stacks items from the top; `tabBarStyle` styles only the
// outer container. Top is not a decided default: settle group alignment as in
// responsive-layout.md「RN 侧栏呈现」, and if it is centered, pass your own bar
// component through the `tabBar` prop instead of adding justify styles here.
export function useAdaptiveTabBarOptions(
  // From project tokens; omit to keep the library's minimum side bar width.
  sideBarWidth?: number,
): Partial<BottomTabNavigationOptions> {
  const { value: breakpoint } = useAppBreakpoint();
  const expanded = breakpoint === 'expanded';

  return useMemo<Partial<BottomTabNavigationOptions>>(
    () =>
      expanded
        ? {
            tabBarPosition: 'left',
            tabBarVariant: 'material',
            tabBarLabelPosition: 'below-icon',
            ...(sideBarWidth == null ? null : { tabBarStyle: { width: sideBarWidth } }),
          }
        : {
            tabBarPosition: 'bottom',
            tabBarVariant: 'uikit',
          },
    [expanded, sideBarWidth],
  );
}

// Usage: one navigator, same screens in every breakpoint.
//
//   const adaptive = useAdaptiveTabBarOptions(tokens.sideBarWidth);
//   <Tab.Navigator screenOptions={{ ...baseOptions, ...adaptive }}>
//     <Tab.Screen name="Home" component={HomeScreen} />
//     ...
//   </Tab.Navigator>

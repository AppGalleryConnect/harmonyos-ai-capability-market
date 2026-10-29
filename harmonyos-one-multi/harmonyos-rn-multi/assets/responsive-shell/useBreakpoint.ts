// The shell defines no thresholds of its own. It reads the app's single
// breakpoint source (BreakpointProvider) so copying both assets never creates
// a second source. Map to the project's existing provider if it has one.
import { useAppBreakpoint } from '../recipes/BreakpointProvider';

export type { AppBreakpoint as Breakpoint } from '../recipes/BreakpointProvider';

export function useBreakpoint() {
  return useAppBreakpoint().value;
}

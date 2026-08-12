export type SearchChromePhase = 'expanded' | 'collapsing' | 'compact';
export type ScrollDirection = 'up' | 'down' | 'none';

export interface SearchChromeState {
  phase: SearchChromePhase;
  lastY: number;
  direction: ScrollDirection;
  directionAnchorY: number;
  focused: boolean;
  sessionOpen: boolean;
  shortLandscape: boolean;
}

export type SearchChromeAction =
  | { type: 'scroll'; y: number }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'transitionEnd' }
  | { type: 'landscape'; short: boolean };

const COLLAPSE_AFTER_Y = 72;
const HYSTERESIS = 24;

export function initialSearchChromeState(shortLandscape: boolean): SearchChromeState {
  return {
    phase: shortLandscape ? 'compact' : 'expanded',
    lastY: 0,
    direction: 'none',
    directionAnchorY: 0,
    focused: false,
    sessionOpen: false,
    shortLandscape,
  };
}

export function reduceSearchChrome(
  state: SearchChromeState,
  action: SearchChromeAction,
): SearchChromeState {
  if (action.type === 'focus') return { ...state, focused: true, phase: 'expanded' };
  if (action.type === 'blur') return { ...state, focused: false };
  if (action.type === 'open') return { ...state, sessionOpen: true, phase: 'expanded' };
  if (action.type === 'close') {
    return { ...state, sessionOpen: false, focused: false, phase: 'compact' };
  }
  if (action.type === 'transitionEnd') {
    return {
      ...state,
      phase: state.phase === 'collapsing' ? 'compact' : state.phase,
    };
  }
  if (action.type === 'landscape') {
    return {
      ...state,
      shortLandscape: action.short,
      phase: action.short && !state.focused ? 'compact' : state.phase,
    };
  }

  const y = Math.max(0, action.y);
  if (state.shortLandscape && !state.focused && !state.sessionOpen) {
    return {
      ...state,
      phase: 'compact',
      lastY: y,
      direction: 'none',
      directionAnchorY: y,
    };
  }
  if (state.focused || state.sessionOpen || y <= 8) {
    return {
      ...state,
      phase: 'expanded',
      lastY: y,
      direction: 'none',
      directionAnchorY: y,
    };
  }

  const direction: ScrollDirection = y > state.lastY
    ? 'down'
    : y < state.lastY
      ? 'up'
      : state.direction;
  const anchor = direction !== state.direction ? state.lastY : state.directionAnchorY;
  let phase = state.phase;

  if (direction === 'down' && y >= COLLAPSE_AFTER_Y && y - anchor >= HYSTERESIS) {
    phase = 'collapsing';
  }
  if (direction === 'up' && anchor - y >= HYSTERESIS) phase = 'expanded';

  return {
    ...state,
    phase,
    lastY: y,
    direction,
    directionAnchorY: anchor,
  };
}

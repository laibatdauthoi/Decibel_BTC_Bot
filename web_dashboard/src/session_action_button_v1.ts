import { createElement } from 'react';
import {
  getSessionStartButtonLabelV1,
  type session_start_request_state_v1,
} from './session_start_request_v1';

export function hasConfirmedSessionEndV1(
  expectedId: string | null,
  latestId: string | null,
  status: string | null,
  noActiveSession: boolean,
): boolean {
  return expectedId !== null && expectedId === latestId && status === 'ENDED' && noActiveSession;
}

export function renderSessionActionButtonV1(
  props: Readonly<{
    sessionStatus: string | null;
    owned: boolean;
    startPhase: session_start_request_state_v1['phase'];
    startAllowed: boolean;
    startBlockReason?: string | null;
    ending: boolean;
    onStart(): void;
    onEnd(): void;
  }>,
) {
  const ending = props.ending || props.sessionStatus === 'STOPPING';
  const starting =
    props.sessionStatus === 'STARTING' ||
    (props.startPhase === 'SESSION_ACTIVE' &&
      ['IDLE', 'ENDED', 'BLOCKED', null].includes(props.sessionStatus)) ||
    ['CHECKING_ACCOUNT', 'STARTING_SESSION', 'CONFIRMING'].includes(props.startPhase);
  const active =
    !starting &&
    props.sessionStatus !== null &&
    !['ENDED', 'BLOCKED', 'IDLE'].includes(props.sessionStatus);
  const label = ending
    ? 'ENDING SESSION…'
    : starting
      ? props.startPhase === 'CHECKING_ACCOUNT'
        ? 'CHECKING ACCOUNT…'
        : 'STARTING SESSION…'
      : active
        ? 'END SESSION'
        : getSessionStartButtonLabelV1('IDLE');
  const button = createElement(
    'button',
    {
      className: 'primary-session-action',
      'aria-busy': ending || starting,
      disabled: ending || starting || (active ? !props.owned : !props.startAllowed),
      onClick: active ? props.onEnd : props.onStart,
    },
    label,
  );
  const blocker =
    !active && !ending && !starting && !props.startAllowed ? props.startBlockReason : null;
  if (!blocker) return button;
  return createElement(
    'div',
    {
      className: 'session-start-tooltip',
      role: 'group',
      tabIndex: 0,
      'aria-label': 'Start session unavailable',
      'aria-describedby': 'settings-start-blocker',
    },
    button,
    createElement('span', { role: 'tooltip', id: 'settings-start-blocker' }, blocker),
  );
}

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { noticeLifetimeMsV1 } from './notice_timing_v1';
import { shouldReopenEventStreamV1 } from './page_visibility_v1';
import {
  checkWithdrawAmountV1,
  describeWalletErrorV1,
  normalizeWalletAddressV1,
  parseAptToOctasV1,
  WalletMenu,
} from './wallet_panel_v1';

describe('Wallet panel presentation', () => {
  it('fades success and error notices but keeps work in progress', () => {
    expect(noticeLifetimeMsV1('success')).toBe(4_000);
    expect(noticeLifetimeMsV1('error')).toBe(6_000);
    expect(noticeLifetimeMsV1('info')).toBeNull();
  });

  it('reopens a stream that is not open when the tab is shown again', () => {
    expect(shouldReopenEventStreamV1(1)).toBe(false);
    expect(shouldReopenEventStreamV1(0)).toBe(true);
    expect(shouldReopenEventStreamV1(2)).toBe(true);
    expect(shouldReopenEventStreamV1(undefined)).toBe(true);
  });

  it('reads a typed APT amount without floating-point drift', () => {
    expect(parseAptToOctasV1('0.1')).toBe(10_000_000);
    expect(parseAptToOctasV1('0,25')).toBe(25_000_000);
    expect(parseAptToOctasV1('1.00000001')).toBe(100_000_001);
    expect(parseAptToOctasV1('0.123456789')).toBeNull();
    expect(parseAptToOctasV1('-1')).toBeNull();
    expect(parseAptToOctasV1('abc')).toBeNull();
    expect(checkWithdrawAmountV1('0.1', 46_550_000)).toBeNull();
    expect(checkWithdrawAmountV1('0', 46_550_000)).toBe('Enter an amount above zero.');
    expect(checkWithdrawAmountV1('0.4655', 46_550_000)).toMatch(/Use MAX/);
    expect(checkWithdrawAmountV1('', 46_550_000)).toMatch(/Enter an amount/);
  });

  it('normalizes Petra addresses for the owner comparison', () => {
    expect(normalizeWalletAddressV1('0xAB')).toBe(`0x${'0'.repeat(62)}ab`);
    expect(normalizeWalletAddressV1('not-an-address')).toBeNull();
    expect(normalizeWalletAddressV1(null)).toBeNull();
  });

  it('turns wallet error codes into short sentences', () => {
    expect(describeWalletErrorV1('PETRA_NOT_INSTALLED')).toBe(
      'Petra is not installed in this browser.',
    );
    expect(describeWalletErrorV1('WALLET_NOT_WHITELISTED')).toBe(
      'This wallet is not allowed to use this bot.',
    );
    expect(describeWalletErrorV1('END_SESSION_BEFORE_REVOKING')).toBe(
      'End the running session before revoking the bot.',
    );
    expect(describeWalletErrorV1('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(
      describeWalletErrorV1(
        'GAS_WITHDRAW_SIMULATION_FAILED:MAX_GAS_UNITS_BELOW_MIN_TRANSACTION_GAS_UNITS',
      ),
    ).toBe(
      'The node rejected the withdrawal in simulation. Nothing was sent. (MAX_GAS_UNITS_BELOW_MIN_TRANSACTION_GAS_UNITS)',
    );
  });

  it('renders a compact top-bar button with the menu closed and no key material', () => {
    const html = renderToStaticMarkup(<WalletMenu />);
    expect(html).toContain('aria-label="Wallet"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('>CONNECT WALLET<');
    expect(html).not.toContain('wallet-dropdown');
    expect(html).not.toMatch(/private.?key/i);
  });
});

describe('Sign-in screen', () => {
  it('offers only the Petra sign-in and shows the error', async () => {
    const { SignInScreen } = await import('./auth_gate_v1');
    const html = renderToStaticMarkup(
      <SignInScreen error="AUTH_NOT_RUNTIME_OWNER" busy={false} onSignIn={() => undefined} />,
    );
    expect(html).toContain('SIGN IN WITH PETRA');
    expect(html).toContain('AUTH_NOT_RUNTIME_OWNER');
    expect(html).not.toContain('<input');
  });
});

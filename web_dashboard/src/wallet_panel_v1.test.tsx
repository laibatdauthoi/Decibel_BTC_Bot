import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { describeWalletErrorV1, normalizeWalletAddressV1, WalletMenu } from './wallet_panel_v1';

describe('Wallet panel presentation', () => {
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

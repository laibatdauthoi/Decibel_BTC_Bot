import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  describeDelegationV1,
  describeSignerV1,
  normalizeWalletAddressV1,
  WalletPanel,
  type wallet_status_v1,
} from './wallet_panel_v1';

const AGENT = `0x${'aa'.repeat(32)}`;
const base: wallet_status_v1 = {
  ownerAddress: `0x${'bb'.repeat(32)}`,
  subaccountAddress: `0x${'cc'.repeat(32)}`,
  signerMode: 'AGENT',
  keystoreSecretConfigured: true,
  agent: { address: AGENT, createdAt: 0, aptBalanceOctas: 50_000_000 },
  delegation: { status: 'ACTIVE', expiresAtMs: Date.UTC(2026, 11, 17) },
  delegationError: null,
  delegationDays: 30,
  payloads: null,
};

describe('Wallet panel presentation', () => {
  it('normalizes Petra addresses for the owner comparison', () => {
    expect(normalizeWalletAddressV1('0xAB')).toBe(`0x${'0'.repeat(62)}ab`);
    expect(normalizeWalletAddressV1('not-an-address')).toBeNull();
    expect(normalizeWalletAddressV1(null)).toBeNull();
  });

  it('names the signer the next session will use', () => {
    expect(describeSignerV1(null)).toBe('UNAVAILABLE');
    expect(describeSignerV1({ ...base, signerMode: 'PRIVATE_KEY', agent: null })).toBe(
      'PRIVATE KEY (.env)',
    );
    expect(describeSignerV1(base)).toBe('AGENT WALLET');
    expect(
      describeSignerV1({ ...base, delegation: { status: 'MISSING', expiresAtMs: null } }),
    ).toBe('AGENT WALLET (NOT AUTHORIZED)');
  });

  it('describes the delegation and its expiry', () => {
    expect(describeDelegationV1(base)).toBe('AUTHORIZED · UNTIL 2026-12-17');
    expect(
      describeDelegationV1({ ...base, delegation: { status: 'EXPIRED', expiresAtMs: 1 } }),
    ).toBe('EXPIRED');
    expect(
      describeDelegationV1({
        ...base,
        delegation: null,
        delegationError: 'DELEGATIONS_READ_FAILED:HTTP_401',
      }),
    ).toBe('DELEGATIONS_READ_FAILED:HTTP_401');
    expect(describeDelegationV1({ ...base, agent: null })).toBe('—');
  });

  it('renders inside Settings without any key material', () => {
    const html = renderToStaticMarkup(<WalletPanel />);
    expect(html).toContain('aria-label="Wallet"');
    expect(html).toContain('CONNECT PETRA');
    expect(html).not.toMatch(/private.?key/i);
  });
});

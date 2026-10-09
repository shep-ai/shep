import { describe, it, expect } from 'vitest';
import { isSupplyChainSecurityEnabled } from '@/domain/shared/supply-chain-security.js';

describe('isSupplyChainSecurityEnabled', () => {
  it('follows the ASPM flag — supply-chain security is part of ASPM (spec 135)', () => {
    expect(isSupplyChainSecurityEnabled({ aspm: true })).toBe(true);
    expect(isSupplyChainSecurityEnabled({ aspm: false })).toBe(false);
  });

  it('is off when no flags are available', () => {
    expect(isSupplyChainSecurityEnabled(undefined)).toBe(false);
  });
});

describe('isSupplyChainSecurityEnabled with the SHEP_SUPPLY_CHAIN_SECURITY override', () => {
  it('turns it off for "false" and "0" even when ASPM is on', () => {
    expect(isSupplyChainSecurityEnabled({ aspm: true }, 'false')).toBe(false);
    expect(isSupplyChainSecurityEnabled({ aspm: true }, '0')).toBe(false);
  });

  it('turns it on for "true" and "1" even when ASPM is off (CI opts in explicitly)', () => {
    expect(isSupplyChainSecurityEnabled({ aspm: false }, 'true')).toBe(true);
    expect(isSupplyChainSecurityEnabled(undefined, '1')).toBe(true);
  });

  it('ignores any other value and follows the ASPM flag', () => {
    expect(isSupplyChainSecurityEnabled({ aspm: false }, '')).toBe(false);
    expect(isSupplyChainSecurityEnabled({ aspm: true }, 'yes')).toBe(true);
  });
});

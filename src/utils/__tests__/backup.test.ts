import { describe, expect, it } from 'vitest';
import { VAULT_SETTING_KEYS, withoutVaultSettings } from '../backup';

describe('backup settings sanitization', () => {
  it('strips every vault secret while keeping user preferences', () => {
    const settings: Record<string, any> = {
      theme: 'dark',
      editorFontSize: 16,
      seededAt: 123
    };
    for (const key of VAULT_SETTING_KEYS) settings[key] = 'secret';

    const sanitized = withoutVaultSettings(settings);

    expect(sanitized.theme).toBe('dark');
    expect(sanitized.editorFontSize).toBe(16);
    expect(sanitized.seededAt).toBe(123);
    for (const key of VAULT_SETTING_KEYS) {
      expect(key in sanitized).toBe(false);
    }
  });

  it('does not mutate the input settings', () => {
    const settings = { theme: 'light', vaultSalt: 'abc' };
    withoutVaultSettings(settings);
    expect(settings.vaultSalt).toBe('abc');
  });
});

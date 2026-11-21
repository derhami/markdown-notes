/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Restoring a backup must never replace the vault material of the device it is
 * restored on: every existing secure note would become undecryptable.
 */
export const VAULT_SETTING_KEYS = [
  'vaultSalt',
  'vaultVerifier',
  'vaultRecoveryKeyHash',
  'vaultRecoveryVerifier',
  'vaultWrappedMasterKey',
  'vaultWrappedMasterKeyRecovery',
  'vaultKdfIterations',
  'vaultRecoveryKdfIterations'
] as const;

export function withoutVaultSettings<T extends Record<string, any>>(settings: T): Partial<T> {
  const clone: Record<string, any> = { ...settings };
  for (const key of VAULT_SETTING_KEYS) delete clone[key];
  return clone as Partial<T>;
}

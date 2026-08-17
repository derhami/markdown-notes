/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generate a cryptographically strong, collision-safe identifier.
 * Falls back to a random string when crypto.randomUUID is unavailable.
 */
export function generateId(): string {
  if (typeof window !== 'undefined' && typeof window.crypto !== 'undefined' && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}
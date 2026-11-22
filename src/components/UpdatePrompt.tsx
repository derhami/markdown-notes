import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Listens for a new service-worker version and prompts the user to update.
 * Updating clears every cached entry so the freshly deployed assets are used.
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered() {
      // Service worker registered successfully.
    },
    onRegisterError(error) {
      console.error('Service worker registration failed:', error);
    },
  });

  const handleUpdate = async () => {
    try {
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }
    } catch (error) {
      console.error('Failed to clear caches:', error);
    }
    await updateServiceWorker(true);
  };

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-sm border border-[#D1D4DC] dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] shadow-2xl p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Update available
            </h3>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
              A new version of Markdown Notes is ready. Update now to get the latest
              improvements. Your local notes stay untouched.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="px-3 py-1.5 text-xs font-semibold text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-900/30 rounded-sm transition-colors"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => void handleUpdate()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--accent)] dark:bg-[var(--accent-dark)] text-white text-xs font-bold rounded-sm hover:opacity-90 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Update &amp; reload</span>
          </button>
        </div>
      </div>
    </div>
  );
}

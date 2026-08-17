/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { useToastStore } from '../stores/useToastStore';
import { useSettingsStore } from '../stores/useSettingsStore';

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  const { settings } = useSettingsStore();
  const isRtl = settings.language === 'fa';

  if (toasts.length === 0) return null;

  return (
    <div 
      className={`fixed bottom-5 z-50 flex flex-col gap-2 max-w-sm w-full px-4 md:px-0 
        ${isRtl ? 'md:left-5 md:right-auto left-1/2 -translate-x-1/2 md:translate-x-0' : 'md:right-5 md:left-auto left-1/2 -translate-x-1/2 md:translate-x-0'}`}
    >
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isInfo = toast.type === 'info';

        return (
          <div
            key={toast.id}
            id={`toast-${toast.id}`}
            className={`flex items-start gap-3 p-4 rounded-xl border shadow-lg transition-all duration-300 transform scale-100 opacity-100 translate-y-0
              ${isRtl ? 'text-right' : 'text-left'}
              ${isSuccess ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-100' : ''}
              ${isError ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-100' : ''}
              ${isInfo ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-800/60 text-indigo-900 dark:text-indigo-100' : ''}
            `}
          >
            {/* Icon */}
            <div className="mt-0.5 shrink-0">
              {isSuccess && <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
              {isError && <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
              {isInfo && <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
            </div>

            {/* Content & Action */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-relaxed">{toast.message}</p>
              {toast.action && (
                <button
                  type="button"
                  id={`btn-toast-act-${toast.id}`}
                  onClick={() => {
                    toast.action?.onClick();
                    removeToast(toast.id);
                  }}
                  className={`mt-2 text-xs font-semibold underline underline-offset-4 cursor-pointer hover:opacity-80 transition-opacity
                    ${isSuccess ? 'text-emerald-700 dark:text-emerald-300' : ''}
                    ${isError ? 'text-rose-700 dark:text-rose-300' : ''}
                    ${isInfo ? 'text-indigo-700 dark:text-indigo-300' : ''}
                  `}
                >
                  {toast.action.label}
                </button>
              )}
            </div>

            {/* Close btn */}
            <button
              type="button"
              id={`btn-toast-close-${toast.id}`}
              onClick={() => removeToast(toast.id)}
              className="mt-0.5 p-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-current/60 hover:text-current transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

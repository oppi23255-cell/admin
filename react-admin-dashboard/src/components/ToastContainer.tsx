import React from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { NotificationPosition, ToastMessage } from '../types';

const POSITION_CLASSES: Record<NotificationPosition, string> = {
  'top-right': 'right-4 top-4',
  'top-left': 'left-4 top-4',
  'top-center': 'left-1/2 top-4 -translate-x-1/2',
  'bottom-right': 'right-4 bottom-4',
  'bottom-left': 'left-4 bottom-4',
  'bottom-center': 'left-1/2 bottom-4 -translate-x-1/2',
};

const TONE_BOX: Record<ToastMessage['type'], string> = {
  success: 'border-[#00e344]/25 bg-[#122117] text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
  error: 'border-[#e32200]/25 bg-[#241312] text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
  warning: 'border-[#f4c20d]/25 bg-[#251f12] text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
};

const TONE_ICON: Record<ToastMessage['type'], string> = {
  success: 'text-[#00e344]',
  error: 'text-[#e32200]',
  warning: 'text-[#f4c20d]',
};

export function ToastContainer({
  toasts,
  position,
  onDismiss,
}: {
  toasts: ToastMessage[];
  position: NotificationPosition;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className={`pointer-events-none fixed z-[80] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 ${
        POSITION_CLASSES[position] ?? POSITION_CLASSES['bottom-left']
      }`}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={`pointer-events-auto group flex items-start gap-3 rounded-[14px] border px-4 py-3 backdrop-blur-sm transition-all duration-200 ${TONE_BOX[toast.type]}`}
        >
          <div className={`mt-0.5 shrink-0 ${TONE_ICON[toast.type]}`}>
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-[18px] w-[18px]" />
            ) : (
              <AlertCircle className="h-[18px] w-[18px]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold leading-5">{toast.title}</div>
            {toast.message && (
              <div className="mt-0.5 text-[12.5px] leading-[18px] text-white/65 break-words">
                {toast.message}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Close notification"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/55 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

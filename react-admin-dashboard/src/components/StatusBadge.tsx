import React from 'react';
import { Language } from '../types';

export type BadgeTone = 'success' | 'danger' | 'info' | 'warning' | 'accent' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'border-[#00e344]/35 bg-[#00e344]/10 text-[#00e344]',
  danger: 'border-[#e32200]/35 bg-[#e32200]/10 text-[#e32200]',
  info: 'border-[#3b82f6]/35 bg-[#3b82f6]/10 text-[#3b82f6]',
  warning: 'border-[#f4c20d]/35 bg-[#f4c20d]/10 text-[#f4c20d]',
  accent: 'border-[#db9d37]/35 bg-[#db9d37]/10 text-[#db9d37]',
  neutral: 'border-[#333333] bg-[#252525] text-[#aaaaaa]',
};

const LABELS_AR: Record<string, string> = {
  pending: 'مستني التأكيد',
  completed: 'مكتمل',
  disputed: 'فيه نزاع',
  cancelled: 'مرفوض / ملغي',
  expired: 'انتهى وقته',
  available: 'متاح للقبول',
  accepted: 'شغال عليه',
  awaiting_confirmation: 'مستني موافقة اللاعب',
  matched: 'مطابق تلقائياً',
  unmatched: 'رسالة جديدة',
  ignored: 'متجاهل',
  credited: 'اتضاف للرصيد',
  active: 'مفعّل',
  inactive: 'موقوف',
};

const LABELS_EN: Record<string, string> = {
  pending: 'Pending',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  available: 'Available',
  accepted: 'Accepted',
  awaiting_confirmation: 'Awaiting Confirmation',
  matched: 'Matched',
  unmatched: 'New Message',
  ignored: 'Ignored',
  credited: 'Credited',
  active: 'Active',
  inactive: 'Inactive',
};

export function statusToTone(status: string): BadgeTone {
  switch (status) {
    case 'completed':
    case 'matched':
    case 'credited':
    case 'active':
      return 'success';
    case 'pending':
    case 'accepted':
      return 'warning';
    case 'awaiting_confirmation':
      return 'accent';
    case 'disputed':
    case 'cancelled':
    case 'unmatched':
      return 'danger';
    case 'available':
      return 'info';
    default:
      return 'neutral';
  }
}

export function StatusBadge({
  status,
  lang = 'ar',
  label,
}: {
  status: string;
  lang?: Language;
  label?: string;
}) {
  const tone = statusToTone(status);
  const map = lang === 'en' ? LABELS_EN : LABELS_AR;
  const text = label ?? map[status] ?? status;

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-[6px] border px-[10px] py-[3px] text-[12px] font-medium leading-4 ${TONE_CLASSES[tone]}`}
    >
      {text}
    </span>
  );
}

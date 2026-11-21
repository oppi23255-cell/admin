import { AppSettings } from '../types';

export function formatMoney(val: number, decimals = 0): string {
  return (Number(val) || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDateTime(iso: string, settings: AppSettings): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const shifted = new Date(date.getTime() + (settings?.tzOffset ?? 2) * 3600_000);
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = shifted.getUTCFullYear();

  let datePart = `${dd}.${mm}.${yyyy}`;
  if (settings?.dateFormat === 'YYYY-MM-DD') datePart = `${yyyy}-${mm}-${dd}`;
  if (settings?.dateFormat === 'MM/DD/YYYY') datePart = `${mm}/${dd}/${yyyy}`;

  let hours = shifted.getUTCHours();
  const mins = String(shifted.getUTCMinutes()).padStart(2, '0');
  let timePart = `${String(hours).padStart(2, '0')}:${mins}`;
  if (settings?.clockFormat === '12h') {
    const suffix = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    timePart = `${hours}:${mins} ${suffix}`;
  }

  return `${datePart} ${timePart}`;
}

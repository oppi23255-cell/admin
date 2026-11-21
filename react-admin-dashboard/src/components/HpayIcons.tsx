import React from 'react';

export function CountryFlagBadge({ code = 'EG' }: { code?: 'SA' | 'EG' | 'AE' | 'KG' }) {
  if (code === 'EG') {
    return (
      <span
        title="مصر · EG"
        className="relative inline-flex h-[18px] w-[26px] overflow-hidden rounded-[3.5px] border border-white/15 flex-col shrink-0 shadow-sm"
      >
        <span className="h-1/3 w-full bg-[#ce1126]" />
        <span className="h-1/3 w-full bg-white flex items-center justify-center">
          <svg viewBox="0 0 12 10" className="h-[5px] w-[6px]" aria-hidden="true">
            <path
              d="M6 0.8L7.2 2.4L10.5 2.4L9.2 4.8L8.1 4.4L7.7 7.8L6.6 9.2H5.4L4.3 7.8L3.9 4.4L2.8 4.8L1.5 2.4L4.8 2.4L6 0.8Z"
              fill="#c09300"
            />
          </svg>
        </span>
        <span className="h-1/3 w-full bg-[#111111]" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-[18px] w-[26px] items-center justify-center rounded-[3.5px] bg-[#252525] text-[8.5px] font-bold text-white border border-white/10 shrink-0">
      {code}
    </span>
  );
}

export function HostapayLogo({
  countryCode = 'EG',
  platformName = 'Nexus Agency',
}: {
  countryCode?: 'SA' | 'EG' | 'AE' | 'KG';
  platformName?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 select-none min-w-0">
      <span className="text-[18px] font-bold tracking-[-0.025em] text-white leading-none whitespace-nowrap truncate">
        {platformName}
      </span>
      <CountryFlagBadge code={countryCode} />
    </div>
  );
}

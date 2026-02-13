import { useId } from 'react';

type BrandLogoProps = {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
};

const SIZE_MAP: Record<NonNullable<BrandLogoProps['size']>, number> = {
  sm: 38,
  md: 44,
  lg: 56,
};

export function BrandLogo({ size = 'md', showWordmark = false }: BrandLogoProps) {
  const iconSize = SIZE_MAP[size];
  const gradientId = useId().replace(/:/g, '');
  const accentId = useId().replace(/:/g, '');

  return (
    <div className={`brand-logo brand-logo-${size}`}>
      <svg
        className="brand-logo-icon"
        width={iconSize}
        height={iconSize}
        viewBox="0 0 64 64"
        role="img"
        aria-label="Yearbook logo"
      >
        <defs>
          <linearGradient id={gradientId} x1="8" y1="6" x2="56" y2="58">
            <stop offset="0%" stopColor="#0e7cf6" />
            <stop offset="100%" stopColor="#2ad0c8" />
          </linearGradient>
          <linearGradient id={accentId} x1="14" y1="14" x2="52" y2="52">
            <stop offset="0%" stopColor="#ffe18f" />
            <stop offset="100%" stopColor="#ff8f52" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="56" height="56" rx="16" fill={`url(#${gradientId})`} />
        <path
          d="M18 22h12c4.2 0 7.6 3.4 7.6 7.6V46c-2.3-2.1-5.3-3.2-8.4-3.2H18z"
          fill="white"
          opacity="0.94"
        />
        <path
          d="M46 22H34c-4.2 0-7.6 3.4-7.6 7.6V46c2.3-2.1 5.3-3.2 8.4-3.2H46z"
          fill="white"
          opacity="0.8"
        />
        <path
          d="M32 16.5l2.7 4.8 5.5 1-3.9 3.9.8 5.6-5.1-2.4-5.1 2.4.8-5.6-3.9-3.9 5.5-1z"
          fill={`url(#${accentId})`}
        />
      </svg>

      {showWordmark && (
        <span className="brand-logo-wordmark" aria-hidden="true">
          Yearwave
        </span>
      )}
    </div>
  );
}

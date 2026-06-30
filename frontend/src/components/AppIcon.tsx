import Image from 'next/image';

interface AppIconProps {
  size?: number;
  className?: string;
}

export function AppIcon({ size = 40, className = '' }: AppIconProps) {
  return (
    <Image
      src="/icons/icon-192.png"
      alt="Notes"
      width={size}
      height={size}
      className={`rounded-2xl shadow-soft ${className}`}
      priority
    />
  );
}

import { cn } from '@/lib/utils';
import { pickAvatar, pickInitials } from '@/lib/mock';
import { StatusDot } from './StatusDot';
import type { OnlineStatus } from '@/types/common';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
};

export interface AvatarProps {
  /** Stable seed — user id, username, or anything unique-per-user. */
  seed: string;
  /** Optional image URL. Falls back to a deterministic gradient + initials. */
  src?: string;
  size?: AvatarSize;
  status?: OnlineStatus;
  className?: string;
  alt?: string;
}

/**
 * Round avatar with a deterministic gradient-initial fallback and an
 * optional status dot. NEVER rewrite this — import it from
 * `@/components/common/Avatar`.
 */
export function Avatar({ seed, src, size = 'md', status, className, alt }: AvatarProps) {
  const gradient = pickAvatar(seed);
  const initials = pickInitials(seed);
  return (
    <div className={cn('relative inline-block shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt={alt ?? initials}
          className={cn('ring-border rounded-full object-cover ring-1', sizeClasses[size])}
        />
      ) : (
        <div
          aria-label={alt ?? initials}
          className={cn(
            'flex items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ring-1 ring-white/10',
            gradient,
            sizeClasses[size]
          )}
        >
          {initials}
        </div>
      )}
      {status ? (
        <StatusDot status={status} className="ring-background absolute right-0 bottom-0 ring-2" />
      ) : null}
    </div>
  );
}

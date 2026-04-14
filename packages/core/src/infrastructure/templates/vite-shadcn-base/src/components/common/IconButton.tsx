import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'solid';
}

const sizeClass = {
  sm: 'h-8 w-8 [&>svg]:h-4 [&>svg]:w-4',
  md: 'h-10 w-10 [&>svg]:h-5 [&>svg]:w-5',
  lg: 'h-12 w-12 [&>svg]:h-6 [&>svg]:w-6',
} as const;

const variantClass = {
  ghost: 'bg-transparent text-muted-foreground hover:bg-card hover:text-foreground active:scale-95',
  solid: 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-sm',
} as const;

/** Round icon-only button with hover + active states. Always use this for tappable icons. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', variant = 'ghost', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'focus-visible:ring-primary inline-flex items-center justify-center rounded-full transition-all duration-150 focus:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
          sizeClass[size],
          variantClass[variant],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
IconButton.displayName = 'IconButton';

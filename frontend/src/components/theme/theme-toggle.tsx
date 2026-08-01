'use client';

import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useTheme } from './use-theme';

interface ThemeToggleProps {
  className?: string;
}

/**
 * Standalone toggle. The marketplace header no longer renders one — theme is a
 * preference, not a peer of the primary CTA, so there it lives inside the user
 * menu. Kept for surfaces that have no user menu (auth, signed-out header).
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { isDark, mounted, toggle } = useTheme();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggle}
      aria-label={isDark ? 'Yorug‘ rejim' : 'Qorong‘i rejim'}
      title={isDark ? 'Yorug‘ rejim' : 'Qorong‘i rejim'}
      className={cn('h-10 w-10 rounded-lg p-0', className)}
      suppressHydrationWarning
    >
      {mounted && isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

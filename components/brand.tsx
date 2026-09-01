import { BookOpen } from 'lucide-react';

import { HardLink } from '@/components/hard-link';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <HardLink className="flex items-center gap-2.5" href="/" aria-label="Estante Aberta, início">
      <span className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground shadow-[0_8px_24px_rgb(24_69_56/18%)]">
        <BookOpen className="size-5" strokeWidth={2.2} />
      </span>
      {!compact && (
        <span className="font-heading text-lg font-bold tracking-[-0.03em]">Estante Aberta</span>
      )}
    </HardLink>
  );
}

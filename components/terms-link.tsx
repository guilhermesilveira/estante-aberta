import { HardLink } from '@/components/hard-link';
import { cn } from '@/lib/utils';

export function TermsLink({ className }: { className?: string }) {
  return (
    <HardLink
      className={cn('font-semibold underline underline-offset-4', className)}
      href="/termos"
    >
      Termos de uso e segurança
    </HardLink>
  );
}

import type { AnchorHTMLAttributes } from 'react';

export function HardLink({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props}>{children}</a>;
}

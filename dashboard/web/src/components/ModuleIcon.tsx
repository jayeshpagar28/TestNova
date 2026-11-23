import { Box, icons, type LucideIcon } from 'lucide-react';

/**
 * Icon names come from the catalogue: the knowledge base suggests a lucide icon per module
 * (PascalCase, e.g. "LayoutDashboard"); kebab-case ("layout-dashboard") is accepted too.
 * An unknown name falls back to a box rather than failing the page.
 */
const pascal = (name: string) => name.replace(/(^|[-_\s]+)(\w)/g, (_, __, c: string) => c.toUpperCase());

export function ModuleIcon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const Icon: LucideIcon = (icons as Record<string, LucideIcon>)[name] ?? (icons as Record<string, LucideIcon>)[pascal(name)] ?? Box;
  return <Icon size={size} strokeWidth={1.6} className={className} aria-hidden />;
}

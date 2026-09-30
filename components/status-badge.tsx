import type { ReactNode } from 'react';

type Status = 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'UPCOMING' | 'ONGOING' | 'COMPLETED';

const styles: Record<Status, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ACTIVE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  ARCHIVED: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  UPCOMING: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  ONGOING: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  COMPLETED: 'bg-muted text-muted-foreground',
};

export function StatusBadge({ status }: { status: Status }): ReactNode {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
      <span aria-hidden className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
      <span>{status}</span>
    </span>
  );
}

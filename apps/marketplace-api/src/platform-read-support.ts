import { z } from 'zod';

/** Bounded page sizes and stable sorting per plan §7. */
export const pageInput = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export interface Page<T> { items: T[]; nextCursor: string | null }

export function paginate<T>(rows: T[], limit: number, idOf: (row: T) => string): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore && items.length ? idOf(items[items.length - 1]) : null };
}

/** Cursor clause shared by every list query, so paging behaves identically everywhere. The
 * explicit return type keeps this a single optional-property shape rather than a union, which
 * Prisma's generated argument types reject when spread. */
export function cursorClause(cursor: string | undefined): { cursor?: { id: string }; skip?: number } {
  return cursor ? { cursor: { id: cursor }, skip: 1 } : {};
}

/**
 * A support operator legitimately needs to recognize which customer a record belongs to, but the
 * full address is personal data that has no place in a screen most operators only ever scan.
 * Masking (rather than omitting) keeps the record identifiable without exposing it — the same
 * treatment the school-side link status view already applies.
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

/** Money is stored in minor units and must stay that way across the wire — formatting is the
 * UI's job, and rounding here would quietly corrupt financial figures. */
export function money(amountMinor: number, currency: string) {
  return { amountMinor, currency };
}

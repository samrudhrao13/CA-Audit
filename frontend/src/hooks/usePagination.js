import { useEffect, useState } from "react";

export const PAGE_SIZE = 100;

/**
 * Client-side pagination over an already-fetched array. Resets to page 1
 * whenever the item count changes (e.g. a filter/search narrows the list)
 * so you're never stranded on a now-empty later page.
 */
export function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [items.length]);

  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return { pageItems, page: safePage, setPage, totalPages, pageSize };
}

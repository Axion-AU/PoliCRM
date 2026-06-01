interface PaginationProps {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: PaginationProps) {
  // Safety checks to prevent NaN
  const safeTotalPages = Math.max(1, Number(totalPages) || 1);
  const safeCurrentPage = Math.max(
    1,
    Math.min(Number(currentPage) || 1, safeTotalPages),
  );

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showPages = 5;

    if (safeTotalPages <= showPages) {
      for (let i = 1; i <= safeTotalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (safeCurrentPage > 3) {
        pages.push("...");
      }

      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(safeTotalPages - 1, safeCurrentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (safeCurrentPage < safeTotalPages - 2) {
        pages.push("...");
      }

      pages.push(safeTotalPages);
    }

    return pages;
  };

  return (
    <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4">
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-600">Rows per page:</label>
        <select
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => onPageChange(safeCurrentPage - 1)}
          disabled={safeCurrentPage === 1}
          className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
        >
          ← Previous
        </button>

        <div className="flex gap-1">
          {getPageNumbers().map((page, idx) =>
            typeof page === "number" ? (
              <button
                key={idx}
                onClick={() => onPageChange(page)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  safeCurrentPage === page
                    ? "bg-primary text-white"
                    : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-300"
                }`}
              >
                {page}
              </button>
            ) : (
              <span key={idx} className="px-2 text-slate-400">
                {page}
              </span>
            ),
          )}
        </div>

        <button
          onClick={() => onPageChange(safeCurrentPage + 1)}
          disabled={safeCurrentPage === safeTotalPages}
          className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

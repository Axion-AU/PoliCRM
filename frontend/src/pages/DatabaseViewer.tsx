import { useState, useEffect } from "react";
import { Database, Table2, RefreshCw, Play, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { $idToken } from "../stores/authStore";

interface TableInfo {
  name: string;
  row_count: number;
  columns: string[];
}

interface DatabaseStats {
  tables: TableInfo[];
  total_tables: number;
  database_type: string;
}

const API_BASE = "/api/db";

async function apiCall<T>(endpoint: string): Promise<T> {
  const token = $idToken.get();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function DatabaseViewer() {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await apiCall<DatabaseStats>("/stats");
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch database stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTableData = async (tableName: string, pageNum: number = 0) => {
    setLoading(true);
    try {
      const data = await apiCall(`/table/${tableName}?page=${pageNum}&limit=50`);
      setTableData(data);
      setSelectedTable(tableName);
      setPage(pageNum);
      setQueryResult(null);
    } catch (error) {
      console.error("Failed to fetch table data:", error);
    } finally {
      setLoading(false);
    }
  };

  const runQuery = async () => {
    if (!query.trim()) return;
    setQueryError(null);
    setLoading(true);
    try {
      const token = $idToken.get();
      const res = await fetch(`${API_BASE}/query?sql=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      if (data.error) {
        setQueryError(data.error);
        setQueryResult(null);
      } else {
        setQueryResult(data);
        setTableData(null);
      }
    } catch (error: any) {
      setQueryError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value: any): string => {
    if (value === null) return "NULL";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "object") return JSON.stringify(value);
    const str = String(value);
    return str.length > 100 ? str.substring(0, 100) + "..." : str;
  };

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 stat-icon-purple rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Database Viewer</h1>
            {stats && (
              <p className="text-muted-foreground text-sm">
                {stats.database_type.toUpperCase()} · {stats.total_tables} tables
              </p>
            )}
          </div>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Table List */}
        <div className="col-span-3 card overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-foreground flex items-center gap-2 text-sm">
              <Table2 className="w-4 h-4" />
              Tables
            </h2>
          </div>
          <div className="overflow-auto max-h-[600px]">
            {stats?.tables.map((table) => (
              <button
                key={table.name}
                onClick={() => fetchTableData(table.name)}
                className={`w-full text-left p-3 hover:bg-secondary transition-colors border-b border-border ${
                  selectedTable === table.name
                    ? "bg-primary/10 border-l-2 border-l-primary"
                    : ""
                }`}
              >
                <div className="font-medium text-sm text-foreground">{table.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {table.row_count.toLocaleString()} rows · {table.columns.length} cols
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="col-span-9 space-y-6">
          {/* SQL Query */}
          <div className="card p-5">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2 text-sm">
              <Search className="w-4 h-4" />
              SQL Query
            </h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runQuery()}
                placeholder="SELECT * FROM members WHERE primary_state = 'VIC' LIMIT 10"
                className="flex-1 bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors"
              />
              <button
                onClick={runQuery}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Play className="w-4 h-4" />
                Run
              </button>
            </div>
            {queryError && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {queryError}
              </div>
            )}
          </div>

          {/* Query Results */}
          {queryResult && (
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-border flex justify-between items-center">
                <h3 className="font-semibold text-foreground">Query Results</h3>
                <span className="text-sm text-muted-foreground">
                  {queryResult.rows?.length || 0} rows
                  {queryResult.truncated && " (truncated to 1000)"}
                </span>
              </div>
              <div className="overflow-auto max-h-[400px]">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 sticky top-0">
                    <tr>
                      {queryResult.columns.map((col: string) => (
                        <th key={col} className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((row: any, i: number) => (
                      <tr key={i} className="border-t border-border hover:bg-secondary/30">
                        {queryResult.columns.map((col: string) => (
                          <td key={col} className="p-3 font-mono text-xs text-foreground whitespace-nowrap">
                            {formatValue(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Table Data */}
          {tableData && !queryResult && (
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-border flex justify-between items-center">
                <h3 className="font-semibold text-foreground">{tableData.table}</h3>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    Page {page + 1} of {tableData.pages} ({tableData.total.toLocaleString()} rows)
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => fetchTableData(selectedTable!, page - 1)}
                      disabled={page === 0}
                      className="p-2 border border-border rounded-lg text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => fetchTableData(selectedTable!, page + 1)}
                      disabled={page >= tableData.pages - 1}
                      className="p-2 border border-border rounded-lg text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="overflow-auto max-h-[500px]">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 sticky top-0">
                    <tr>
                      {tableData.columns.map((col: string) => (
                        <th key={col} className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.rows.map((row: any, i: number) => (
                      <tr key={i} className="border-t border-border hover:bg-secondary/30">
                        {tableData.columns.map((col: string) => (
                          <td key={col} className="p-3 font-mono text-xs text-foreground whitespace-nowrap">
                            {formatValue(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!tableData && !queryResult && (
            <div className="card p-16 text-center">
              <div className="w-16 h-16 mx-auto bg-secondary rounded-full flex items-center justify-center text-muted-foreground mb-4">
                <Database className="w-8 h-8" />
              </div>
              <p className="text-muted-foreground">Select a table to browse or run a SQL query</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DatabaseViewer;

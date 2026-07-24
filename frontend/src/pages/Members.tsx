import { useState, useEffect, useCallback, useRef } from "react";
import { Search, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { MembershipBadge, type MembershipStatus } from "../components/MembershipBadge";
import { personsApi, type Person } from "../services/api";
import { MemberDetailDrawer } from "../components/MemberDetailDrawer";

/* ─── Australian states ─────────────────────────────────────────────────── */
const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

/* ─── Mock members (offline fallback) ───────────────────────────────────── */
type PersonRow = Person & { membership_status: MembershipStatus };

const MOCK_MEMBERS: PersonRow[] = [
  { id: "1",  given_name: "Amelia",    surname: "Thornton",     email: "***",  primary_state: "VIC", primary_zip: "3000", created_at: "2025-11-01T09:00:00Z", updated_at: "2025-11-20T14:00:00Z", membership_status: "active"    },
  { id: "2",  given_name: "Marcus",    surname: "Oduya",        email: "***",  primary_state: "NSW", primary_zip: "2000", created_at: "2025-10-15T11:00:00Z", updated_at: "2025-11-18T09:00:00Z", membership_status: "active"    },
  { id: "3",  given_name: "Priya",     surname: "Sharma",       email: "***",  primary_state: "QLD", primary_zip: "4000", created_at: "2025-09-22T08:00:00Z", updated_at: "2025-11-05T10:00:00Z", membership_status: "lapsed"    },
  { id: "4",  given_name: "Daniel",    surname: "Kowalski",     email: "***",  primary_state: "WA",  primary_zip: "6000", created_at: "2025-08-10T13:00:00Z", updated_at: "2025-10-30T16:00:00Z", membership_status: "active"    },
  { id: "5",  given_name: "Sophie",    surname: "Nakamura",     email: "***",  primary_state: "SA",  primary_zip: "5000", created_at: "2025-07-03T10:00:00Z", updated_at: "2025-11-12T11:00:00Z", membership_status: "resigned"  },
  { id: "6",  given_name: "James",     surname: "Okonkwo",      email: "***",  primary_state: "VIC", primary_zip: "3121", created_at: "2025-06-18T08:00:00Z", updated_at: "2025-10-28T15:00:00Z", membership_status: "active"    },
  { id: "7",  given_name: "Fatima",    surname: "Al-Rashid",    email: "***",  primary_state: "NSW", primary_zip: "2010", created_at: "2025-05-22T09:00:00Z", updated_at: "2025-11-01T10:00:00Z", membership_status: "active"    },
  { id: "8",  given_name: "Liam",      surname: "Brennan",      email: "***",  primary_state: "QLD", primary_zip: "4101", created_at: "2025-04-14T11:00:00Z", updated_at: "2025-09-30T14:00:00Z", membership_status: "lapsed"    },
  { id: "9",  given_name: "Grace",     surname: "Watkins",      email: "***",  primary_state: "ACT", primary_zip: "2601", created_at: "2025-03-09T13:00:00Z", updated_at: "2025-11-15T11:00:00Z", membership_status: "active"    },
  { id: "10", given_name: "Noah",      surname: "Papadopoulos", email: "***",  primary_state: "VIC", primary_zip: "3002", created_at: "2025-02-27T10:00:00Z", updated_at: "2025-10-20T09:00:00Z", membership_status: "suspended" },
  { id: "11", given_name: "Isabella",  surname: "Tran",         email: "***",  primary_state: "NSW", primary_zip: "2060", created_at: "2025-01-15T08:00:00Z", updated_at: "2025-11-10T16:00:00Z", membership_status: "active"    },
  { id: "12", given_name: "Oliver",    surname: "McCarthy",     email: "***",  primary_state: "TAS", primary_zip: "7000", created_at: "2024-12-03T14:00:00Z", updated_at: "2025-09-20T10:00:00Z", membership_status: "active"    },
  { id: "13", given_name: "Charlotte", surname: "Singh",        email: "***",  primary_state: "WA",  primary_zip: "6005", created_at: "2024-11-18T09:00:00Z", updated_at: "2025-10-01T14:00:00Z", membership_status: "lapsed"    },
  { id: "14", given_name: "William",   surname: "Nguyen",       email: "***",  primary_state: "SA",  primary_zip: "5006", created_at: "2024-10-29T10:00:00Z", updated_at: "2025-11-08T11:00:00Z", membership_status: "active"    },
  { id: "15", given_name: "Mia",       surname: "Johnson",      email: "***",  primary_state: "VIC", primary_zip: "3056", created_at: "2024-10-10T12:00:00Z", updated_at: "2025-11-22T10:00:00Z", membership_status: "active"    },
];

const PAGE_SIZE = 15;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function Members() {
  const [members, setMembers] = useState<PersonRow[]>(MOCK_MEMBERS);
  const [total, setTotal] = useState(MOCK_MEMBERS.length);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<MembershipStatus | "">("");

  // Pagination
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(
    async (pageIndex: number) => {
      setLoading(true);
      try {
        const c = cursors[pageIndex - 1];
        const result = await personsApi.list({
          cursor: c,
          state: stateFilter || undefined,
          search: search || undefined,
          limit: PAGE_SIZE,
        });
        setMembers(
          (result.data ?? []).map((m) => ({
            ...m,
            membership_status: (m.membership_status ?? "active") as MembershipStatus,
          })),
        );
        setTotal(result.total ?? 0);
        if (result.next_cursor && cursors[pageIndex] === undefined) {
          setCursors((prev) => {
            const next = [...prev];
            next[pageIndex] = result.next_cursor;
            return next;
          });
        }
        setOffline(false);
      } catch (err: unknown) {
        console.error("personsApi.list failed:", (err instanceof Error ? err.message : err), { search, stateFilter, statusFilter, pageIndex, PAGE_SIZE });
        setOffline(true);
        // Fall back to mock data with client-side filtering
        let filtered = MOCK_MEMBERS;
        if (search) {
          const q = search.toLowerCase();
          filtered = filtered.filter(
            (m) =>
              m.given_name.toLowerCase().includes(q) ||
              m.surname.toLowerCase().includes(q),
          );
        }
        if (stateFilter) {
          filtered = filtered.filter((m) => m.primary_state === stateFilter);
        }
        if (statusFilter) {
          filtered = filtered.filter((m) => m.membership_status === statusFilter);
        }
        const start = (pageIndex - 1) * PAGE_SIZE;
        setTotal(filtered.length);
        setMembers(filtered.slice(start, start + PAGE_SIZE));
      } finally {
        setLoading(false);
      }
    },
    [cursors, stateFilter, search, statusFilter],
  );

  // Reset pagination on filter change
  useEffect(() => {
    setPage(1);
    setCursors([undefined]);
  }, [search, stateFilter, statusFilter]);

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => load(page), search ? 350 : 0);
    return () => clearTimeout(searchTimeout.current);
  }, [page, load, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ padding: "32px 40px" }}>
      <PageHeader
        title="Members"
        subtitle={offline ? "Showing sample data — backend offline" : `${total.toLocaleString("en-AU")} total members`}
      />

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 320 }}>
          <Search
            size={14}
            strokeWidth={2}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--slate-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            id="members-search"
            type="search"
            className="input-base"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>

        {/* State filter */}
        <select
          id="members-state-filter"
          className="select-base"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
        >
          <option value="">All States</option>
          {STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          id="members-status-filter"
          className="select-base"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as MembershipStatus | "")}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="lapsed">Lapsed</option>
          <option value="resigned">Resigned</option>
          <option value="suspended">Suspended</option>
        </select>

        {(search || stateFilter || statusFilter) && (
          <button
            className="btn-ghost"
            onClick={() => {
              setSearch("");
              setStateFilter("");
              setStatusFilter("");
            }}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <SlidersHorizontal size={13} strokeWidth={2} />
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div
        style={{
          background: "var(--canvas-raised)",
          border: "1px solid var(--console-border)",
          borderRadius: 12,
          overflow: "hidden",
          opacity: loading ? 0.6 : 1,
          transition: "opacity 150ms ease-out",
        }}
      >
        <table
          className="data-table"
          style={{ width: "100%", borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Name</th>
              <th style={{ textAlign: "left" }}>State</th>
              <th style={{ textAlign: "left" }}>Postcode</th>
              <th style={{ textAlign: "left" }}>Joined</th>
              <th style={{ textAlign: "left" }}>Last Updated</th>
              <th style={{ textAlign: "left" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: "center",
                    padding: "40px 16px",
                    color: "var(--slate-muted)",
                    fontSize: 13.5,
                  }}
                >
                  {loading ? "Loading…" : "No members match your filters."}
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr
                  key={m.id}
                  className="animate-fade-in"
                  onClick={() => setSelectedMemberId(m.id)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <span
                      style={{
                        fontWeight: 500,
                        color: "oklch(22% 0.03 260)",
                      }}
                    >
                      {m.given_name} {m.surname}
                    </span>
                  </td>
                  <td style={{ color: "var(--slate-muted)" }}>
                    {m.primary_state ?? "—"}
                  </td>
                  <td style={{ color: "var(--slate-muted)" }}>
                    {m.primary_zip ?? "—"}
                  </td>
                  <td style={{ color: "var(--slate-muted)" }}>
                    {fmtDate(m.created_at)}
                  </td>
                  <td style={{ color: "var(--slate-muted)" }}>
                    {fmtDate(m.updated_at)}
                  </td>
                  <td>
                    <MembershipBadge status={m.membership_status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Drawer */}
      <MemberDetailDrawer
        memberId={selectedMemberId}
        onClose={() => setSelectedMemberId(null)}
        fallbackMember={members.find((m) => m.id === selectedMemberId)}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 16,
            fontSize: 13,
            color: "var(--slate-muted)",
          }}
        >
          <span>
            Page {page} of {totalPages}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-ghost"
              disabled={page === 1}
              onClick={() => {
                setPage((p) => p - 1);
              }}
              style={{
                padding: "6px 10px",
                opacity: page === 1 ? 0.4 : 1,
                cursor: page === 1 ? "not-allowed" : "pointer",
              }}
            >
              <ChevronLeft size={14} strokeWidth={2} />
            </button>
            <button
              className="btn-ghost"
              disabled={page === totalPages}
              onClick={() => {
                setPage((p) => p + 1);
              }}
              style={{
                padding: "6px 10px",
                opacity: page === totalPages ? 0.4 : 1,
                cursor: page === totalPages ? "not-allowed" : "pointer",
              }}
            >
              <ChevronRight size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

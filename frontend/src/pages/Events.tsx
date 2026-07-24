import { useState, useEffect } from "react";
import { Calendar, MapPin, DollarSign, Plus, Users, CheckCircle, XCircle, ChevronDown, ChevronUp, LogIn } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Modal, ModalFooter } from "../components/ui/modal";
import { eventsApi, type Event, type EventRsvp } from "../services/api";

const MOCK_EVENTS: Event[] = [
  { id: "e1", title: "Community BBQ & Meet & Greet", event_type: "in_person", location: "Kingston Park, VIC", capacity: 80, ticket_price_cents: 0, start_at: "2026-08-15T10:00:00Z", end_at: "2026-08-15T14:00:00Z", status: "published" },
  { id: "e2", title: "Policy Strategy Workshop", description: "Internal workshop for campaign staff", event_type: "in_person", location: "Campbell Town Hall, NSW", capacity: 30, ticket_price_cents: 1500, start_at: "2026-09-02T09:00:00Z", end_at: "2026-09-02T17:00:00Z", status: "draft" },
  { id: "e3", title: "National Fundraising Webinar", event_type: "online", capacity: 500, ticket_price_cents: 2500, start_at: "2026-09-20T18:00:00Z", end_at: "2026-09-20T20:00:00Z", status: "published" },
  { id: "e4", title: "Hybrid Town Hall: Climate Policy", event_type: "hybrid", location: "Brisbane Convention Centre, QLD", capacity: 200, ticket_price_cents: 0, start_at: "2026-07-10T18:30:00Z", end_at: "2026-07-10T21:00:00Z", status: "completed" },
  { id: "e5", title: "Candidate Q&A Session", event_type: "online", capacity: 100, ticket_price_cents: 0, start_at: "2026-08-28T19:00:00Z", status: "cancelled" },
];

const MOCK_ATTENDEES: Record<string, Array<EventRsvp & { person_name?: string }>> = {
  e1: [
    { id: "r1", event_id: "e1", person_id: "p1", status: "confirmed", person_name: "Amelia Thornton" },
    { id: "r2", event_id: "e1", person_id: "p2", status: "confirmed", person_name: "Marcus Oduya" },
    { id: "r3", event_id: "e1", person_id: "p3", status: "checked_in", checked_in_at: "2026-08-15T10:05:00Z", person_name: "Priya Sharma" },
    { id: "r4", event_id: "e1", person_id: "p4", status: "canceled", person_name: "Daniel Kowalski" },
  ],
  e3: [
    { id: "r5", event_id: "e3", person_id: "p5", status: "confirmed", person_name: "Sophie Nakamura" },
    { id: "r6", event_id: "e3", person_id: "p6", status: "confirmed", person_name: "James Okonkwo" },
  ],
  e4: [
    { id: "r7", event_id: "e4", person_id: "p7", status: "checked_in", checked_in_at: "2026-07-10T18:25:00Z", person_name: "Fatima Al-Rashid" },
    { id: "r8", event_id: "e4", person_id: "p8", status: "checked_in", checked_in_at: "2026-07-10T18:30:00Z", person_name: "Liam Brennan" },
  ],
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtCurrency(cents?: number): string {
  if (cents === undefined || cents === null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function statusBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case "draft":     return { label: "Draft",     color: "#64748B", bg: "rgba(100,116,139,0.12)" };
    case "published": return { label: "Published", color: "#0D9488", bg: "rgba(13,148,136,0.12)" };
    case "cancelled": return { label: "Cancelled", color: "#E11D48", bg: "rgba(225,29,72,0.12)" };
    case "completed": return { label: "Completed", color: "#2563EB", bg: "rgba(37,99,235,0.12)" };
    default:          return { label: status,      color: "#64748B", bg: "rgba(100,116,139,0.12)" };
  }
}

function eventTypeLabel(t: string): string {
  return t === "in_person" ? "In Person" : t === "online" ? "Online" : "Hybrid";
}

export default function Events() {
  const [events, setEvents] = useState<Event[]>(MOCK_EVENTS);
  const [attendees, setAttendees] = useState<Record<string, Array<EventRsvp & { person_name?: string }>>>(MOCK_ATTENDEES);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await eventsApi.list();
      setEvents(data);
      setOffline(false);
    } catch {
      setOffline(true);
      setEvents(MOCK_EVENTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEvents(); }, []);

  const loadAttendees = async (eventId: string) => {
    if (attendees[eventId] && !offline) return;
    try {
      const data = await eventsApi.attendees(eventId);
      setAttendees((prev) => ({ ...prev, [eventId]: data }));
    } catch {
      setAttendees((prev) => ({ ...prev, [eventId]: MOCK_ATTENDEES[eventId] ?? [] }));
    }
  };

  const toggleExpanded = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadAttendees(id);
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await eventsApi.publish(id);
      setEvents((prev) => prev.map((e) => e.id === id ? { ...e, status: "published" } : e));
    } catch (err) { console.error("publish failed", err); }
  };

  const handleCancel = async (id: string) => {
    try {
      await eventsApi.cancel(id);
      setEvents((prev) => prev.map((e) => e.id === id ? { ...e, status: "cancelled" } : e));
    } catch (err) { console.error("cancel failed", err); }
  };

  const handleCheckIn = async (eventId: string, personId: string) => {
    try {
      await eventsApi.checkIn(eventId, personId);
      setAttendees((prev) => ({
        ...prev,
        [eventId]: (prev[eventId] ?? []).map((a) =>
          a.person_id === personId ? { ...a, status: "checked_in", checked_in_at: new Date().toISOString() } : a
        ),
      }));
    } catch (err) { console.error("check-in failed", err); }
  };

  return (
    <div className="page-content" style={{ padding: "32px 40px", maxWidth: 1200 }}>
      <PageHeader
        title="Events"
        subtitle={offline ? "Showing sample data — backend offline" : `${events.length} events`}
        action={
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} strokeWidth={2.5} />
            Create Event
          </button>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {events.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "60px 16px", color: "var(--slate-muted)", fontSize: 13.5 }}>
            No events yet. Create one to get started.
          </div>
        )}

        {events.map((event) => {
          const badge = statusBadge(event.status);
          const isExpanded = expandedId === event.id;
          const eventAttendees = attendees[event.id];

          return (
            <div
              key={event.id}
              className="transition-base"
              style={{
                background: "var(--canvas-raised)",
                border: "1px solid var(--console-border)",
                borderRadius: 12,
                overflow: "hidden",
                opacity: loading ? 0.6 : 1,
                transition: "opacity 150ms ease-out",
              }}
            >
              <div
                onClick={() => toggleExpanded(event.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "16px 20px",
                  cursor: "pointer",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 15, color: "var(--navy)" }}>
                      {event.title}
                    </span>
                    <span style={badgeStyle(badge.color, badge.bg)}>{badge.label}</span>
                    <span style={{
                      fontSize: 10.5,
                      fontWeight: 500,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "var(--slate-muted)",
                      background: "var(--mist)",
                      padding: "1px 6px",
                      borderRadius: 4,
                    }}>
                      {eventTypeLabel(event.event_type)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--slate-muted)" }}>
                      <Calendar size={12} strokeWidth={2} />
                      {fmtDate(event.start_at)} {fmtTime(event.start_at)}
                    </span>
                    {event.location && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--slate-muted)" }}>
                        <MapPin size={12} strokeWidth={2} />
                        {event.location}
                      </span>
                    )}
                    {event.ticket_price_cents !== undefined && event.ticket_price_cents !== null && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--slate-muted)" }}>
                        <DollarSign size={12} strokeWidth={2} />
                        {fmtCurrency(event.ticket_price_cents)}
                      </span>
                    )}
                    {event.capacity !== undefined && event.capacity !== null && (
                      <span style={{ fontSize: 12.5, color: "var(--slate-muted)" }}>
                        <Users size={12} strokeWidth={2} style={{ marginRight: 4, verticalAlign: -1 }} />
                        Cap: {event.capacity}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  {event.status === "draft" && (
                    <button
                      className="btn-primary"
                      onClick={() => handlePublish(event.id)}
                      style={{ padding: "6px 12px", fontSize: 12 }}
                    >
                      <CheckCircle size={12} strokeWidth={2.5} />
                      Publish
                    </button>
                  )}
                  {event.status === "published" && (
                    <button
                      className="btn-ghost"
                      onClick={() => handleCancel(event.id)}
                      style={{
                        padding: "6px 12px",
                        fontSize: 12,
                        color: "var(--status-flagged)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        background: "none",
                        border: "1px solid var(--status-flagged)",
                        borderRadius: "var(--radius)",
                        cursor: "pointer",
                      }}
                    >
                      <XCircle size={12} strokeWidth={2.5} />
                      Cancel
                    </button>
                  )}
                  {isExpanded ? (
                    <ChevronUp size={18} strokeWidth={2} style={{ color: "var(--slate-muted)" }} />
                  ) : (
                    <ChevronDown size={18} strokeWidth={2} style={{ color: "var(--slate-muted)" }} />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--console-border)", padding: 16 }}>
                  {event.description && (
                    <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--slate-mid)", lineHeight: 1.5 }}>
                      {event.description}
                    </p>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <Users size={14} strokeWidth={2} style={{ color: "var(--slate-muted)" }} />
                    <span className="stat-label" style={{ fontSize: 10.5 }}>
                      Attendees ({eventAttendees?.length ?? 0})
                    </span>
                  </div>

                  <div style={{
                    border: "1px solid var(--console-border)",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}>
                    <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left" }}>Person</th>
                          <th style={{ textAlign: "left" }}>Status</th>
                          <th style={{ textAlign: "left" }}>Checked In</th>
                          <th style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!eventAttendees || eventAttendees.length === 0) ? (
                          <tr>
                            <td colSpan={4} style={{ textAlign: "center", padding: "24px 16px", color: "var(--slate-muted)", fontSize: 13 }}>
                              No attendees yet.
                            </td>
                          </tr>
                        ) : (
                          eventAttendees.map((a) => (
                            <tr key={a.id}>
                              <td>
                                <span style={{ fontWeight: 500, color: "var(--navy)", fontSize: 13 }}>
                                  {a.person_name ?? a.person_id}
                                </span>
                              </td>
                              <td>
                                <span style={{
                                  ...attendeeStatusStyle(a.status === "checked_in" ? "checked_in" : a.status),
                                }}>
                                  {a.status === "checked_in" ? "Checked In" : a.status === "confirmed" ? "Confirmed" : a.status === "canceled" ? "Cancelled" : a.status}
                                </span>
                              </td>
                              <td style={{ color: "var(--slate-muted)", fontSize: 12.5 }}>
                                {a.checked_in_at ? fmtDate(a.checked_in_at) + " " + fmtTime(a.checked_in_at) : "—"}
                              </td>
                              <td style={{ textAlign: "right" }}>
                                {a.status !== "checked_in" && (
                                  <button
                                    className="btn-primary"
                                    onClick={() => handleCheckIn(event.id, a.person_id)}
                                    style={{ padding: "4px 10px", fontSize: 11.5 }}
                                  >
                                    <LogIn size={11} strokeWidth={2.5} />
                                    Check In
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      className="input-base"
                      placeholder="Person ID to RSVP…"
                      id={`rsvp-input-${event.id}`}
                      style={{ width: 280, fontSize: 12.5, padding: "6px 10px" }}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") {
                          const input = e.currentTarget;
                          const pid = input.value.trim();
                          if (!pid) return;
                          try {
                            const rsvp = await eventsApi.rsvp(event.id, pid);
                            setAttendees((prev) => ({
                              ...prev,
                              [event.id]: [...(prev[event.id] ?? []), { ...rsvp, person_name: pid }],
                            }));
                            input.value = "";
                          } catch (err) { console.error("rsvp failed", err); }
                        }
                      }}
                    />
                    <span style={{ fontSize: 11.5, color: "var(--slate-muted)", alignSelf: "center" }}>
                      Enter person ID + Enter to RSVP
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Event" size="lg">
        <CreateEventForm
          onSubmit={async (data) => {
            try {
              const created = await eventsApi.create(data);
              setEvents((prev) => [...prev, created]);
              setShowCreateModal(false);
            } catch (err) { console.error("create event failed", err); }
          }}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>
    </div>
  );
}

function badgeStyle(color: string, bg: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 7px",
    borderRadius: 4,
    fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    color,
    background: bg,
  };
}

function attendeeStatusStyle(status: string): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 6px",
    borderRadius: 4,
    fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };
  if (status === "checked_in") return { ...base, color: "#0D9488", background: "rgba(13,148,136,0.12)" };
  if (status === "confirmed")  return { ...base, color: "#2563EB", background: "rgba(37,99,235,0.12)" };
  if (status === "canceled")   return { ...base, color: "#E11D48", background: "rgba(225,29,72,0.12)" };
  return { ...base, color: "#64748B", background: "rgba(100,116,139,0.12)" };
}

interface CreateEventFormProps {
  onSubmit: (data: Partial<Event>) => Promise<void>;
  onCancel: () => void;
}

function CreateEventForm({ onSubmit, onCancel }: CreateEventFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("in_person");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [ticketPrice, setTicketPrice] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startAt) return;
    setSubmitting(true);
    const data: Partial<Event> = {
      title: title.trim(),
      description: description.trim() || undefined,
      event_type: eventType,
      location: location.trim() || undefined,
      capacity: capacity ? Number(capacity) : undefined,
      ticket_price_cents: ticketPrice ? Math.round(Number(ticketPrice) * 100) : undefined,
      start_at: new Date(startAt).toISOString(),
      end_at: endAt ? new Date(endAt).toISOString() : undefined,
    };
    try {
      await onSubmit(data);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label className="stat-label" style={{ display: "block", marginBottom: 4 }}>Title *</label>
          <input className="input-base" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" required />
        </div>

        <div>
          <label className="stat-label" style={{ display: "block", marginBottom: 4 }}>Description</label>
          <textarea className="input-base" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={3} style={{ resize: "vertical" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="stat-label" style={{ display: "block", marginBottom: 4 }}>Event Type</label>
            <select className="select-base" value={eventType} onChange={(e) => setEventType(e.target.value)} style={{ width: "100%" }}>
              <option value="in_person">In Person</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div>
            <label className="stat-label" style={{ display: "block", marginBottom: 4 }}>Location</label>
            <input className="input-base" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Venue or URL" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="stat-label" style={{ display: "block", marginBottom: 4 }}>Capacity</label>
            <input className="input-base" type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 100" />
          </div>
          <div>
            <label className="stat-label" style={{ display: "block", marginBottom: 4 }}>Ticket Price ($)</label>
            <input className="input-base" type="number" min={0} step="0.01" value={ticketPrice} onChange={(e) => setTicketPrice(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="stat-label" style={{ display: "block", marginBottom: 4 }}>Start At *</label>
            <input className="input-base" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
          </div>
          <div>
            <label className="stat-label" style={{ display: "block", marginBottom: 4 }}>End At</label>
            <input className="input-base" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
        </div>
      </div>

      <ModalFooter>
        <button type="button" className="btn-ghost" onClick={onCancel} style={{ padding: "8px 16px", fontSize: 13, color: "var(--slate-muted)", background: "none", border: "1px solid var(--console-border)", borderRadius: "var(--radius)", cursor: "pointer" }}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Creating…" : "Create Event"}
        </button>
      </ModalFooter>
    </form>
  );
}

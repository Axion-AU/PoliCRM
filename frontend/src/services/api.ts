/**
 * PoliCRM API Client
 *
 * Backend port is dynamic (8080–8100). Set VITE_API_BASE_URL in your .env to
 * point at the correct port. Defaults to http://localhost:8080.
 *
 * Example .env entry:
 *   VITE_API_BASE_URL=http://localhost:8080
 */

const TOKEN_KEY = "policrm_auth_token";

function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function validateApiBase(candidate?: string): string {
  const raw = candidate ?? "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error(`Insecure HTTP API base URL is only allowed for localhost, got: ${raw}`);
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Invalid VITE_API_BASE_URL: "${raw}" is not a valid URL`);
    }
    throw err;
  }
  return raw;
}

const API_BASE = validateApiBase(import.meta.env.VITE_API_BASE_URL as string | undefined);

/* ─── Types ──────────────────────────────────────────────────────────────── */
export interface ApiError extends Error {
  status: number;
}

export interface Person {
  id: string;
  given_name: string;
  surname: string;
  email?: string; // encrypted at rest — may be absent
  primary_state?: string;
  primary_zip?: string;
  membership_status?: string;
  created_at: string;
  updated_at: string;
}

export interface PersonsPage {
  data: Person[];
  next_cursor?: string;
  total?: number;
}

export interface ImportJob {
  id: string;
  source: "csv" | "nationbuilder";
  status: "pending" | "running" | "complete" | "failed";
  records_total?: number;
  records_processed?: number;
  records_skipped?: number;
  filename?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

/* ─── Core fetch wrapper ─────────────────────────────────────────────────── */
async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = "/login";
    throw Object.assign(new Error("Session expired"), { status: 401 });
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.message ?? body?.error ?? message;
    } catch {
      // ignore JSON parse errors
    }
    const err = Object.assign(new Error(message), { status: res.status });
    throw err;
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

/* ─── Persons API ────────────────────────────────────────────────────────── */
export const personsApi = {
  list(params?: {
    cursor?: string;
    state?: string;
    limit?: number;
    search?: string;
  }): Promise<PersonsPage> {
    const q = new URLSearchParams();
    if (params?.cursor) q.set("cursor", params.cursor);
    if (params?.state) q.set("state", params.state);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.search) q.set("search", params.search);
    const qs = q.toString();
    return request<PersonsPage>(`/persons${qs ? `?${qs}` : ""}`);
  },

  get(id: string): Promise<Person> {
    return request<Person>(`/persons/${encodeURIComponent(id)}`);
  },
};

export const membersApi = {
  update(id: string, data: Record<string, unknown>): Promise<void> {
    return request<void>(`/persons/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  resetStatus(id: string): Promise<void> {
    return request<void>(`/persons/${encodeURIComponent(id)}/reset-status`, {
      method: "POST",
    });
  },
};

/* ─── Import / Jobs API ──────────────────────────────────────────────────── */
export const importApi = {
  list(): Promise<ImportJob[]> {
    return request<ImportJob[]>("/import/jobs");
  },

  get(id: string): Promise<ImportJob> {
    return request<ImportJob>(`/import/jobs/${encodeURIComponent(id)}`);
  },

  uploadCsv(file: File): Promise<ImportJob> {
    const form = new FormData();
    form.append("file", file);
    return request<ImportJob>("/import/csv", {
      method: "POST",
      body: form,
      headers: {}, // Let browser set multipart boundary
    });
  },

  startNationBuilder(params: { api_key: string; slug: string }): Promise<ImportJob> {
    return request<ImportJob>("/import/nationbuilder", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },
};

/* ─── Analytics API ─────────────────────────────────────────────────────── */
export const analyticsApi = {
  electorateCounts(): Promise<{
    verified: Record<string, number>;
    projected: Record<string, number>;
    metadata?: { verified_max: number; projected_max: number };
  }> {
    return request("/analytics/electorate-counts");
  },

  growth(): Promise<Record<string, number>> {
    return request("/analytics/growth");
  },

  geographic(): Promise<{
    by_state: Record<string, number>;
    by_division: Record<string, number>;
  }> {
    return request("/analytics/geographic");
  },

  summary(): Promise<{
    total_persons: number;
    states_covered: number;
    imports_total: number;
    last_import_at?: string;
  }> {
    return request("/analytics/summary");
  },
};

/* ─── Stats API ─────────────────────────────────────────────────────────── */
export interface StatsDashboard {
  total_members: number;
  active_members: number;
  lapsed_members: number;
  verified_count: number;
  failed_count: number;
  partial_match_count: number;
  captcha_count: number;
  unchecked_count: number;
  duplicate_count: number;
  new_members_30d: number;
  by_state: Record<string, number>;
}

export interface ElectorateStat {
  federal_division: string;
  count: number;
}

export const statsApi = {
  dashboard(): Promise<StatsDashboard> {
    return request<StatsDashboard>("/stats/dashboard");
  },
  electorates(): Promise<ElectorateStat[]> {
    return request<ElectorateStat[]>("/stats/electorates");
  },
};

/* ─── Tasks API ──────────────────────────────────────────────────────────── */
export interface Task {
  id: string;
  person_id?: string;
  assigned_to?: string;
  assigned_by?: string;
  title: string;
  description?: string;
  status: "pending" | "completed" | "cancelled";
  due_date?: string;
  completed_at?: string;
  completed_by?: string;
  created_at: string;
  updated_at: string;
}

export const tasksApi = {
  list(params?: { assigned_to?: string; status?: string; person_id?: string }): Promise<Task[]> {
    const q = new URLSearchParams();
    if (params?.assigned_to) q.set("assigned_to", params.assigned_to);
    if (params?.status) q.set("status", params.status);
    if (params?.person_id) q.set("person_id", params.person_id);
    const qs = q.toString();
    return request<Task[]>(`/tasks${qs ? `?${qs}` : ""}`);
  },
  today(): Promise<Task[]> { return request<Task[]>("/tasks/today"); },
  overdue(): Promise<Task[]> { return request<Task[]>("/tasks/overdue"); },
  get(id: string): Promise<Task> { return request<Task>(`/tasks/${id}`); },
  create(data: { title: string; description?: string; assigned_to?: string; person_id?: string; due_date?: string }): Promise<Task> {
    return request<Task>("/tasks", { method: "POST", body: JSON.stringify(data) });
  },
  update(id: string, data: Partial<Task>): Promise<void> {
    return request<void>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  complete(id: string): Promise<void> { return request<void>(`/tasks/${id}/complete`, { method: "POST" }); },
  cancel(id: string): Promise<void> { return request<void>(`/tasks/${id}/cancel`, { method: "POST" }); },
  delete(id: string): Promise<void> { return request<void>(`/tasks/${id}`, { method: "DELETE" }); },
};

/* ─── Memberships API ────────────────────────────────────────────────────── */
export interface MembershipTier {
  id: string;
  name: string;
  description?: string;
  price_cents: number;
  billing_period: string;
  benefits?: string[];
  is_active: boolean;
  sort_order: number;
}

export interface Membership {
  id: string;
  person_id: string;
  party_id: string;
  tier_id?: string;
  status: string;
  membership_type?: string;
  join_date?: string;
  renewal_date?: string;
  auto_renew: boolean;
}

export const membershipsApi = {
  tiers: {
    list(): Promise<MembershipTier[]> { return request<MembershipTier[]>("/membership-tiers"); },
    create(data: Partial<MembershipTier>): Promise<MembershipTier> { return request<MembershipTier>("/membership-tiers", { method: "POST", body: JSON.stringify(data) }); },
    update(id: string, data: Partial<MembershipTier>): Promise<void> { return request<void>(`/membership-tiers/${id}`, { method: "PATCH", body: JSON.stringify(data) }); },
  },
  list(params?: { status?: string; person_id?: string }): Promise<Membership[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.person_id) q.set("person_id", params.person_id);
    return request<Membership[]>(`/memberships?${q}`);
  },
  create(data: { person_id: string; party_id: string; tier_id?: string; status?: string }): Promise<Membership> {
    return request<Membership>("/memberships", { method: "POST", body: JSON.stringify(data) });
  },
  renew(id: string): Promise<void> { return request<void>(`/memberships/${id}/renew`, { method: "POST" }); },
  get(id: string): Promise<Membership & { person_name?: string; tier_name?: string }> { return request(`/memberships/${id}`); },
};

/* ─── Donations API ──────────────────────────────────────────────────────── */
export interface Donation {
  id: string;
  person_id: string;
  amount_cents: number;
  currency: string;
  donation_type: string;
  status: string;
  campaign?: string;
  donated_at: string;
}

export interface DonationStats {
  total_7d: number;
  total_30d: number;
  total_all: number;
  avg_gift: number;
  monthly_recurring: number;
  by_campaign: Record<string, number>;
}

export const donationsApi = {
  list(params?: { person_id?: string; campaign?: string }): Promise<Donation[]> {
    const q = new URLSearchParams();
    if (params?.person_id) q.set("person_id", params.person_id);
    if (params?.campaign) q.set("campaign", params.campaign);
    return request<Donation[]>(`/donations?${q}`);
  },
  stats(): Promise<DonationStats> { return request<DonationStats>("/donations/stats"); },
  create(data: { person_id: string; amount_cents: number; campaign?: string; donation_type?: string }): Promise<Donation> {
    return request<Donation>("/donations", { method: "POST", body: JSON.stringify(data) });
  },
};

/* ─── Events API ─────────────────────────────────────────────────────────── */
export interface Event {
  id: string;
  title: string;
  description?: string;
  event_type: string;
  location?: string;
  capacity?: number;
  ticket_price_cents?: number;
  start_at: string;
  end_at?: string;
  status: string;
}

export interface EventRsvp {
  id: string;
  event_id: string;
  person_id: string;
  status: string;
  checked_in_at?: string;
}

export const eventsApi = {
  list(params?: { status?: string; upcoming?: boolean }): Promise<Event[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.upcoming) q.set("upcoming", "true");
    return request<Event[]>(`/events?${q}`);
  },
  get(id: string): Promise<Event> { return request<Event>(`/events/${id}`); },
  create(data: Partial<Event>): Promise<Event> { return request<Event>("/events", { method: "POST", body: JSON.stringify(data) }); },
  update(id: string, data: Partial<Event>): Promise<void> { return request<void>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(data) }); },
  publish(id: string): Promise<void> { return request<void>(`/events/${id}/publish`, { method: "POST" }); },
  cancel(id: string): Promise<void> { return request<void>(`/events/${id}/cancel`, { method: "POST" }); },
  rsvp(event_id: string, person_id: string): Promise<EventRsvp> {
    return request<EventRsvp>(`/events/${event_id}/rsvp`, { method: "POST", body: JSON.stringify({ person_id }) });
  },
  checkIn(event_id: string, person_id: string): Promise<void> {
    return request<void>(`/events/${event_id}/check-in`, { method: "POST", body: JSON.stringify({ person_id }) });
  },
  attendees(event_id: string): Promise<Array<EventRsvp & { person_name?: string }>> {
    return request(`/events/${event_id}/attendees`);
  },
};

/* ─── Email Campaigns API ────────────────────────────────────────────────── */
export interface EmailCampaign {
  id: string;
  title: string;
  subject: string;
  body_html: string;
  status: string;
  scheduled_at?: string;
  sent_at?: string;
  created_at: string;
}

export interface CampaignStats {
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  pending: number;
}

export const emailApi = {
  list(): Promise<EmailCampaign[]> { return request<EmailCampaign[]>("/email-campaigns"); },
  get(id: string): Promise<EmailCampaign> { return request<EmailCampaign>(`/email-campaigns/${id}`); },
  create(data: { title: string; subject: string; body_html: string }): Promise<EmailCampaign> {
    return request<EmailCampaign>("/email-campaigns", { method: "POST", body: JSON.stringify(data) });
  },
  update(id: string, data: Partial<EmailCampaign>): Promise<void> {
    return request<void>(`/email-campaigns/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  send(id: string): Promise<void> { return request<void>(`/email-campaigns/${id}/send`, { method: "POST" }); },
  stats(id: string): Promise<CampaignStats> { return request<CampaignStats>(`/email-campaigns/${id}/stats`); },
  addRecipients(id: string, person_ids: string[]): Promise<void> {
    return request<void>(`/email-campaigns/${id}/recipients`, { method: "POST", body: JSON.stringify({ person_ids }) });
  },
};

/* ─── SMS API ────────────────────────────────────────────────────────────── */
export interface SmsMessage {
  id: string;
  person_id?: string;
  phone_number: string;
  body: string;
  status: string;
  sent_at?: string;
}

export const smsApi = {
  send(data: { person_id: string; body: string }): Promise<SmsMessage> {
    return request<SmsMessage>("/sms/send", { method: "POST", body: JSON.stringify(data) });
  },
  broadcast(data: { person_ids: string[]; body: string }): Promise<{ sent: number }> {
    return request("/sms/broadcast", { method: "POST", body: JSON.stringify(data) });
  },
  messages(): Promise<SmsMessage[]> { return request<SmsMessage[]>("/sms/messages"); },
  stats(): Promise<{ total_sent: number; delivery_rate: number }> { return request("/sms/stats"); },
};

/* ─── Prospects API ──────────────────────────────────────────────────────── */
export interface Prospect {
  person_id: string;
  score: number;
  tier: string;
  reason?: string;
  suggested_ask_cents?: number;
  last_calculated: string;
}

export const prospectsApi = {
  list(): Promise<Prospect[]> { return request<Prospect[]>("/prospects"); },
  recalculate(): Promise<void> { return request<void>("/prospects/recalculate", { method: "POST" }); },
  logOutcome(id: string, data: { outcome: string; pledged_cents?: number; notes?: string }): Promise<void> {
    return request<void>(`/prospects/${id}/log-outcome`, { method: "POST", body: JSON.stringify(data) });
  },
};

/* ─── Automations API ────────────────────────────────────────────────────── */
export interface Automation {
  id: string;
  name: string;
  description?: string;
  trigger_type: string;
  trigger_config: string;
  actions: string;
  is_active: boolean;
  created_at: string;
}

export const automationsApi = {
  list(): Promise<Automation[]> { return request<Automation[]>("/automations"); },
  create(data: { name: string; trigger_type: string; trigger_config: string; actions: string }): Promise<Automation> {
    return request<Automation>("/automations", { method: "POST", body: JSON.stringify(data) });
  },
  update(id: string, data: Partial<Automation>): Promise<void> { return request<void>(`/automations/${id}`, { method: "PATCH", body: JSON.stringify(data) }); },
  activate(id: string): Promise<void> { return request<void>(`/automations/${id}/activate`, { method: "POST" }); },
  deactivate(id: string): Promise<void> { return request<void>(`/automations/${id}/deactivate`, { method: "POST" }); },
  delete(id: string): Promise<void> { return request<void>(`/automations/${id}`, { method: "DELETE" }); },
};

/* ─── Activity API ───────────────────────────────────────────────────────── */
export interface ActivityEntry {
  id: string;
  user_id?: string;
  person_id?: string;
  action: string;
  description?: string;
  created_at: string;
}

export const activityApi = {
  list(): Promise<ActivityEntry[]> { return request<ActivityEntry[]>("/activity"); },
  stats(): Promise<{ tasks_completed_today: number; contacts_made_this_week: number; new_people_this_week: number }> {
    return request("/activity/stats");
  },
};

/* ─── Branches API ───────────────────────────────────────────────────────── */
export interface Branch {
  id: string;
  name: string;
  type: string;
  parent_id?: string;
  created_at: string;
}

export const branchesApi = {
  list(): Promise<Branch[]> { return request<Branch[]>("/branches"); },
  create(data: { name: string; type: string; parent_id?: string }): Promise<Branch> {
    return request<Branch>("/branches", { method: "POST", body: JSON.stringify(data) });
  },
  update(id: string, data: Partial<Branch>): Promise<void> { return request<void>(`/branches/${id}`, { method: "PATCH", body: JSON.stringify(data) }); },
  del(id: string): Promise<void> { return request<void>(`/branches/${id}`, { method: "DELETE" }); },
};

/* ─── ERA API ────────────────────────────────────────────────────────────── */
export interface ERAStats {
  total_records: number;
  total_uploads: number;
  by_state: Record<string, number>;
  top_divisions: { division: string; count: number }[];
  total_matches: number;
  verified_matches: number;
  partial_match_count: number;
  unchecked_count: number;
}

export interface ERARecord {
  id: number;
  given_names: string;
  surname: string;
  full_address: string;
  locality: string;
  postcode: string;
  federal_division: string;
  state_district?: string;
  enrolled_date?: string;
}

export interface SearchResult extends ERARecord {
  overall_score: number;
  name_score: number;
  address_score: number;
}

export interface BrowseResult {
  total: number;
  skip: number;
  limit: number;
  records: ERARecord[];
}

export const eraApi = {
  getStats(): Promise<ERAStats> { return request<ERAStats>("/era/stats"); },

  getDivisions(): Promise<{ division: string; count: number }[]> {
    return request("/era/divisions");
  },

  getFiles(): Promise<{ filename: string; size_mb: number }[]> {
    return request("/era/files");
  },

  getUploads(): Promise<{ id: number; filename: string; record_count: number; status: string }[]> {
    return request("/era/uploads");
  },

  parseFromDisk(filename: string, clearExisting: boolean): Promise<void> {
    return request("/era/parse-from-disk", {
      method: "POST",
      body: JSON.stringify({ filename, clear_existing: clearExisting }),
    });
  },

  search(params: {
    surname: string;
    given_names?: string;
    locality?: string;
    postcode?: string;
    limit?: number;
  }): Promise<SearchResult[]> {
    return request("/era/search", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  browse(params: {
    federal_division?: string;
    skip?: number;
    limit?: number;
  }): Promise<BrowseResult> {
    const q = new URLSearchParams();
    if (params.federal_division) q.set("federal_division", params.federal_division);
    if (params.skip !== undefined) q.set("skip", String(params.skip));
    if (params.limit !== undefined) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<BrowseResult>(`/era/browse${qs ? `?${qs}` : ""}`);
  },

  uploadFile(file: File): Promise<void> {
    const form = new FormData();
    form.append("file", file);
    return request<void>("/era/upload", {
      method: "POST",
      body: form,
      headers: {},
    });
  },

  getRecruitmentTargets(params: {
    include_same_address?: boolean;
    include_same_surname?: boolean;
    limit?: number;
  }): Promise<any[]> {
    const q = new URLSearchParams();
    if (params.include_same_address) q.set("include_same_address", "true");
    if (params.include_same_surname) q.set("include_same_surname", "true");
    if (params.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<any[]>(`/era/recruitment-targets${qs ? `?${qs}` : ""}`);
  },

  getHouseholdStats(): Promise<any> { return request("/era/household-stats"); },

  getTopHouseholds(limit: number, minElectors: number): Promise<any[]> {
    return request<any[]>(`/era/top-households?limit=${limit}&min_electors=${minElectors}`);
  },

  getVolunteerCandidates(limit: number, threshold: number): Promise<any[]> {
    return request<any[]>(`/era/volunteer-candidates?limit=${limit}&threshold=${threshold}`);
  },
};

/* ─── Users API (admin) ──────────────────────────────────────────────────── */
export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  branch_id?: string;
  branch_name?: string;
  is_active: boolean;
  created_at: string;
}

export const usersApi = {
  list(): Promise<UserRecord[]> { return request<UserRecord[]>("/users"); },
  create(data: { email: string; name: string; role?: string; branch_id?: string }): Promise<UserRecord> {
    return request<UserRecord>("/users", { method: "POST", body: JSON.stringify(data) });
  },
  update(id: string, data: { role?: string; is_active?: boolean }): Promise<void> {
    return request<void>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
};

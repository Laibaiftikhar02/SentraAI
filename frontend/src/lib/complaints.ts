/**
 * Complaint API types and helper functions.
 */
import { api } from "./api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Attachment {
  id: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export interface AIPrediction {
  summary: string | null;
  category: string | null;
  category_confidence: number | null;
  priority: string | null;
  priority_confidence: number | null;
  priority_rationale: string | null;
  department: string | null;
  routing_confidence: number | null;
  duplicate_detected: boolean;
  duplicate_cluster_id: string | null;
  needs_manual_review: boolean;
  provider: string | null;
}

export interface ComplaintDetail {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string | null;
  ai_status: string | null;
  organization_id: string;
  user_id: string;
  department_id: string | null;
  zone_id: string | null;
  category_id: string | null;
  duplicate_cluster_id: string | null;
  created_at: string;
  updated_at: string;
  department_name: string | null;
  zone_name: string | null;
  category_name: string | null;
  submitter_name: string | null;
  attachments: Attachment[];
  ai_prediction: AIPrediction | null;
}

export interface ComplaintListItem {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  ai_status: string | null;
  category_name: string | null;
  department_name: string | null;
  zone_name: string | null;
  created_at: string;
  updated_at: string;
  attachment_count: number;
}

export interface ComplaintListResponse {
  items: ComplaintListItem[];
  total: number;
  page: number;
  per_page: number;
}

export interface HistoryEntry {
  id: string;
  action: string;
  previous_value: string | null;
  new_value: string | null;
  actor_id: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface ComplaintStats {
  total: number;
  open: number;
  resolved: number;
  high_priority: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  description: string | null;
}

export interface ZoneOption {
  id: string;
  name: string;
  zone_type: string | null;
}

// ── API Functions ────────────────────────────────────────────────────────────

export async function submitComplaint(data: {
  title: string;
  description: string;
  zone_id?: string | null;
  category_id?: string | null;
  file?: File | null;
}): Promise<{ data: { id: string; status: string } }> {
  const form = new FormData();
  form.append("title", data.title);
  form.append("description", data.description);
  if (data.zone_id) form.append("zone_id", data.zone_id);
  if (data.category_id) form.append("category_id", data.category_id);
  if (data.file) form.append("file", data.file);
  return api.postForm("/complaints", form);
}

export async function listComplaints(params?: {
  page?: number;
  per_page?: number;
  status?: string;
  priority?: string;
}): Promise<ComplaintListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  if (params?.status) query.set("status", params.status);
  if (params?.priority) query.set("priority", params.priority);
  const qs = query.toString();
  return api.get<ComplaintListResponse>(`/complaints${qs ? `?${qs}` : ""}`);
}

export async function getComplaint(id: string): Promise<ComplaintDetail> {
  return api.get<ComplaintDetail>(`/complaints/${id}`);
}

export async function getComplaintHistory(
  id: string
): Promise<HistoryEntry[]> {
  return api.get<HistoryEntry[]>(`/complaints/${id}/history`);
}

export async function getComplaintStats(): Promise<ComplaintStats> {
  return api.get<ComplaintStats>("/complaints/stats");
}

export async function getCategories(): Promise<CategoryOption[]> {
  return api.get<CategoryOption[]>("/reference/categories");
}

export async function getZones(): Promise<ZoneOption[]> {
  return api.get<ZoneOption[]>("/reference/zones");
}

export interface ReprocessResult {
  data: {
    id: string;
    ai_status: string | null;
    priority: string | null;
    department_id: string | null;
  };
}

export async function reprocessComplaint(
  id: string
): Promise<ReprocessResult> {
  return api.post<ReprocessResult>(`/complaints/${id}/reprocess`);
}

// ── Utility ──────────────────────────────────────────────────────────────────

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    created: "Created",
    assigned: "Assigned",
    in_progress: "In Progress",
    resolved: "Resolved",
    closed: "Closed",
    reopened: "Reopened",
  };
  return map[status] || status;
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    created: "text-blue-400",
    assigned: "text-blue-300",
    in_progress: "text-yellow-400",
    resolved: "text-green-400",
    closed: "text-gray-400",
    reopened: "text-orange-400",
  };
  return map[status] || "text-gray-400";
}

export function priorityColor(priority: string | null): string {
  if (!priority) return "text-gray-500";
  const map: Record<string, string> = {
    critical: "text-urgency-critical",
    high: "text-urgency-high",
    medium: "text-urgency-medium",
    low: "text-urgency-low",
  };
  return map[priority] || "text-gray-500";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function aiStatusLabel(status: string | null): string {
  const map: Record<string, string> = {
    pending: "Processing\u2026",
    completed: "Completed",
    unavailable: "Unavailable",
    timeout: "Timed Out",
    invalid: "Invalid Output",
  };
  return map[status || ""] || "Pending";
}

export function confidencePct(value: number | null): string {
  if (value == null) return "\u2014";
  return `${Math.round(value * 100)}%`;
}

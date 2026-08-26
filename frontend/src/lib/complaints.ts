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
  ai_summary: string | null;
  assigned_admin: string | null;
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

// ── Admin Types ──────────────────────────────────────────────────────────────

export interface AdminNotification {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  complaint_id: string | null;
  created_at: string;
}

export interface DuplicateCluster {
  id: string;
  summary: string | null;
  member_count: number;
  members: {
    id: string;
    title: string;
    status: string;
    priority: string | null;
    created_at: string;
  }[];
}

export interface DepartmentOption {
  id: string;
  name: string;
}

export interface AdminOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

// ── Admin API Functions ──────────────────────────────────────────────────────

export async function adminListComplaints(params?: {
  page?: number;
  per_page?: number;
  status?: string;
  priority?: string;
  category?: string;
  zone?: string;
  department?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}): Promise<ComplaintListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  if (params?.status) query.set("status", params.status);
  if (params?.priority) query.set("priority", params.priority);
  if (params?.category) query.set("category", params.category);
  if (params?.zone) query.set("zone", params.zone);
  if (params?.department) query.set("department", params.department);
  if (params?.search) query.set("search", params.search);
  if (params?.date_from) query.set("date_from", params.date_from);
  if (params?.date_to) query.set("date_to", params.date_to);
  const qs = query.toString();
  return api.get<ComplaintListResponse>(`/admin/complaints${qs ? `?${qs}` : ""}`);
}

export async function adminGetComplaint(id: string): Promise<ComplaintDetail> {
  return api.get<ComplaintDetail>(`/admin/complaints/${id}`);
}

export async function adminUpdateComplaint(
  id: string,
  body: {
    category_id?: string | null;
    priority?: string | null;
    department_id?: string | null;
    status?: string | null;
    note?: string | null;
    response?: string | null;
    assign_to_user_id?: string | null;
  }
): Promise<{ data: { id: string; status: string; priority: string | null } }> {
  return api.patch(`/admin/complaints/${id}`, body);
}

export async function adminGetCluster(clusterId: string): Promise<DuplicateCluster> {
  return api.get<DuplicateCluster>(`/admin/clusters/${clusterId}`);
}

export async function adminGetNotifications(unreadOnly = false): Promise<AdminNotification[]> {
  const qs = unreadOnly ? "?unread_only=true" : "";
  return api.get<AdminNotification[]>(`/admin/notifications${qs}`);
}

export async function adminMarkNotificationRead(id: string): Promise<{ id: string; is_read: boolean }> {
  return api.patch(`/admin/notifications/${id}/read`);
}

export async function adminMarkAllNotificationsRead(): Promise<{ marked_read: number }> {
  return api.post(`/admin/notifications/read-all`);
}

export async function adminGetDepartments(): Promise<DepartmentOption[]> {
  return api.get<DepartmentOption[]>("/admin/departments");
}

export async function adminGetAdmins(): Promise<AdminOption[]> {
  return api.get<AdminOption[]>("/admin/admins");
}

// ── Heatmap Types ─────────────────────────────────────────────────────────────

export interface HeatmapZone {
  zoneId: string;
  zoneName: string;
  zoneType: string | null;
  totalReports: number;
  distinctIssueClusters: number;
  urgencyDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  heatIntensity: number;
  polygon: number[][] | null;
  centroid: number[];
}

export interface HeatmapMarker {
  markerId: string;
  markerType: "complaint" | "duplicate_cluster";
  zoneId: string;
  urgency: string;
  reportCount: number;
  clusterId?: string;
  complaintId?: string;
  complaintIds: string[];
  summary: string | null;
  category: string | null;
  department: string | null;
  confidence: number | null;
  position: number[];
}

export interface HeatmapResponse {
  zones: HeatmapZone[];
  markers: HeatmapMarker[];
}

// ── Heatmap API Function ────────────────────────────────────────────────────

export async function getHeatmapData(): Promise<HeatmapResponse> {
  return api.get<HeatmapResponse>("/analytics/heatmap");
}

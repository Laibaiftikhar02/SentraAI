"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  adminGetComplaint,
  adminUpdateComplaint,
  adminGetCluster,
  getComplaintHistory,
  getCategories,
  adminGetDepartments,
  adminGetAdmins,
  ComplaintDetail,
  HistoryEntry,
  DuplicateCluster,
  CategoryOption,
  DepartmentOption,
  AdminOption,
  statusLabel,
  statusColor,
  priorityColor,
  formatDate,
  aiStatusLabel,
  confidencePct,
} from "@/lib/complaints";

// Valid status transitions (mirrors backend state machine)
const VALID_TRANSITIONS: Record<string, string[]> = {
  created: ["assigned", "in_progress"],
  assigned: ["in_progress", "resolved"],
  in_progress: ["resolved", "reopened"],
  resolved: ["closed", "reopened"],
  closed: ["reopened"],
  reopened: ["in_progress", "assigned"],
};

const PRIORITY_LEVELS = ["critical", "high", "medium", "low"];

export default function AdminComplaintDetailPage() {
  const router = useRouter();
  const params = useParams();
  const complaintId = params.id as string;

  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Data
  const [complaint, setComplaint] = useState<ComplaintDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [cluster, setCluster] = useState<DuplicateCluster | null>(null);

  // Form state
  const [newStatus, setNewStatus] = useState("");
  const [newPriority, setNewPriority] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newDepartmentId, setNewDepartmentId] = useState("");
  const [assignToUserId, setAssignToUserId] = useState("");
  const [note, setNote] = useState("");
  const [response, setResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [error, setError] = useState("");

  // Auth check
  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "admin" && u.role !== "super_admin") {
          router.replace("/login");
          return;
        }
        setUser(u);
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "Unauthorized") {
          clearToken();
        }
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  // Load complaint + reference data
  const loadData = useCallback(async () => {
    if (!user || !complaintId) return;
    try {
      const [c, hist, depts, adminList, cats] = await Promise.all([
        adminGetComplaint(complaintId),
        getComplaintHistory(complaintId).catch(() => []),
        adminGetDepartments().catch(() => []),
        adminGetAdmins().catch(() => []),
        getCategories().catch(() => []),
      ]);
      setComplaint(c);
      setHistory(hist);
      setDepartments(depts);
      setAdmins(adminList);
      setCategories(cats);

      // Pre-fill form with current values
      setNewPriority(c.priority || "");
      setNewCategoryId(c.category_id || "");
      setNewDepartmentId(c.department_id || "");

      // Load duplicate cluster if detected
      if (c.ai_prediction?.duplicate_detected && c.ai_prediction?.duplicate_cluster_id) {
        adminGetCluster(c.ai_prediction.duplicate_cluster_id)
          .then(setCluster)
          .catch(() => {});
      }
    } catch {
      setError("Failed to load complaint.");
    }
  }, [user, complaintId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  // Build PATCH body from form — only send changed fields
  async function handleSave() {
    if (!complaint) return;
    setSaving(true);
    setSaveMessage("");

    const body: Record<string, string> = {};

    if (newStatus) body.status = newStatus;
    if (newPriority && newPriority !== complaint.priority) body.priority = newPriority;
    if (newCategoryId && newCategoryId !== complaint.category_id) body.category_id = newCategoryId;
    if (newDepartmentId && newDepartmentId !== (complaint.department_id || ""))
      body.department_id = newDepartmentId;
    if (assignToUserId) body.assign_to_user_id = assignToUserId;
    if (note.trim()) body.note = note.trim();
    if (response.trim()) body.response = response.trim();

    if (Object.keys(body).length === 0) {
      setSaveMessage("No changes to apply.");
      setSaving(false);
      return;
    }

    try {
      await adminUpdateComplaint(complaintId, body);
      setSaveMessage("Changes saved successfully.");
      // Clear transient fields after save
      setNewStatus("");
      setNote("");
      setResponse("");
      setAssignToUserId("");
      // Reload data
      await loadData();
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  // Quick action: accept AI suggestions
  async function handleAcceptAI() {
    if (!complaint?.ai_prediction) return;
    const ai = complaint.ai_prediction;
    const body: Record<string, string> = {};

    if (ai.priority && ai.priority !== complaint.priority) body.priority = ai.priority;
    if (ai.department) {
      const dept = departments.find(
        (d) => d.name.toLowerCase() === ai.department!.toLowerCase()
      );
      if (dept && dept.id !== complaint.department_id) body.department_id = dept.id;
    }
    if (ai.category) {
      const cat = categories.find(
        (c) => c.name.toLowerCase() === ai.category!.toLowerCase()
      );
      if (cat && cat.id !== complaint.category_id) body.category_id = cat.id;
    }

    if (Object.keys(body).length === 0) {
      setSaveMessage("AI suggestions already applied.");
      return;
    }

    setSaving(true);
    try {
      await adminUpdateComplaint(complaintId, body);
      setSaveMessage("AI suggestions accepted.");
      await loadData();
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render states ──

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-panel px-8 py-6">
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-panel px-8 py-6 text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.push("/admin/inbox")}
            className="btn-secondary text-sm"
          >
            Back to Inbox
          </button>
        </div>
      </div>
    );
  }

  if (!complaint) return null;

  const allowedTransitions = VALID_TRANSITIONS[complaint.status] || [];

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push("/admin/inbox")}
            className="text-gray-400 hover:text-white text-sm mb-2 transition-colors"
          >
            &larr; Back to Inbox
          </button>
          <h1 className="text-2xl font-bold">{complaint.title}</h1>
          <p className="text-gray-500 text-sm mt-1">
            ID: {complaint.id.slice(0, 8)}... &bull; Submitted by{" "}
            {complaint.submitter_name || "Unknown"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="btn-secondary text-sm">
            Logout
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left column: Complaint details + Admin actions ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status & Priority cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-panel p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wide">
                Status
              </p>
              <p
                className={`text-lg font-semibold mt-1 ${statusColor(complaint.status)}`}
              >
                {statusLabel(complaint.status)}
              </p>
            </div>
            <div className="glass-panel p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wide">
                Priority
              </p>
              <p
                className={`text-lg font-semibold mt-1 ${priorityColor(complaint.priority)}`}
              >
                {complaint.priority
                  ? complaint.priority.charAt(0).toUpperCase() +
                    complaint.priority.slice(1)
                  : "Pending"}
              </p>
            </div>
            <div className="glass-panel p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wide">
                Category
              </p>
              <p className="text-lg font-semibold mt-1">
                {complaint.category_name || "Pending"}
              </p>
            </div>
            <div className="glass-panel p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wide">
                Department
              </p>
              <p className="text-lg font-semibold mt-1">
                {complaint.department_name || "Unassigned"}
              </p>
            </div>
          </div>

          {/* Description */}
          <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-3">Description</h2>
            <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">
              {complaint.description}
            </p>
            {complaint.zone_name && (
              <p className="text-gray-500 text-sm mt-3">
                Location: {complaint.zone_name}
              </p>
            )}
          </div>

          {/* Attachments */}
          {complaint.attachments.length > 0 && (
            <div className="glass-panel p-6">
              <h2 className="text-lg font-semibold mb-3">
                Attachments ({complaint.attachments.length})
              </h2>
              <div className="space-y-2">
                {complaint.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={`/api/v1/complaints/${complaint.id}/attachments/${a.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between glass-panel-light p-3 hover:bg-glass-light transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-blue-400 text-lg">&#128206;</span>
                      <div>
                        <p className="text-sm font-medium">
                          {a.original_filename}
                        </p>
                        <p className="text-xs text-gray-500">
                          {a.file_type} &bull;{" "}
                          {(a.file_size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <span className="text-gray-400 text-sm">Download</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ── Admin Actions Form ── */}
          <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-4">Admin Actions</h2>

            {saveMessage && (
              <div
                className={`mb-4 p-3 rounded-lg text-sm ${
                  saveMessage.includes("success") ||
                  saveMessage.includes("accepted")
                    ? "bg-green-500/10 text-green-400"
                    : saveMessage.includes("No changes")
                      ? "bg-yellow-500/10 text-yellow-400"
                      : "bg-red-500/10 text-red-400"
                }`}
              >
                {saveMessage}
              </div>
            )}

            <div className="space-y-4">
              {/* Row 1: Status transition + Priority override */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">
                    Update Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="glass-input w-full text-sm"
                  >
                    <option value="">No change</option>
                    {allowedTransitions.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                  {allowedTransitions.length === 0 && (
                    <p className="text-xs text-gray-600 mt-1">
                      No transitions available from &quot;{statusLabel(complaint.status)}&quot;
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">
                    Priority Override
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="glass-input w-full text-sm"
                  >
                    <option value="">None</option>
                    {PRIORITY_LEVELS.map((p) => (
                      <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </select>
                  {newPriority !== (complaint.priority || "") && (
                    <p className="text-xs text-blue-400 mt-1">
                      Changed from{" "}
                      {complaint.priority
                        ? complaint.priority.charAt(0).toUpperCase() +
                          complaint.priority.slice(1)
                        : "none"}
                    </p>
                  )}
                </div>
              </div>

              {/* Row 2: Category + Department override */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">
                    Category Override
                  </label>
                  <select
                    value={newCategoryId}
                    onChange={(e) => setNewCategoryId(e.target.value)}
                    className="glass-input w-full text-sm"
                  >
                    <option value="">None</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">
                    Department Reassignment
                  </label>
                  <select
                    value={newDepartmentId}
                    onChange={(e) => setNewDepartmentId(e.target.value)}
                    className="glass-input w-full text-sm"
                  >
                    <option value="">None (General Review)</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Reassign admin */}
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">
                  Reassign to Admin
                </label>
                <select
                  value={assignToUserId}
                  onChange={(e) => setAssignToUserId(e.target.value)}
                  className="glass-input w-full text-sm"
                >
                  <option value="">No reassignment</option>
                  {admins
                    .filter((a) => a.id !== user?.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.role === "super_admin" ? "Super Admin" : "Admin"})
                      </option>
                    ))}
                </select>
              </div>

              {/* Row 4: Internal note */}
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">
                  Internal Note (admin-only)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add an internal note visible only to admins..."
                  rows={3}
                  maxLength={5000}
                  className="glass-input w-full text-sm resize-none"
                />
              </div>

              {/* Row 5: Response to submitter */}
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">
                  Response to Submitter
                </label>
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="Write a response that will be sent to the complainant..."
                  rows={3}
                  maxLength={10000}
                  className="glass-input w-full text-sm resize-none"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary text-sm"
                >
                  {saving ? "Saving..." : "Apply Changes"}
                </button>
                {complaint.ai_prediction && (
                  <button
                    onClick={handleAcceptAI}
                    disabled={saving}
                    className="btn-secondary text-sm"
                  >
                    Accept AI Suggestions
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column: AI Analysis + Timeline + Metadata ── */}
        <div className="space-y-6">
          {/* AI Status */}
          {complaint.ai_status && (
            <div className="glass-panel p-4 flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide">
                  AI Triage Status
                </p>
                <p
                  className={`text-sm font-medium mt-1 ${
                    complaint.ai_status === "completed"
                      ? "text-green-400"
                      : complaint.ai_status === "pending"
                        ? "text-yellow-400"
                        : "text-red-400"
                  }`}
                >
                  {aiStatusLabel(complaint.ai_status)}
                </p>
              </div>
            </div>
          )}

          {/* AI Analysis */}
          {complaint.ai_prediction && (
            <div className="glass-panel p-6 border-blue-500/20">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <span className="text-blue-400">&#9881;</span>
                AI Analysis
                {complaint.ai_prediction.needs_manual_review && (
                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                    Needs Manual Review
                  </span>
                )}
              </h2>

              {complaint.ai_prediction.summary && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">
                    Summary
                  </p>
                  <p className="text-gray-300 text-sm mt-1">
                    {complaint.ai_prediction.summary}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                {complaint.ai_prediction.category && (
                  <div>
                    <p className="text-gray-400">Category</p>
                    <p className="font-medium">
                      {complaint.ai_prediction.category}
                    </p>
                    <p className="text-xs text-gray-500">
                      {confidencePct(complaint.ai_prediction.category_confidence)}
                    </p>
                  </div>
                )}
                {complaint.ai_prediction.priority && (
                  <div>
                    <p className="text-gray-400">Priority</p>
                    <p
                      className={`font-medium ${priorityColor(complaint.ai_prediction.priority)}`}
                    >
                      {complaint.ai_prediction.priority.charAt(0).toUpperCase() +
                        complaint.ai_prediction.priority.slice(1)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {confidencePct(complaint.ai_prediction.priority_confidence)}
                    </p>
                  </div>
                )}
                {complaint.ai_prediction.department && (
                  <div>
                    <p className="text-gray-400">Department</p>
                    <p className="font-medium">
                      {complaint.ai_prediction.department}
                    </p>
                    <p className="text-xs text-gray-500">
                      {confidencePct(complaint.ai_prediction.routing_confidence)}
                    </p>
                  </div>
                )}
              </div>

              {complaint.ai_prediction.priority_rationale && (
                <div className="mt-3 text-sm">
                  <p className="text-gray-400">Rationale</p>
                  <p className="text-gray-300 mt-0.5 italic text-xs">
                    {complaint.ai_prediction.priority_rationale}
                  </p>
                </div>
              )}

              {complaint.ai_prediction.duplicate_detected && (
                <div className="mt-3">
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">
                    Possible Duplicate
                  </span>
                </div>
              )}

              <p className="text-xs text-gray-500 mt-4 italic">
                AI recommendations are advisory.
                {complaint.ai_prediction.provider && (
                  <span className="ml-1">
                    Provider: {complaint.ai_prediction.provider}
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Duplicate Cluster */}
          {cluster && (
            <div className="glass-panel p-6">
              <h2 className="text-sm font-semibold mb-3">
                Duplicate Cluster ({cluster.member_count} members)
              </h2>
              {cluster.summary && (
                <p className="text-xs text-gray-400 mb-3">{cluster.summary}</p>
              )}
              <div className="space-y-2">
                {cluster.members.map((m) => (
                  <Link
                    key={m.id}
                    href={`/admin/complaints/${m.id}`}
                    className="block glass-panel-light p-2 hover:bg-glass-light transition-colors"
                  >
                    <p className="text-sm font-medium truncate">{m.title}</p>
                    <div className="flex gap-2 mt-0.5">
                      <span
                        className={`text-xs ${statusColor(m.status)}`}
                      >
                        {statusLabel(m.status)}
                      </span>
                      <span
                        className={`text-xs ${priorityColor(m.priority)}`}
                      >
                        {m.priority || "\u2014"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="glass-panel p-6">
            <h2 className="text-sm font-semibold mb-4">Timeline</h2>
            {history.length === 0 ? (
              <p className="text-gray-500 text-sm">No history yet.</p>
            ) : (
              <div className="space-y-0">
                {history.map((h, i) => (
                  <div key={h.id} className="relative pl-6 pb-6 last:pb-0">
                    {i < history.length - 1 && (
                      <div className="absolute left-[7px] top-3 bottom-0 w-px bg-glass-border" />
                    )}
                    <div
                      className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 ${
                        h.action === "created"
                          ? "bg-blue-500 border-blue-400"
                          : h.action.startsWith("admin_")
                            ? "bg-purple-500 border-purple-400"
                            : h.action === "status_changed"
                              ? "bg-yellow-500 border-yellow-400"
                              : "bg-gray-600 border-gray-500"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium capitalize">
                        {h.action.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDate(h.created_at)}
                      </p>
                      {h.previous_value && h.action !== "created" && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {h.previous_value} &rarr;{" "}
                          <span className="text-gray-300">{h.new_value}</span>
                        </p>
                      )}
                      {!h.previous_value && h.new_value && h.action !== "created" && (
                        <p className="text-xs text-gray-400 mt-1 truncate max-w-[250px]">
                          {h.new_value}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="glass-panel p-6">
            <h3 className="text-sm font-semibold mb-3">Details</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">Submitted</dt>
                <dd>{formatDate(complaint.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Updated</dt>
                <dd>{formatDate(complaint.updated_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Submitter</dt>
                <dd>{complaint.submitter_name || "Unknown"}</dd>
              </div>
              {complaint.department_name && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Department</dt>
                  <dd>{complaint.department_name}</dd>
                </div>
              )}
              {complaint.zone_name && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Location</dt>
                  <dd>{complaint.zone_name}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

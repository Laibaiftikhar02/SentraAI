"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  getComplaint,
  getComplaintHistory,
  reprocessComplaint,
  ComplaintDetail,
  HistoryEntry,
  statusLabel,
  statusColor,
  priorityColor,
  formatDate,
  aiStatusLabel,
  confidencePct,
} from "@/lib/complaints";

export default function ComplaintDetailPage() {
  const router = useRouter();
  const params = useParams();
  const complaintId = params.id as string;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [complaint, setComplaint] = useState<ComplaintDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState("");
  const [reprocessing, setReprocessing] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "user") {
          router.replace("/login");
          return;
        }
        setUser(u);
      })
      .catch(() => {
        clearToken();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!user || !complaintId) return;
    Promise.all([
      getComplaint(complaintId).then(setComplaint).catch(() => setError("Failed to load complaint")),
      getComplaintHistory(complaintId).then(setHistory).catch(() => {}),
    ]);
  }, [user, complaintId]);

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

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
            onClick={() => router.push("/dashboard/complaints")}
            className="btn-secondary text-sm"
          >
            Back to Complaints
          </button>
        </div>
      </div>
    );
  }

  if (!complaint) return null;

  async function handleReprocess() {
    setReprocessing(true);
    try {
      await reprocessComplaint(complaintId);
      // Reload complaint data
      const [updated, hist] = await Promise.all([
        getComplaint(complaintId),
        getComplaintHistory(complaintId).catch(() => []),
      ]);
      setComplaint(updated);
      setHistory(hist);
    } catch {
      setError("AI reprocessing failed. Please try again later.");
    } finally {
      setReprocessing(false);
    }
  }

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <button
            onClick={() => router.push("/dashboard/complaints")}
            className="text-gray-400 hover:text-white text-sm mb-2 transition-colors"
          >
            &larr; Back to Complaints
          </button>
          <h1 className="text-2xl font-bold">{complaint.title}</h1>
          <p className="text-gray-500 text-sm mt-1">
            ID: {complaint.id.slice(0, 8)}... &bull; Submitted by{" "}
            {complaint.submitter_name || "You"}
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
        {/* Left column — Complaint details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status & Priority */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-panel p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wide">
                Status
              </p>
              <p className={`text-lg font-semibold mt-1 ${statusColor(complaint.status)}`}>
                {statusLabel(complaint.status)}
              </p>
            </div>
            <div className="glass-panel p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wide">
                Priority
              </p>
              <p className={`text-lg font-semibold mt-1 ${priorityColor(complaint.priority)}`}>
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
                Location
              </p>
              <p className="text-lg font-semibold mt-1">
                {complaint.zone_name || "—"}
              </p>
            </div>
          </div>

          {/* Description */}
          <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-3">Description</h2>
            <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">
              {complaint.description}
            </p>
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
                        <p className="text-sm font-medium">{a.original_filename}</p>
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

          {/* AI Status Badge */}
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
              {(complaint.ai_status === "unavailable" ||
                complaint.ai_status === "timeout" ||
                complaint.ai_status === "invalid") && (
                <button
                  onClick={handleReprocess}
                  disabled={reprocessing}
                  className="btn-secondary text-xs"
                >
                  {reprocessing ? "Processing\u2026" : "Retry AI"}
                </button>
              )}
            </div>
          )}

          {/* AI Prediction (if available) */}
          {complaint.ai_prediction && (
            <div className="glass-panel p-6 border-blue-500/20">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
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
                  <p className="text-gray-300 mt-1">
                    {complaint.ai_prediction.summary}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                {complaint.ai_prediction.category && (
                  <div>
                    <p className="text-gray-400">Category</p>
                    <p className="font-medium">
                      {complaint.ai_prediction.category}
                    </p>
                    <p className="text-xs text-gray-500">
                      Confidence: {confidencePct(complaint.ai_prediction.category_confidence)}
                    </p>
                  </div>
                )}
                {complaint.ai_prediction.priority && (
                  <div>
                    <p className="text-gray-400">Priority</p>
                    <p className={`font-medium ${priorityColor(complaint.ai_prediction.priority)}`}>
                      {complaint.ai_prediction.priority.charAt(0).toUpperCase() +
                        complaint.ai_prediction.priority.slice(1)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Confidence: {confidencePct(complaint.ai_prediction.priority_confidence)}
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
                      Confidence: {confidencePct(complaint.ai_prediction.routing_confidence)}
                    </p>
                  </div>
                )}
              </div>

              {complaint.ai_prediction.priority_rationale && (
                <div className="mt-3 text-sm">
                  <p className="text-gray-400">Priority Rationale</p>
                  <p className="text-gray-300 mt-0.5 italic">
                    {complaint.ai_prediction.priority_rationale}
                  </p>
                </div>
              )}

              {complaint.ai_prediction.duplicate_detected && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">
                    Possible Duplicate Detected
                  </span>
                </div>
              )}

              <p className="text-xs text-gray-500 mt-4 italic">
                AI recommendations are advisory and subject to admin
                verification.
                {complaint.ai_prediction.provider && (
                  <span className="ml-2">
                    Provider: {complaint.ai_prediction.provider}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Right column — Timeline */}
        <div>
          <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-4">Timeline</h2>
            {history.length === 0 ? (
              <p className="text-gray-500 text-sm">No history yet.</p>
            ) : (
              <div className="space-y-0">
                {history.map((h, i) => (
                  <div key={h.id} className="relative pl-6 pb-6 last:pb-0">
                    {/* Vertical line */}
                    {i < history.length - 1 && (
                      <div className="absolute left-[7px] top-3 bottom-0 w-px bg-glass-border" />
                    )}
                    {/* Dot */}
                    <div
                      className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 ${
                        h.action === "created"
                          ? "bg-blue-500 border-blue-400"
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
                      {h.new_value && h.action !== "created" && (
                        <p className="text-xs text-gray-400 mt-1">
                          &rarr; {h.new_value}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="glass-panel p-6 mt-4">
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
              {complaint.department_name && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Department</dt>
                  <dd>{complaint.department_name}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

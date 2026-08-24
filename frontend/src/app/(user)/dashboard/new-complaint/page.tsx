"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  submitComplaint,
  getCategories,
  getZones,
  CategoryOption,
  ZoneOption,
} from "@/lib/complaints";

export default function NewComplaintPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Reference data
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);

  useEffect(() => {
    Promise.all([
      fetchCurrentUser().then((u) => {
        if (u.role !== "user") {
          router.replace("/login");
          return;
        }
        setUser(u);
      }),
      getCategories().then(setCategories).catch(() => []),
      getZones().then(setZones).catch(() => []),
    ]).finally(() => setLoading(false));
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const result = await submitComplaint({
        title: title.trim(),
        description: description.trim(),
        zone_id: zoneId || null,
        category_id: categoryId || null,
        file,
      });
      setSuccess(
        `Complaint submitted successfully! Tracking ID: ${result.data.id.slice(0, 8)}...`
      );
      // Redirect to complaint detail after brief delay
      setTimeout(() => {
        router.push(`/dashboard/complaints/${result.data.id}`);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

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

  return (
    <div className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-8">
        <div>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-gray-400 hover:text-white text-sm mb-2 transition-colors"
          >
            &larr; Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold">New Complaint</h1>
          <p className="text-gray-400 text-sm">
            Submit a complaint — AI will help classify and route it
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="btn-secondary text-sm">
            Logout
          </button>
        </div>
      </header>

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="glass-panel p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Complaint Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className="glass-input w-full"
              placeholder="Brief description of the issue"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={500}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              className="glass-input w-full min-h-[120px] resize-y"
              placeholder="Provide details about the issue — location, impact, any relevant context"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              maxLength={10000}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Category <span className="text-gray-500">(optional)</span>
            </label>
            <select
              className="glass-input w-full"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— Select a category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Campus Zone */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Campus Zone / Location{" "}
              <span className="text-gray-500">(optional)</span>
            </label>
            <select
              className="glass-input w-full"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
            >
              <option value="">— Select a location —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                  {z.zone_type ? ` (${z.zone_type})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Attachment */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Attachment <span className="text-gray-500">(optional)</span>
            </label>
            <input
              type="file"
              className="glass-input w-full text-sm"
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.txt"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <p className="text-gray-500 text-xs mt-1">
              Supported: images (JPG, PNG, GIF, WebP), PDF, DOC/DOCX, TXT.
              Max 10 MB.
            </p>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2.5 text-green-400 text-sm">
              {success}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !title.trim() || !description.trim()}
            className="btn-primary w-full"
          >
            {submitting ? "Submitting..." : "Submit Complaint"}
          </button>

          <p className="text-gray-500 text-xs text-center">
            Your complaint will be saved securely. AI triage may run after
            submission to classify and route the issue.
          </p>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  OrgSettings,
  configGetOrgSettings,
  configUpdateOrgSettings,
} from "@/lib/config";

export default function OrgSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "super_admin") {
          router.replace("/login");
          return;
        }
        setUser(u);
        loadSettings();
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "Unauthorized") {
          clearToken();
        }
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function loadSettings() {
    try {
      setError(null);
      const data = await configGetOrgSettings();
      setSettings(data);
      setFormName(data.name);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setSuccess(false);
    try {
      const updated = await configUpdateOrgSettings({
        name: formName.trim(),
      });
      setSettings(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
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
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <Link
            href="/super-admin"
            className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block"
          >
            &larr; Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold">Organization Settings</h1>
          <p className="text-gray-400 text-sm">
            Configure your organization&apos;s name and identity
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="btn-secondary text-sm">
            Logout
          </button>
        </div>
      </header>

      {error && (
        <div className="glass-panel border-red-500/50 p-4 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Settings Form */}
      <div className="glass-panel p-6 max-w-xl">
        <h2 className="text-lg font-semibold mb-4">Organization Information</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Organization Name
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              className="glass-input w-full"
              placeholder="e.g. SentraAI University"
            />
            <p className="text-gray-500 text-xs mt-1">
              This name appears in notifications, reports, and the dashboard header.
            </p>
          </div>

          {settings && (
            <div className="border-t border-glass-border pt-4">
              <p className="text-gray-500 text-xs">
                Organization ID:{" "}
                <span className="font-mono text-gray-400">
                  {settings.id}
                </span>
              </p>
              {settings.description && (
                <p className="text-gray-500 text-xs mt-1">
                  Description: {settings.description}
                </p>
              )}
            </div>
          )}

          {formError && (
            <p className="text-red-400 text-sm">{formError}</p>
          )}
          {success && (
            <p className="text-green-400 text-sm">Settings saved successfully.</p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || !formName.trim()}
              className="btn-primary text-sm"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Future settings notice */}
      <div className="glass-panel p-6 mt-4 max-w-xl">
        <h3 className="text-sm font-medium text-gray-400 mb-2">
          Additional Settings (Future)
        </h3>
        <ul className="text-gray-500 text-sm space-y-1">
          <li>• Theme customization</li>
          <li>• Custom labels and terminology</li>
          <li>• Notification templates</li>
          <li>• Response templates</li>
          <li>• AI model configuration</li>
        </ul>
        <p className="text-gray-600 text-xs mt-3">
          These features are planned for future releases.
        </p>
      </div>
    </div>
  );
}

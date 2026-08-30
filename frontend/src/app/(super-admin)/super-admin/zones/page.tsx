"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  ConfigZone,
  configListZones,
  configCreateZone,
  configUpdateZone,
  configDeleteZone,
} from "@/lib/config";

const ZONE_TYPES = [
  { value: "", label: "— Select type —" },
  { value: "building", label: "Building" },
  { value: "hostel", label: "Hostel" },
  { value: "academic", label: "Academic Block" },
  { value: "outdoor", label: "Outdoor" },
  { value: "parking", label: "Parking" },
  { value: "other", label: "Other" },
];

export default function ZoneManagement() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<ConfigZone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState("");
  const [formPolygon, setFormPolygon] = useState<number[][]>([]);
  const [polygonText, setPolygonText] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showJsonEditor, setShowJsonEditor] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "super_admin") {
          router.replace("/login");
          return;
        }
        setUser(u);
        loadZones();
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "Unauthorized") {
          clearToken();
        }
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function loadZones() {
    try {
      setError(null);
      const data = await configListZones();
      setZones(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load zones");
    }
  }

  function openAddForm() {
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setFormType("");
    setFormPolygon([]);
    setPolygonText("");
    setFormError(null);
    setShowJsonEditor(false);
    setShowForm(true);
  }

  function openEditForm(zone: ConfigZone) {
    setEditingId(zone.id);
    setFormName(zone.name);
    setFormDesc(zone.description || "");
    setFormType(zone.zone_type || "");
    setFormPolygon(zone.polygon_json || []);
    setPolygonText(JSON.stringify(zone.polygon_json || [], null, 2));
    setFormError(null);
    setShowJsonEditor(false);
    setShowForm(true);
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 840);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 600);
    const updated = [...formPolygon, [x, y]];
    setFormPolygon(updated);
    setPolygonText(JSON.stringify(updated, null, 2));
  }

  function handlePolygonTextChange(text: string) {
    setPolygonText(text);
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.every((p: unknown) => Array.isArray(p))) {
        setFormPolygon(parsed as number[][]);
        setFormError(null);
      }
    } catch {
      // Invalid JSON — user is still typing
    }
  }

  function removeLastPoint() {
    const updated = formPolygon.slice(0, -1);
    setFormPolygon(updated);
    setPolygonText(JSON.stringify(updated, null, 2));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    // Validate polygon if provided
    if (formPolygon.length > 0 && formPolygon.length < 3) {
      setFormError("Polygon must have at least 3 points");
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        await configUpdateZone(editingId, {
          name: formName.trim(),
          description: formDesc.trim() || null,
          zone_type: formType || null,
          polygon_json: formPolygon.length >= 3 ? formPolygon : null,
        });
      } else {
        await configCreateZone({
          name: formName.trim(),
          description: formDesc.trim() || null,
          zone_type: formType || null,
          polygon_json: formPolygon.length >= 3 ? formPolygon : null,
        });
      }
      setShowForm(false);
      await loadZones();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(zone: ConfigZone) {
    try {
      await configUpdateZone(zone.id, { is_active: !zone.is_active });
      await loadZones();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleDelete(zone: ConfigZone) {
    if (!confirm(`Delete zone "${zone.name}"? This cannot be undone.`)) return;
    try {
      await configDeleteZone(zone.id);
      await loadZones();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const renderPolygonPreview = useCallback(
    (polygon: number[][] | null) => {
      if (!polygon || polygon.length < 3) return null;
      const points = polygon.map((p) => `${p[0]},${p[1]}`).join(" ");
      return (
        <svg viewBox="0 0 840 600" className="w-16 h-12">
          <polygon
            points={points}
            fill="rgba(59, 130, 246, 0.3)"
            stroke="rgba(59, 130, 246, 0.8)"
            strokeWidth="2"
          />
        </svg>
      );
    },
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-panel-glow px-10 py-8 text-center">
          <div className="w-8 h-8 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      user={user}
      role="super_admin"
      title="Campus Zone Management"
      subtitle="Configure campus zones, buildings, and areas for the heatmap"
    >
      {error && (
        <div className="glass-panel border-red-500/50 p-4 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Add button */}
      <div className="flex justify-end mb-4">
        <button onClick={openAddForm} className="btn-primary text-sm">
          + Add Zone
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="glass-panel p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? "Edit Zone" : "Add Zone"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Zone Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="glass-input w-full"
                  placeholder="e.g. Main Library"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Zone Type
                </label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="glass-input w-full"
                >
                  {ZONE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Description
              </label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="glass-input w-full min-h-[60px]"
                placeholder="Optional description"
              />
            </div>

            {/* Polygon Editor */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm text-gray-400">
                  Polygon Boundary ({formPolygon.length} points)
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowJsonEditor(!showJsonEditor)}
                    className="text-blue-400 hover:text-blue-300 text-xs"
                  >
                    {showJsonEditor ? "Visual Editor" : "JSON Editor"}
                  </button>
                  {formPolygon.length > 0 && (
                    <button
                      type="button"
                      onClick={removeLastPoint}
                      className="text-orange-400 hover:text-orange-300 text-xs"
                    >
                      Remove Last Point
                    </button>
                  )}
                </div>
              </div>

              {showJsonEditor ? (
                <textarea
                  value={polygonText}
                  onChange={(e) => handlePolygonTextChange(e.target.value)}
                  className="glass-input w-full min-h-[120px] font-mono text-xs"
                  placeholder='[[100,100],[200,100],[200,200],[100,200]]'
                />
              ) : (
                <div className="border border-glass-border rounded-lg overflow-hidden">
                  <svg
                    viewBox="0 0 840 600"
                    className="w-full bg-navy-800 cursor-crosshair"
                    style={{ minHeight: "200px" }}
                    onClick={handleSvgClick}
                  >
                    {/* Grid */}
                    {[0, 100, 200, 300, 400, 500, 600, 700, 800].map(
                      (x) => (
                        <line
                          key={`v${x}`}
                          x1={x}
                          y1={0}
                          x2={x}
                          y2={600}
                          stroke="rgba(255,255,255,0.03)"
                          strokeWidth="1"
                        />
                      )
                    )}
                    {[0, 100, 200, 300, 400, 500].map((y) => (
                      <line
                        key={`h${y}`}
                        x1={0}
                        y1={y}
                        x2={840}
                        y2={y}
                        stroke="rgba(255,255,255,0.03)"
                        strokeWidth="1"
                      />
                    ))}
                    {/* Polygon */}
                    {formPolygon.length >= 3 && (
                      <polygon
                        points={formPolygon
                          .map((p) => `${p[0]},${p[1]}`)
                          .join(" ")}
                        fill="rgba(59, 130, 246, 0.2)"
                        stroke="rgba(59, 130, 246, 0.8)"
                        strokeWidth="2"
                      />
                    )}
                    {/* Points */}
                    {formPolygon.map((p, i) => (
                      <circle
                        key={i}
                        cx={p[0]}
                        cy={p[1]}
                        r="4"
                        fill="#3b82f6"
                        stroke="white"
                        strokeWidth="1"
                      />
                    ))}
                    {/* Instruction */}
                    {formPolygon.length === 0 && (
                      <text
                        x="420"
                        y="300"
                        textAnchor="middle"
                        fill="rgba(255,255,255,0.3)"
                        fontSize="14"
                      >
                        Click to add polygon points (min 3)
                      </text>
                    )}
                  </svg>
                </div>
              )}
            </div>

            {formError && (
              <p className="text-red-400 text-sm">{formError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving || !formName.trim()}
                className="btn-primary text-sm"
              >
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-glass-border">
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Zone
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Type
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Preview
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Status
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {zones.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    No zones configured yet.
                  </td>
                </tr>
              ) : (
                zones.map((zone) => (
                  <tr
                    key={zone.id}
                    className="border-b border-glass-border/50 hover:bg-glass-hover transition-colors"
                  >
                    <td className="p-4">
                      <div className="font-medium">{zone.name}</div>
                      {zone.description && (
                        <div className="text-gray-500 text-sm mt-0.5">
                          {zone.description}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="text-gray-400 text-sm capitalize">
                        {zone.zone_type || "—"}
                      </span>
                    </td>
                    <td className="p-4">
                      {renderPolygonPreview(zone.polygon_json) || (
                        <span className="text-gray-500 text-xs">
                          No boundary
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          zone.is_active
                            ? "bg-green-500/20 text-green-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {zone.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditForm(zone)}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(zone)}
                          className={`text-sm ${
                            zone.is_active
                              ? "text-orange-400 hover:text-orange-300"
                              : "text-green-400 hover:text-green-300"
                          }`}
                        >
                          {zone.is_active ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => handleDelete(zone)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

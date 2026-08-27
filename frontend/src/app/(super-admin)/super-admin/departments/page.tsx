"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  ConfigDepartment,
  configListDepartments,
  configCreateDepartment,
  configUpdateDepartment,
} from "@/lib/config";

export default function DepartmentManagement() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<ConfigDepartment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
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
        loadDepartments();
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "Unauthorized") {
          clearToken();
        }
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function loadDepartments() {
    try {
      setError(null);
      const data = await configListDepartments();
      setDepartments(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load departments");
    }
  }

  function openAddForm() {
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(dept: ConfigDepartment) {
    setEditingId(dept.id);
    setFormName(dept.name);
    setFormDesc(dept.description || "");
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await configUpdateDepartment(editingId, {
          name: formName.trim(),
          description: formDesc.trim() || null,
        });
      } else {
        await configCreateDepartment({
          name: formName.trim(),
          description: formDesc.trim() || null,
        });
      }
      setShowForm(false);
      await loadDepartments();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(dept: ConfigDepartment) {
    try {
      await configUpdateDepartment(dept.id, { is_active: !dept.is_active });
      await loadDepartments();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
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
          <h1 className="text-2xl font-bold">Department Management</h1>
          <p className="text-gray-400 text-sm">
            Manage organizational departments and assigned admins
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

      {/* Add button */}
      <div className="flex justify-end mb-4">
        <button onClick={openAddForm} className="btn-primary text-sm">
          + Add Department
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="glass-panel p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? "Edit Department" : "Add Department"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Department Name
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="glass-input w-full"
                placeholder="e.g. IT Department"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Description
              </label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="glass-input w-full min-h-[80px]"
                placeholder="Optional description"
              />
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
                  Department Name
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Status
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Assigned Admins
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {departments.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="p-8 text-center text-gray-500"
                  >
                    No departments configured yet.
                  </td>
                </tr>
              ) : (
                departments.map((dept) => (
                  <tr
                    key={dept.id}
                    className="border-b border-glass-border/50 hover:bg-glass-hover transition-colors"
                  >
                    <td className="p-4">
                      <div className="font-medium">{dept.name}</div>
                      {dept.description && (
                        <div className="text-gray-500 text-sm mt-0.5">
                          {dept.description}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          dept.is_active
                            ? "bg-green-500/20 text-green-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {dept.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="p-4">
                      {dept.assigned_admins.length === 0 ? (
                        <span className="text-gray-500 text-sm">
                          No admins assigned
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {dept.assigned_admins.map((a) => (
                            <span
                              key={a.id}
                              className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs"
                            >
                              {a.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditForm(dept)}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(dept)}
                          className={`text-sm ${
                            dept.is_active
                              ? "text-orange-400 hover:text-orange-300"
                              : "text-green-400 hover:text-green-300"
                          }`}
                        >
                          {dept.is_active ? "Disable" : "Enable"}
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
    </div>
  );
}

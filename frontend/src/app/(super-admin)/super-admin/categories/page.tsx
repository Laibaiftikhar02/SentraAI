"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  ConfigCategory,
  ConfigDepartment,
  configListCategories,
  configCreateCategory,
  configUpdateCategory,
  configListDepartments,
} from "@/lib/config";

export default function CategoryManagement() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<ConfigCategory[]>([]);
  const [departments, setDepartments] = useState<ConfigDepartment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formDeptId, setFormDeptId] = useState("");
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
        loadData();
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "Unauthorized") {
          clearToken();
        }
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function loadData() {
    try {
      setError(null);
      const [cats, depts] = await Promise.all([
        configListCategories(),
        configListDepartments(),
      ]);
      setCategories(cats);
      setDepartments(depts);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    }
  }

  function openAddForm() {
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setFormDeptId("");
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(cat: ConfigCategory) {
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormDesc(cat.description || "");
    setFormDeptId(cat.mapped_department_id || "");
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await configUpdateCategory(editingId, {
          name: formName.trim(),
          description: formDesc.trim() || null,
          department_id: formDeptId || null,
        });
      } else {
        await configCreateCategory({
          name: formName.trim(),
          description: formDesc.trim() || null,
          department_id: formDeptId || null,
        });
      }
      setShowForm(false);
      await loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(cat: ConfigCategory) {
    try {
      await configUpdateCategory(cat.id, { is_active: !cat.is_active });
      await loadData();
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
          <h1 className="text-2xl font-bold">Category Management</h1>
          <p className="text-gray-400 text-sm">
            Manage complaint categories and their mapped departments
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
          + Add Category
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="glass-panel p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? "Edit Category" : "Add Category"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Category Name
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="glass-input w-full"
                placeholder="e.g. Network Issue"
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
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Mapped Department
              </label>
              <select
                value={formDeptId}
                onChange={(e) => setFormDeptId(e.target.value)}
                className="glass-input w-full"
              >
                <option value="">— No mapping —</option>
                {departments
                  .filter((d) => d.is_active)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
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
                  Category
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Mapped Department
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
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    No categories configured yet.
                  </td>
                </tr>
              ) : (
                categories.map((cat) => (
                  <tr
                    key={cat.id}
                    className="border-b border-glass-border/50 hover:bg-glass-hover transition-colors"
                  >
                    <td className="p-4">
                      <div className="font-medium">{cat.name}</div>
                      {cat.description && (
                        <div className="text-gray-500 text-sm mt-0.5">
                          {cat.description}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      {cat.mapped_department_name ? (
                        <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs">
                          {cat.mapped_department_name}
                        </span>
                      ) : (
                        <span className="text-gray-500 text-sm">
                          Unmapped
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          cat.is_active
                            ? "bg-green-500/20 text-green-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {cat.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditForm(cat)}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(cat)}
                          className={`text-sm ${
                            cat.is_active
                              ? "text-orange-400 hover:text-orange-300"
                              : "text-green-400 hover:text-green-300"
                          }`}
                        >
                          {cat.is_active ? "Disable" : "Enable"}
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

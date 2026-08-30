"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  ConfigAdmin,
  ConfigDepartment,
  configListAdmins,
  configCreateAdmin,
  configUpdateAdmin,
  configListDepartments,
} from "@/lib/config";

export default function AdminManagement() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<ConfigAdmin[]>([]);
  const [departments, setDepartments] = useState<ConfigDepartment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formDeptIds, setFormDeptIds] = useState<string[]>([]);
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
      const [adm, depts] = await Promise.all([
        configListAdmins(),
        configListDepartments(),
      ]);
      setAdmins(adm);
      setDepartments(depts);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    }
  }

  function openAddForm() {
    setEditingId(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormDeptIds([]);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(admin: ConfigAdmin) {
    setEditingId(admin.id);
    setFormName(admin.name);
    setFormEmail(admin.email);
    setFormPassword("");
    setFormDeptIds(admin.departments.map((d) => d.id));
    setFormError(null);
    setShowForm(true);
  }

  function toggleDeptSelection(deptId: string) {
    setFormDeptIds((prev) =>
      prev.includes(deptId)
        ? prev.filter((id) => id !== deptId)
        : [...prev, deptId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await configUpdateAdmin(editingId, {
          name: formName.trim(),
          department_ids: formDeptIds,
        });
      } else {
        if (formPassword.length < 8) {
          setFormError("Password must be at least 8 characters");
          setSaving(false);
          return;
        }
        await configCreateAdmin({
          email: formEmail.trim(),
          name: formName.trim(),
          password: formPassword,
          department_ids: formDeptIds,
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

  async function toggleActive(admin: ConfigAdmin) {
    try {
      await configUpdateAdmin(admin.id, { is_active: !admin.is_active });
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

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
      title="Admin Management"
      subtitle="Create and manage Department Admin accounts"
    >
      {error && (
        <div className="glass-panel border-red-500/50 p-4 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Add button */}
      <div className="flex justify-end mb-4">
        <button onClick={openAddForm} className="btn-primary text-sm">
          + Create Admin
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="glass-panel p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? "Edit Admin" : "Create Admin"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="glass-input w-full"
                placeholder="Admin name"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                required
                disabled={!!editingId}
                className="glass-input w-full disabled:opacity-50"
                placeholder="admin@organization.com"
              />
            </div>
            {!editingId && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  required
                  minLength={8}
                  className="glass-input w-full"
                  placeholder="Minimum 8 characters"
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Department Assignments
              </label>
              <div className="flex flex-wrap gap-2">
                {departments
                  .filter((d) => d.is_active)
                  .map((dept) => (
                    <button
                      key={dept.id}
                      type="button"
                      onClick={() => toggleDeptSelection(dept.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        formDeptIds.includes(dept.id)
                          ? "bg-blue-600 border-blue-500 text-white"
                          : "bg-glass border-glass-border text-gray-400 hover:text-white"
                      }`}
                    >
                      {dept.name}
                    </button>
                  ))}
                {departments.filter((d) => d.is_active).length === 0 && (
                  <p className="text-gray-500 text-sm">
                    No active departments. Create departments first.
                  </p>
                )}
              </div>
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
                  Admin Name
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Email
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Department
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
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    No admin accounts created yet.
                  </td>
                </tr>
              ) : (
                admins.map((admin) => (
                  <tr
                    key={admin.id}
                    className="border-b border-glass-border/50 hover:bg-glass-hover transition-colors"
                  >
                    <td className="p-4 font-medium">{admin.name}</td>
                    <td className="p-4 text-gray-400 text-sm">
                      {admin.email}
                    </td>
                    <td className="p-4">
                      {admin.departments.length === 0 ? (
                        <span className="text-gray-500 text-sm">
                          Unassigned
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {admin.departments.map((d) => (
                            <span
                              key={d.id}
                              className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs"
                            >
                              {d.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          admin.is_active
                            ? "bg-green-500/20 text-green-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {admin.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditForm(admin)}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(admin)}
                          className={`text-sm ${
                            admin.is_active
                              ? "text-orange-400 hover:text-orange-300"
                              : "text-green-400 hover:text-green-300"
                          }`}
                        >
                          {admin.is_active ? "Disable" : "Enable"}
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

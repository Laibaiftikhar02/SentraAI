/**
 * Super Admin configuration API types and helper functions (Phase 6).
 * Covers: departments, categories, admin accounts, campus zones, org settings.
 */
import { api } from "./api";

// ── Department Types ──────────────────────────────────────────────────────────

export interface ConfigDepartment {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  assigned_admins: { id: string; name: string }[];
}

export interface DepartmentCreateBody {
  name: string;
  description?: string | null;
}

export interface DepartmentUpdateBody {
  name?: string | null;
  description?: string | null;
  is_active?: boolean | null;
}

// ── Category Types ────────────────────────────────────────────────────────────

export interface ConfigCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  mapped_department_id: string | null;
  mapped_department_name: string | null;
}

export interface CategoryCreateBody {
  name: string;
  description?: string | null;
  department_id?: string | null;
}

export interface CategoryUpdateBody {
  name?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  department_id?: string | null;
}

// ── Admin Types ───────────────────────────────────────────────────────────────

export interface ConfigAdmin {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  departments: { id: string; name: string }[];
}

export interface AdminCreateBody {
  email: string;
  name: string;
  password: string;
  department_ids: string[];
}

export interface AdminUpdateBody {
  name?: string | null;
  is_active?: boolean | null;
  department_ids?: string[] | null;
}

// ── Zone Types ────────────────────────────────────────────────────────────────

export interface ConfigZone {
  id: string;
  name: string;
  description: string | null;
  zone_type: string | null;
  polygon_json: number[][] | null;
  is_active: boolean;
}

export interface ZoneCreateBody {
  name: string;
  description?: string | null;
  zone_type?: string | null;
  polygon_json?: number[][] | null;
}

export interface ZoneUpdateBody {
  name?: string | null;
  description?: string | null;
  zone_type?: string | null;
  polygon_json?: number[][] | null;
  is_active?: boolean | null;
}

// ── Org Settings Types ────────────────────────────────────────────────────────

export interface OrgSettings {
  id: string;
  name: string;
  description: string | null;
}

export interface OrgSettingsUpdateBody {
  name?: string | null;
}

// ══════════════════════════════════════════════════════════════════════════════
// API Functions
// ══════════════════════════════════════════════════════════════════════════════

// ── Departments ───────────────────────────────────────────────────────────────

export async function configListDepartments(): Promise<ConfigDepartment[]> {
  return api.get<ConfigDepartment[]>("/config/departments");
}

export async function configCreateDepartment(
  body: DepartmentCreateBody
): Promise<ConfigDepartment> {
  return api.post<ConfigDepartment>("/config/departments", body);
}

export async function configUpdateDepartment(
  id: string,
  body: DepartmentUpdateBody
): Promise<ConfigDepartment> {
  return api.patch<ConfigDepartment>(`/config/departments/${id}`, body);
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function configListCategories(): Promise<ConfigCategory[]> {
  return api.get<ConfigCategory[]>("/config/categories");
}

export async function configCreateCategory(
  body: CategoryCreateBody
): Promise<ConfigCategory> {
  return api.post<ConfigCategory>("/config/categories", body);
}

export async function configUpdateCategory(
  id: string,
  body: CategoryUpdateBody
): Promise<ConfigCategory> {
  return api.patch<ConfigCategory>(`/config/categories/${id}`, body);
}

// ── Admins ────────────────────────────────────────────────────────────────────

export async function configListAdmins(): Promise<ConfigAdmin[]> {
  return api.get<ConfigAdmin[]>("/config/admins");
}

export async function configCreateAdmin(
  body: AdminCreateBody
): Promise<ConfigAdmin> {
  return api.post<ConfigAdmin>("/config/admins", body);
}

export async function configUpdateAdmin(
  id: string,
  body: AdminUpdateBody
): Promise<ConfigAdmin> {
  return api.patch<ConfigAdmin>(`/config/admins/${id}`, body);
}

// ── Zones ─────────────────────────────────────────────────────────────────────

export async function configListZones(): Promise<ConfigZone[]> {
  return api.get<ConfigZone[]>("/config/zones");
}

export async function configCreateZone(
  body: ZoneCreateBody
): Promise<ConfigZone> {
  return api.post<ConfigZone>("/config/zones", body);
}

export async function configUpdateZone(
  id: string,
  body: ZoneUpdateBody
): Promise<ConfigZone> {
  return api.patch<ConfigZone>(`/config/zones/${id}`, body);
}

export async function configDeleteZone(id: string): Promise<void> {
  return api.delete<void>(`/config/zones/${id}`);
}

// ── Organization Settings ─────────────────────────────────────────────────────

export async function configGetOrgSettings(): Promise<OrgSettings> {
  return api.get<OrgSettings>("/config/org");
}

export async function configUpdateOrgSettings(
  body: OrgSettingsUpdateBody
): Promise<OrgSettings> {
  return api.patch<OrgSettings>("/config/org", body);
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  getHeatmapData,
  HeatmapZone,
  HeatmapMarker,
} from "@/lib/complaints";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Map heatIntensity (0–1) to an RGBA fill color.
 *  0 = transparent/neutral; 1 = warm red/orange.
 *  PMD §18.1: "Heat is not a priority score. Heat = issue concentration / impact."
 */
function heatColor(intensity: number): string {
  if (intensity <= 0) return "rgba(255,255,255,0.02)";
  // Gradient: blue-ish (low) → yellow (mid) → red-orange (high)
  if (intensity < 0.33) {
    const t = intensity / 0.33;
    return `rgba(59, 130, 246, ${0.08 + t * 0.15})`; // blue
  } else if (intensity < 0.66) {
    const t = (intensity - 0.33) / 0.33;
    return `rgba(234, 179, 8, ${0.15 + t * 0.2})`; // yellow
  } else {
    const t = (intensity - 0.66) / 0.34;
    return `rgba(239, 68, 68, ${0.2 + t * 0.3})`; // red
  }
}

/** Map heatIntensity to a stroke color for zone borders. */
function heatStroke(intensity: number): string {
  if (intensity <= 0) return "rgba(255,255,255,0.15)";
  if (intensity < 0.33) return "rgba(59, 130, 246, 0.4)";
  if (intensity < 0.66) return "rgba(234, 179, 8, 0.5)";
  return "rgba(239, 68, 68, 0.5)";
}

/** Urgency marker fill color — PMD §18.1 markers: Critical=red, High=orange, Medium=yellow, Low=green. */
function markerFill(urgency: string): string {
  switch (urgency) {
    case "critical":
      return "#ef4444";
    case "high":
      return "#f97316";
    case "medium":
      return "#eab308";
    case "low":
      return "#22c55e";
    default:
      return "#6b7280";
  }
}

function urgencyLabel(u: string): string {
  return u.charAt(0).toUpperCase() + u.slice(1);
}

function polygonPoints(polygon: number[][]): string {
  return polygon.map((p) => `${p[0]},${p[1]}`).join(" ");
}

// ── SVG ViewBox (matches seed data coordinate space) ──────────────────────────
const SVG_WIDTH = 840;
const SVG_HEIGHT = 600;

// ── Component ─────────────────────────────────────────────────────────────────

export default function CampusHeatmap() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<HeatmapZone[]>([]);
  const [markers, setMarkers] = useState<HeatmapMarker[]>([]);

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    content: React.ReactNode;
  } | null>(null);

  // Selected zone (for side panel)
  const [selectedZone, setSelectedZone] = useState<HeatmapZone | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "admin" && u.role !== "super_admin") {
          router.replace("/login");
          return;
        }
        setUser(u);
        getHeatmapData()
          .then((data) => {
            setZones(data.zones);
            setMarkers(data.markers);
          })
          .catch((err) => setError(err.message || "Failed to load heatmap"));
      })
      .catch(() => {
        clearToken();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  // Zone hover → show tooltip
  const handleZoneHover = useCallback(
    (e: React.MouseEvent<SVGPolygonElement>, zone: HeatmapZone) => {
      const rect = (
        e.currentTarget.closest("svg") as SVGSVGElement
      ).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setTooltip({
        x,
        y,
        content: (
          <div className="text-xs space-y-1">
            <p className="font-semibold text-white">{zone.zoneName}</p>
            <p className="text-gray-300">
              Reports: <span className="text-white">{zone.totalReports}</span>
            </p>
            <p className="text-gray-300">
              Distinct Issues:{" "}
              <span className="text-white">{zone.distinctIssueClusters}</span>
            </p>
            <div className="text-gray-300">
              <span className="text-urgency-critical">
                {zone.urgencyDistribution.critical}C
              </span>{" "}
              <span className="text-urgency-high">
                {zone.urgencyDistribution.high}H
              </span>{" "}
              <span className="text-urgency-medium">
                {zone.urgencyDistribution.medium}M
              </span>{" "}
              <span className="text-urgency-low">
                {zone.urgencyDistribution.low}L
              </span>
            </div>
          </div>
        ),
      });
    },
    []
  );

  const handleZoneClick = useCallback(
    (zone: HeatmapZone) => {
      setSelectedZone(zone);
    },
    []
  );

  // Marker hover → show tooltip
  const handleMarkerHover = useCallback(
    (e: React.MouseEvent<SVGGElement>, marker: HeatmapMarker) => {
      const rect = (
        e.currentTarget.closest("svg") as SVGSVGElement
      ).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setTooltip({
        x,
        y,
        content: (
          <div className="text-xs space-y-1">
            <p className="font-semibold text-white">
              {marker.markerType === "duplicate_cluster"
                ? `Cluster (${marker.reportCount} reports)`
                : "Complaint"}
            </p>
            <p
              className={`font-medium ${
                marker.urgency === "critical"
                  ? "text-urgency-critical"
                  : marker.urgency === "high"
                  ? "text-urgency-high"
                  : marker.urgency === "medium"
                  ? "text-urgency-medium"
                  : "text-urgency-low"
              }`}
            >
              {urgencyLabel(marker.urgency)} Urgency
            </p>
            {marker.summary && (
              <p className="text-gray-400 line-clamp-2">{marker.summary}</p>
            )}
            {marker.category && (
              <p className="text-gray-400">Category: {marker.category}</p>
            )}
            {marker.department && (
              <p className="text-gray-400">Dept: {marker.department}</p>
            )}
            {marker.confidence != null && (
              <p className="text-gray-400">
                Confidence: {Math.round(marker.confidence * 100)}%
              </p>
            )}
          </div>
        ),
      });
    },
    []
  );

  const handleMarkerClick = useCallback(
    (marker: HeatmapMarker) => {
      if (marker.markerType === "complaint" && marker.complaintId) {
        router.push(`/admin/complaints/${marker.complaintId}`);
      } else if (
        marker.markerType === "duplicate_cluster" &&
        marker.clusterId
      ) {
        // Navigate to first complaint in the cluster
        if (marker.complaintIds && marker.complaintIds.length > 0) {
          router.push(`/admin/complaints/${marker.complaintIds[0]}`);
        }
      }
    },
    [router]
  );

  const handleZoneNavigate = useCallback(
    (zone: HeatmapZone) => {
      router.push(`/admin/inbox?zone=${zone.zoneId}`);
    },
    [router]
  );

  // Total stats for header
  const totalReports = zones.reduce((s, z) => s + z.totalReports, 0);
  const totalClusters = zones.reduce(
    (s, z) => s + z.distinctIssueClusters,
    0
  );
  const activeZones = zones.filter((z) => z.totalReports > 0).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-panel px-8 py-6">
          <p className="text-gray-400">Loading heatmap...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-panel px-8 py-6 text-center">
          <p className="text-red-400 mb-3">{error}</p>
          <Link href="/admin/dashboard" className="btn-secondary text-sm">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Campus Heatmap</h1>
          <p className="text-gray-400 text-sm">
            Issue concentration &amp; urgency visualization &bull;{" "}
            {totalReports} reports across {activeZones}/{zones.length} zones
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/dashboard" className="btn-secondary text-sm">
            Dashboard
          </Link>
          <Link href="/admin/inbox" className="btn-secondary text-sm">
            Inbox
          </Link>
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="btn-secondary text-sm">
            Logout
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* ── SVG Map (3/4 width) ──────────────────────────────────────── */}
        <div className="lg:col-span-3 glass-panel p-4">
          <div className="relative w-full" style={{ aspectRatio: `${SVG_WIDTH}/${SVG_HEIGHT}` }}>
            <svg
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className="w-full h-full"
              style={{ background: "rgba(10,14,26,0.8)" }}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Grid lines for visual reference */}
              <defs>
                <pattern
                  id="grid"
                  width="50"
                  height="50"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 50 0 L 0 0 0 50"
                    fill="none"
                    stroke="rgba(255,255,255,0.03)"
                    strokeWidth="0.5"
                  />
                </pattern>
              </defs>
              <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="url(#grid)" />

              {/* ── Zone Polygons ─────────────────────────────────────── */}
              {zones.map((zone) => {
                if (!zone.polygon || zone.polygon.length < 3) return null;
                const isSelected =
                  selectedZone?.zoneId === zone.zoneId;
                return (
                  <g key={zone.zoneId}>
                    {/* Zone fill (heat layer) */}
                    <polygon
                      points={polygonPoints(zone.polygon)}
                      fill={heatColor(zone.heatIntensity)}
                      stroke={
                        isSelected
                          ? "rgba(96,165,250,0.8)"
                          : heatStroke(zone.heatIntensity)
                      }
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      className="cursor-pointer transition-all duration-200"
                      onMouseMove={(e) => handleZoneHover(e, zone)}
                      onMouseLeave={() => setTooltip(null)}
                      onClick={() => handleZoneClick(zone)}
                    />
                    {/* Zone label (compact summary) */}
                    <text
                      x={zone.centroid[0]}
                      y={zone.centroid[1] - 15}
                      textAnchor="middle"
                      className="pointer-events-none select-none"
                      fill="rgba(255,255,255,0.85)"
                      fontSize="12"
                      fontWeight="600"
                    >
                      {zone.zoneName}
                    </text>
                    <text
                      x={zone.centroid[0]}
                      y={zone.centroid[1] + 2}
                      textAnchor="middle"
                      className="pointer-events-none select-none"
                      fill="rgba(255,255,255,0.5)"
                      fontSize="10"
                    >
                      {zone.totalReports > 0
                        ? `${zone.totalReports} reports · ${zone.distinctIssueClusters} issues`
                        : "No reports"}
                    </text>
                    {zone.totalReports > 0 && (
                      <text
                        x={zone.centroid[0]}
                        y={zone.centroid[1] + 16}
                        textAnchor="middle"
                        className="pointer-events-none select-none"
                        fill="rgba(255,255,255,0.4)"
                        fontSize="9"
                      >
                        {zone.urgencyDistribution.critical > 0 && (
                          <tspan fill="#ef4444">
                            {zone.urgencyDistribution.critical}C{" "}
                          </tspan>
                        )}
                        {zone.urgencyDistribution.high > 0 && (
                          <tspan fill="#f97316">
                            {zone.urgencyDistribution.high}H{" "}
                          </tspan>
                        )}
                        {zone.urgencyDistribution.medium > 0 && (
                          <tspan fill="#eab308">
                            {zone.urgencyDistribution.medium}M{" "}
                          </tspan>
                        )}
                        {zone.urgencyDistribution.low > 0 && (
                          <tspan fill="#22c55e">
                            {zone.urgencyDistribution.low}L
                          </tspan>
                        )}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* ── Markers ───────────────────────────────────────────── */}
              {markers.map((marker) => {
                const isCluster =
                  marker.markerType === "duplicate_cluster";
                const r = isCluster
                  ? Math.min(16, 8 + marker.reportCount * 1.5)
                  : marker.urgency === "critical"
                  ? 8
                  : 6;
                const fill = markerFill(marker.urgency);
                return (
                  <g
                    key={marker.markerId}
                    className="cursor-pointer"
                    onMouseMove={(e) => handleMarkerHover(e, marker)}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => handleMarkerClick(marker)}
                  >
                    {/* Glow for critical */}
                    {marker.urgency === "critical" && (
                      <circle
                        cx={marker.position[0]}
                        cy={marker.position[1]}
                        r={r + 4}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="1.5"
                        opacity="0.4"
                      />
                    )}
                    {/* Marker circle */}
                    <circle
                      cx={marker.position[0]}
                      cy={marker.position[1]}
                      r={r}
                      fill={fill}
                      stroke="rgba(0,0,0,0.5)"
                      strokeWidth="1"
                      opacity="0.9"
                    />
                    {/* Cluster report count */}
                    {isCluster && marker.reportCount > 1 && (
                      <text
                        x={marker.position[0]}
                        y={marker.position[1] + 3.5}
                        textAnchor="middle"
                        fill="white"
                        fontSize="9"
                        fontWeight="bold"
                        className="pointer-events-none select-none"
                      >
                        {marker.reportCount}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* ── Tooltip overlay ────────────────────────────────────── */}
            {tooltip && (
              <div
                className="absolute z-50 glass-panel px-3 py-2 pointer-events-none"
                style={{
                  left: Math.min(tooltip.x + 12, 600),
                  top: tooltip.y - 10,
                  maxWidth: 260,
                }}
              >
                {tooltip.content}
              </div>
            )}
          </div>

          {/* ── Legend ────────────────────────────────────────────────── */}
          <div className="mt-4 flex flex-wrap gap-6 items-start">
            {/* Heat scale */}
            <div className="glass-panel-light p-3 flex-1 min-w-[220px]">
              <p className="text-xs font-semibold text-gray-300 mb-2">
                Heat = Impact / Concentration
              </p>
              <div className="flex items-center gap-2">
                <div
                  className="h-3 flex-1 rounded"
                  style={{
                    background:
                      "linear-gradient(to right, rgba(59,130,246,0.2), rgba(234,179,8,0.35), rgba(239,68,68,0.5))",
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                <span>Low concentration</span>
                <span>High concentration</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                Based on distinct issue clusters — not raw report count
              </p>
            </div>

            {/* Marker scale */}
            <div className="glass-panel-light p-3 flex-1 min-w-[220px]">
              <p className="text-xs font-semibold text-gray-300 mb-2">
                Markers = Urgency
              </p>
              <div className="flex items-center gap-3">
                {[
                  { label: "Critical", color: "#ef4444" },
                  { label: "High", color: "#f97316" },
                  { label: "Medium", color: "#eab308" },
                  { label: "Low", color: "#22c55e" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-1">
                    <span
                      className="w-3 h-3 rounded-full inline-block"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-[10px] text-gray-400">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                Cluster markers show report count; single markers = one
                complaint
              </p>
            </div>
          </div>
        </div>

        {/* ── Side Panel (1/4 width) ─────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Overview Stats */}
          <div className="glass-panel p-4">
            <h2 className="text-sm font-semibold mb-3">Overview</h2>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-gray-500 text-[10px]">Total Reports</p>
                <p className="text-lg font-bold">{totalReports}</p>
              </div>
              <div>
                <p className="text-gray-500 text-[10px]">Distinct Issues</p>
                <p className="text-lg font-bold">{totalClusters}</p>
              </div>
              <div>
                <p className="text-gray-500 text-[10px]">Active Zones</p>
                <p className="text-lg font-bold">
                  {activeZones}/{zones.length}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-[10px]">Markers</p>
                <p className="text-lg font-bold">{markers.length}</p>
              </div>
            </div>
          </div>

          {/* Selected Zone Detail */}
          {selectedZone ? (
            <div className="glass-panel p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">
                  {selectedZone.zoneName}
                </h2>
                <span className="text-[10px] text-gray-500">
                  {selectedZone.zoneType}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Reports</span>
                  <span className="font-medium">
                    {selectedZone.totalReports}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Distinct Issues</span>
                  <span className="font-medium">
                    {selectedZone.distinctIssueClusters}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Heat Intensity</span>
                  <span className="font-medium">
                    {Math.round(selectedZone.heatIntensity * 100)}%
                  </span>
                </div>
                <div>
                  <p className="text-gray-400 mb-1">Urgency Distribution</p>
                  <div className="flex gap-2">
                    {Object.entries(selectedZone.urgencyDistribution).map(
                      ([key, val]) => (
                        <div key={key} className="text-center flex-1">
                          <p
                            className={`text-sm font-bold ${
                              key === "critical"
                                ? "text-urgency-critical"
                                : key === "high"
                                ? "text-urgency-high"
                                : key === "medium"
                                ? "text-urgency-medium"
                                : "text-urgency-low"
                            }`}
                          >
                            {val}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {urgencyLabel(key)}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleZoneNavigate(selectedZone)}
                  className="btn-primary text-xs flex-1"
                >
                  View Complaints
                </button>
                <button
                  onClick={() => setSelectedZone(null)}
                  className="btn-secondary text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-panel p-4">
              <h2 className="text-sm font-semibold mb-2">Zone Detail</h2>
              <p className="text-gray-500 text-xs">
                Click a zone on the map to view its statistics and navigate to
                its complaints.
              </p>
            </div>
          )}

          {/* Zone List */}
          <div className="glass-panel p-4">
            <h2 className="text-sm font-semibold mb-3">All Zones</h2>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {zones.map((zone) => (
                <button
                  key={zone.zoneId}
                  onClick={() => handleZoneClick(zone)}
                  className={`w-full text-left p-2 rounded-lg transition-colors text-xs ${
                    selectedZone?.zoneId === zone.zoneId
                      ? "bg-blue-500/20 border border-blue-500/30"
                      : "hover:bg-glass-light border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{zone.zoneName}</span>
                    <span className="text-gray-500">
                      {zone.totalReports}
                    </span>
                  </div>
                  {zone.totalReports > 0 && (
                    <div className="flex gap-1.5 mt-0.5">
                      {zone.urgencyDistribution.critical > 0 && (
                        <span className="text-urgency-critical">
                          {zone.urgencyDistribution.critical}C
                        </span>
                      )}
                      {zone.urgencyDistribution.high > 0 && (
                        <span className="text-urgency-high">
                          {zone.urgencyDistribution.high}H
                        </span>
                      )}
                      {zone.urgencyDistribution.medium > 0 && (
                        <span className="text-urgency-medium">
                          {zone.urgencyDistribution.medium}M
                        </span>
                      )}
                      {zone.urgencyDistribution.low > 0 && (
                        <span className="text-urgency-low">
                          {zone.urgencyDistribution.low}L
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Visual rule notice (PMD §18.1) */}
      <div className="mt-4 glass-panel p-3 text-center">
        <p className="text-[10px] text-gray-500">
          Heat colors represent issue concentration / impact —{" "}
          <span className="text-gray-400 font-medium">
            not urgency or priority
          </span>
          . Marker colors represent discrete urgency levels. Report count does
          not inflate heat.
        </p>
      </div>
    </div>
  );
}

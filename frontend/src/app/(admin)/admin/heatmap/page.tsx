"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { CampusHeatmapMap } from "@/components/heatmap/CampusHeatmapMap";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import { getHeatmapData, HeatmapZone, HeatmapMarker } from "@/lib/complaints";

function urgencyLabel(u: string): string {
  return u.charAt(0).toUpperCase() + u.slice(1);
}

export default function CampusHeatmapPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<HeatmapZone[]>([]);
  const [markers, setMarkers] = useState<HeatmapMarker[]>([]);
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
      .catch((err) => {
        if (err instanceof Error && err.message === "Unauthorized") {
          clearToken();
        }
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleMarkerClick = useCallback(
    (marker: HeatmapMarker) => {
      if (marker.markerType === "complaint" && marker.complaintId) {
        router.push(`/admin/complaints/${marker.complaintId}`);
      } else if (
        marker.markerType === "duplicate_cluster" &&
        marker.complaintIds &&
        marker.complaintIds.length > 0
      ) {
        router.push(`/admin/complaints/${marker.complaintIds[0]}`);
      }
    },
    [router]
  );

  const handleZoneNavigate = useCallback(
    (zone: HeatmapZone) => router.push(`/admin/inbox?zone=${zone.zoneId}`),
    [router]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-panel-glow px-10 py-8 text-center">
          <div className="w-8 h-8 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading campus heatmap...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-panel-glow px-10 py-8 text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-secondary text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalReports = zones.reduce((s, z) => s + z.totalReports, 0);
  const totalClusters = zones.reduce((s, z) => s + z.distinctIssueClusters, 0);
  const activeZones = zones.filter((z) => z.totalReports > 0).length;
  const criticalCount = zones.reduce(
    (s, z) => s + z.urgencyDistribution.critical,
    0
  );

  return (
    <AppShell
      user={user}
      role="admin"
      title="Campus Heatmap"
      subtitle="Issue concentration & urgency visualization"
    >
      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 stagger-children">
        <div className="stat-card">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            Total Reports
          </p>
          <p className="text-2xl font-bold mt-1">{totalReports}</p>
        </div>
        <div className="stat-card">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            Distinct Issues
          </p>
          <p className="text-2xl font-bold mt-1 text-accent-cyan">
            {totalClusters}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            Active Zones
          </p>
          <p className="text-2xl font-bold mt-1">
            {activeZones}
            <span className="text-gray-600 text-base font-normal">
              /{zones.length}
            </span>
          </p>
        </div>
        <div className="stat-card">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            Critical
          </p>
          <p className="text-2xl font-bold mt-1 text-urgency-critical">
            {criticalCount}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 glass-panel-glow p-4">
          <CampusHeatmapMap
            zones={zones}
            markers={markers}
            selectedZoneId={selectedZone?.zoneId}
            onZoneClick={setSelectedZone}
            onMarkerClick={handleMarkerClick}
          />
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {selectedZone ? (
            <div className="glass-panel-glow p-4 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">
                  {selectedZone.zoneName}
                </h2>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                  {selectedZone.zoneType}
                </span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center glass-panel-light rounded-lg p-2">
                    <p className="text-lg font-bold">
                      {selectedZone.totalReports}
                    </p>
                    <p className="text-[9px] text-gray-500 uppercase">
                      Reports
                    </p>
                  </div>
                  <div className="text-center glass-panel-light rounded-lg p-2">
                    <p className="text-lg font-bold text-accent-cyan">
                      {selectedZone.distinctIssueClusters}
                    </p>
                    <p className="text-[9px] text-gray-500 uppercase">
                      Issues
                    </p>
                  </div>
                  <div className="text-center glass-panel-light rounded-lg p-2">
                    <p className="text-lg font-bold">
                      {Math.round(selectedZone.heatIntensity * 100)}%
                    </p>
                    <p className="text-[9px] text-gray-500 uppercase">Heat</p>
                  </div>
                </div>

                <div>
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-2">
                    Urgency Breakdown
                  </p>
                  <div className="space-y-1.5">
                    {Object.entries(selectedZone.urgencyDistribution).map(
                      ([key, val]) => {
                        const maxVal = Math.max(
                          ...Object.values(selectedZone.urgencyDistribution),
                          1
                        );
                        const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                        const colorClass =
                          key === "critical"
                            ? "bg-urgency-critical"
                            : key === "high"
                            ? "bg-urgency-high"
                            : key === "medium"
                            ? "bg-urgency-medium"
                            : "bg-urgency-low";
                        const textClass =
                          key === "critical"
                            ? "text-urgency-critical"
                            : key === "high"
                            ? "text-urgency-high"
                            : key === "medium"
                            ? "text-urgency-medium"
                            : "text-urgency-low";
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 w-10 text-right">
                              {urgencyLabel(key)}
                            </span>
                            <div className="flex-1 h-2 rounded-full bg-navy-700 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
                                style={{
                                  width: `${Math.max(pct, val > 0 ? 6 : 0)}%`,
                                }}
                              />
                            </div>
                            <span
                              className={`text-xs font-semibold w-5 text-right ${textClass}`}
                            >
                              {val}
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleZoneNavigate(selectedZone)}
                  className="btn-primary text-xs flex-1 !py-2"
                >
                  View Complaints
                </button>
                <button
                  onClick={() => setSelectedZone(null)}
                  className="btn-secondary text-xs !py-2 !px-3"
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

          {/* Zone list */}
          <div className="glass-panel p-4">
            <h2 className="text-sm font-semibold mb-3">All Zones</h2>
            <div className="space-y-1 max-h-[340px] overflow-y-auto pr-1">
              {zones
                .sort((a, b) => b.totalReports - a.totalReports)
                .map((zone) => (
                  <button
                    key={zone.zoneId}
                    onClick={() => setSelectedZone(zone)}
                    className={`w-full text-left p-2.5 rounded-lg transition-all duration-200 text-xs ${
                      selectedZone?.zoneId === zone.zoneId
                        ? "bg-accent-violet/10 border border-accent-violet/25"
                        : "hover:bg-glass-light border border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{zone.zoneName}</span>
                      {zone.totalReports > 0 && (
                        <span className="text-gray-500 font-medium">
                          {zone.totalReports}
                        </span>
                      )}
                    </div>
                    {zone.totalReports > 0 && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {zone.urgencyDistribution.critical > 0 && (
                          <span className="badge-critical !text-[9px] !px-1.5">
                            {zone.urgencyDistribution.critical}
                          </span>
                        )}
                        {zone.urgencyDistribution.high > 0 && (
                          <span className="badge-high !text-[9px] !px-1.5">
                            {zone.urgencyDistribution.high}
                          </span>
                        )}
                        {zone.urgencyDistribution.medium > 0 && (
                          <span className="badge-medium !text-[9px] !px-1.5">
                            {zone.urgencyDistribution.medium}
                          </span>
                        )}
                        {zone.urgencyDistribution.low > 0 && (
                          <span className="badge-low !text-[9px] !px-1.5">
                            {zone.urgencyDistribution.low}
                          </span>
                        )}
                        <div className="flex-1 h-1 rounded-full bg-navy-700 overflow-hidden ml-1">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${zone.heatIntensity * 100}%`,
                              background:
                                zone.heatIntensity < 0.33
                                  ? "#22d3ee"
                                  : zone.heatIntensity < 0.66
                                  ? "#eab308"
                                  : "#ef4444",
                              opacity: 0.7,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* PMD §18.1 notice */}
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
    </AppShell>
  );
}

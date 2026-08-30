"use client";

import { useState, useCallback } from "react";
import { HeatmapZone, HeatmapMarker } from "@/lib/complaints";

// ── Helpers ──────────────────────────────────────────────────────────────────

function heatColor(intensity: number): string {
  if (intensity <= 0) return "rgba(255,255,255,0.015)";
  if (intensity < 0.33) {
    const t = intensity / 0.33;
    return `rgba(34, 211, 238, ${0.06 + t * 0.12})`; // cyan
  } else if (intensity < 0.66) {
    const t = (intensity - 0.33) / 0.33;
    return `rgba(234, 179, 8, ${0.12 + t * 0.18})`; // yellow
  } else {
    const t = (intensity - 0.66) / 0.34;
    return `rgba(239, 68, 68, ${0.18 + t * 0.28})`; // red
  }
}

function heatStroke(intensity: number): string {
  if (intensity <= 0) return "rgba(255,255,255,0.1)";
  if (intensity < 0.33) return "rgba(34, 211, 238, 0.35)";
  if (intensity < 0.66) return "rgba(234, 179, 8, 0.45)";
  return "rgba(239, 68, 68, 0.5)";
}

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

function urgencyBadgeClass(u: string): string {
  switch (u) {
    case "critical":
      return "badge-critical";
    case "high":
      return "badge-high";
    case "medium":
      return "badge-medium";
    case "low":
      return "badge-low";
    default:
      return "";
  }
}

function urgencyLabel(u: string): string {
  return u.charAt(0).toUpperCase() + u.slice(1);
}

function polygonPoints(polygon: number[][]): string {
  return polygon.map((p) => `${p[0]},${p[1]}`).join(" ");
}

const SVG_WIDTH = 840;
const SVG_HEIGHT = 600;

// ── Component ────────────────────────────────────────────────────────────────

interface CampusHeatmapMapProps {
  zones: HeatmapZone[];
  markers: HeatmapMarker[];
  selectedZoneId?: string | null;
  onZoneClick?: (zone: HeatmapZone) => void;
  onMarkerClick?: (marker: HeatmapMarker) => void;
  className?: string;
}

export function CampusHeatmapMap({
  zones,
  markers,
  selectedZoneId,
  onZoneClick,
  onMarkerClick,
  className = "",
}: CampusHeatmapMapProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    content: React.ReactNode;
  } | null>(null);

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
          <div className="text-xs space-y-1.5">
            <p className="font-semibold text-white text-sm">{zone.zoneName}</p>
            <div className="flex items-center gap-3 text-gray-300">
              <span>
                Reports:{" "}
                <span className="text-white font-medium">{zone.totalReports}</span>
              </span>
              <span>
                Issues:{" "}
                <span className="text-white font-medium">
                  {zone.distinctIssueClusters}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 pt-0.5">
              {zone.urgencyDistribution.critical > 0 && (
                <span className="badge-critical">
                  {zone.urgencyDistribution.critical}C
                </span>
              )}
              {zone.urgencyDistribution.high > 0 && (
                <span className="badge-high">
                  {zone.urgencyDistribution.high}H
                </span>
              )}
              {zone.urgencyDistribution.medium > 0 && (
                <span className="badge-medium">
                  {zone.urgencyDistribution.medium}M
                </span>
              )}
              {zone.urgencyDistribution.low > 0 && (
                <span className="badge-low">
                  {zone.urgencyDistribution.low}L
                </span>
              )}
            </div>
          </div>
        ),
      });
    },
    []
  );

  const handleMarkerHover = useCallback(
    (e: React.MouseEvent<SVGGElement>, marker: HeatmapMarker) => {
      const rect = (
        e.currentTarget.closest("svg") as SVGSVGElement
      ).getBoundingClientRect();
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        content: (
          <div className="text-xs space-y-1.5">
            <p className="font-semibold text-white">
              {marker.markerType === "duplicate_cluster"
                ? `Cluster (${marker.reportCount} reports)`
                : "Complaint"}
            </p>
            <span className={urgencyBadgeClass(marker.urgency)}>
              {urgencyLabel(marker.urgency)} Urgency
            </span>
            {marker.summary && (
              <p className="text-gray-400 line-clamp-2">{marker.summary}</p>
            )}
            {marker.category && (
              <p className="text-gray-500">Category: {marker.category}</p>
            )}
            {marker.department && (
              <p className="text-gray-500">Dept: {marker.department}</p>
            )}
            {marker.confidence != null && (
              <p className="text-gray-500">
                Confidence: {Math.round(marker.confidence * 100)}%
              </p>
            )}
          </div>
        ),
      });
    },
    []
  );

  return (
    <div className={className}>
      <div
        className="relative w-full"
        style={{ aspectRatio: `${SVG_WIDTH}/${SVG_HEIGHT}` }}
      >
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-full rounded-lg"
          style={{ background: "rgba(8,12,24,0.85)" }}
          onMouseLeave={() => setTooltip(null)}
        >
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
                stroke="rgba(255,255,255,0.025)"
                strokeWidth="0.5"
              />
            </pattern>
            <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-orange" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="zone-glow" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="url(#grid)" />

          {/* Zones */}
          {zones.map((zone) => {
            if (!zone.polygon || zone.polygon.length < 3) return null;
            const isSelected = selectedZoneId === zone.zoneId;
            return (
              <g key={zone.zoneId}>
                <polygon
                  points={polygonPoints(zone.polygon)}
                  fill={heatColor(zone.heatIntensity)}
                  stroke={
                    isSelected
                      ? "rgba(167,139,250,0.8)"
                      : heatStroke(zone.heatIntensity)
                  }
                  strokeWidth={isSelected ? 2.5 : 1.2}
                  filter={isSelected ? "url(#zone-glow)" : undefined}
                  className="cursor-pointer transition-all duration-300"
                  style={{ opacity: isSelected ? 1 : 0.9 }}
                  onMouseMove={(e) => handleZoneHover(e, zone)}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => onZoneClick?.(zone)}
                />
                <text
                  x={zone.centroid[0]}
                  y={zone.centroid[1] - 14}
                  textAnchor="middle"
                  className="pointer-events-none select-none"
                  fill="rgba(255,255,255,0.9)"
                  fontSize="11"
                  fontWeight="600"
                  style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}
                >
                  {zone.zoneName}
                </text>
                <text
                  x={zone.centroid[0]}
                  y={zone.centroid[1] + 2}
                  textAnchor="middle"
                  className="pointer-events-none select-none"
                  fill="rgba(255,255,255,0.45)"
                  fontSize="9.5"
                >
                  {zone.totalReports > 0
                    ? `${zone.totalReports} reports · ${zone.distinctIssueClusters} issues`
                    : "No reports"}
                </text>
                {zone.totalReports > 0 && (
                  <text
                    x={zone.centroid[0]}
                    y={zone.centroid[1] + 15}
                    textAnchor="middle"
                    className="pointer-events-none select-none"
                    fontSize="8.5"
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

          {/* Markers */}
          {markers.map((marker) => {
            const isCluster = marker.markerType === "duplicate_cluster";
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
                onClick={() => onMarkerClick?.(marker)}
              >
                {marker.urgency === "critical" && (
                  <>
                    <circle
                      cx={marker.position[0]}
                      cy={marker.position[1]}
                      r={r + 8}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="1"
                      opacity="0.15"
                      className="animate-glow-pulse"
                    />
                    <circle
                      cx={marker.position[0]}
                      cy={marker.position[1]}
                      r={r + 4}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="1.5"
                      opacity="0.35"
                    />
                  </>
                )}
                {marker.urgency === "high" && (
                  <circle
                    cx={marker.position[0]}
                    cy={marker.position[1]}
                    r={r + 3}
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="1"
                    opacity="0.2"
                  />
                )}
                <circle
                  cx={marker.position[0]}
                  cy={marker.position[1]}
                  r={r}
                  fill={fill}
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth="1"
                  opacity="0.9"
                  filter={
                    marker.urgency === "critical"
                      ? "url(#glow-red)"
                      : marker.urgency === "high"
                      ? "url(#glow-orange)"
                      : undefined
                  }
                />
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

        {tooltip && (
          <div
            className="absolute z-50 glass-panel-glow px-3.5 py-2.5 pointer-events-none"
            style={{
              left: Math.min(tooltip.x + 14, 580),
              top: tooltip.y - 10,
              maxWidth: 280,
            }}
          >
            {tooltip.content}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="glass-panel-light p-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-2">
            Heat = Impact / Concentration
          </p>
          <div
            className="h-2.5 rounded-full overflow-hidden"
            style={{
              background:
                "linear-gradient(to right, rgba(34,211,238,0.18), rgba(234,179,8,0.3), rgba(239,68,68,0.46))",
            }}
          />
          <div className="flex justify-between text-[10px] text-gray-500 mt-1">
            <span>Low concentration</span>
            <span>High concentration</span>
          </div>
        </div>
        <div className="glass-panel-light p-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-2">
            Markers = Urgency
          </p>
          <div className="flex items-center gap-3">
            {[
              { label: "Critical", color: "#ef4444" },
              { label: "High", color: "#f97316" },
              { label: "Medium", color: "#eab308" },
              { label: "Low", color: "#22c55e" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{
                    backgroundColor: item.color,
                    boxShadow: `0 0 6px ${item.color}40`,
                  }}
                />
                <span className="text-[10px] text-gray-400">{item.label}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5">
            Cluster size = report count
          </p>
        </div>
      </div>
    </div>
  );
}

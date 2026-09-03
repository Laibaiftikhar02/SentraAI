"use client";

import { useState, useCallback, useMemo } from "react";
import { HeatmapZone, HeatmapMarker } from "@/lib/complaints";

// ── Constants ────────────────────────────────────────────────────────────────

const SVG_WIDTH = 840;
const SVG_HEIGHT = 600;

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
};

const ZONE_TYPE_STYLES: Record<
  string,
  { fill: string; stroke: string; roof: string; label: string }
> = {
  building: {
    fill: "rgba(30, 41, 75, 0.85)",
    stroke: "rgba(100, 116, 139, 0.35)",
    roof: "rgba(45, 60, 105, 0.55)",
    label: "Building",
  },
  hostel: {
    fill: "rgba(38, 45, 80, 0.85)",
    stroke: "rgba(129, 140, 248, 0.35)",
    roof: "rgba(55, 65, 115, 0.55)",
    label: "Hostel",
  },
  academic: {
    fill: "rgba(32, 46, 82, 0.85)",
    stroke: "rgba(96, 165, 250, 0.35)",
    roof: "rgba(48, 68, 120, 0.55)",
    label: "Academic",
  },
  outdoor: {
    fill: "rgba(20, 55, 45, 0.55)",
    stroke: "rgba(74, 222, 128, 0.25)",
    roof: "rgba(28, 78, 62, 0.35)",
    label: "Outdoor",
  },
  parking: {
    fill: "rgba(45, 45, 55, 0.75)",
    stroke: "rgba(148, 163, 184, 0.3)",
    roof: "rgba(60, 60, 72, 0.45)",
    label: "Parking",
  },
  other: {
    fill: "rgba(35, 42, 70, 0.8)",
    stroke: "rgba(148, 163, 184, 0.3)",
    roof: "rgba(50, 58, 92, 0.5)",
    label: "Zone",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function polygonPoints(polygon: number[][]): string {
  return polygon.map((p) => `${p[0]},${p[1]}`).join(" ");
}

function polygonBounds(polygon: number[][]) {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function polygonArea(polygon: number[][]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return Math.abs(area) / 2;
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

function generateTreesAroundZone(
  polygon: number[][],
  zoneId: string,
  count: number
): Array<{ x: number; y: number; r: number }> {
  const bounds = polygonBounds(polygon);
  const trees: Array<{ x: number; y: number; r: number }> = [];
  const padding = 18;
  let seed = 0;
  for (const ch of zoneId) seed += ch.charCodeAt(0);

  for (let i = 0; i < count; i++) {
    const angle = pseudoRandom(seed + i) * Math.PI * 2;
    const distance = padding + pseudoRandom(seed + i + 1000) * 35;
    const x = bounds.cx + Math.cos(angle) * distance * 1.4;
    const y = bounds.cy + Math.sin(angle) * distance;
    if (x > 10 && x < SVG_WIDTH - 10 && y > 10 && y < SVG_HEIGHT - 10) {
      trees.push({ x, y, r: 1.5 + pseudoRandom(seed + i + 2000) * 1.5 });
    }
  }
  return trees;
}

function priorityWeight(p: string): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[p] || 0;
}

function zonePriority(zone: HeatmapZone): string {
  const dist = zone.urgencyDistribution;
  if (dist.critical > 0) return "critical";
  if (dist.high > 0) return "high";
  if (dist.medium > 0) return "medium";
  if (dist.low > 0) return "low";
  return "none";
}

function heatColorStops(intensity: number): [string, string, string] {
  if (intensity <= 0) return ["rgba(34,197,94,0.0)", "rgba(34,197,94,0.0)", "rgba(34,197,94,0.0)"];
  if (intensity < 0.25) {
    // Low concentration → green
    const t = intensity / 0.25;
    return [
      `rgba(34, 197, 94, ${0.16 + t * 0.1})`,
      `rgba(34, 197, 94, ${0.07 + t * 0.06})`,
      `rgba(34, 197, 94, 0)`,
    ];
  }
  if (intensity < 0.5) {
    // Medium concentration → yellow
    const t = (intensity - 0.25) / 0.25;
    return [
      `rgba(${234 - t * 30}, ${179 + t * 20}, 8, ${0.24 + t * 0.08})`,
      `rgba(${234 - t * 30}, ${179 + t * 20}, 8, ${0.11 + t * 0.05})`,
      "rgba(234, 199, 8, 0)",
    ];
  }
  if (intensity < 0.75) {
    // High concentration → orange
    const t = (intensity - 0.5) / 0.25;
    return [
      `rgba(249, ${115 - t * 47}, 22, ${0.3 + t * 0.08})`,
      `rgba(249, ${115 - t * 47}, 22, ${0.14 + t * 0.04})`,
      "rgba(249, 68, 22, 0)",
    ];
  }
  // Critical / strongest concentration → red
  const t = (intensity - 0.75) / 0.25;
  return [
    `rgba(239, ${68 - t * 20}, ${68 - t * 30}, ${0.36 + t * 0.14})`,
    `rgba(239, ${68 - t * 20}, ${68 - t * 30}, ${0.16 + t * 0.06})`,
    "rgba(239, 68, 68, 0)",
  ];
}

function markerFill(urgency: string): string {
  return PRIORITY_COLORS[urgency] || "#6b7280";
}

function urgencyLabel(u: string): string {
  return u.charAt(0).toUpperCase() + u.slice(1);
}

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

  const validZones = useMemo(
    () => zones.filter((z) => z.polygon && z.polygon.length >= 3),
    [zones]
  );

  // Compute bounds/centroids for zones
  const zoneMeta = useMemo(() => {
    const map = new Map<string, ReturnType<typeof polygonBounds> & { area: number }>();
    validZones.forEach((z) => {
      const b = polygonBounds(z.polygon!);
      map.set(z.zoneId, { ...b, area: polygonArea(z.polygon!) });
    });
    return map;
  }, [validZones]);

  // Generate a campus base layer: roads connecting nearby zones, green fills
  const { roads, greenBlobs } = useMemo(() => {
    const centroids = validZones.map((z) => {
      const m = zoneMeta.get(z.zoneId)!;
      return { id: z.zoneId, x: m.cx, y: m.cy };
    });

    const roads: Array<[number, number, number, number]> = [];
    const connected = new Set<string>();

    // Connect each zone to its nearest neighbors
    centroids.forEach((c) => {
      const others = centroids
        .filter((o) => o.id !== c.id)
        .map((o) => ({
          ...o,
          d: Math.hypot(o.x - c.x, o.y - c.y),
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 2);

      others.forEach((o) => {
        const key = [c.id, o.id].sort().join("-");
        if (!connected.has(key) && o.d < 320) {
          connected.add(key);
          roads.push([c.x, c.y, o.x, o.y]);
        }
      });
    });

    return { roads, greenBlobs: centroids };
  }, [validZones, zoneMeta]);

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
                <span className="badge-critical">{zone.urgencyDistribution.critical}C</span>
              )}
              {zone.urgencyDistribution.high > 0 && (
                <span className="badge-high">{zone.urgencyDistribution.high}H</span>
              )}
              {zone.urgencyDistribution.medium > 0 && (
                <span className="badge-medium">{zone.urgencyDistribution.medium}M</span>
              )}
              {zone.urgencyDistribution.low > 0 && (
                <span className="badge-low">{zone.urgencyDistribution.low}L</span>
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
          <div className="text-xs space-y-1.5 max-w-[220px]">
            <p className="font-semibold text-white">
              {marker.markerType === "duplicate_cluster"
                ? `Cluster (${marker.reportCount} reports)`
                : "Complaint"}
            </p>
            <span
              className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium"
              style={{
                background: `${markerFill(marker.urgency)}20`,
                color: markerFill(marker.urgency),
                border: `1px solid ${markerFill(marker.urgency)}40`,
              }}
            >
              {urgencyLabel(marker.urgency)} Urgency
            </span>
            {marker.summary && (
              <p className="text-gray-400 line-clamp-2">{marker.summary}</p>
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
          className="w-full h-full rounded-xl overflow-hidden"
          style={{ background: "#060a14" }}
          onMouseLeave={() => setTooltip(null)}
        >
          <defs>
            {/* Ground grid */}
            <pattern
              id="campus-grid"
              width="60"
              height="60"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 60 0 L 0 0 0 60"
                fill="none"
                stroke="rgba(255,255,255,0.018)"
                strokeWidth="0.5"
              />
            </pattern>

            {/* Heat radial gradients — one per active zone */}
            {validZones.map((zone) => {
              const meta = zoneMeta.get(zone.zoneId)!;
              const [stop0, stop1, stop2] = heatColorStops(zone.heatIntensity);
              const baseRadius = Math.max(meta.width, meta.height) * 0.78;
              const r = baseRadius + zone.heatIntensity * 80;
              const id = `heat-gradient-${zone.zoneId}`;
              return (
                <radialGradient
                  key={id}
                  id={id}
                  cx={meta.cx}
                  cy={meta.cy}
                  r={r}
                  fx={meta.cx}
                  fy={meta.cy}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor={stop0} />
                  <stop offset="55%" stopColor={stop1} />
                  <stop offset="100%" stopColor={stop2} />
                </radialGradient>
              );
            })}

            {/* Glow filters */}
            <filter id="heat-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="marker-glow-red" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="marker-glow-orange" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="marker-glow-yellow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="marker-glow-green" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="building-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
            </filter>

            <filter id="zone-selection-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Base ground */}
          <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="#060a14" />
          <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="url(#campus-grid)" />

          {/* Subtle campus boundary vignette */}
          <rect
            width={SVG_WIDTH}
            height={SVG_HEIGHT}
            fill="url(#campus-grid)"
            style={{
              maskImage:
                "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 90%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 90%)",
            }}
          />

          {/* Green spaces / open areas around zones */}
          {greenBlobs.map((c) => {
            const zone = validZones.find((z) => z.zoneId === c.id);
            if (!zone) return null;
            const meta = zoneMeta.get(c.id)!;
            const rx = Math.max(meta.width * 0.72, 55);
            const ry = Math.max(meta.height * 0.72, 55);
            return (
              <ellipse
                key={`green-${c.id}`}
                cx={c.x}
                cy={c.y}
                rx={rx}
                ry={ry}
                fill="rgba(34, 197, 94, 0.04)"
                stroke="rgba(74, 222, 128, 0.07)"
                strokeWidth="1"
              />
            );
          })}

          {/* Scattered trees / vegetation around zones */}
          <g opacity="0.5">
            {validZones.flatMap((zone) => {
              const meta = zoneMeta.get(zone.zoneId)!;
              const treeCount = Math.min(14, Math.max(5, Math.round(meta.area / 2500)));
              return generateTreesAroundZone(zone.polygon!, zone.zoneId, treeCount).map(
                (tree, idx) => (
                  <circle
                    key={`tree-${zone.zoneId}-${idx}`}
                    cx={tree.x}
                    cy={tree.y}
                    r={tree.r}
                    fill="rgba(74, 222, 128, 0.28)"
                    className="pointer-events-none"
                  />
                )
              );
            })}
          </g>

          {/* Roads connecting zones */}
          <g opacity="0.55">
            {roads.map(([x1, y1, x2, y2], i) => (
              <line
                key={`road-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(148, 163, 184, 0.22)"
                strokeWidth="10"
                strokeLinecap="round"
              />
            ))}
            {roads.map(([x1, y1, x2, y2], i) => (
              <line
                key={`road-center-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(71, 85, 105, 0.35)"
                strokeWidth="5"
                strokeLinecap="round"
              />
            ))}
            {roads.map(([x1, y1, x2, y2], i) => (
              <line
                key={`road-dash-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(148, 163, 184, 0.12)"
                strokeWidth="1"
                strokeDasharray="6 8"
                strokeLinecap="round"
              />
            ))}
          </g>

          {/* Heat concentration overlays (under buildings for depth) */}
          <g style={{ mixBlendMode: "screen" }}>
            {validZones.map((zone) => {
              const meta = zoneMeta.get(zone.zoneId)!;
              if (zone.heatIntensity <= 0) return null;
              const id = `heat-gradient-${zone.zoneId}`;
              const baseRadius = Math.max(meta.width, meta.height) * 0.78;
              const r = baseRadius + zone.heatIntensity * 80;
              return (
                <ellipse
                  key={`heat-${zone.zoneId}`}
                  cx={meta.cx}
                  cy={meta.cy}
                  rx={r}
                  ry={r * 0.85}
                  fill={`url(#${id})`}
                  filter="url(#heat-glow)"
                  className="pointer-events-none"
                  opacity={0.85 + zone.heatIntensity * 0.15}
                />
              );
            })}
          </g>

          {/* Zone buildings / areas */}
          {validZones.map((zone) => {
            const isSelected = selectedZoneId === zone.zoneId;
            const style =
              ZONE_TYPE_STYLES[zone.zoneType || "other"] || ZONE_TYPE_STYLES.other;
            const meta = zoneMeta.get(zone.zoneId)!;

            // Create a subtle 3D roof offset polygon
            const roofOffset = 5;
            const roofPolygon = zone.polygon!.map(([x, y]) => [x - roofOffset, y - roofOffset]);

            return (
              <g key={zone.zoneId}>
                {/* Shadow / depth layer */}
                <polygon
                  points={polygonPoints(zone.polygon!)}
                  fill="rgba(0,0,0,0.25)"
                  transform={`translate(${roofOffset * 0.8}, ${roofOffset * 0.8})`}
                  className="pointer-events-none"
                />

                {/* Roof layer */}
                <polygon
                  points={polygonPoints(roofPolygon)}
                  fill={style.roof}
                  stroke={style.stroke}
                  strokeWidth={isSelected ? 2 : 1}
                  className="pointer-events-none"
                  opacity={0.9}
                />

                {/* Main building footprint */}
                <polygon
                  points={polygonPoints(zone.polygon!)}
                  fill={style.fill}
                  stroke={
                    isSelected
                      ? "rgba(167, 139, 250, 0.85)"
                      : style.stroke
                  }
                  strokeWidth={isSelected ? 2.5 : 1.2}
                  strokeLinejoin="round"
                  filter={isSelected ? "url(#zone-selection-glow)" : "url(#building-shadow)"}
                  className="cursor-pointer transition-all duration-300 hover:brightness-110"
                  style={{ opacity: isSelected ? 1 : 0.92 }}
                  onMouseMove={(e) => handleZoneHover(e, zone)}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => onZoneClick?.(zone)}
                />

                {/* Interior architectural detail: simple courtyard/glass hint */}
                {meta.area > 8000 && (
                  <polygon
                    points={polygonPoints(
                      zone.polygon!.map(([x, y]) => [
                        meta.cx + (x - meta.cx) * 0.55,
                        meta.cy + (y - meta.cy) * 0.55,
                      ])
                    )}
                    fill="rgba(255,255,255,0.025)"
                    stroke={style.stroke}
                    strokeWidth="0.8"
                    strokeDasharray="4 4"
                    className="pointer-events-none"
                  />
                )}

                {/* Building windows for larger structures */}
                {meta.area > 5000 && zone.zoneType !== "outdoor" && (
                  <g className="pointer-events-none" opacity="0.35">
                    {(() => {
                      const windows: React.ReactNode[] = [];
                      const cols = Math.max(3, Math.round(meta.width / 35));
                      const rows = Math.max(2, Math.round(meta.height / 35));
                      const winW = meta.width / (cols * 2.2);
                      const winH = meta.height / (rows * 2.2);
                      for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                          const wx =
                            meta.minX + meta.width * 0.12 + c * (meta.width / cols);
                          const wy =
                            meta.minY + meta.height * 0.12 + r * (meta.height / rows);
                          windows.push(
                            <rect
                              key={`win-${zone.zoneId}-${r}-${c}`}
                              x={wx}
                              y={wy}
                              width={winW}
                              height={winH}
                              rx={1}
                              fill="rgba(200, 220, 255, 0.15)"
                            />
                          );
                        }
                      }
                      return windows;
                    })()}
                  </g>
                )}
              </g>
            );
          })}

          {/* Zone boundary pulse for selected zone */}
          {selectedZoneId &&
            validZones
              .filter((z) => z.zoneId === selectedZoneId)
              .map((zone) => (
                <polygon
                  key={`sel-${zone.zoneId}`}
                  points={polygonPoints(zone.polygon!)}
                  fill="none"
                  stroke="rgba(167, 139, 250, 0.5)"
                  strokeWidth="2"
                  strokeDasharray="8 6"
                  className="pointer-events-none animate-glow-pulse"
                />
              ))}

          {/* Markers */}
          {markers.map((marker) => {
            const isCluster = marker.markerType === "duplicate_cluster";
            const color = markerFill(marker.urgency);
            const priority = marker.urgency;

            // Cluster sizing based on report count
            const baseR = isCluster
              ? Math.min(22, 13 + Math.sqrt(marker.reportCount) * 2.5)
              : priority === "critical"
              ? 8
              : priority === "high"
              ? 7
              : 5.5;

            const glowFilter =
              priority === "critical"
                ? "url(#marker-glow-red)"
                : priority === "high"
                ? "url(#marker-glow-orange)"
                : priority === "medium"
                ? "url(#marker-glow-yellow)"
                : "url(#marker-glow-green)";

            return (
              <g
                key={marker.markerId}
                className="cursor-pointer"
                onMouseMove={(e) => handleMarkerHover(e, marker)}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onMarkerClick?.(marker)}
              >
                {/* Outer pulse ring for critical/high */}
                {(priority === "critical" || priority === "high") && (
                  <>
                    <circle
                      cx={marker.position[0]}
                      cy={marker.position[1]}
                      r={baseR + 12}
                      fill="none"
                      stroke={color}
                      strokeWidth="1"
                      opacity={0.12}
                      className="animate-glow-pulse"
                    />
                    <circle
                      cx={marker.position[0]}
                      cy={marker.position[1]}
                      r={baseR + 6}
                      fill="none"
                      stroke={color}
                      strokeWidth="1.5"
                      opacity={0.25}
                    />
                  </>
                )}

                {/* Glow backing */}
                <circle
                  cx={marker.position[0]}
                  cy={marker.position[1]}
                  r={baseR + 3}
                  fill={color}
                  opacity={0.15}
                  filter={glowFilter}
                />

                {/* Main marker */}
                <circle
                  cx={marker.position[0]}
                  cy={marker.position[1]}
                  r={baseR}
                  fill={color}
                  stroke="rgba(6,10,20,0.7)"
                  strokeWidth={isCluster ? 2.5 : 1.5}
                  filter={glowFilter}
                />

                {/* Inner highlight */}
                <circle
                  cx={marker.position[0] - baseR * 0.25}
                  cy={marker.position[1] - baseR * 0.25}
                  r={baseR * 0.25}
                  fill="rgba(255,255,255,0.25)"
                  className="pointer-events-none"
                />

                {/* Cluster count */}
                {isCluster && marker.reportCount > 1 && (
                  <text
                    x={marker.position[0]}
                    y={marker.position[1] + 4}
                    textAnchor="middle"
                    fill="white"
                    fontSize={Math.min(13, 9 + marker.reportCount * 0.25)}
                    fontWeight="800"
                    className="pointer-events-none select-none"
                    style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}
                  >
                    {marker.reportCount}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Floating zone labels */}
        {validZones.map((zone) => {
          const meta = zoneMeta.get(zone.zoneId)!;
          const topPriority = zonePriority(zone);
          const color = PRIORITY_COLORS[topPriority] || "#94a3b8";
          const hasReports = zone.totalReports > 0;

          return (
            <div
              key={`label-${zone.zoneId}`}
              className="absolute pointer-events-none"
              style={{
                left: `${(meta.cx / SVG_WIDTH) * 100}%`,
                top: `${(meta.cy / SVG_HEIGHT) * 100}%`,
                transform: "translate(-50%, -110%)",
                zIndex: selectedZoneId === zone.zoneId ? 20 : 10,
              }}
            >
              <div
                className={`px-2.5 py-1.5 rounded-lg border shadow-lg backdrop-blur-md transition-all duration-300 ${
                  selectedZoneId === zone.zoneId
                    ? "bg-navy-800/90 border-accent-purple/50"
                    : "bg-navy-900/80 border-white/10"
                }`}
                style={{
                  boxShadow:
                    selectedZoneId === zone.zoneId
                      ? `0 0 20px -5px ${color}40`
                      : "0 4px 16px -4px rgba(0,0,0,0.4)",
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 6px ${color}`,
                    }}
                  />
                  <span className="text-[11px] font-semibold text-white whitespace-nowrap">
                    {zone.zoneName}
                  </span>
                </div>
                {hasReports && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-400">
                      {zone.totalReports} reports
                    </span>
                    <div className="flex items-center gap-1">
                      {zone.urgencyDistribution.critical > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-urgency-critical" />
                      )}
                      {zone.urgencyDistribution.high > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-urgency-high" />
                      )}
                      {zone.urgencyDistribution.medium > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-urgency-medium" />
                      )}
                      {zone.urgencyDistribution.low > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-urgency-low" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-50 glass-panel-glow px-3.5 py-2.5 pointer-events-none"
            style={{
              left: Math.min(tooltip.x + 14, SVG_WIDTH - 240),
              top: tooltip.y - 10,
              maxWidth: 260,
            }}
          >
            {tooltip.content}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">
              Concentration
            </span>
            <div
              className="h-2 w-24 rounded-full"
              style={{
                background:
                  "linear-gradient(to right, rgba(34,197,94,0.6), rgba(234,199,8,0.65), rgba(249,115,22,0.7), rgba(239,68,68,0.75))",
              }}
            />
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-3">
            {[
              { label: "Critical", color: PRIORITY_COLORS.critical },
              { label: "High", color: PRIORITY_COLORS.high },
              { label: "Medium", color: PRIORITY_COLORS.medium },
              { label: "Low", color: PRIORITY_COLORS.low },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: item.color,
                    boxShadow: `0 0 6px ${item.color}`,
                  }}
                />
                <span className="text-[10px] text-gray-400">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-gray-500">
          Click a zone to view its complaints · Click a marker for details
        </p>
      </div>
    </div>
  );
}

import type { Pin } from "@/lib/types";

export interface Cluster {
  id: string;
  pins: Pin[];
  x_percent: number;
  y_percent: number;
  count: number;
  isCluster: true;
}

export interface PinWithCluster extends Pin {
  isCluster?: false;
}

export type PinDisplay = PinWithCluster | Cluster;

export function clusterPins(pins: Pin[], radius: number = 2.5): PinDisplay[] {
  if (pins.length === 0) return [];
  if (pins.length === 1) return [{ ...pins[0], isCluster: false as const }];

  const sorted = [...pins].sort((a, b) => a.x_percent - b.x_percent);
  const clusters: Cluster[] = [];

  for (const pin of sorted) {
    let added = false;
    for (const cluster of clusters) {
      const dx = cluster.x_percent - pin.x_percent;
      const dy = cluster.y_percent - pin.y_percent;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        cluster.pins.push(pin);
        cluster.x_percent = cluster.pins.reduce((s, p) => s + p.x_percent, 0) / cluster.pins.length;
        cluster.y_percent = cluster.pins.reduce((s, p) => s + p.y_percent, 0) / cluster.pins.length;
        cluster.count = cluster.pins.length;
        added = true;
        break;
      }
    }
    if (!added) {
      clusters.push({
        id: `cluster-${pin.id}`,
        pins: [pin],
        x_percent: pin.x_percent,
        y_percent: pin.y_percent,
        count: 1,
        isCluster: true,
      });
    }
  }

  const result: PinDisplay[] = [];
  for (const cluster of clusters) {
    if (cluster.count === 1) {
      result.push({ ...cluster.pins[0], isCluster: false as const });
    } else {
      result.push(cluster);
    }
  }
  return result;
}

export function getPinSize(): number {
  return 16;
}

export function getClusterSize(count: number): number {
  const baseSize = 16;
  if (count === 1) return baseSize;
  const reduction = Math.min((count - 1) * 0.1, 0.5);
  return Math.max(baseSize * (1 - reduction), 10);
}

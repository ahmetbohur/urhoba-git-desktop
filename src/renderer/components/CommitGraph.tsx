import { useMemo } from 'react';
import { graphColor, type GraphRow } from '../lib/commit-graph';

/**
 * Bir commit satırının grafik sütunu.
 *
 * Her satır kendi SVG'sini çiziyor: liste sanallaştırıldığı için tek bir büyük
 * SVG kurmak mümkün değil, ekranda olmayan satırlar hiç render edilmiyor.
 * Çizgiler satırın üst kenarından alt kenarına gittiği için komşu satırlar
 * kesintisiz bir ağ oluşturuyor.
 */

const LANE_WIDTH = 14;
const NODE_RADIUS = 3.5;
const MAX_LANES = 8;

/** Şerit indeksinin yatay konumu. Sabitlere bağlı olduğu için bileşen dışında. */
function laneX(lane: number): number {
  return Math.min(lane, MAX_LANES - 1) * LANE_WIDTH + LANE_WIDTH / 2;
}

export function CommitGraph({
  row,
  height,
  isMerge,
}: {
  row: GraphRow;
  height: number;
  isMerge: boolean;
}) {
  // Çok dallı geçmişte grafik sütunu listeyi ezmesin diye genişliği sınırlıyoruz.
  const lanes = Math.min(Math.max(row.width, 1), MAX_LANES);
  const width = lanes * LANE_WIDTH;

  const paths = useMemo(
    () =>
      row.edges.map((edge, index) => {
        const x1 = laneX(edge.from);
        const x2 = laneX(edge.to);
        // Dikey çizgide düz hat, şerit değiştiren çizgide yumuşak bir S eğrisi.
        const d =
          x1 === x2
            ? `M ${x1} 0 L ${x2} ${height}`
            : `M ${x1} 0 C ${x1} ${height / 2}, ${x2} ${height / 2}, ${x2} ${height}`;
        return { d, color: graphColor(edge.colorLane), key: `${index}-${edge.from}-${edge.to}` };
      }),
    [row.edges, height],
  );

  const nodeX = laneX(row.lane);
  const nodeColor = graphColor(row.lane);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden="true"
    >
      {paths.map((path) => (
        <path
          key={path.key}
          d={path.d}
          stroke={path.color}
          strokeWidth={1.5}
          fill="none"
          opacity={0.85}
        />
      ))}
      {/* Merge commit'leri içi boş daireyle: geçmişte gözle taranabilsin. */}
      <circle
        cx={nodeX}
        cy={height / 2}
        r={NODE_RADIUS}
        fill={isMerge ? 'var(--surface)' : nodeColor}
        stroke={nodeColor}
        strokeWidth={1.8}
      />
    </svg>
  );
}

export const GRAPH_LANE_WIDTH = LANE_WIDTH;

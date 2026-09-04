'use client';

import { useId } from 'react';

import type { ChartDataset, ChartElement } from '@/lib/studio';

export type StudioChartProps = {
  element: ChartElement;
};

type CartesianScale = {
  minimum: number;
  maximum: number;
  ticks: number[];
};

type LegendItem = {
  dataset: ChartDataset;
  x: number;
  y: number;
};

type PieSlice = {
  value: number;
  label: string;
  startAngle: number;
  endAngle: number;
};

const WIDTH = 800;
const HEIGHT = 450;
const LEFT = 74;
const RIGHT = 24;
const BOTTOM = 62;
const LEGEND_X = 74;
const LEGEND_Y = 20;
const LEGEND_ROW_HEIGHT = 24;
const LEGEND_GAP = 18;
const LEGEND_MAX_X = WIDTH - RIGHT;
const GRID_TICK_COUNT = 6;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function finiteValues(datasets: ChartDataset[]) {
  return datasets.flatMap((dataset) =>
    dataset.values.filter((value) => Number.isFinite(value)),
  );
}

function niceNumber(value: number, round: boolean) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  let niceFraction: number;

  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;

  return niceFraction * 10 ** exponent;
}

function makeScale(values: number[]): CartesianScale {
  const rawMinimum = Math.min(0, ...values);
  const rawMaximum = Math.max(0, ...values);
  const rawRange =
    rawMaximum - rawMinimum ||
    Math.abs(rawMaximum) ||
    Math.abs(rawMinimum) ||
    1;
  const step = niceNumber(rawRange / (GRID_TICK_COUNT - 1), true);
  let minimum = Math.floor(rawMinimum / step) * step;
  let maximum = Math.ceil(rawMaximum / step) * step;

  if (rawMinimum >= 0) minimum = 0;
  if (rawMaximum <= 0) maximum = 0;
  if (minimum === maximum) maximum = minimum + step;

  const ticks: number[] = [];
  for (
    let value = minimum, guard = 0;
    value <= maximum + step / 2 && guard < 20;
    value += step, guard += 1
  ) {
    ticks.push(Math.abs(value) < step / 1_000_000 ? 0 : value);
  }

  return { minimum, maximum, ticks };
}

function formatValue(value: number) {
  const absolute = Math.abs(value);
  const compact = (divisor: number, suffix: string) => {
    const result = value / divisor;
    const digits = Math.abs(result) >= 10 || Number.isInteger(result) ? 0 : 1;
    return `${result.toFixed(digits).replace('.', ',')}${suffix}`;
  };

  if (absolute >= 1_000_000_000) return compact(1_000_000_000, ' Md');
  if (absolute >= 1_000_000) return compact(1_000_000, ' M');
  if (absolute >= 1_000) return compact(1_000, ' k');
  if (absolute > 0 && absolute < 0.01)
    return value.toExponential(1).replace('.', ',');
  return Number.isInteger(value)
    ? String(value)
    : value
        .toFixed(2)
        .replace(/0+$/, '')
        .replace(/[.,]$/, '')
        .replace('.', ',');
}

function truncate(label: string, maximum = 18) {
  return label.length > maximum ? `${label.slice(0, maximum - 1)}…` : label;
}

function legendLayout(datasets: ChartDataset[]) {
  const items: LegendItem[] = [];
  let x = LEGEND_X;
  let y = LEGEND_Y;

  for (const dataset of datasets) {
    const itemWidth = clamp(
      46 + truncate(dataset.label, 22).length * 8,
      96,
      224,
    );
    if (x + itemWidth > LEGEND_MAX_X && x > LEGEND_X) {
      x = LEGEND_X;
      y += LEGEND_ROW_HEIGHT;
    }
    items.push({ dataset, x, y });
    x += itemWidth + LEGEND_GAP;
  }

  return {
    items,
    height: items.length === 0 ? 0 : y - LEGEND_Y + LEGEND_ROW_HEIGHT,
  };
}

function pointCount(element: ChartElement) {
  return Math.max(
    element.labels.length,
    ...element.datasets.map((dataset) => dataset.values.length),
    0,
  );
}

function categoryLabel(element: ChartElement, index: number) {
  return element.labels[index] ?? '';
}

function seriesColor(dataset: ChartDataset) {
  return dataset.color || 'currentColor';
}

function LegendBlock({ items }: { items: LegendItem[] }) {
  return (
    <g className="studio-chart-legend" aria-label="Légende">
      {items.map(({ dataset, x, y }, index) => (
        <g key={`${dataset.label}-${index}`} transform={`translate(${x} ${y})`}>
          <rect
            className="studio-chart-legend-swatch"
            x="0"
            y="-10"
            width="12"
            height="12"
            rx="3"
            fill={seriesColor(dataset)}
          />
          <text
            className="studio-chart-legend-label"
            x="20"
            y="0"
            fill="currentColor"
            fontSize="14"
          >
            {truncate(dataset.label || `Série ${index + 1}`, 22)}
          </text>
        </g>
      ))}
    </g>
  );
}

function EmptyChart({
  showLegend,
  legend,
}: {
  showLegend: boolean;
  legend: LegendItem[];
}) {
  return (
    <>
      {showLegend ? <LegendBlock items={legend} /> : null}
      <text
        className="studio-chart-empty"
        x={WIDTH / 2}
        y={HEIGHT / 2}
        fill="currentColor"
        fillOpacity="0.58"
        fontSize="18"
        textAnchor="middle"
      >
        Aucune donnée
      </text>
    </>
  );
}

function CartesianAxes({
  element,
  scale,
  plotTop,
  plotBottom,
  plotWidth,
}: {
  element: ChartElement;
  scale: CartesianScale;
  plotTop: number;
  plotBottom: number;
  plotWidth: number;
}) {
  const count = pointCount(element);
  const yFor = (value: number) =>
    plotBottom -
    ((value - scale.minimum) / (scale.maximum - scale.minimum)) *
      (plotBottom - plotTop);
  const labelStride = Math.max(1, Math.ceil(count / 12));
  const rotateLabels = count > 8;

  return (
    <g className="studio-chart-axes" aria-hidden="true">
      {scale.ticks.map((tick) => {
        const y = yFor(tick);
        return (
          <g key={tick}>
            <line
              className={
                tick === 0 ? 'studio-chart-zero-line' : 'studio-chart-grid-line'
              }
              x1={LEFT}
              y1={y}
              x2={LEFT + plotWidth}
              y2={y}
              stroke="currentColor"
              strokeOpacity={tick === 0 ? 0.42 : 0.13}
              strokeWidth={tick === 0 ? 1.5 : 1}
            />
            <text
              className="studio-chart-y-label"
              x={LEFT - 12}
              y={y + 5}
              fill="currentColor"
              fillOpacity="0.66"
              fontSize="13"
              textAnchor="end"
            >
              {formatValue(tick)}
            </text>
          </g>
        );
      })}

      {Array.from({ length: count }, (_, index) => {
        if (index % labelStride !== 0) return null;
        const x =
          count === 1
            ? LEFT + plotWidth / 2
            : LEFT + ((index + 0.5) / count) * plotWidth;
        const label = categoryLabel(element, index);
        if (!label) return null;
        return (
          <text
            key={`${label}-${index}`}
            className="studio-chart-x-label"
            x={x}
            y={plotBottom + 25}
            fill="currentColor"
            fillOpacity="0.72"
            fontSize="13"
            textAnchor={rotateLabels ? 'end' : 'middle'}
            transform={
              rotateLabels ? `rotate(-32 ${x} ${plotBottom + 25})` : undefined
            }
          >
            {truncate(label, rotateLabels ? 14 : 18)}
          </text>
        );
      })}
    </g>
  );
}

function BarPlot({
  element,
  scale,
  plotTop,
  plotBottom,
  plotWidth,
}: {
  element: ChartElement;
  scale: CartesianScale;
  plotTop: number;
  plotBottom: number;
  plotWidth: number;
}) {
  const count = pointCount(element);
  const plotHeight = plotBottom - plotTop;
  const yFor = (value: number) =>
    plotBottom -
    ((value - scale.minimum) / (scale.maximum - scale.minimum)) * plotHeight;
  const zeroY = yFor(0);
  const categoryWidth = plotWidth / Math.max(count, 1);
  const groupWidth = categoryWidth * 0.74;
  const barWidth = groupWidth / Math.max(element.datasets.length, 1);

  return (
    <g className="studio-chart-bars">
      {Array.from({ length: count }, (_, pointIndex) =>
        element.datasets.map((dataset, datasetIndex) => {
          const value = dataset.values[pointIndex];
          if (!Number.isFinite(value)) return null;
          const valueY = yFor(value);
          const x =
            LEFT +
            pointIndex * categoryWidth +
            (categoryWidth - groupWidth) / 2 +
            datasetIndex * barWidth;
          return (
            <rect
              key={`${datasetIndex}-${pointIndex}`}
              className="studio-chart-bar"
              x={x + Math.min(2, barWidth * 0.08)}
              y={Math.min(valueY, zeroY)}
              width={Math.max(1, barWidth - Math.min(4, barWidth * 0.16))}
              height={Math.abs(zeroY - valueY)}
              rx={Math.min(4, barWidth * 0.12)}
              fill={seriesColor(dataset)}
            >
              <title>
                {`${categoryLabel(element, pointIndex) || `Valeur ${pointIndex + 1}`} — ${dataset.label}: ${formatValue(value)}`}
              </title>
            </rect>
          );
        }),
      )}
    </g>
  );
}

function linePath(
  dataset: ChartDataset,
  count: number,
  xFor: (index: number) => number,
  yFor: (value: number) => number,
) {
  let path = '';
  let open = false;
  for (let index = 0; index < count; index += 1) {
    const value = dataset.values[index];
    if (!Number.isFinite(value)) {
      open = false;
      continue;
    }
    path += `${open ? ' L' : ' M'} ${xFor(index)} ${yFor(value)}`;
    open = true;
  }
  return path.trim();
}

function LinePlot({
  element,
  scale,
  plotTop,
  plotBottom,
  plotWidth,
}: {
  element: ChartElement;
  scale: CartesianScale;
  plotTop: number;
  plotBottom: number;
  plotWidth: number;
}) {
  const count = pointCount(element);
  const plotHeight = plotBottom - plotTop;
  const xFor = (index: number) =>
    count === 1
      ? LEFT + plotWidth / 2
      : LEFT + ((index + 0.5) / count) * plotWidth;
  const yFor = (value: number) =>
    plotBottom -
    ((value - scale.minimum) / (scale.maximum - scale.minimum)) * plotHeight;

  return (
    <g className="studio-chart-lines">
      {element.datasets.map((dataset, datasetIndex) => {
        const path = linePath(dataset, count, xFor, yFor);
        if (!path) return null;
        return (
          <g key={`${dataset.label}-${datasetIndex}`}>
            <path
              className="studio-chart-line"
              d={path}
              fill="none"
              stroke={seriesColor(dataset)}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {dataset.values.slice(0, count).map((value, pointIndex) => {
              if (!Number.isFinite(value)) return null;
              return (
                <circle
                  key={pointIndex}
                  className="studio-chart-point"
                  cx={xFor(pointIndex)}
                  cy={yFor(value)}
                  r="5"
                  fill={seriesColor(dataset)}
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <title>
                    {`${categoryLabel(element, pointIndex) || `Valeur ${pointIndex + 1}`} — ${dataset.label}: ${formatValue(value)}`}
                  </title>
                </circle>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function piePath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const sweep = Math.min(359.999, Math.max(0, endAngle - startAngle));
  const adjustedEnd = startAngle + sweep;
  const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
  const outerEnd = polarPoint(cx, cy, outerRadius, adjustedEnd);
  const largeArc = sweep > 180 ? 1 : 0;

  if (innerRadius <= 0) {
    return [
      `M ${cx} ${cy}`,
      `L ${outerStart.x} ${outerStart.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
      'Z',
    ].join(' ');
  }

  const innerEnd = polarPoint(cx, cy, innerRadius, adjustedEnd);
  const innerStart = polarPoint(cx, cy, innerRadius, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function makePieSlices(
  element: ChartElement,
  dataset: ChartDataset,
): PieSlice[] {
  const positive = dataset.values.map((value) =>
    Number.isFinite(value) && value > 0 ? value : 0,
  );
  const total = positive.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];

  let angle = 0;
  return positive.flatMap((value, index) => {
    if (value <= 0) return [];
    const startAngle = angle;
    angle += (value / total) * 360;
    return [
      {
        value,
        label: categoryLabel(element, index) || `Valeur ${index + 1}`,
        startAngle,
        endAngle: angle,
      },
    ];
  });
}

function PiePlot({
  element,
  plotTop,
}: {
  element: ChartElement;
  plotTop: number;
}) {
  const drawableDatasets = element.datasets
    .map((dataset) => ({ dataset, slices: makePieSlices(element, dataset) }))
    .filter(({ slices }) => slices.length > 0);
  if (drawableDatasets.length === 0) return null;

  const cx = WIDTH / 2;
  const availableHeight = HEIGHT - plotTop - 24;
  const cy = plotTop + availableHeight / 2;
  const outermost = Math.min(148, availableHeight / 2 - 18);
  const multiple = drawableDatasets.length > 1;
  const ringThickness = multiple
    ? Math.min(34, (outermost - 14) / drawableDatasets.length)
    : outermost;

  return (
    <g className="studio-chart-pies">
      {drawableDatasets.map(({ dataset, slices }, datasetIndex) => {
        const outerRadius = outermost - datasetIndex * ringThickness;
        const innerRadius = multiple
          ? Math.max(
              12,
              outerRadius - ringThickness + Math.min(4, ringThickness * 0.18),
            )
          : 0;
        return slices.map((slice, sliceIndex) => {
          const middleAngle = (slice.startAngle + slice.endAngle) / 2;
          const labelPoint = polarPoint(cx, cy, outerRadius + 18, middleAngle);
          const share = (slice.endAngle - slice.startAngle) / 360;
          const showLabel =
            datasetIndex === 0 && share >= 0.045 && slices.length <= 14;
          return (
            <g key={`${datasetIndex}-${sliceIndex}`}>
              <path
                className="studio-chart-pie-slice"
                d={piePath(
                  cx,
                  cy,
                  innerRadius,
                  outerRadius,
                  slice.startAngle,
                  slice.endAngle,
                )}
                fill={seriesColor(dataset)}
                fillOpacity={clamp(1 - sliceIndex * 0.1, 0.42, 1)}
                stroke="currentColor"
                strokeOpacity="0.28"
                strokeWidth="1.5"
              >
                <title>{`${slice.label} — ${dataset.label}: ${formatValue(slice.value)}`}</title>
              </path>
              {showLabel ? (
                <text
                  className="studio-chart-pie-label"
                  x={labelPoint.x}
                  y={labelPoint.y + 4}
                  fill="currentColor"
                  fontSize="13"
                  textAnchor={
                    labelPoint.x < cx - 4
                      ? 'end'
                      : labelPoint.x > cx + 4
                        ? 'start'
                        : 'middle'
                  }
                >
                  {truncate(slice.label, 14)}
                </text>
              ) : null}
            </g>
          );
        });
      })}
    </g>
  );
}

export function StudioChart({ element }: StudioChartProps) {
  const accessibilityId = useId();
  const titleId = `${accessibilityId}-title`;
  const descriptionId = `${accessibilityId}-description`;
  const values = finiteValues(element.datasets);
  const legend = legendLayout(element.datasets);
  const plotTop = element.showLegend ? LEGEND_Y + legend.height + 10 : 24;
  const plotBottom = HEIGHT - BOTTOM;
  const plotWidth = WIDTH - LEFT - RIGHT;
  const hasCartesianData = values.length > 0 && pointCount(element) > 0;
  const hasPieData = element.datasets.some((dataset) =>
    dataset.values.some((value) => Number.isFinite(value) && value > 0),
  );
  const empty = element.chartType === 'pie' ? !hasPieData : !hasCartesianData;
  const scale = makeScale(values);
  const chartName =
    element.chartType === 'bar'
      ? 'Graphique en barres'
      : element.chartType === 'line'
        ? 'Graphique en courbes'
        : 'Graphique en secteurs';

  return (
    <svg
      className="studio-chart"
      data-chart-type={element.chartType}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      aria-labelledby={`${titleId} ${descriptionId}`}
    >
      <title id={titleId}>{chartName}</title>
      <desc id={descriptionId}>
        {element.datasets.length > 0
          ? element.datasets.map((dataset) => dataset.label).join(', ')
          : 'Aucune série'}
      </desc>

      {empty ? (
        <EmptyChart showLegend={element.showLegend} legend={legend.items} />
      ) : (
        <>
          {element.showLegend ? <LegendBlock items={legend.items} /> : null}
          {element.chartType === 'pie' ? (
            <PiePlot element={element} plotTop={plotTop} />
          ) : (
            <>
              <CartesianAxes
                element={element}
                scale={scale}
                plotTop={plotTop}
                plotBottom={plotBottom}
                plotWidth={plotWidth}
              />
              {element.chartType === 'bar' ? (
                <BarPlot
                  element={element}
                  scale={scale}
                  plotTop={plotTop}
                  plotBottom={plotBottom}
                  plotWidth={plotWidth}
                />
              ) : (
                <LinePlot
                  element={element}
                  scale={scale}
                  plotTop={plotTop}
                  plotBottom={plotBottom}
                  plotWidth={plotWidth}
                />
              )}
            </>
          )}
        </>
      )}
    </svg>
  );
}

// src/components/admin/SemanticSpaceChart.jsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';

const PALETTE = [
  '#6366f1',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
  '#a855f7',
  '#f43f5e',
  '#14b8a6',
  '#eab308',
  '#0ea5e9',
];

const SemanticSpaceChart = ({ data }) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ width: 600, height: 380 });

  const validData = useMemo(
    () =>
      Array.isArray(data)
        ? data.filter(
            (d) =>
              d &&
              d.coordinates &&
              typeof d.coordinates.x === 'number' &&
              Number.isFinite(d.coordinates.x) &&
              typeof d.coordinates.y === 'number' &&
              Number.isFinite(d.coordinates.y)
          )
        : [],
    [data]
  );

  const hiddenCount = (Array.isArray(data) ? data.length : 0) - validData.length;

  useLayoutEffect(() => {
    if (!containerRef.current) return undefined;
    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(280, Math.floor(entry.contentRect.width));
        setSize((prev) => (prev.width === w ? prev : { ...prev, width: w }));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return undefined;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    d3.select('body').selectAll('.d3-tooltip-semantic').remove();

    if (validData.length === 0) return undefined;

    const margin = { top: 16, right: 20, bottom: 36, left: 36 };
    const width = size.width;
    const height = size.height;
    const innerW = Math.max(80, width - margin.left - margin.right);
    const innerH = Math.max(80, height - margin.top - margin.bottom);

    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xExtent = d3.extent(validData, (d) => d.coordinates.x);
    const yExtent = d3.extent(validData, (d) => d.coordinates.y);
    const xSpan = Math.max(1e-6, xExtent[1] - xExtent[0]);
    const ySpan = Math.max(1e-6, yExtent[1] - yExtent[0]);
    const xBuffer = xSpan * 0.12 + 0.1;
    const yBuffer = ySpan * 0.12 + 0.1;

    const xScale = d3
      .scaleLinear()
      .domain([xExtent[0] - xBuffer, xExtent[1] + xBuffer])
      .range([0, innerW]);
    const yScale = d3
      .scaleLinear()
      .domain([yExtent[0] - yBuffer, yExtent[1] + yBuffer])
      .range([innerH, 0]);

    const maxCount = d3.max(validData, (d) => d.count || 0) || 1;
    const rScale = d3
      .scaleSqrt()
      .domain([0, maxCount])
      .range([5, Math.min(24, Math.max(10, innerW / 20))]);

    const color = d3
      .scaleOrdinal()
      .domain(validData.map((d) => d.canonical_name))
      .range(PALETTE);

    // Gridlines (both axes)
    g.append('g')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerW)
          .tickFormat(() => '')
      )
      .call((sel) => sel.select('.domain').remove())
      .selectAll('line')
      .attr('stroke', '#eef2f7')
      .attr('stroke-dasharray', '2 4');

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(5)
          .tickSize(-innerH)
          .tickFormat(() => '')
      )
      .call((sel) => sel.select('.domain').remove())
      .selectAll('line')
      .attr('stroke', '#eef2f7')
      .attr('stroke-dasharray', '2 4');

    // Axis text
    const xAxisG = g
      .append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(5));
    xAxisG.select('.domain').attr('stroke', '#cbd5e1');
    xAxisG.selectAll('.tick line').remove();
    xAxisG.selectAll('text').attr('fill', '#64748b').attr('font-size', 10).attr('font-family', 'inherit');

    const yAxisG = g.append('g').call(d3.axisLeft(yScale).ticks(5));
    yAxisG.select('.domain').remove();
    yAxisG.selectAll('.tick line').remove();
    yAxisG.selectAll('text').attr('fill', '#64748b').attr('font-size', 10).attr('font-family', 'inherit');

    // Axis labels
    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 30)
      .attr('text-anchor', 'middle')
      .attr('fill', '#64748b')
      .attr('font-size', 11)
      .text('Semantic axis 1 (PCA)');
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2)
      .attr('y', -26)
      .attr('text-anchor', 'middle')
      .attr('fill', '#64748b')
      .attr('font-size', 11)
      .text('Semantic axis 2 (PCA)');

    // Tooltip
    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'd3-tooltip-semantic');

    // Points
    const nodes = g
      .selectAll('g.point')
      .data(validData, (d) => d.canonical_name)
      .enter()
      .append('g')
      .attr('class', 'point')
      .attr('transform', (d) => `translate(${xScale(d.coordinates.x)},${yScale(d.coordinates.y)})`)
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this).select('circle.fg').attr('stroke', '#0f172a').attr('stroke-width', 2);
        tooltip
          .style('opacity', 1)
          .html(
            `<strong>${d.canonical_name}</strong>` +
              `<div class="ff-tt-meta">${d.count || 0} response${(d.count || 0) === 1 ? '' : 's'}</div>`
          );
      })
      .on('mousemove', function (event) {
        tooltip
          .style('left', `${event.pageX + 12}px`)
          .style('top', `${event.pageY - 12}px`);
      })
      .on('mouseout', function () {
        d3.select(this).select('circle.fg').attr('stroke', '#ffffff').attr('stroke-width', 1.5);
        tooltip.style('opacity', 0);
      });

    nodes
      .append('circle')
      .attr('class', 'halo')
      .attr('r', (d) => rScale(d.count || 0) + 5)
      .attr('fill', (d) => color(d.canonical_name))
      .attr('opacity', 0.12);

    nodes
      .append('circle')
      .attr('class', 'fg')
      .attr('r', 0)
      .attr('fill', (d) => color(d.canonical_name))
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.5)
      .transition()
      .duration(450)
      .ease(d3.easeBackOut.overshoot(1.4))
      .attr('r', (d) => rScale(d.count || 0));

    // Labels next to largest groups (top 6 by count)
    const labeled = validData
      .slice()
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 6);

    g.selectAll('text.label')
      .data(labeled, (d) => d.canonical_name)
      .enter()
      .append('text')
      .attr('class', 'label')
      .attr('x', (d) => xScale(d.coordinates.x) + rScale(d.count || 0) + 4)
      .attr('y', (d) => yScale(d.coordinates.y) + 3)
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .attr('fill', '#334155')
      .style('opacity', 0)
      .text((d) => d.canonical_name)
      .transition()
      .delay(300)
      .duration(300)
      .style('opacity', 1);

    return () => {
      tooltip.remove();
    };
  }, [validData, size]);

  return (
    <div className="ff-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div>
          <h4 className="ff-section-title">Semantic space</h4>
          <p className="ff-section-subtitle">
            Cluster centroids projected to 2D · bubble size = response count
          </p>
        </div>
        <span className="ff-chip">PCA · 2D</span>
      </div>
      <div ref={containerRef} className="px-3 py-3">
        {validData.length > 0 ? (
          <svg ref={svgRef} role="img" aria-label="Semantic space scatter plot" />
        ) : (
          <div className="flex items-center justify-center px-4 py-12 text-center">
            <div>
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="9" cy="10" r="1" />
                  <circle cx="15" cy="13" r="1.5" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-700">No semantic coordinates</p>
              <p className="mt-1 text-xs text-slate-500">
                Semantic map is unavailable for this run because coordinate data is missing.
              </p>
            </div>
          </div>
        )}
      </div>
      {hiddenCount > 0 && (
        <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          {hiddenCount} manually-edited group{hiddenCount === 1 ? '' : 's'} hidden — no coordinates available.
        </p>
      )}
    </div>
  );
};

export default SemanticSpaceChart;

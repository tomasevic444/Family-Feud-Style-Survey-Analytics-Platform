// src/components/admin/SurveyResultsChart.jsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';

// Cohesive AI Analytics palette: brand-anchored, paired with cyan and emerald accents.
const PALETTE = [
  '#6366f1', // brand-500 (violet/indigo)
  '#22d3ee', // accent-400 (cyan)
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#a855f7', // violet-500
  '#0ea5e9', // sky-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f43f5e', // rose-500
  '#84cc16', // lime-500
];

function truncate(label, max = 14) {
  if (!label) return '';
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

const SurveyResultsChart = ({ data }) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ width: 600, height: 360 });

  const sortedData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data
      .filter((d) => d && typeof d.count === 'number' && Number.isFinite(d.count))
      .slice()
      .sort((a, b) => b.count - a.count);
  }, [data]);

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
    d3.select('body').selectAll('.d3-tooltip').remove();

    if (sortedData.length === 0) return undefined;

    const margin = { top: 16, right: 16, bottom: 56, left: 44 };
    const width = size.width;
    const height = size.height;
    const innerW = Math.max(80, width - margin.left - margin.right);
    const innerH = Math.max(80, height - margin.top - margin.bottom);

    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);

    // SVG <defs> for per-bar vertical gradient + soft drop shadow
    const defs = svg.append('defs');
    const grad = defs
      .append('linearGradient')
      .attr('id', 'ff-bar-gradient')
      .attr('x1', '0%')
      .attr('x2', '0%')
      .attr('y1', '0%')
      .attr('y2', '100%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', 'currentColor').attr('stop-opacity', 1);
    grad.append('stop').attr('offset', '100%').attr('stop-color', 'currentColor').attr('stop-opacity', 0.7);

    const filter = defs
      .append('filter')
      .attr('id', 'ff-bar-shadow')
      .attr('x', '-20%')
      .attr('y', '-20%')
      .attr('width', '140%')
      .attr('height', '140%');
    filter
      .append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 4)
      .attr('stdDeviation', 4)
      .attr('flood-color', '#0f172a')
      .attr('flood-opacity', 0.12);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scaleBand()
      .domain(sortedData.map((d) => d.canonical_name))
      .range([0, innerW])
      .padding(0.28);

    const maxCount = d3.max(sortedData, (d) => d.count) || 1;
    const yScale = d3
      .scaleLinear()
      .domain([0, maxCount])
      .nice()
      .range([innerH, 0]);

    const color = d3.scaleOrdinal().domain(sortedData.map((d) => d.canonical_name)).range(PALETTE);

    // Gridlines
    g.append('g')
      .attr('class', 'ff-grid')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(Math.min(6, Math.max(3, Math.floor(innerH / 40))))
          .tickSize(-innerW)
          .tickFormat(() => '')
      )
      .call((sel) => sel.select('.domain').remove())
      .call((sel) =>
        sel
          .selectAll('line')
          .attr('stroke', '#e2e8f0')
          .attr('stroke-dasharray', '2 4')
      );

    // X axis
    const xAxis = g
      .append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).tickSizeOuter(0));
    xAxis.select('.domain').attr('stroke', '#cbd5e1');
    xAxis
      .selectAll('text')
      .attr('fill', '#475569')
      .attr('font-size', 11)
      .attr('font-family', 'inherit')
      .each(function (label) {
        d3.select(this).text(truncate(String(label), 12));
      })
      .attr('text-anchor', 'end')
      .attr('transform', 'rotate(-30)')
      .attr('dx', '-0.4em')
      .attr('dy', '0.6em');
    xAxis.selectAll('.tick line').attr('stroke', '#cbd5e1');

    // Y axis
    const yAxis = g
      .append('g')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(Math.min(6, Math.max(3, Math.floor(innerH / 40))))
          .tickFormat(d3.format('d'))
      );
    yAxis.select('.domain').remove();
    yAxis.selectAll('.tick line').remove();
    yAxis.selectAll('text').attr('fill', '#64748b').attr('font-size', 11).attr('font-family', 'inherit');

    // Tooltip
    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'd3-tooltip');

    // Bars
    const bars = g
      .selectAll('.bar')
      .data(sortedData, (d) => d.canonical_name);

    const bandwidth = xScale.bandwidth();
    const radius = Math.min(6, Math.max(2, bandwidth / 5));

    bars
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => xScale(d.canonical_name))
      .attr('width', bandwidth)
      .attr('y', innerH)
      .attr('height', 0)
      .attr('rx', radius)
      .attr('ry', radius)
      .style('color', (d) => color(d.canonical_name))
      .attr('fill', 'url(#ff-bar-gradient)')
      .attr('filter', 'url(#ff-bar-shadow)')
      .attr('opacity', 0.95)
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 1);
        tooltip
          .style('opacity', 1)
          .html(
            `<strong>${d.canonical_name}</strong>` +
              `<div class="ff-tt-meta">${d.count} response${d.count === 1 ? '' : 's'}</div>`
          );
      })
      .on('mousemove', function (event) {
        tooltip
          .style('left', `${event.pageX + 12}px`)
          .style('top', `${event.pageY - 12}px`);
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 0.95);
        tooltip.style('opacity', 0);
      })
      .transition()
      .duration(450)
      .ease(d3.easeCubicOut)
      .attr('y', (d) => yScale(d.count))
      .attr('height', (d) => innerH - yScale(d.count));

    // Value labels (only if bar is tall enough)
    g.selectAll('.bar-value')
      .data(sortedData)
      .enter()
      .append('text')
      .attr('class', 'bar-value')
      .attr('x', (d) => (xScale(d.canonical_name) || 0) + bandwidth / 2)
      .attr('y', (d) => yScale(d.count) - 6)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .attr('fill', '#334155')
      .style('opacity', 0)
      .text((d) => d.count)
      .transition()
      .delay(250)
      .duration(300)
      .style('opacity', (d) => (innerH - yScale(d.count) >= 18 ? 1 : 0));

    return () => {
      tooltip.remove();
    };
  }, [sortedData, size]);

  if (!sortedData || sortedData.length === 0) {
    return (
      <div className="ff-card p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M3 3v18h18" />
              <rect x="7" y="13" width="3" height="5" rx="1" />
              <rect x="12" y="9" width="3" height="9" rx="1" />
              <rect x="17" y="6" width="3" height="12" rx="1" />
            </svg>
          </span>
          <div>
            <h4 className="ff-section-title">Response distribution</h4>
            <p className="ff-section-subtitle">No grouped responses to chart yet.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ff-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-white via-brand-50/30 to-white px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white shadow-glow">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M3 3v18h18" />
              <rect x="7" y="13" width="3" height="5" rx="1" />
              <rect x="12" y="9" width="3" height="9" rx="1" />
              <rect x="17" y="6" width="3" height="12" rx="1" />
            </svg>
          </span>
          <div>
            <h4 className="ff-section-title">Response distribution</h4>
            <p className="ff-section-subtitle">
              Counts per grouped answer · {sortedData.length} group{sortedData.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <span className="ff-chip-brand">Bar chart</span>
      </div>
      <div ref={containerRef} className="px-3 py-3">
        <svg ref={svgRef} role="img" aria-label="Response distribution bar chart" />
      </div>
    </div>
  );
};

export default SurveyResultsChart;

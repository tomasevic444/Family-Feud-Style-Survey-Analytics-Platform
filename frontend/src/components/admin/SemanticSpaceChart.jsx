import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const SemanticSpaceChart = ({ data }) => {
  const d3Container = useRef(null);
  const validData = Array.isArray(data)
    ? data.filter(
        (d) =>
          d &&
          d.coordinates &&
          typeof d.coordinates.x === 'number' &&
          Number.isFinite(d.coordinates.x) &&
          typeof d.coordinates.y === 'number' &&
          Number.isFinite(d.coordinates.y)
      )
    : [];
  const hiddenCount = (Array.isArray(data) ? data.length : 0) - validData.length;

  useEffect(() => {
    if (!d3Container.current) return () => {};
    const svgRoot = d3.select(d3Container.current);
    svgRoot.selectAll('*').remove();
    d3.select('.d3-tooltip-semantic').remove();

    if (validData.length > 0) {
      const margin = { top: 20, right: 30, bottom: 40, left: 50 };
      const width = 500 - margin.left - margin.right;
      const height = 350 - margin.top - margin.bottom;

      const chart = svgRoot
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      const xExtent = d3.extent(validData, (d) => d.coordinates.x);
      const yExtent = d3.extent(validData, (d) => d.coordinates.y);
      const buffer = 0.2; 

      const xScale = d3.scaleLinear()
        .domain([xExtent[0] - buffer, xExtent[1] + buffer])
        .range([0, width]);

      const yScale = d3.scaleLinear()
        .domain([yExtent[0] - buffer, yExtent[1] + buffer])
        .range([height, 0]);

      // Dodaj ose na grafik
      chart.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale))
        .append("text")
        .attr("y", margin.bottom - 10)
        .attr("x", width / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .text("Semantička Osa 1 (PCA)");

      chart.append("g")
        .call(d3.axisLeft(yScale))
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -margin.left + 15)
        .attr("x", -height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .text("Semantička Osa 2 (PCA)");
        
      const tooltip = d3.select("body").append("div")
        .attr("class", "d3-tooltip-semantic")
        .style("position", "absolute")
        .style("z-index", "10")
        .style("visibility", "hidden")
        .style("background", "rgba(255,255,255,0.9)")
        .style("border", "1px solid #ccc")
        .style("border-radius", "5px")
        .style("padding", "8px")
        .style("font-size", "12px");
      chart.selectAll('circle')
        .data(validData)
        .enter()
        .append('circle')
          .attr('cx', (d) => xScale(d.coordinates.x))
          .attr('cy', (d) => yScale(d.coordinates.y))
          .attr('r', (d) => 3 + Math.sqrt(d.count))
          .style('fill', 'steelblue')
          .style('opacity', 0.7)
          .on("mouseover", (event, d) => {
            tooltip.style("visibility", "visible").html(`<strong>${d.canonical_name}</strong><br/>(${d.count} odgovora)`);
          })
          .on("mousemove", (event) => {
            tooltip.style("top", (event.pageY - 10) + "px").style("left", (event.pageX + 10) + "px");
          })
          .on("mouseout", () => {
            tooltip.style("visibility", "hidden");
          });
    }

    return () => {
      d3.select('.d3-tooltip-semantic').remove();
    };
  }, [data]);

  return (
    <div className="chart-container p-4 border border-gray-300 rounded-lg shadow bg-white mt-8">
      <h4 className="text-md font-semibold text-gray-700 mb-3 text-center">Mapa Značenja (Semantički Prostor)</h4>
      {validData.length > 0 ? (
        <svg ref={d3Container} />
      ) : (
        <p className="text-sm text-gray-500 p-2 text-center">
          Semantic map unavailable for this run because coordinate data is missing.
        </p>
      )}
      {hiddenCount > 0 && (
        <p className="text-xs text-gray-500 mt-2 text-center">
          Some manually edited groups are not shown in the semantic map because coordinate data is unavailable.
        </p>
      )}
    </div>
  );
};

export default SemanticSpaceChart;
// src/components/admin/SurveyResultsChart.jsx
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3'; // Import all of d3

const SurveyResultsChart = ({ data }) => {
  const d3Container = useRef(null); // Ref to the SVG container

  // This effect will run when the `data` prop changes
  useEffect(() => {
    if (data && d3Container.current && data.length > 0) {
      const svg = d3.select(d3Container.current);
      svg.selectAll("*").remove(); // Clear previous chart elements

      // --- Chart Dimensions and Margins ---
      const margin = { top: 30, right: 30, bottom: 120, left: 60 }; // Increased bottom margin for labels
      const width = 500 - margin.left - margin.right; // Fixed width for simplicity
      const height = 350 - margin.top - margin.bottom;

      // --- Create SVG container within the ref ---
      const chart = svg
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      // --- Scales ---
      // X-axis: Canonical Names (Ordinal Scale)
      const xScale = d3.scaleBand()
        .domain(data.map(d => d.canonical_name))
        .range([0, width])
        .padding(0.2); // Padding between bars

      // Y-axis: Counts (Linear Scale)
      const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count) || 10]) // Ensure domain starts at 0, max is data max or 10
        .range([height, 0]); // Inverted range for y-axis (0 at bottom)

      // --- Axes ---
      // X-axis
      chart.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale))
        .selectAll("text") // Select all text labels on x-axis
          .style("text-anchor", "end")
          .attr("dx", "-.8em")
          .attr("dy", ".15em")
          .attr("transform", "rotate(-45)"); // Rotate for better readability

      // Y-axis
      chart.append("g")
        .call(d3.axisLeft(yScale));

      // Y-axis label
      chart.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left + 15) // Position to the left of y-axis
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .style("fill", "#333")
        .text("Number of Responses");

      // --- Bars ---
      chart.selectAll(".bar")
        .data(data)
        .enter()
        .append("rect")
          .attr("class", "bar")
          .attr("x", d => xScale(d.canonical_name))
          .attr("y", d => yScale(d.count))
          .attr("width", xScale.bandwidth())
          .attr("height", d => height - yScale(d.count))
          .attr("fill", "steelblue")
        .on("mouseover", function(event, d) { // Tooltip on hover
            d3.select(this).attr("fill", "orange");
            tooltip.transition()
                .duration(200)
                .style("opacity", .9);
            tooltip.html(`<strong>${d.canonical_name}</strong><br/>Count: ${d.count}`)
                .style("left", (event.pageX + 5) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function(d) {
            d3.select(this).attr("fill", "steelblue");
            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        });

      // --- Tooltip --- (simple div tooltip)
      const tooltip = d3.select("body").append("div")
        .attr("class", "d3-tooltip")
        .style("position", "absolute")
        .style("z-index", "10")
        .style("visibility", "visible") // Start visible but opacity 0
        .style("opacity", 0)
        .style("background-color", "white")
        .style("border", "solid")
        .style("border-width", "1px")
        .style("border-radius", "5px")
        .style("padding", "10px")
        .style("font-size", "12px");


    } else if (d3Container.current) {
        // Clear SVG if no data
        d3.select(d3Container.current).selectAll("*").remove();
    }

    // Cleanup function to remove tooltip when component unmounts or data changes
    return () => {
        d3.select(".d3-tooltip").remove();
    };

  }, [data]); // Redraw chart if data changes

  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-500 p-4">No data available to display chart.</p>;
  }

  return (
    <div className="chart-container p-4 border border-gray-300 rounded-lg shadow bg-white">
      <h4 className="text-md font-semibold text-gray-700 mb-3 text-center">Survey Response Distribution</h4>
      <svg ref={d3Container} />
    </div>
  );
};

export default SurveyResultsChart;
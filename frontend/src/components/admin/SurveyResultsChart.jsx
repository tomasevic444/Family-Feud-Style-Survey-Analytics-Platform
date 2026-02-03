// src/components/admin/SurveyResultsChart.jsx
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3'; 

const SurveyResultsChart = ({ data }) => {
  const d3Container = useRef(null); 

  useEffect(() => {
    if (data && d3Container.current && data.length > 0) {
      const svg = d3.select(d3Container.current);
      svg.selectAll("*").remove();

      const margin = { top: 30, right: 30, bottom: 120, left: 60 }; 
      const width = 500 - margin.left - margin.right; 
      const height = 350 - margin.top - margin.bottom;

      const chart = svg
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      const xScale = d3.scaleBand()
        .domain(data.map(d => d.canonical_name))
        .range([0, width])
        .padding(0.2); 

      const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count) || 10])
        .range([height, 0]); 

      chart.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale))
        .selectAll("text") 
          .style("text-anchor", "end")
          .attr("dx", "-.8em")
          .attr("dy", ".15em")
          .attr("transform", "rotate(-45)");

      chart.append("g")
        .call(d3.axisLeft(yScale));
      chart.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left + 15) 
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .style("fill", "#333")
        .text("Number of Responses");

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
        .on("mouseover", function(event, d) { 
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

      const tooltip = d3.select("body").append("div")
        .attr("class", "d3-tooltip")
        .style("position", "absolute")
        .style("z-index", "10")
        .style("visibility", "visible") 
        .style("opacity", 0)
        .style("background-color", "white")
        .style("border", "solid")
        .style("border-width", "1px")
        .style("border-radius", "5px")
        .style("padding", "10px")
        .style("font-size", "12px");


    } else if (d3Container.current) {
        d3.select(d3Container.current).selectAll("*").remove();
    }

    return () => {
        d3.select(".d3-tooltip").remove();
    };

  }, [data]); 

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
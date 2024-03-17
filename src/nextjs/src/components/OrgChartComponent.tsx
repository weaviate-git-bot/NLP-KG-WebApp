import React, { useRef, useEffect } from "react";
import { OrgChart } from "@ferdydh/d3-org-chart";
import { select } from "d3";

type OrgChartComponentProps = {
  fields: DataType[];
  startExpanded?: boolean;
  setHoveredNode: React.Dispatch<React.SetStateAction<DataType | undefined>>;
};

type DataType = {
  id: string;
  parentId: string;
  numberOfPublications: number;
  description: string;
  label: string;
  _directSubordinates: number;
};

const chevronUp = `
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">
<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
</svg>
`;

const chevronDown = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">
<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
</svg>
`;

export const OrgChartComponent = ({
  fields,
  startExpanded,
  setHoveredNode,
}: OrgChartComponentProps) => {
  const d3Container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fields && d3Container.current) {
      const chart = new OrgChart<DataType>()
        .container(d3Container.current as unknown as string)
        .data(fields)
        .compact(true)
        .enableZoom(true)
        .nodeHeight((d) => 100)
        .nodeWidth((d) => 220)
        .childrenMargin((d) => 50)
        .compactMarginBetween((d) => 25)
        .compactMarginPair((d) => 50)
        .siblingsMargin((d) => 25)
        .svgHeight(d3Container.current.offsetHeight)
        .svgWidth(d3Container.current.offsetWidth)
        .buttonContent(({ node, state }) => {
          return `
          <div class="flex rounded-md p-1 text-sm m-auto border-2 bg-white text-blue-500"> 
            <span>
              ${node.children ? chevronUp : chevronDown}
            </span> 
            <span>
              ${node.data._directSubordinates}
            </span>
          </div>`;
        })
        .nodeContent(function (d, i, arr, state) {
          const url = d.data.id.split("_")[0] as string;
          const currentPath = window.location.pathname;
          const currentPathId = decodeURIComponent(
            currentPath.substring(currentPath.lastIndexOf("/") + 1)
          );
          const backgroundColor = currentPathId === url ? "bg-[#9ABCE4]" : "";
          return `
          <a class="flex px-6 py-4 rounded-xl border-2 w-full h-full bg-white hover:underline hover:text-blue-500 ${backgroundColor}" href="/fields/${encodeURIComponent(url)}">
            <div class="flex m-auto text-center">
              <div class="text-base"> 
                ${d.data.label} 
              </div>
          </div>
        </a>`;
        })
        .render();

      if (startExpanded) {
        chart.expandAll();
      }

      chart.fitExact();
    }
  }, []);

  useEffect(() => {
    const nodes = select(d3Container.current).selectAll(".node");

    nodes.on("mouseenter", (event, d: any) => {
      nodes.selectAll("a").style("box-shadow", "none");

      select(event.currentTarget)
        .select("a")
        .style("box-shadow", "0 0 20px 4px #0065bd");

      setHoveredNode(d.data);
    });
  });

  return (
    <div className="min-h-[400px] w-full rounded-xl border-2 md:h-full">
      <div ref={d3Container} className="h-full w-full" />
    </div>
  );
};

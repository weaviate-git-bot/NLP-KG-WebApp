import type {GetStaticPaths, GetStaticPropsContext, InferGetStaticPropsType,} from "next";
import {useEffect, useState} from "react";
import {Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import {env} from "~/env.cjs";
import {read} from "~/server/services/neo4jConnection";
import {api} from "~/utils/api";
import type {DataType, Field, FieldWithParent} from "~/utils/types";
import FilterBoard, {FilterData} from "~/components/Common/FilterBoard";
import {Pagination, PaginationButton} from "~/components/Pagination";
import {ResultPublications} from "~/components/SearchResult/ResultPublications";
import {ResultResearchers} from "~/components/SearchResult/ResultResearchers";
import {ShimmerPublication} from "~/components/Shimmer/ShimmerPublication";
import {ShimmerResearcher} from "~/components/Shimmer/ShimmerResearcher";
// import { OrgChartComponent } from "~/components/OrgChartComponent";
import dynamic from "next/dynamic";
import {BC_BAR_COLOR} from "~/styles/global";

const OrgChartComponent = dynamic(
  () =>
    import("~/components/OrgChartComponent").then(
      (mod) => mod.OrgChartComponent
    ),
  { ssr: false }
);

export const getStaticPaths: GetStaticPaths<{ id: string }> = async () => {
  const res = await read(
    `MATCH (n:FieldOfStudy) WHERE elementId(n)<>"${env.FOS_ROOT_ID}" RETURN elementId(n) as id`
  );

  const paths = res.map((x) => ({
    params: { id: encodeURIComponent(x.id as string) },
  }));

  return {
    fallback: "blocking",
    paths,
  };
};

function createIdMapWithIndex(inputArray: DataType[]) {
  let idMap = new Map();

  // Iterate over the array and construct the map
  inputArray.forEach((obj, index) => {
    let newId = `${obj.id}_${index}`;

    // If the original id is not in the map, add it with a new array
    if (!idMap.has(obj.id)) {
      idMap.set(obj.id, [newId]);
    } else {
      // If the original id is already in the map, push the new id to the array
      idMap.get(obj.id).push(newId);
    }
    obj.id = newId;
  });
  return idMap;
}

function fillParentIds(inputArray: DataType[], idMap: any) {
  inputArray.forEach((obj) => {
    const parentIds = idMap.get(obj.parentId);
    if (parentIds) {
      parentIds.forEach((parentId: any) => {
        if (
          !inputArray.find(
            (ele) =>
              ele.parentId === parentId &&
              ele.id.split("_")[0] === obj.id.split("_")[0]
          )
        ) {
          obj.parentId = parentId;
          return;
        }
      });
    }
  });
}

// Make this statically generated (Keywords: Static Site Generation)
export const getStaticProps = async (context: GetStaticPropsContext) => {
  //////////////////////////////////////////////////////
  // Note: the following lines share the same code as [id].tsx
  // But because of nextjs magic, we can't extract this into a function
  const rootId = env.FOS_ROOT_ID;

  const rootCypher = `MATCH (root:FieldOfStudy)
  WHERE elementId(root)="${rootId}"
  RETURN root`;

  const treeCypher = `MATCH p=((root:FieldOfStudy)-[:SUPERFIELD_OF *1..]->(f:FieldOfStudy))
  where elementId(root)="${rootId}"
  return f as field, elementId(startNode(last(relationships(p)))) as parentId`;

  const rootResult = (await read(rootCypher)).map((entry) => {
    const field = entry.root as FieldWithParent;
    field.parentId = "";
    return field;
  });

  const treeResult = (await read(treeCypher)).map((entry) => {
    const field = entry.field as FieldWithParent;
    field.parentId = entry.parentId as string;
    return field;
  });

  const allFields = treeResult.concat(rootResult).map((field) => {
    return {
      id: field.elementId,
      parentId: field.parentId,
      synonyms: field.properties.synonyms,
      numberOfPublications: field.properties.numberOfPublications,
      description: field.properties.description,
      label: field.properties.label,
    } as DataType;
  });

  //////////////////////////////////////////////////////

  const { params } = context;
  const id = (params?.id as string) || "";

  fillParentIds(allFields, createIdMapWithIndex(allFields));

  if (id === env.FOS_ROOT_ID)
    return {
      props: {
        isRoot: true,
        result: JSON.stringify(allFields) || "",
      },
    } as const;

  const filterCypher = `MATCH (f:FieldOfStudy)
    WHERE elementId(f)=$id
    WITH f
    OPTIONAL MATCH (f)-[:SUPERFIELD_OF]->(f_sub)
    WITH f, COLLECT(DISTINCT f_sub) as subfields
    OPTIONAL MATCH (f)-[:SUBFIELD_OF*]->(f_sup)
    WITH [f] as field, subfields, COLLECT(DISTINCT f_sup) as supfields
    WITH field+subfields+supfields as fields
    UNWIND fields as field
    RETURN elementId(field) as id`;

  const idsToFilter = (await read(filterCypher, { id: id })).map((entry) => {
    return entry.id as string;
  });

  const fieldCypher = `MATCH (f:FieldOfStudy)
    WHERE elementId(f)=$id
    RETURN f as field`;

  const field = (await read(fieldCypher, { id: id })).map((entry) => {
    return entry.field as Field;
  })[0]!;

  // We first filter the trees with relevant id
  const fieldsWithRelevantId = allFields.filter((item) =>
    idsToFilter.includes(item.id.split("_")[0] as string)
  );

  // Then, it's possible that the field has a parent node that we don't want to show here, so we remove those
  const treeFields = fieldsWithRelevantId.filter(
    (item) =>
      !item.parentId ||
      idsToFilter.includes(item.parentId.split("_")[0] as string)
  );

  const treeFieldsJSON = JSON.stringify(treeFields) || "";
  const fieldJSON = JSON.stringify(field) || "";

  return {
    props: {
      id,
      isRoot: false,
      treeFieldsJSON: treeFieldsJSON,
      fieldJSON: fieldJSON,
    },
    revalidate: 120,
  } as const;
};

export default function FieldOfStudyView(
  props: InferGetStaticPropsType<typeof getStaticProps>
) {
  if (props.isRoot) {
    return <RootPage {...props} />;
  } else {
    return <FOSPage {...props} />;
  }
}

const RootPage = ({
  result,
}: Extract<
  InferGetStaticPropsType<typeof getStaticProps>,
  { isRoot: true }
>) => {
  if (!result) {
    return <div>No result</div>;
  }

  const fields = JSON.parse(result as string) as DataType[];
  const root = fields.find((node) => node.parentId === "");

  const [hoveredNode, setHoveredNode] = useState<DataType | undefined>(root);

  return (
    <div className="flex min-h-screen justify-center gap-x-12 gap-y-4 p-4 md:flex-row md:px-12">
      <div className="flex w-full flex-col justify-start md:w-3/4">
        <h1 className="mb-2 w-full text-center text-2xl">
          Fields of Study Hierarchy Graph
        </h1>
        <div className="flex flex-grow">
          <div className="w-full flex-shrink-0 lg:w-3/4">
            <OrgChartComponent
              fields={fields}
              setHoveredNode={setHoveredNode}
            />
          </div>
          {hoveredNode && (
            <div className="w-full flex-shrink-0 overflow-y-auto pl-10 lg:w-1/4">
              <h1 className="text-[20px] font-bold">{hoveredNode.label}</h1>
              <p>{hoveredNode.description}</p>
              <p>
                <b>Number of Publications:</b>{" "}
                {hoveredNode.numberOfPublications}
              </p>
              {hoveredNode.synonyms && (
                <p>
                  <b>Synonyms:</b> {hoveredNode.synonyms.join(", ")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const FOSPage = ({
  id,
  treeFieldsJSON,
  fieldJSON,
}: Extract<
  InferGetStaticPropsType<typeof getStaticProps>,
  { isRoot: false }
>) => {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [id]);

  if (!fieldJSON || !treeFieldsJSON) {
    console.error("Contact maintainer");
    return <div>No result</div>;
  }

  type PublicationSortOption = "citation" | "recency" | "influential";
  const [publicationSortOption, setPublicationSortOption] =
    useState<PublicationSortOption>("citation");

  type ResearcherSortOption = "citation" | "publication" | "h-index";
  const [researcherSortOption, setResearcherSortOption] =
    useState<ResearcherSortOption>("citation");

  const treeFields = JSON.parse(treeFieldsJSON as string) as DataType[];
  const field = JSON.parse(fieldJSON as string) as Field;

  const [filterData, setFilterData] = useState<FilterData>({
    citation: 0,
    startYear: 0,
    endYear: 99999,
    venues: [],
    fields: [],
    survey: undefined,
  });

  const { data: allVenueData } = api.search.all_venues.useQuery();
  const { data: allFieldData } = api.search.all_fields.useQuery();

  const { data, isLoading } = api.page.field.useQuery({
    id: field.elementId,
    page,
    publicationSortOption: publicationSortOption,
    fieldFilters: filterData.fields,
    min_citation_filter: filterData.citation,
    min_date_filter: filterData.startYear,
    max_date_filter: filterData.endYear,
    venue_filters: filterData.venues,
    survey_filter: filterData.survey,
  });

  const { data: researcherData, isLoading: researcherIsLoading } =
    api.page.fieldAuthors.useQuery({
      id: field.elementId,
      researcherSortOption: researcherSortOption,
    });

  const { data: fieldData, isLoading: fieldIsLoading } =
    api.page.highlightedField.useQuery({ id: field.elementId });

  const [hoveredNode, setHoveredNode] = useState<DataType | undefined>(
    treeFields[0]
  );

  return (
    <div className="md:py-8">
      <div className="flex min-h-[60vh] flex-col gap-x-12 gap-y-4 p-4 md:flex-row md:px-12">
        <div className="space-y-3 px-5 md:w-[60%]">
          <h3>Field of Study:</h3>
          <div
            className="flex w-fit gap-1"
          >
            <h1 className="text-2xl">
              {field.properties.label}
            </h1>
            <div className="hidden group-hover:block">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-6 w-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
                />
              </svg>
            </div>
          </div>
          <p>{field.properties.description}</p>
          <div className="w-full flex flex-col items-center">
            <p className="mb-6 mt-8">
              Papers released in this area over the years:
            </p>
            <div className="w-[80%] h-[30vh]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  width={600}
                  height={300}
                  data={fieldIsLoading || !fieldData?.trend ? [] : fieldData.trend}
                  maxBarSize={30}
                >
                  <CartesianGrid stroke="#ccc" strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar type="monotone" dataKey="count" fill={BC_BAR_COLOR} />
                </BarChart>
              </ResponsiveContainer>

            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col justify-start md:w-1/3">
          <h4 className="w-full text-center text-xl">Hierarchy</h4>
          <OrgChartComponent
            fields={treeFields}
            startExpanded
            setHoveredNode={setHoveredNode}
          />
        </div>
      </div>
      <div className="divider md:px-12" />

      {/* Papers & Researchers */}
      <div className="mt-8 flex w-full justify-center gap-x-12 gap-y-4 p-4 md:flex-row md:px-12">
        <div className="w-[17%] border-r p-4">
          <FilterBoard
            venues={allVenueData?.venues}
            fields={allFieldData?.fields}
            setFilterData={setFilterData}
          />
        </div>

        {/* Result Publications */}
        <div className="md:w-[66%] px-[5%]">
          <h3 className="text-sm text-gray-400">
            <span>Publications for {field.properties.label}</span>
          </h3>
          {(isLoading || !!data?.publications.length) && (
            <div className="flex items-center">
              <span className="mr-2 text-xs text-gray-400">Sort by</span>
              <select
                onChange={(e) =>
                  setPublicationSortOption(
                    e.target.value as PublicationSortOption
                  )
                }
                value={publicationSortOption}
                className="select select-bordered select-primary select-xs text-primary"
              >
                <option value="citation">Citation</option>
                <option value="recency">Recency</option>
                <option value="influential">Most Influential papers</option>
              </select>
            </div>
          )}
          <PaginationButton
            currentPage={page}
            setCurrentPage={setPage}
            hasNext={data?.hasNext ?? false}
            hasPrevious={data?.hasPrevious ?? false}
          />
          {isLoading ? (
            <>
              <ShimmerPublication />
              <ShimmerPublication />
              <ShimmerPublication />
              <ShimmerPublication />
            </>
          ) : !data ? (
            <div>data is empty</div>
          ) : (
            <ResultPublications publications={data.publications} />
          )}
          <Pagination
            currentPage={page}
            setCurrentPage={setPage}
            hasNext={data?.hasNext ?? false}
            hasPrevious={data?.hasPrevious ?? false}
            totalResults={data?.total ?? 0}
          />
        </div>

        {/* Researchers */}
        {(researcherIsLoading ||
          (researcherData?.researchers &&
            !!researcherData.researchers.length)) && (
            <>
              <div className="w-[17%] space-y-3">
                <h3 className="text-sm text-gray-400">
                  <span>Researchers for {field.properties.label}</span>
                </h3>
                <div className="flex items-center">
                  <span className="mr-2 text-xs text-gray-400">Sort by</span>
                  <select
                    onChange={(e) =>
                      setResearcherSortOption(
                        e.target.value as ResearcherSortOption
                      )
                    }
                    value={researcherSortOption}
                    className="select select-bordered select-primary select-xs text-primary"
                  >
                    <option value="citation">Citation</option>
                    <option value="publication">Publication</option>
                    <option value="hindex">h-index</option>
                  </select>
                </div>

                {researcherIsLoading ? (
                  <div>
                    <ShimmerResearcher />
                    <ShimmerResearcher />
                    <ShimmerResearcher />
                    <ShimmerResearcher />
                  </div>
                ) : !researcherData ? (
                  <div>data is empty</div>
                ) : (
                  <ResultResearchers researchers={researcherData.researchers} />
                )}
              </div>
            </>
          )}
      </div>
    </div>
  );
};

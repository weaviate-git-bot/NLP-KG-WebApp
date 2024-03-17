import type {GetStaticPaths, GetStaticProps, InferGetStaticPropsType,} from "next";
import Link from "next/link";
import {useEffect, useState} from "react";
import ModifyBookmarkModal from "~/components/Common/ModifyBookmarkModal";
import {env} from "~/env.cjs";
import {useActiveSection} from "~/hooks";
import {read} from "~/server/services/neo4jConnection";
import {getMonthName, twoDigits} from "~/utils";
import {api} from "~/utils/api";
import type {DataType, FieldWithParent, PublicationSearch,} from "~/utils/types";
import AskThisPaperPopUp from "~/components/PublicationChat/AskThisPaperPopUp";
import {useSession} from "next-auth/react";
import {InlineResearcherList} from "~/components/InlineResearcherList";
//import { OrgChartComponent } from "~/components/OrgChartComponent";
import {Pagination, PaginationButton} from "~/components/Pagination";
import {ResultPublications} from "~/components/SearchResult/ResultPublications";
import {ShimmerPublication} from "~/components/Shimmer/ShimmerPublication";
import {URLLink} from "~/components/URLLink";
import dynamic from "next/dynamic";

const OrgChartComponent = dynamic(
  () =>
    import("~/components/OrgChartComponent").then(
      (mod) => mod.OrgChartComponent
    ),
  { ssr: false }
);

export const getStaticPaths: GetStaticPaths<{ id: string }> = async () => {
  // TOGGLE FOR DEVELOPMENT
  // const res = await read(`MATCH (n:Publication) RETURN elementId(n) as id LIMIT 300`);
  const res = await read(`MATCH (n:Publication) RETURN elementId(n) as id`);
  const paths = res.map((x) => ({
    params: { id: encodeURIComponent(x.id as string) },
  }));

  return {
    fallback: "blocking",
    paths,
  };
};

// Make this statically generated (Keywords: Static Site Generation)
export const getStaticProps: GetStaticProps = async (context) => {
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
  const full_id = (params?.id as string) || "";
  var id = undefined;
  var chatid = undefined;
  if (full_id.includes("---")) {
    [id, chatid] = full_id.split("---");
  } else {
    id = full_id;
    chatid = "";
  }

  const queryString = `
    MATCH (p:Publication)
    WHERE elementId(p)='${id}'
    WITH p
    LIMIT 1
    MATCH (p)-[:PUBLISHED_AT]-(venue)
    RETURN p AS publication, venue
    `;
  const query = (await read(queryString)).map((x) => {
    x.publication.venue = x.venue;
    const publication = x.publication as PublicationSearch;
    return publication;
  });

  const filterCypher = `MATCH (p:Publication)-[:HAS_FIELD_OF_STUDY]-(f:FieldOfStudy)
  WHERE elementId(p)=$id
  WITH f
  OPTIONAL MATCH (f)-[:SUBFIELD_OF*]->(f_sup)
  WITH [f] as field, COLLECT(DISTINCT f_sup) as supfields
  WITH field+supfields as fields
  UNWIND fields as field
  RETURN elementId(field) as id`;

  const idsToFilter = (await read(filterCypher, { id: id })).map((entry) => {
    return entry.id as string;
  });

  // We first filter the trees with relevant id
  const fieldsWithRelevantId = allFields.filter((item) =>
    idsToFilter.includes(item.id)
  );
  // Then, it's possible that the field has a parent node that we don't want to show here, so we remove those
  const treeFields = fieldsWithRelevantId.filter(
    (item) => !item.parentId || idsToFilter.includes(item.parentId)
  );
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

  fillParentIds(treeFields, createIdMapWithIndex(treeFields));

  const treeFieldsJSON = JSON.stringify(treeFields) || "";

  const publicationJSON = JSON.stringify(query[0]) || "";

  return {
    props: {
      id,
      chatid,
      publicationJSON: publicationJSON,
      treeFieldsJSON: treeFieldsJSON,
    },
    revalidate: 120,
  };
};

export default function PublicationView({
  id,
  chatid,
  publicationJSON,
  treeFieldsJSON,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const { activeId } = useActiveSection(["citations", "references"]);
  const [citationsPage, setCitationsPage] = useState(0);
  const [referencesPage, setReferencesPage] = useState(0);

  const [chatMessages, setChatMessages] = useState<{ sender: string; text: string }[]>([]);
  const initialRecommendedQuestions = [
    "What is the goal of this paper?",
    "What are the key results of this paper?",
    "What methods are used in this paper?",
  ];
  const [chatRecommendedQuestions, setChatRecommendedQuestions] = useState(initialRecommendedQuestions);

  useEffect(() => {
    setCitationsPage(0);
    setReferencesPage(0);
    // Reset chat messages when publication view changes
    setChatMessages([]);
    // Update recommended questions when publication view changes
    setChatRecommendedQuestions(initialRecommendedQuestions);
  }, [id]);


  if (!publicationJSON || !treeFieldsJSON) {
    return <div>No result</div>;
  }

  const publication = JSON.parse(
    publicationJSON as string
  ) as PublicationSearch;

  const content = publication.properties.fullText
    ? publication.properties.fullText
    : publication.properties.publicationTitle;
  const publicationName = publication.properties.publicationTitle;
  const publicationId = publication.elementId;

  const treeFields = JSON.parse(treeFieldsJSON as string) as DataType[];

  type SortOption = "citation" | "recency";
  const [citationsSortOption, setCitationsSortOption] =
    useState<SortOption>("citation");

  const [referencesSortOption, setReferencesSortOption] =
    useState<SortOption>("citation");

  const { data: citationsData, isLoading: citationsIsLoading } =
    api.page.publicationCitations.useQuery({
      id: publication.elementId,
      citationsPage,
      citationsSortOption: citationsSortOption,
    });

  const { data: referencesData, isLoading: referencesIsLoading } =
    api.page.publicationReferences.useQuery({
      id: publication.elementId,
      referencesPage,
      referencesSortOption: referencesSortOption,
    });

  const { data: session } = useSession();
  const { data: profileData } = api.profile.get.useQuery(undefined, {
    enabled: session !== undefined && session !== null,
  });

  const [hoveredNode, setHoveredNode] = useState<DataType | undefined>(
    treeFields[0]
  );

  return (
    <div className="md:py-8">
      {/* Upper part */}
      <div className="flex min-h-[50vh] flex-col gap-x-12 gap-y-4 overflow-x-hidden p-4 md:flex-row md:px-12">
        {/* Left */}
        <div className="md:w-2/3 md:pl-12">
          <div className="">
            <h3>Publication:</h3>
            <h1 className="flex flex-row items-start justify-between text-2xl font-semibold">
              <div>
                {publication.properties.publicationTitle}
              </div>
              <ModifyBookmarkModal publication={publication.elementId} />
            </h1>
            <div className="my-2 space-y-3">
              <p className="text-sm">
                <InlineResearcherList
                  authorList={publication.properties.authorList}
                  authorIdList={publication.properties.authorIdList}
                />
                &nbsp;•&nbsp;
                <Link
                  href={`/venues/${encodeURIComponent(
                    publication.venue.elementId
                  )}`}
                  className="link"
                  key={publication.venue.elementId}
                >
                  @{publication.venue.properties.name}
                </Link>
                &nbsp;•&nbsp;
                <span>{`${twoDigits(
                  publication.properties.publicationDate.day
                )} ${getMonthName(
                  publication.properties.publicationDate.month
                )} ${publication.properties.publicationDate.year}`}</span>
              </p>
              <p className="mb-2"><b>TLDR:</b> {publication.properties.tldr}</p>
              <div className="flex space-x-2">
                <URLLink publication={publication} />
                <div className="rounded-full border-2 px-2 text-center text-sm font-semibold">
                  Citations: {publication.properties.numberOfCitations}
                </div>
              </div>
            </div>
          </div>


          <div className="block peer-checked:hidden">
            <div className="divider divider-vertical m-0" />
            <b>Abstract:</b> {publication.properties.publicationAbstract}
          </div>

        </div>
        {/* Right */}
        <div className="mt-4 flex flex-col justify-start md:w-1/3">
          <h2 className="mb-6 text-center text-lg font-semibold">
            Related Fields of Study
          </h2>

          {citationsIsLoading ? (
            <div>loading</div>
          ) : !citationsData ? (
            <div>No Result</div>
          ) : (
            <OrgChartComponent
              fields={treeFields}
              startExpanded
              setHoveredNode={setHoveredNode}
            />
          )}
        </div>
      </div>

      {/* Lower Part */}
      <div className="sticky flex h-16 justify-center gap-8 border-y-4 bg-white">
        <Link
          className={`flex h-full items-center p-4 font-bold hover:bg-gray-200 ${activeId === "citations" ? "bg-gray-100" : ""
            }`}
          href="#citations"
        >
          {publication.properties.numberOfCitations || "No"}
          &nbsp;Citations
        </Link>
        <Link
          className={`flex h-full items-center p-4 font-bold hover:bg-gray-200 ${activeId === "references" ? "bg-gray-100" : ""
            }`}
          href="#references"
        >
          {referencesData ? referencesData.total : "No"}
          &nbsp;References
        </Link>
      </div>
      <div className="p-4 md:px-24">
        <div id="citations" className="scroll-mt-28 w-[70vw] xl:w-[800px] m-auto">
          <h3 className="text-xl font-semibold">Citations</h3>
          <div className="flex justify-between mb-3">
            {(citationsIsLoading || !!citationsData?.citations.length) && (
              <div className="flex items-center">
                <span className="mr-2 text-xs text-gray-400">Sort by</span>
                <select
                  onChange={(e) =>
                    setCitationsSortOption(e.target.value as SortOption)
                  }
                  value={citationsSortOption}
                  className="select select-bordered select-primary select-xs text-primary"
                >
                  <option value="citation">Citation</option>
                  <option value="recency">Recency</option>
                </select>
              </div>
            )}
            <PaginationButton
              currentPage={citationsPage}
              setCurrentPage={setCitationsPage}
              hasNext={citationsData?.hasNext ?? false}
              hasPrevious={citationsData?.hasPrevious ?? false}
            />
          </div>
          {citationsIsLoading ? (
            <>
              <ShimmerPublication />
              <ShimmerPublication />
              <ShimmerPublication />
              <ShimmerPublication />
            </>
          ) : !citationsData ? (
            <div>data is empty</div>
          ) : (
            <ResultPublications publications={citationsData.citations} />
          )}
          <Pagination
            totalResults={citationsData?.total ?? 0}
            currentPage={citationsPage}
            setCurrentPage={setCitationsPage}
            hasNext={citationsData?.hasNext ?? false}
            hasPrevious={citationsData?.hasPrevious ?? false}
          />
        </div>
        <div className="divider" />
        <div id="references" className="scroll-mt-28 w-[70vw] xl:w-[800px] m-auto">
          <h3 className="text-xl font-semibold">References</h3>
          <div className="flex justify-between mb-3">
            {(referencesIsLoading || !!referencesData?.references.length) && (
              <div className="flex items-center">
                <span className="mr-2 text-xs text-gray-400">Sort by</span>
                <select
                  onChange={(e) =>
                    setReferencesSortOption(e.target.value as SortOption)
                  }
                  value={referencesSortOption}
                  className="select select-bordered select-primary select-xs text-primary"
                >
                  <option value="citation">Citation</option>
                  <option value="recency">Recency</option>
                </select>
              </div>
            )}

            <PaginationButton
              currentPage={referencesPage}
              setCurrentPage={setReferencesPage}
              hasNext={referencesData?.hasNext ?? false}
              hasPrevious={referencesData?.hasPrevious ?? false}
            />
          </div>
          {referencesIsLoading ? (
            <>
              <ShimmerPublication />
              <ShimmerPublication />
              <ShimmerPublication />
              <ShimmerPublication />
            </>
          ) : !referencesData ? (
            <div>data is empty</div>
          ) : (
            <ResultPublications publications={referencesData.references} />
          )}
          <Pagination
            totalResults={referencesData?.total ?? 0}
            currentPage={referencesPage}
            setCurrentPage={setReferencesPage}
            hasNext={referencesData?.hasNext ?? false}
            hasPrevious={referencesData?.hasPrevious ?? false}
          />
        </div>

        <div key={publicationId} className="ml-2 w-[12%] border-r p-4">
          <AskThisPaperPopUp
            publication={content}
            publicationId={publicationId}
            publicationName={publicationName}
            chatId={chatid}
            openaikey={profileData?.openaikey}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
            chatRecommendedQuestions={chatRecommendedQuestions}
            setChatRecommendedQuestions={setChatRecommendedQuestions}
          />
        </div>
      </div>
    </div>
  )
}

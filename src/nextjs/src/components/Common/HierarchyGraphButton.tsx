import getConfig from "next/config";
import {useRouter} from "next/router";

const HierarchyButton = () => {
    const router = useRouter();
    const {publicRuntimeConfig} = getConfig();
    const fos_root_node_link = `/fields/${encodeURIComponent(publicRuntimeConfig.FOS_ROOT_ID).split("_")[0]}` as string;

    return (
        <button className="btn btn-sm tooltip tooltip-bottom" onClick={() => router.push(fos_root_node_link)}
                data-tip="Go to Fields of Study hierarchy graph">
            <div className="flex flex-row items-center gap-x-2">
                <span>Hierarchy Graph</span>
            </div>
        </button>
    );
};

export default HierarchyButton;

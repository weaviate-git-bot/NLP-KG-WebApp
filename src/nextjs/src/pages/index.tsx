import {type NextPage} from "next";
import Head from 'next/head';
import {useRouter} from "next/router";
import {SearchBox} from "~/components/SearchBox";
import {Toggle} from "~/components/Toggle";
import BookmarkListsDropdown from "~/components/Common/BookmarkListsDropdown";
import NotificationDropdown from "~/components/Common/NotificationDropdown";
import ProfileButton from "~/components/Common/ProfileButton";
import HierarchyButton from "~/components/Common/HierarchyGraphButton";
import getConfig from "next/config";
import Link from "next/link";


const Home: NextPage = () => {
  const router = useRouter();
  const { publicRuntimeConfig } = getConfig();
  const fos_root_node_link = `/fields/"${publicRuntimeConfig.FOS_ROOT_ID}"`.replace(/:/g, "%3A");
  const currentYear = new Date().getFullYear();

  return (
    <div className="relative h-full w-full bg-base-200">
      {/* Head */}
      <Head>
        <title>NLP Knowledge Graph</title>
        <meta
            name="description"
            content="Natural Language Processing Knowledge Graph"
        />
        <link rel="icon" href="/favicon-white.ico"/>
      </Head>

      {/* Main Section */}
      <main className="container mx-auto">
        <div className="absolute right-0 top-0 mt-4 mr-8 flex flex-row items-center gap-x-4">
          <HierarchyButton/>
          <NotificationDropdown/>
          <BookmarkListsDropdown/>
          <ProfileButton/>
        </div>
        <div className="hero min-h-screen">
          <div className="hero-content text-center">
            <div>
              <h1 className="text-5xl font-bold text-primary">NLP-KG</h1>
              <p className="py-6">
                Explore Scholarly Entities in Natural Language Processing
              </p>
              <div className="flex flex-row justify-center">
                <SearchBox/>
              </div>
              <div className="mt-4 flex flex-row justify-center">
                <Toggle/>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Section */}
      <footer className="footer footer-center p-0 bg-base-200 text-base-content rounded -mt-[30px]">
        <nav className="grid grid-flow-col gap-5">
          <Link className="link link-hover" href="/about">About</Link>
          <Link className="link link-hover"
                href="https://www.tum.de/en/about-tum/contact-directions/legal-notice">Legal Notice</Link>
          <p>Copyright © {currentYear}</p>
        </nav>
      </footer>
    </div>
  );
};
export default Home;

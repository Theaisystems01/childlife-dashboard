import { useEffect, useState } from "react";
import { api, getToken, logout } from "./lib/api";
import { useTheme } from "./components/ui";
import Sidebar from "./components/Sidebar";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Calls from "./pages/Calls";
import CallQueue from "./pages/CallQueue";
import Settings from "./pages/Settings";
import Help from "./pages/Help";

const PAGES = {
  overview: {
    title: "Overview",
    description: "Complaint trends and call outcomes across the feedback line.",
    Component: Overview,
  },
  calls: {
    title: "Call records",
    description: "Every call in the foundation reporting format, searchable and exportable.",
    Component: Calls,
  },
  queue: {
    title: "Call queue",
    description: "Upload patient lists and track who still needs to be contacted.",
    Component: CallQueue,
  },
  settings: {
    title: "Settings",
    description: "How and when outbound calls are placed.",
    Component: Settings,
  },
  help: {
    title: "Help",
    description: "How to upload a list, follow the queue, and read the reports.",
    Component: Help,
  },
};

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  // The page lives in the URL hash, not only in React state.
  //
  // Without this a refresh always landed back on Overview, and the browser's back
  // button walked out of the app entirely rather than to the previous page. The hash
  // is used rather than a path so no server or Vercel rewrite rule is needed.
  const [tab, setTab] = useState(() => {
    const fromHash = window.location.hash.replace(/^#\/?/, "");
    return fromHash in PAGES ? fromHash : "overview";
  });

  // Keep the URL in step when the page changes, and follow the URL when the user
  // presses back or forward.
  useEffect(() => {
    if (window.location.hash.replace(/^#\/?/, "") !== tab) {
      window.history.pushState(null, "", `#/${tab}`);
    }
  }, [tab]);

  useEffect(() => {
    const onNav = () => {
      const fromHash = window.location.hash.replace(/^#\/?/, "");
      setTab(fromHash in PAGES ? fromHash : "overview");
    };
    window.addEventListener("popstate", onNav);
    window.addEventListener("hashchange", onNav);
    return () => {
      window.removeEventListener("popstate", onNav);
      window.removeEventListener("hashchange", onNav);
    };
  }, []);
  const [filters, setFilters] = useState(null);
  const [theme, setTheme] = useTheme();

  // Resume an existing session on load; a rejected token drops us back to sign-in.
  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (user) api.filters().then(setFilters).catch(() => setFilters(null));
  }, [user]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--page)" }}>
        <div className="flex items-center gap-2.5 text-sm" style={{ color: "var(--text-muted)" }}>
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
          Loading…
        </div>
      </div>
    );
  }

  if (!user) return <Login onSignedIn={setUser} />;

  const page = PAGES[tab];
  const Component = page.Component;

  return (
    <div className="flex min-h-screen" style={{ background: "var(--page)" }}>
      <Sidebar
        tab={tab}
        onTab={setTab}
        user={user}
        theme={theme}
        onTheme={setTheme}
        onSignOut={() => {
          logout();
          setUser(null);
        }}
      />

      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-[1360px] px-6 py-8 lg:px-10">
          <header className="mb-7 pl-12 lg:pl-0">
            <h1 className="text-[26px] font-medium leading-tight tracking-[-0.02em]">{page.title}</h1>
            <p className="mt-1 text-[13.5px]" style={{ color: "var(--text-muted)" }}>
              {page.description}
            </p>
          </header>

          <div key={tab} className="animate-in">
            <Component filters={filters} user={user} />
          </div>
        </main>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, getToken, logout } from "./lib/api";
import { useTheme } from "./components/ui";
import Sidebar from "./components/Sidebar";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Calls from "./pages/Calls";
import CallQueue from "./pages/CallQueue";

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
};

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState("overview");
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
            <Component filters={filters} />
          </div>
        </main>
      </div>
    </div>
  );
}

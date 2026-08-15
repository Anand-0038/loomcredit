"use client";

import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { docsGroups, docsPath, type DocsPage } from "../lib/docs";

export function DocsSidebar({
  activeSlug,
  pages,
}: {
  activeSlug: string;
  pages: DocsPage[];
}) {
  const [query, setQuery] = useState("");
  const filteredPages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return pages;
    return pages.filter((page) =>
      `${page.title} ${page.description} ${page.group}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [pages, query]);

  return (
    <aside className="docs-sidebar" aria-label="Documentation navigation">
      <div className="docs-search">
        <MagnifyingGlass size={17} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search docs"
          aria-label="Search documentation"
        />
        <kbd>/</kbd>
      </div>
      <nav>
        {docsGroups.map((group) => {
          const groupPages = filteredPages.filter(
            (page) => page.group === group,
          );
          if (groupPages.length === 0) return null;
          return (
            <div className="docs-nav-group" key={group}>
              <p>{group}</p>
              {groupPages.map((page) => (
                <Link
                  key={page.slug}
                  href={docsPath(page.slug)}
                  className={page.slug === activeSlug ? "active" : undefined}
                  aria-current={page.slug === activeSlug ? "page" : undefined}
                >
                  {page.label}
                </Link>
              ))}
            </div>
          );
        })}
        {filteredPages.length === 0 ? (
          <p className="docs-no-results">No matching pages.</p>
        ) : null}
      </nav>
    </aside>
  );
}

import Link from "next/link";
import { ArrowUpRight, BookOpen } from "@phosphor-icons/react/dist/ssr";

import { docsPages, type DocsPage } from "../lib/docs";
import { absoluteUrl, siteName } from "../lib/seo";
import { DocsSidebar } from "./docs-sidebar";
import { StructuredData } from "./structured-data";

export function DocsShell({
  activeSlug,
  page,
  children,
}: {
  activeSlug: string;
  page: DocsPage;
  children: React.ReactNode;
}) {
  return (
    <main className="docs-page">
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          "@id": absoluteUrl(`/docs${page.slug ? `/${page.slug}` : ""}`),
          headline: page.title,
          description: page.description,
          url: absoluteUrl(`/docs${page.slug ? `/${page.slug}` : ""}`),
          inLanguage: "en",
          author: { "@type": "Organization", name: siteName },
          publisher: { "@type": "Organization", name: siteName },
          isPartOf: { "@type": "WebSite", name: siteName },
        }}
      />
      <div className="docs-mobile-bar">
        <BookOpen size={18} weight="duotone" aria-hidden="true" />
        <span>Documentation</span>
        <span className="docs-version">testnet</span>
      </div>
      <div className="docs-layout">
        <DocsSidebar activeSlug={activeSlug} pages={docsPages} />
        <article className="docs-article">
          <nav className="docs-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/docs">Docs</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{page.label}</span>
          </nav>
          <div className="docs-article-header">
            <div>
              <p className="eyebrow">{page.group}</p>
              <h1>{page.title}</h1>
              <p className="docs-lede">{page.description}</p>
            </div>
            <span className="docs-version">v0.1 · testnet</span>
          </div>
          {children}
          <footer className="docs-article-footer">
            <Link href="/whitepaper">
              Read the product whitepaper{" "}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
            <Link href="/docs/operations/troubleshooting">
              Need help? Start with troubleshooting{" "}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </footer>
        </article>
        <aside className="docs-toc" aria-label="On this page">
          <p>On this page</p>
          {page.sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
            </a>
          ))}
        </aside>
      </div>
    </main>
  );
}

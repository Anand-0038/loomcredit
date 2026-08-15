import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocsContent } from "../../../components/docs-content";
import { DocsShell } from "../../../components/docs-shell";
import { docsPages, findDocsPage } from "../../../lib/docs";

export const dynamicParams = false;

export function generateStaticParams() {
  return docsPages.map((page) => ({
    slug: page.slug ? page.slug.split("/") : undefined,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findDocsPage(slug?.join("/") ?? "");
  if (!page) return { title: "Documentation" };
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/docs${page.slug ? `/${page.slug}` : ""}` },
  };
}

export default async function DocsRoute({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const activeSlug = slug?.join("/") ?? "";
  const page = findDocsPage(activeSlug);
  if (!page) notFound();

  return (
    <DocsShell activeSlug={activeSlug} page={page}>
      <DocsContent sections={page.sections} />
    </DocsShell>
  );
}

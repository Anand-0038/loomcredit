import Link from "next/link";

import type { DocsBlock, DocsSection } from "../lib/docs";
import { DocsCode } from "./docs-code";

function InlineText({ value }: { value: string }) {
  const parts = value.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code className="docs-inline-code" key={`${part}-${index}`}>
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

function Block({ block }: { block: DocsBlock }) {
  switch (block.kind) {
    case "text":
      return (
        <p className="docs-paragraph">
          <InlineText value={block.body} />
        </p>
      );
    case "bullets":
      return (
        <ul className="docs-list">
          {block.items.map((item) => (
            <li key={item}>
              <InlineText value={item} />
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="docs-steps">
          {block.items.map((item) => (
            <li key={item}>
              <InlineText value={item} />
            </li>
          ))}
        </ol>
      );
    case "code":
      return <DocsCode language={block.language} code={block.code} />;
    case "callout":
      return (
        <aside className={`docs-callout ${block.tone}`}>
          <strong>{block.title}</strong>
          <p>
            <InlineText value={block.body} />
          </p>
        </aside>
      );
    case "table":
      return (
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                {block.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.join("|")}>
                  {row.map((cell, index) => (
                    <td key={`${cell}-${index}`}>
                      <InlineText value={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "links":
      return (
        <div className="docs-links">
          {block.items.map((item) => (
            <a
              href={item.href}
              key={item.href}
              rel={item.href.startsWith("http") ? "noreferrer" : undefined}
              target={item.href.startsWith("http") ? "_blank" : undefined}
            >
              <strong>{item.label}</strong>
              <span>{item.note}</span>
            </a>
          ))}
        </div>
      );
  }
}

export function DocsContent({ sections }: { sections: DocsSection[] }) {
  return (
    <div className="docs-content">
      {sections.map((section) => (
        <section className="docs-section" id={section.id} key={section.id}>
          <h2>{section.title}</h2>
          {section.blocks.map((block, index) => (
            <Block block={block} key={`${section.id}-${block.kind}-${index}`} />
          ))}
        </section>
      ))}
      <p className="docs-source-note">
        Documentation is generated from the current repository contract. For the
        recorded testnet evidence, inspect the{" "}
        <Link href="/proof/0xfed7def6e6d23052735cd35d968d9bca6895077d3a223e418a7c1530575320d9">
          live proof console
        </Link>
        .
      </p>
    </div>
  );
}

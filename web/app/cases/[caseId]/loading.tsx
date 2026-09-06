export default function Loading() {
  return (
    <main>
      <section className="page-main">
        <div className="container">
          <div className="case-detail-card" aria-busy="true">
            <span className="eyebrow">Loading case</span>
            <h1>Reading the durable worker record…</h1>
          </div>
        </div>
      </section>
    </main>
  );
}

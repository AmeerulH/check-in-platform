export default function Loading() {
  return (
    <main aria-busy="true" aria-live="polite" className="route-loading">
      <span className="sr-only">Loading page</span>
      <aside className="route-loading-sidebar" aria-hidden="true">
        <div className="skeleton skeleton-brand" />
        <div className="skeleton skeleton-nav" />
        <div className="skeleton skeleton-nav" />
        <div className="skeleton skeleton-nav" />
        <div className="skeleton skeleton-nav" />
      </aside>
      <section className="route-loading-content" aria-hidden="true">
        <div className="skeleton skeleton-kicker" />
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-copy" />
        <div className="skeleton skeleton-panel" />
      </section>
    </main>
  );
}

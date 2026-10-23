/** Flowing animated backdrop: drifting colour blobs, a slow conic ribbon, faint grid and grain. Pure CSS — GPU cheap. */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <div className="ribbon" />
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <div className="blob b4" />
      <div className="grid" />
      <div className="noise" />
    </div>
  );
}

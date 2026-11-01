const colours = [
  { name: "Chalk", hex: "#e8e4dc" },
  { name: "Rose", hex: "#b78685" },
  { name: "Claret", hex: "#713e50" },
  { name: "Moss", hex: "#797d67" },
  { name: "Ink", hex: "#343c4a" },
];

export default function Home() {
  return (
    <div className="site">
      <header><span>PERSONAL STYLIST</span><span>COLOUR STUDY / 01</span></header>
      <main>
        <p className="eyebrow">A more personal point of view</p>
        <h1>Your colours.<br /><em>Seen differently.</em></h1>
        <p className="intro">Explore what colour brings out in you. A thoughtful consultation, starting with your own photo.</p>
        <div className="swatches" aria-label="Illustrative colour studies, not a personal palette">
          {colours.map((colour) => <div key={colour.name} className="swatch"><div style={{ backgroundColor: colour.hex }} /><span>{colour.name}</span></div>)}
        </div>
        <p className="caption">An illustrative colour study. Your palette will be your own.</p>
        <section className="status" aria-labelledby="status-title">
          <span className="status-mark" aria-hidden="true" />
          <div><h2 id="status-title">The studio is taking shape.</h2><p>This is the first scaffold. The photo consultation is not available yet.</p></div>
        </section>
      </main>
      <footer><span>Built for DevDay Community Hackathon · London · 1 November 2026</span><span>No photo uploads or AI processing on this page.</span></footer>
    </div>
  );
}

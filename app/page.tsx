import Link from "next/link";

const colours = ["#e4ded0", "#b78d83", "#794751", "#858b6e", "#404c5a"];

export default function Home() {
  return <div className="shell landing">
    <header className="topbar"><Link className="wordmark" href="/">PERSONAL STYLIST <span> / COLOUR STUDY</span></Link><Link href="/colour-system">The colour system ↗</Link></header>
    <main className="landing-main">
      <div className="landing-copy"><p className="eyebrow">A more personal point of view <span>— 01</span></p><h1>Your colours.<br/><em>Seen differently.</em></h1><p className="lede">A quiet space to notice what colour brings out in you. Start with your own photo, compare colours, and build a palette that feels like yours.</p><Link className="button primary" href="/profile">Begin your colour study <span>↗</span></Link><p className="small">Private, invite-only access · No AI analysis required</p></div>
      <div className="landing-art" aria-label="Illustrative colour study"><div className="art-label"><span>COLOUR STUDY</span><span>01 — 31</span></div><div className="art-arch"><div className="art-inner"><span>YOUR<br/><i>colour</i><br/>STORY</span></div></div><div className="art-swatches">{colours.map((c,i)=><div key={c} style={{background:c}}><span>0{i+1}</span></div>)}</div><p>AN EXPLORATION, NOT A VERDICT.</p></div>
    </main><footer className="footer"><span>Made for the DevDay Community Hackathon</span><span>Colour is personal. Your choices are yours.</span></footer>
  </div>;
}

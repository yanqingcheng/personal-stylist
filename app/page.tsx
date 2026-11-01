import Link from "next/link";
import Image from "next/image";
import "./home.css";

export const metadata = { title: "Personal stylist · A style that could only be yours", description: "A personal styling journey through colour, individual style, outfit inspiration and your own editorial point of view." };

const chapters = [
  { number: "02", title: "Your signature", text: "Discover the shapes, details and style essence that feel unmistakably you." },
  { number: "03", title: "The fitting room", text: "Explore on-you outfit moodboards. Tell us what you love. Refine together." },
  { number: "04", title: "Your cover story", text: "A personal fashion editorial, bringing your point of view into focus." },
  { number: "05", title: "The boutique", text: "A considered edit of clothing to explore and try. Your style, out in the world." },
];

export default function Home() {
  return <div className="ps-page">
    <a className="ps-skip" href="#main">Skip to content</a>
    <header className="ps-header">
      <Link className="ps-brand" href="/" aria-label="Personal stylist home">personal<span>stylist<span className="ps-asterisk">✳</span></span></Link>
      <span className="ps-headerNote">A NEW POINT OF VIEW<br/>ON GETTING DRESSED.</span>
      <nav aria-label="Main navigation"><a href="#chapters">The experience <span>↓</span></a><Link href="/profile">Enter the studio <span>↗</span></Link></nav>
    </header>
    <main id="main">
      <section className="ps-hero" aria-labelledby="hero-title">
        <div className="ps-heroCopy">
          <p className="ps-kicker"><span /> PERSONAL STYLE. OPEN TO POSSIBILITY.</p>
          <h1 id="hero-title">A style that<br/>could only<br/>be <em>yours.</em></h1>
          <p className="ps-intro">Your colours. Your contradictions. Your kind of beautiful. A personal styling journey from the first spark to a whole world of possibilities.</p>
          <Link className="ps-cta" href="/profile">Find your starting point <span>↗</span></Link>
          <p className="ps-access">Start with colour · Private, invite-only studio</p>
        </div>
        <figure className="ps-art">
          <Image src="/design/atelier-collage.webp" alt="Sculptural cobalt pleats, translucent yellow fabric and vermilion paper arranged as an editorial collage" width={1122} height={1402} priority sizes="(max-width: 700px) 100vw, 52vw" />
          <span className="ps-artTop">THE PERSONAL STYLIST ATELIER</span>
          <div className="ps-paperNote"><span>NOT A NEW YOU.</span><strong>More<br/><em>you.</em></strong><span>↗</span></div>
          <figcaption>COLOUR / TEXTURE / SHAPE / POSSIBILITY<span>CONCEPT ART · AI-GENERATED</span></figcaption>
        </figure>
      </section>
      <div className="ps-manifesto"><span>LESS “WHAT SHOULD I WEAR?”</span><span className="ps-star">✳</span><span>MORE “THAT FEELS LIKE ME.”</span></div>
      <section className="ps-journey" id="chapters" aria-labelledby="journey-title">
        <div className="ps-journeyHeading"><p className="ps-kicker">THE EXPERIENCE / FIVE CHAPTERS</p><h2 id="journey-title">From a little curiosity.<br/>To a whole <em>point of view.</em></h2><p>Style is a conversation, not a verdict.<br/>We’re opening the studio one chapter at a time.</p></div>
        <div className="ps-chapters">
          <Link href="/profile" className="ps-openChapter">
            <div className="ps-chapterMeta"><span>01 / COLOUR</span><span className="ps-openBadge">OPEN NOW ↗</span></div>
            <div className="ps-swatches" aria-hidden="true"><span/><span/><span/><span/><span/></div>
            <h3>See yourself<br/>in a new light.</h3><p>Bring your photo. Compare colour drapes. Find a palette that feels like yours.</p><span className="ps-chapterLink">Begin your colour study ↗</span>
          </Link>
          <div className="ps-nextChapters">{chapters.map(chapter => <div className="ps-closedChapter" key={chapter.number}>
            <span className="ps-chapterNumber">{chapter.number}</span><div><h3>{chapter.title}</h3><p>{chapter.text}</p></div><span className="ps-soon">COMING<br/>SOON</span>
          </div>)}<p className="ps-voice">A conversation in your own voice? On our wish list, too.</p></div>
        </div>
      </section>
      <section className="ps-closing"><span>NO DRESS CODE. NO ONE WAY TO BE.</span><p>Come as you are.<br/><em>See what unfolds.</em></p><Link href="/profile">Step into the studio <span>↗</span></Link></section>
    </main>
    <footer className="ps-footer"><Link href="/">Personal stylist ✳</Link><Link href="/colour-system">How the colour study works ↗</Link><span>Made for the DevDay Community Hackathon</span></footer>
  </div>;
}

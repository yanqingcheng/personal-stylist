"use client";
/* Private signed media is displayed directly and refreshed; never image-proxied. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import atlas from "../../data/colour-atlas-31.json";
import "./studio.css";

type Profile = { document?: { selectedTemplateId?: string; referencePhotoId?: string; photos?: { id: string }[] } };
type Look = { mediaId: string; title?: string; description?: string };
type Round = { id: string; looks: Look[]; approved: boolean; editorial?: string | null; createdAt: string };
type Style = { intake?: { data?: { wardrobe?: string; preferences?: string } } | null; rounds?: Round[] };

export default function StudioHub() {
  const [preview, setPreview] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [style, setStyle] = useState<Style | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [state, setState] = useState("loading");
  const [styleUnavailable, setStyleUnavailable] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
    async function load() {
      if (isPreview) { setPreview(true); setState("preview"); return; }
      setState("loading"); setProfile(null); setStyle(null); setUrls({});
      try {
        const response = await fetch("/api/profile", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { setState("login"); return; }
        if (!response.ok) throw new Error("unavailable");
        const data = await response.json();
        if (data.deletionPending) { setState("deleting"); return; }
        if (!data.profile || data.profile.deletion_state === "deleted") { setState("unavailable"); return; }
        setProfile(data.profile); setState("ready");
        try {
          const result = await fetch("/api/style", { cache: "no-store", signal: controller.signal });
          if (!result.ok) { setStyleUnavailable(true); return; }
          setStyle(await result.json()); setStyleUnavailable(false);
        } catch { if (!controller.signal.aborted) setStyleUnavailable(true); }
      } catch { if (!controller.signal.aborted) setState("unavailable"); }
    }
    void load();
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (preview || !style) return;
    const controller = new AbortController();
    const ids = [...new Set((style.rounds || []).flatMap(r => (r.looks || []).map(l => l.mediaId)))];
    async function refresh() {
      const entries = await Promise.all(ids.map(async id => {
        try { const response = await fetch(`/api/media/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal }); if (!response.ok) return [id, ""]; const data = await response.json(); return [id, data.url || ""]; }
        catch { return [id, ""]; }
      }));
      if (!controller.signal.aborted) setUrls(Object.fromEntries(entries));
    }
    void refresh(); const timer = setInterval(() => void refresh(), 45000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [style, preview]);
  const palette = atlas.types.find(p => p.id === (preview ? "warm-deep-muted" : profile?.document?.selectedTemplateId));
  const rounds = (style?.rounds || []).filter(r => r.looks?.length);
  const approved = [...rounds].reverse().find(r => r.approved);
  const featured = approved || rounds[rounds.length - 1];
  const featuredLook = featured?.looks[0];
  const heroUrl = preview ? "/design/hub-avatar.webp" : featuredLook ? urls[featuredLook.mediaId] : "";
  const looks = rounds.flatMap(r => r.looks.map(look => ({ ...look, approved: r.approved })));
  const editorial = [...rounds].reverse().find(r => r.editorial)?.editorial;
  const wardrobe = style?.intake?.data?.wardrobe?.trim();
  const ready = state === "ready" || preview;

  return <div className="hub-page">
    {preview && <div className="hub-preview">DESIGN PREVIEW · FICTIONAL MODEL & EXAMPLE PALETTE · NOT YOUR SAVED RESULTS <Link href="/studio">Exit preview ↗</Link></div>}
    <header className="hub-header"><Link className="hub-brand" href="/">personal<span>stylist ✳</span></Link><nav aria-label="Studio navigation"><a href="#overview">Overview</a><a href="#library">Your library</a><Link href="/style">Consultation ↗</Link></nav></header>
    <main className="hub-main" id="overview">
      <div className="hub-heading"><div><p className="hub-eyebrow">THE PERSONAL EDIT / YOUR STUDIO</p><h1>All the pieces.<br/><em>All you.</em></h1></div><p>A place for what you’ve discovered.<br/>And everything you’re becoming.</p></div>
      {!ready && <div className="hub-status" role="status">{state === "loading" ? "Opening your studio…" : state === "login" ? <>Your personal studio starts here. <Link href="/login">Sign in ↗</Link></> : state === "deleting" ? "Your profile is being deleted. Saved results are unavailable." : <>We couldn’t load your studio. <button onClick={() => setRetry(r => r + 1)}>Try again</button></>}</div>}
      <div className="hub-grid">
        <aside className="hub-cover" aria-label="Your featured style image">
          <div className="hub-cover-image">{heroUrl ? <img src={heroUrl} alt={preview ? "Fictional model in charcoal tailoring, an illustrative design preview" : featuredLook?.title || "Your saved generated outfit sheet"} /> : <div className="hub-cover-empty"><span className="hub-cover-cross">✳</span><p>Your next<br/><em>point of view.</em></p><span>{featuredLook ? "Your saved image is loading or unavailable." : "Your first saved outfit will find its home here."}</span><Link href="/style">Explore your style ↗</Link></div>}<span className="hub-cover-index">01 / THE PERSONAL EDIT</span></div>
          <div className="hub-cover-caption"><span>{preview ? "FICTIONAL OUTFIT / DESIGN PREVIEW" : approved ? "YOUR APPROVED STYLE DIRECTION" : featured ? "YOUR SAVED EXPLORATION" : "A LITTLE MORE YOU, EVERY DAY"}</span><span>↗</span></div>
          <p className="hub-cover-note">{preview ? "An invented model and outfit. Real studios show your saved outfit sheet here." : featured ? "Generated outfit illustration. Open your consultation to review or refine it." : "There’s no single way to get dressed. Let’s find yours."}</p>
        </aside>
        <div className="hub-content">
          <section aria-labelledby="hub-signature"><div className="hub-section-line"><h2 id="hub-signature">Your signature</h2><span>THREE WAYS TO SEE YOURSELF</span></div>
            <div className="hub-result-cards">
              <Link className="hub-result hub-colour" href="/profile"><div className="hub-card-top"><span>01</span><span>{palette ? preview ? "EXAMPLE" : "SAVED" : "EXPLORE"} ↗</span></div><div className="hub-palette-art" aria-hidden="true">{(palette ? [...Object.values(palette.neutrals).slice(1,3), ...Object.values(palette.accents).slice(0,3)] : ["#e6e2d8", "#d5d3ca", "#b7b9af", "#8c9487", "#555e54"]).map((hex,i) => <span key={i} style={{backgroundColor:hex}} />)}</div><h3>Colour</h3><strong>{palette ? palette.name : "Find your palette"}</strong><p>{palette ? palette.factor_words.join(" · ") : "See what different colours bring out in you."}</p><span className="hub-card-link">{palette ? "Revisit your colours" : "Begin colour study"} ↗</span></Link>
              <Link className="hub-result" href="/style"><div className="hub-card-top"><span>02</span><span>EXPLORE ↗</span></div><div className="hub-shape-art" aria-hidden="true"><i/><i/><i/></div><h3>Silhouette</h3><strong>Shape & movement</strong><p>Your proportions, your preferences. A conversation to begin.</p><span className="hub-card-link">Explore in consultation ↗</span></Link>
              <Link className="hub-result" href="/style"><div className="hub-card-top"><span>03</span><span>EXPLORE ↗</span></div><div className="hub-vibe-art" aria-hidden="true"><span>✳</span><i/></div><h3>Vibe</h3><strong>That certain something</strong><p>The energy you want to bring. In your own words.</p><span className="hub-card-link">Find your direction ↗</span></Link>
            </div><p className="hub-fine">Silhouette and vibe are open conversations; separate results haven’t been saved yet.</p>
          </section>
          <section className="hub-editorial" aria-labelledby="hub-editorial-title"><div><p className="hub-eyebrow">THE STYLE EDIT</p><h2 id="hub-editorial-title">Your story.<br/><em>Beautifully told.</em></h2><p>{editorial ? editorial.slice(0,210) + (editorial.length > 210 ? "…" : "") : "A personal editorial, shaped by the looks you love and the direction you approve."}</p><Link href="/style">{editorial ? "Read your saved editorial" : "Continue your consultation"} ↗</Link></div><div className="hub-editorial-graphic" aria-hidden="true"><span>THE<br/>PERSONAL<br/><em>EDIT.</em></span><i>✳</i></div></section>
          <section className="hub-wardrobe"><div><p className="hub-eyebrow">WHAT’S ALREADY YOURS</p><h2>Your wardrobe, <em>in the picture.</em></h2><p>{wardrobe || "A favourite jacket. The shoes you live in. Add wardrobe notes when you want your own pieces in the conversation."}</p></div><Link href="/style">{wardrobe ? "Edit wardrobe notes" : "Add your notes"} ↗</Link></section>
        </div>
      </div>
      <section className="hub-library" id="library"><div className="hub-section-line"><h2>Your output library</h2><span>{looks.length} SAVED {looks.length === 1 ? "IMAGE" : "IMAGES"}</span></div>{looks.length ? <div className="hub-library-grid">{looks.map((look,i) => <Link href="/style" className="hub-library-item" key={`${look.mediaId}-${i}`}>{urls[look.mediaId] ? <img src={urls[look.mediaId]} alt={look.title || "Saved generated outfit sheet"}/> : <div className="hub-image-missing">Saved image unavailable</div>}<span>{look.approved ? "APPROVED DIRECTION" : "EXPLORATION"} / {String(i+1).padStart(2,"0")}</span><h3>{look.title || "Outfit study"} ↗</h3></Link>)}</div> : <div className="hub-library-empty"><span>↗</span><div><h3>Room for your next idea.</h3><p>Your generated moodboards and outfit studies will collect here. {preview ? "This fictional preview doesn’t contain saved outputs." : "Start with a brief, then explore together."}</p></div><Link href="/style">Open consultation ↗</Link></div>}{styleUnavailable && <p className="hub-service-note">Saved style work couldn’t be loaded. Your colour study is still available. <button onClick={() => setRetry(r => r + 1)}>Try again</button></p>}</section>
    </main><footer className="hub-footer"><span>PERSONAL STYLIST ✳</span><span>Always a work in progress. Always yours.</span><Link href="/profile">Your colour study ↗</Link></footer>
  </div>;
}

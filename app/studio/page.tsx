"use client";
/* Private signed media is displayed directly and refreshed; never image-proxied. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { studioOutputHref } from "../../lib/studio-output-link";
import { z } from "zod";
import { useEffect, useState } from "react";
import atlas from "../../data/colour-atlas-31.json";
import "./studio.css";

type Profile = { document?: { selectedTemplateId?: string; referencePhotoId?: string; photos?: { id: string }[]; answers?: unknown } };
type Look = { mediaId: string; title?: string; description?: string };
type Output = { id: string; board: { title: string; options: { title: string }[] }; documentRevision: string; url?: string | null; provenance: "prepared" | "dynamic"; purpose?: "silhouette" | "synthesis" };
type Job = { state: string; output: Output | null };
type Consultation = { approvedOutputId: string | null; approvedOutputHash: string | null };
type Action = { kind: string; status: string; result: string | null };
type Round = { id: string; looks: Look[]; approved: boolean; editorial?: string | null; createdAt: string };
type Style = { intake?: { data?: { wardrobe?: string; preferences?: string } } | null; rounds?: Round[] };

const savedAnswers = z.object({
  bodyProportionAnswers: z.record(z.string(), z.unknown()).optional(),
  consultationVibe: z.unknown().optional(),
});
const reportedProportion = z.object({
  questionId: z.string(), answer: z.enum(["A", "B", "both", "neither", "unsure"]),
  source: z.literal("user-visual-report"),
});
const reportedVibe = z.object({
  source: z.literal("user-report"),
  recognisable: z.string().optional(), aspiration: z.string().optional(), avoid: z.string().optional(),
});
const proportionLabels = [
  {id:"vertical-impression", choices:{A:"Extended outline", B:"Compact outline", both:"Outline varies", neither:"Neither outline diagram", unsure:"Outline unsure"}},
  {id:"torso-leg-relation", choices:{A:"More torso length", B:"More leg length", both:"Length relation varies", neither:"Neither length diagram", unsure:"Length relation unsure"}},
  {id:"shoulder-breadth", choices:{A:"Broader shoulder span", B:"Narrower shoulder span", both:"Shoulder span varies", neither:"Neither shoulder-span diagram", unsure:"Shoulder span unsure"}},
  {id:"shoulder-edge", choices:{A:"Defined shoulder corners", B:"Rounded shoulder corners", both:"Shoulder edge varies", neither:"Neither shoulder-edge diagram", unsure:"Shoulder edge unsure"}},
];
function excerpt(text: string, limit = 95) {
  const value = text.trim();
  return value.length > limit ? value.slice(0, limit).trimEnd() + "…" : value;
}

export default function StudioHub() {
  const [preview, setPreview] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [style, setStyle] = useState<Style | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [state, setState] = useState("loading");
  const [styleUnavailable, setStyleUnavailable] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
    let timer: ReturnType<typeof setInterval> | undefined;
    async function refreshSaved() {
      const results = await Promise.allSettled(["/api/style", "/api/consultation/generate", "/api/consultation/actions", "/api/consultation"].map(async path => {
        const response = await fetch(path, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Saved work unavailable");
        return response.json();
      }));
      if (controller.signal.aborted) return;
      const [legacy, generated, editorial, current] = results;
      if (legacy.status === "fulfilled") setStyle(legacy.value);
      if (generated.status === "fulfilled") setJobs(generated.value.jobs || []);
      if (editorial.status === "fulfilled") setActions(editorial.value.actions || []);
      setConsultation(current.status === "fulfilled" ? current.value.consultation : null);
      setStyleUnavailable(results.some(result => result.status === "rejected"));
    }
    async function load() {
      if (isPreview) { setPreview(true); setState("preview"); return; }
      setState("loading"); setProfile(null); setStyle(null); setUrls({}); setJobs([]); setActions([]); setConsultation(null); setStyleUnavailable(false);
      try {
        const response = await fetch("/api/profile", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { setState("login"); return; }
        if (!response.ok) throw new Error("unavailable");
        const data = await response.json();
        if (data.deletionPending) { setState("deleting"); return; }
        if (!data.profile || data.profile.deletion_state === "deleted") { setState("unavailable"); return; }
        setProfile(data.profile);
        await refreshSaved();
        if (controller.signal.aborted) return;
        setState("ready");
        timer = setInterval(() => void refreshSaved(), 45000);
      } catch { if (!controller.signal.aborted) setState("unavailable"); }
    }
    void load();
    return () => { controller.abort(); clearInterval(timer); };
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
  const savedOutputs = jobs.flatMap(job => job.state === "succeeded" && job.output ? [job.output] : []);
  const looks = [
    ...rounds.flatMap(r => r.looks.map(look => ({ id: look.mediaId, title: look.title, url: urls[look.mediaId], approved: r.approved, provenance: "legacy", documentRevision: undefined, purpose: "synthesis" }))),
    ...savedOutputs.map(output => ({ id: output.id, title: output.board.title, url: output.url, approved: consultation?.approvedOutputId === output.id && consultation?.approvedOutputHash === output.documentRevision, provenance: output.provenance, documentRevision: output.documentRevision, purpose: output.purpose || "synthesis" })),
  ];
  const approved = [...looks].reverse().find(look => look.approved);
  const featuredLook = approved || looks[looks.length - 1];
  const featured = Boolean(featuredLook);
  const heroUrl = preview ? "/design/hub-avatar.webp" : featuredLook?.url;
  const editorial = [...actions].reverse().find(action => action.kind === "editorial" && action.status === "succeeded" && action.result)?.result || [...rounds].reverse().find(r => r.editorial)?.editorial;
  const silhouette = [...savedOutputs].reverse().find(output => output.purpose === "silhouette");
  const answers = savedAnswers.safeParse(preview ? undefined : profile?.document?.answers);
  const observations = proportionLabels.flatMap(({id,choices}) => {
    const answer = reportedProportion.safeParse(answers.success ? answers.data.bodyProportionAnswers?.[id] : undefined);
    return answer.success && answer.data.questionId === id ? [choices[answer.data.answer]] : [];
  });
  const vibe = reportedVibe.safeParse(answers.success ? answers.data.consultationVibe : undefined);
  const recognisable = vibe.success ? vibe.data.recognisable?.trim() : undefined;
  const aspiration = vibe.success ? vibe.data.aspiration?.trim() : undefined;
  const avoid = vibe.success ? vibe.data.avoid?.trim() : undefined;
  const hasVibe = Boolean(recognisable || aspiration || avoid);
  const silhouetteApproved = Boolean(silhouette && consultation?.approvedOutputId === silhouette.id && consultation.approvedOutputHash === silhouette.documentRevision);
  const silhouetteSummary = observations.length ? `User reports: ${observations.join(" · ")}.` : silhouette ? `${silhouette.provenance === "prepared" ? "Supplied prepared" : "Generated"} exploration · ${silhouette.board.options.length} saved directions. Review the illustration together.` : "Your proportions, your preferences. A conversation to begin.";
  const vibeSummary = [aspiration ? `Aspiration: ${excerpt(aspiration)}` : "", avoid ? `Avoid: ${excerpt(avoid, 75)}` : ""].filter(Boolean).join(" · ");
  const wardrobe = style?.intake?.data?.wardrobe?.trim();
  const ready = state === "ready" || preview;

  return <div className="hub-page">
    {preview && <div className="hub-preview">DESIGN PREVIEW · FICTIONAL MODEL & EXAMPLE PALETTE · NOT YOUR SAVED RESULTS <a href="/studio">Exit preview ↗</a></div>}
    <header className="hub-header"><Link className="hub-brand" href="/">personal<span>stylist ✳</span></Link><nav aria-label="Studio navigation"><a href="#overview">Overview</a><a href="#library">Your library</a><Link href="/style">Consultation ↗</Link></nav></header>
    <main className="hub-main" id="overview">
      <div className="hub-heading"><div><p className="hub-eyebrow">THE PERSONAL EDIT / YOUR STUDIO</p><h1>All the pieces.<br/><em>All you.</em></h1></div><p>A place for what you’ve discovered.<br/>And everything you’re becoming.</p></div>
      {!ready && <div className="hub-status" role="status">{state === "loading" ? "Opening your studio…" : state === "login" ? <>Your personal studio starts here. <Link href="/login">Sign in ↗</Link></> : state === "deleting" ? "Your profile is being deleted. Saved results are unavailable." : <>We couldn’t load your studio. <button onClick={() => setRetry(r => r + 1)}>Try again</button></>}</div>}
      <div className="hub-grid">
        <aside className="hub-cover" aria-label="Your featured style image">
          <div className="hub-cover-image">{heroUrl ? <img src={heroUrl} alt={preview ? "Fictional model in charcoal tailoring, an illustrative design preview" : featuredLook?.title || "Your saved generated outfit sheet"} /> : <div className="hub-cover-empty"><span className="hub-cover-cross">✳</span><p>Your next<br/><em>point of view.</em></p><span>{featuredLook ? "Your saved image is loading or unavailable." : "Your first saved outfit will find its home here."}</span><Link href="/style">Explore your style ↗</Link></div>}<span className="hub-cover-index">01 / THE PERSONAL EDIT</span></div>
          <div className="hub-cover-caption"><span>{preview ? "FICTIONAL OUTFIT / DESIGN PREVIEW" : approved ? "YOUR APPROVED STYLE DIRECTION" : featured ? "YOUR SAVED EXPLORATION" : "A LITTLE MORE YOU, EVERY DAY"}</span></div>
          {(preview || featuredLook) && <Link className="hub-cover-title" href={featuredLook ? studioOutputHref(featuredLook) : "/style"}>{preview ? "A new point of view" : featuredLook?.title || "Your outfit study"}<span aria-hidden="true"> ↗</span></Link>}
          <p className="hub-cover-note">{preview ? "An invented model and outfit. Real studios show your saved outfit sheet here." : featured ? `${featuredLook?.provenance === "prepared" ? "Supplied prepared image" : "Generated outfit illustration"}. Open your consultation to review or refine it.` : "There’s no single way to get dressed. Let’s find yours."}</p>
        </aside>
        <div className="hub-content">
          <section aria-labelledby="hub-signature"><div className="hub-section-line"><h2 id="hub-signature">Your signature</h2><span>THREE WAYS TO SEE YOURSELF</span></div>
            <div className="hub-result-cards">
              <Link className="hub-result hub-colour" href="/profile"><div className="hub-card-top"><span>01</span><span>{palette ? preview ? "EXAMPLE" : "SAVED" : "EXPLORE"} ↗</span></div><div className="hub-palette-art" aria-hidden="true">{(palette ? [...Object.values(palette.neutrals).slice(1,3), ...Object.values(palette.accents).slice(0,3)] : ["#e6e2d8", "#d5d3ca", "#b7b9af", "#8c9487", "#555e54"]).map((hex,i) => <span key={i} style={{backgroundColor:hex}} />)}</div><h3>Colour</h3><strong>{palette ? palette.name : "Find your palette"}</strong><p>{palette ? palette.factor_words.join(" · ") : "See what different colours bring out in you."}</p><span className="hub-card-link">{palette ? "Revisit your colours" : "Begin colour study"} ↗</span></Link>
              <Link className="hub-result" href={silhouette ? studioOutputHref(silhouette) : "/style?stage=6"}><div className="hub-card-top"><span>02</span><span>{silhouetteApproved ? "APPROVED" : silhouette ? "SAVED" : observations.length ? "USER REPORTS" : "EXPLORE"} ↗</span></div><div className="hub-shape-art" aria-hidden="true"><i/><i/><i/></div><h3>Silhouette</h3><strong>{silhouette?.board.title || (observations.length ? `${observations.length} saved observations` : "Shape & movement")}</strong><p>{silhouetteSummary}</p><span className="hub-card-link">{silhouette || observations.length ? "Revisit your silhouette" : "Explore in consultation"} ↗</span></Link>
              <Link className="hub-result" href="/style?stage=7"><div className="hub-card-top"><span>03</span><span>{hasVibe ? "YOUR WORDS" : "EXPLORE"} ↗</span></div><div className="hub-vibe-art" aria-hidden="true"><span>✳</span><i/></div><h3>Vibe</h3><strong>{recognisable ? `You recognise: ${excerpt(recognisable, 75)}` : hasVibe ? "Your desired direction" : "That certain something"}</strong><p>{vibeSummary || (hasVibe ? "Your own description, saved for your consultation." : "The energy you want to bring. In your own words.")}</p><span className="hub-card-link">{hasVibe ? "Revisit your vibe" : "Find your direction"} ↗</span></Link>
            </div><p className="hub-fine">Explore silhouette and vibe in your consultation; saved illustrations are ideas to review together.</p>
          </section>
          <section className="hub-editorial" aria-labelledby="hub-editorial-title"><div><p className="hub-eyebrow">THE STYLE EDIT</p><h2 id="hub-editorial-title">Your story.<br/><em>Beautifully told.</em></h2><p>{editorial ? editorial.slice(0,210) + (editorial.length > 210 ? "…" : "") : "A personal editorial, shaped by the looks you love and the direction you approve."}</p><Link href="/style">{editorial ? "Read your saved editorial" : "Continue your consultation"} ↗</Link></div><div className="hub-editorial-graphic" aria-hidden="true"><span>THE<br/>PERSONAL<br/><em>EDIT.</em></span><i>✳</i></div></section>
          <section className="hub-wardrobe"><div><p className="hub-eyebrow">WHAT’S ALREADY YOURS</p><h2>Your wardrobe, <em>in the picture.</em></h2><p>{wardrobe || "A favourite jacket. The shoes you live in. Add wardrobe notes when you want your own pieces in the conversation."}</p></div><Link href="/style">{wardrobe ? "Edit wardrobe notes" : "Add your notes"} ↗</Link></section>
        </div>
      </div>
      <section className="hub-library" id="library"><div className="hub-section-line"><h2>Your output library</h2><span>{looks.length} SAVED {looks.length === 1 ? "IMAGE" : "IMAGES"}</span></div>{looks.length ? <div className="hub-library-grid">{looks.map((look,i) => <Link href={studioOutputHref(look)} className="hub-library-item" key={`${look.id}-${i}`}>{look.url ? <img src={look.url} alt={look.title || "Saved generated outfit sheet"}/> : <div className="hub-image-missing">Saved image unavailable</div>}<span>{look.approved ? "APPROVED DIRECTION" : "EXPLORATION"}{look.provenance === "prepared" ? " · PREPARED IMAGE" : ""} / {String(i+1).padStart(2,"0")}</span><h3>{look.title || "Outfit study"} ↗</h3></Link>)}</div> : <div className="hub-library-empty"><span>↗</span><div><h3>{state === "loading" ? "Opening your saved library…" : styleUnavailable ? "Your library couldn’t be fully loaded." : "Room for your next idea."}</h3><p>{styleUnavailable ? "Retry below to check your saved work." : <>Your generated moodboards and outfit studies will collect here. {preview ? "This fictional preview doesn’t contain saved outputs." : "Start with a brief, then explore together."}</>}</p></div><Link href="/style?stage=8">Open consultation ↗</Link></div>}{styleUnavailable && <p className="hub-service-note">Some saved style work couldn’t be refreshed. The library may be incomplete. <button onClick={() => setRetry(r => r + 1)}>Try again</button></p>}</section>
    </main><footer className="hub-footer"><span>PERSONAL STYLIST ✳</span><span>Always a work in progress. Always yours.</span><Link href="/profile">Your colour study ↗</Link></footer>
  </div>;
}

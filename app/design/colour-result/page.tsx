"use client";

import { useState } from "react";
import Link from "next/link";
import atlas from "../../../data/colour-atlas-31.json";
import "./result.css";

// Design-only fixture supplied for this prototype. No real user image or inference.
// Original: generated_images/01a196fa-438d-7263-802a-b741ad60172e/
// exec-b371df9d-579a-4990-bbe1-28524311e295.png. Converted to WebP, no retouching.
const reference = "/design/fictional-colour-reference.webp";
const neutralNames = ["Soft white", "Light layer", "Everyday neutral", "Dark base", "Deep neutral"];

export default function ColourResultPrototype() {
  const [paletteId, setPaletteId] = useState("warm-deep-muted");
  const palette = atlas.types.find(p => p.id === paletteId) || atlas.types[0];
  const colours = [
    ...Object.entries(palette.neutrals).map(([id, hex], i) => ({ id, hex, name: neutralNames[i] })),
    ...Object.entries(palette.accents).map(([id, hex]) => ({ id, hex, name: palette.accent_names[id as keyof typeof palette.accent_names] || id })),
  ];
  const [choices, setChoices] = useState([9, 11]);
  const [active, setActive] = useState(0);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const current = colours[choices[active]];
  function favourite(hex: string) { setFavourites(prev => prev.includes(hex) ? prev.filter(x => x !== hex) : [...prev, hex]); }

  return <div className="cr-page">
    <div className="cr-prototype">DESIGN PROTOTYPE · FICTIONAL AI PORTRAIT · NOT AN ANALYSIS</div>
    <header className="cr-header"><Link href="/">personal stylist <span>✳</span></Link><span>THE COLOUR CHAPTER / 01</span></header>
    <main className="cr-main">
      <div className="cr-title"><p className="cr-eyebrow">A PALETTE TO EXPLORE, NOT A BOX TO FIT.</p><h1>Make it <em>yours.</em></h1><p>See the colour. Notice yourself.</p></div>
      <div className="cr-workspace">
        <section className="cr-comparison" aria-label="Compare colours on the same fictional portrait">
          <div className="cr-compare-heading"><span>YOUR COLOUR MIRROR</span><span>Same portrait. Different colour.</span></div>
          <div className="cr-portraits">{choices.map((choice, side) => {
            const colour = colours[choice];
            return <div className={`cr-look ${active === side ? "cr-active" : ""}`} key={side}>
              <button className="cr-portrait-button" aria-pressed={active === side} aria-label={`Edit drape ${side === 0 ? "A" : "B"}: ${colour.name}`} onClick={() => setActive(side)}>
                <span className="cr-side">{side === 0 ? "A" : "B"} {active === side ? "· EDITING" : "· TAP TO EDIT"}</span>
                {/* Same image URL, crop and dimensions on both sides; colour never filters the photo. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={reference} alt="Identical fictional face and neck for colour comparison" width="1024" height="1536" />
                <span className="cr-drape" style={{ backgroundColor: colour.hex }} />
              </button>
              <div className="cr-look-caption"><div><strong>{colour.name}</strong><span>{colour.hex}</span></div><button onClick={() => favourite(colour.hex)} aria-pressed={favourites.includes(colour.hex)} aria-label={`${favourites.includes(colour.hex) ? "Remove" : "Save"} ${colour.name} favourite`}>{favourites.includes(colour.hex) ? "♥" : "♡"}</button></div>
            </div>;
          })}</div>
          <p className="cr-method">The face stays exactly the same. Flat colour overlays show adjacency, not simulated fabric or reflected light.</p>
        </section>
        <section className="cr-palette" aria-label="Palette navigation">
          <div className="cr-palette-head"><div><p className="cr-eyebrow">ILLUSTRATIVE COLOUR STORY</p><h2>{palette.name}</h2><p>{palette.factor_words.join(" · ")}</p></div><span className="cr-count">05 + 08<br/><small>NEUTRALS / ACCENTS</small></span></div>
          <label className="cr-switch">Try another palette<select value={palette.id} onChange={e => setPaletteId(e.target.value)}>{atlas.types.map(p => <option key={p.id} value={p.id}>{p.name} — {p.factor_words.join(", ")}</option>)}</select></label>
          <p className="cr-tap">Tap a colour to dress portrait <strong>{active === 0 ? "A" : "B"}</strong></p>
          {[{ title: "The everyday foundations", start: 0, end: 5 }, { title: "A little more expression", start: 5, end: 13 }].map(group => <div className="cr-colour-group" key={group.title}><h3>{group.title}<span>{group.end - group.start}</span></h3><div className="cr-swatches">{colours.slice(group.start, group.end).map((colour, i) => <button key={colour.id} style={{ backgroundColor: colour.hex }} aria-label={`Try ${colour.name}, ${colour.hex}, on portrait ${active === 0 ? "A" : "B"}`} aria-pressed={choices[active] === group.start + i} title={colour.name} onClick={() => setChoices(prev => prev.map((value, side) => side === active ? group.start + i : value))}><span>{choices[active] === group.start + i ? "✓" : favourites.includes(colour.hex) ? "♥" : ""}</span></button>)}</div></div>)}
          <p className="cr-selection" aria-live="polite">On {active === 0 ? "A" : "B"}: <strong>{current.name}</strong> · {current.hex}</p>
          <div className="cr-saved"><button onClick={() => setShowSaved(!showSaved)} aria-expanded={showSaved}>Your favourites <span>{favourites.length} {showSaved ? "−" : "+"}</span></button>{showSaved && <div className="cr-saved-list">{favourites.length ? favourites.map(hex => <span key={hex}><i style={{ backgroundColor: hex }} />{hex}<button aria-label={`Remove favourite ${hex}`} onClick={() => favourite(hex)}>×</button></span>) : <p>Tap a heart below either portrait to keep a colour here.</p>}<p>Prototype only: favourites reset when this page reloads.</p></div>}</div>
        </section>
      </div>
      <footer className="cr-note"><span>YOUR TASTE GETS THE FINAL WORD.</span><p>Keep what feels good. Try something unexpected. You can always change your mind.</p></footer>
    </main>
    <div className="cr-actions"><span>{favourites.length} favourite{favourites.length === 1 ? "" : "s"}<small>THIS EXPLORATION</small></span><button onClick={() => favourite(current.hex)}>{favourites.includes(current.hex) ? "♥ Saved to favourites" : "♡ Keep this colour"}</button></div>
  </div>;
}

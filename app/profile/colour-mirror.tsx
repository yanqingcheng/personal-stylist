"use client";
/* Private references use short-lived URLs directly, never an image proxy. */
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { atlas, personalPalette, type Template } from "@/lib/colour";
import styles from "./colour-mirror.module.css";

type Props = {
  referenceUrl: string | undefined;
  referenceLabel: string;
  template: Template;
  favourites: string[];
  crop: { zoom: number; y: number };
  onCrop: (crop: { zoom: number; y: number }) => void;
  onTemplate: (id: string) => void;
  onFavourite: (hex: string) => void;
};

/** Palette exploration changes adjacent colour, never the source face or factors. */
export default function ColourMirror(props: Props) {
  const colours = personalPalette(props.template, []).swatches;
  const [choices, setChoices] = useState([5, 11]);
  const [active, setActive] = useState(0);
  const current = colours[choices[active]];
  const name = (index: number) => colours[index].name || colours[index].role.replaceAll("_", " ");
  return <section className={styles.mirror} aria-label="Explore your palette beside the same face">
    <div className={styles.workspace}>
      <div className={styles.comparison}>
        <div className={styles.heading}><strong>YOUR COLOUR MIRROR</strong><span>Same face. Different colour.</span></div>
        <div className={styles.portraits}>{choices.map((choice, side) => <article key={side}>
          <button type="button" className={`${styles.frame} ${side === active ? styles.active : ""}`} style={{ background: colours[choice].hex }} onClick={() => setActive(side)} aria-pressed={active === side} aria-label={`Change colour ${side === 0 ? "A" : "B"}: ${name(choice)}`}>
            <span className={styles.side}>{side === 0 ? "A" : "B"}{active === side ? " · EDITING" : " · TAP TO EDIT"}</span>
            <span className={styles.crop}>{props.referenceUrl ? <img src={props.referenceUrl} alt="Your unchanged face and neck reference" style={{ objectPosition: `50% ${props.crop.y}%`, transform: `scale(${props.crop.zoom})` }} /> : <span>Reference unavailable. Return to your photos.</span>}</span>
            <span className={styles.drape} aria-hidden="true" />
          </button>
          <div className={styles.caption}><div><strong>{name(choice)}</strong><small>{colours[choice].hex}</small></div><button type="button" onClick={() => props.onFavourite(colours[choice].hex)} aria-pressed={props.favourites.includes(colours[choice].hex)} aria-label={`${props.favourites.includes(colours[choice].hex) ? "Remove" : "Keep"} ${name(choice)} favourite`}>{props.favourites.includes(colours[choice].hex) ? "♥" : "♡"}</button></div>
        </article>)}</div>
        <p className={styles.method}>{props.referenceLabel} Both sides use the same photograph and crop. Flat colour shows adjacency, not reflected fabric light.</p>
      </div>
      <div className={styles.navigation}>
        <label className={styles.switch}>No, that doesn’t feel right? Try another palette<select value={props.template.id} onChange={e => props.onTemplate(e.target.value)}>{atlas.map(p => <option key={p.id} value={p.id}>{p.name} — {p.factor_words.join(", ")}</option>)}</select></label>
        <p>Tap a colour to change portrait <strong>{active === 0 ? "A" : "B"}</strong>.</p>
        {[{ title: "Everyday foundations", start: 0, end: 5 }, { title: "A little more expression", start: 5, end: 13 }].map(group => <div className={styles.group} key={group.title}><h3>{group.title}<span>{group.end - group.start}</span></h3><div className={styles.swatches}>{colours.slice(group.start, group.end).map((colour, i) => <button type="button" key={colour.id} style={{ background: colour.hex }} title={colour.name || colour.role} aria-label={`Try ${colour.name || colour.role.replaceAll("_", " ")}, ${colour.hex}, on ${active === 0 ? "A" : "B"}`} aria-pressed={choices[active] === group.start + i} onClick={() => setChoices(previous => previous.map((value, side) => side === active ? group.start + i : value))}><span>{choices[active] === group.start + i ? "✓" : props.favourites.includes(colour.hex) ? "♥" : ""}</span></button>)}</div></div>)}
        <p className={styles.selection} aria-live="polite">On {active === 0 ? "A" : "B"}: {current.name || current.role.replaceAll("_", " ")} · {current.hex}</p>
        <details className={styles.details}><summary>Frame your face and neck</summary><p>Use one shared crop for both sides. Keep your face and neck visible.</p><label>Zoom <input type="range" min="1" max="3" step="0.05" value={props.crop.zoom} onChange={e => props.onCrop({ ...props.crop, zoom: Number(e.target.value) })} /></label><label>Vertical position <input type="range" min="0" max="100" value={props.crop.y} onChange={e => props.onCrop({ ...props.crop, y: Number(e.target.value) })} /></label></details>
        <div className={styles.favourites}><strong>Your favourites · {props.favourites.length}</strong><div>{props.favourites.map(hex => <button type="button" key={hex} onClick={() => props.onFavourite(hex)} aria-label={`Remove ${hex} favourite`}><i style={{ background: hex }} />{hex} ×</button>)}</div><p>Favourites describe your taste. They don’t change your colour evidence. Use Save my palette to keep changes.</p></div>
      </div>
    </div>
  </section>;
}

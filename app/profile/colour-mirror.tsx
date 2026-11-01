"use client";
/* Private references use short-lived URLs directly, never an image proxy. */
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { atlas, personalPalette, type Template } from "@/lib/colour";
import { nearestPalette, nearbyPalettes, type PalettePoint } from "./palette-navigation";
import styles from "./colour-mirror.module.css";

type Props = {
  referenceUrl: string | undefined;
  referenceLabel: string;
  /** Parent validates source identity/version before supplying an oriented-source rectangle. */
  framing?: {
    sourceMediaId: string;
    sourceVersion: string;
    sourceWidth: number;
    sourceHeight: number;
    crop: { x: number; y: number; width: number; height: number };
  };
  template: Template;
  favourites: string[];
  crop: { zoom: number; y: number };
  onCrop: (crop: { zoom: number; y: number }) => void;
  onTemplate: (id: string) => void;
  onFavourite: (hex: string) => void;
};

/** Palette exploration changes adjacent colour, never the source face or factors. */
export default function ColourMirror(props: Props) {
  const [navigation, setNavigation] = useState({ id: props.template.id, point: [...props.template.coords] as PalettePoint });
  if (navigation.id !== props.template.id) setNavigation({ id: props.template.id, point: [...props.template.coords] as PalettePoint });
  const point = navigation.id === props.template.id ? navigation.point : [...props.template.coords] as PalettePoint;
  function chooseTemplate(id: string) {
    const template = atlas.find(item => item.id === id)!;
    setNavigation({ id, point: [...template.coords] as PalettePoint });
    props.onTemplate(id);
  }
  function moveAxis(axis: number, value: number) {
    const next = point.map((coordinate, index) => index === axis ? value : coordinate) as PalettePoint;
    const template = nearestPalette(next, props.template);
    setNavigation({ id: template.id, point: next });
    if (template.id !== props.template.id) props.onTemplate(template.id);
  }
  const framing = props.framing;
  const framedViewport = framing ? { aspectRatio: `${framing.crop.width * framing.sourceWidth} / ${framing.crop.height * framing.sourceHeight}`, height: "auto" } : undefined;
  const framedImage = framing ? { position: "absolute" as const, maxWidth: "none", left: `${-100 * framing.crop.x / framing.crop.width}%`, top: `${-100 * framing.crop.y / framing.crop.height}%`, width: `${100 / framing.crop.width}%`, height: `${100 / framing.crop.height}%`, objectFit: "fill" as const, transform: "none" } : { objectPosition: `50% ${props.crop.y}%`, transform: `translateY(${(50 - props.crop.y) * (props.crop.zoom * 1.12 - 1)}%) scale(${props.crop.zoom * 1.12})` };
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
            <span className={styles.crop} style={framedViewport}>{props.referenceUrl ? <img src={props.referenceUrl} alt="Your unchanged face and neck reference" style={framedImage} /> : <span>Reference unavailable. Return to your photos.</span>}</span>
            <span className={styles.drape} aria-hidden="true" />
          </button>
          <div className={styles.caption}><div><strong>{name(choice)}</strong><small>{colours[choice].hex}</small></div><button type="button" onClick={() => props.onFavourite(colours[choice].hex)} aria-pressed={props.favourites.includes(colours[choice].hex)} aria-label={`${props.favourites.includes(colours[choice].hex) ? "Remove" : "Keep"} ${name(choice)} favourite`}>{props.favourites.includes(colours[choice].hex) ? "♥" : "♡"}</button></div>
        </article>)}</div>
        <p className={styles.method}>{props.referenceLabel} Both sides use the same photograph and crop. Flat colour shows adjacency, not reflected fabric light.</p>
      </div>
      <div className={styles.navigation}>
        <div className={styles.explorer}>
          <h3>Find colours that feel right</h3>
          <p>Move a little to explore. Your palette changes when you cross into a neighbouring palette.</p>
          {[{ name: "Temperature", low: "Cooler", high: "Warmer" }, { name: "Depth", low: "Deeper", high: "Lighter" }, { name: "Chroma", low: "Softer", high: "Brighter" }].map((axis, index) => <label className={styles.axis} key={axis.name}><strong>{axis.name}</strong><input aria-label={`Explore palette ${axis.name.toLowerCase()}`} type="range" min="-1" max="1" step="0.01" value={point[index]} onChange={event => moveAxis(index, Number(event.target.value))} /><span><span>{axis.low}</span><span>{axis.high}</span></span></label>)}
          <p className={styles.paletteStatus} aria-live="polite"><strong>{props.template.name}</strong> · {props.template.factor_words.join(", ")}</p>
          <div className={styles.nearby} aria-label="Nearby palettes">{nearbyPalettes(point).map(template => <button type="button" key={template.id} aria-pressed={props.template.id === template.id} onClick={() => chooseTemplate(template.id)}>{template.name}</button>)}</div>
          <p>These controls explore palette designs; they don’t measure your colouring.</p>
          <details><summary>Browse all palettes</summary><label className={styles.switch}>Palette<select value={props.template.id} onChange={e => chooseTemplate(e.target.value)}>{atlas.map(p => <option key={p.id} value={p.id}>{p.name} — {p.factor_words.join(", ")}</option>)}</select></label></details>
        </div>
        <p>Tap a colour to change portrait <strong>{active === 0 ? "A" : "B"}</strong>.</p>
        {[{ title: "Everyday foundations", start: 0, end: 5 }, { title: "A little more expression", start: 5, end: 13 }].map(group => <div className={styles.group} key={group.title}><h3>{group.title}<span>{group.end - group.start}</span></h3><div className={styles.swatches}>{colours.slice(group.start, group.end).map((colour, i) => <button type="button" key={colour.id} style={{ background: colour.hex }} title={colour.name || colour.role} aria-label={`Try ${colour.name || colour.role.replaceAll("_", " ")}, ${colour.hex}, on ${active === 0 ? "A" : "B"}`} aria-pressed={choices[active] === group.start + i} onClick={() => setChoices(previous => previous.map((value, side) => side === active ? group.start + i : value))}><span>{choices[active] === group.start + i ? "✓" : props.favourites.includes(colour.hex) ? "♥" : ""}</span></button>)}</div></div>)}
        <p className={styles.selection} aria-live="polite">On {active === 0 ? "A" : "B"}: {current.name || current.role.replaceAll("_", " ")} · {current.hex}</p>
        {!framing && <details className={styles.details}><summary>Adjust framing manually</summary><p>Use one shared crop for both sides. Keep your face and neck visible.</p><label>Zoom <input type="range" min="1" max="3" step="0.05" value={props.crop.zoom} onChange={e => props.onCrop({ ...props.crop, zoom: Number(e.target.value) })} /></label><label>Vertical position <input type="range" min="0" max="100" value={props.crop.y} onChange={e => props.onCrop({ ...props.crop, y: Number(e.target.value) })} /></label></details>}
        <div className={styles.favourites}><strong>Your favourites · {props.favourites.length}</strong><div>{props.favourites.map(hex => <button type="button" key={hex} onClick={() => props.onFavourite(hex)} aria-label={`Remove ${hex} favourite`}><i style={{ background: hex }} />{hex} ×</button>)}</div><p>Favourites describe your taste. They don’t change your colour evidence. Use Save my palette to keep changes.</p></div>
      </div>
    </div>
  </section>;
}

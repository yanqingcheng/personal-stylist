import { atlas, type Template } from "@/lib/colour";

export type PalettePoint = [number, number, number];
const distance = (point: PalettePoint, template: Template) => template.coords.reduce((sum, value, axis) => sum + (value - point[axis]) ** 2, 0);
/** Atlas anchors define nearest-palette boundaries; slider values are exploration, not measurements. */
export function nearestPalette(point: PalettePoint, current: Template): Template {
  return atlas.reduce((best, candidate) => distance(point, candidate) < distance(point, best) - 1e-9 ? candidate : best, current);
}
export function nearbyPalettes(point: PalettePoint): Template[] {
  return [...atlas].sort((a, b) => distance(point, a) - distance(point, b)).slice(0, 4);
}

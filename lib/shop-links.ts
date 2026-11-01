/** UK retailer searches, not verified products. No network requests are made here. */
export function retailerSearchLinks(query: string) {
  const terms = query.trim().replace(/\s+/g, ' ').slice(0, 240);
  if (!terms) return [];
  const marks = new URL('https://www.marksandspencer.com/search');
  marks.searchParams.set('searchTerm', terms);
  return [
    { retailer: 'M&S', href: marks.href },
  ];
}

// Only literal wardrobe vocabulary can cross from freeform look text into a URL.
// Do not include wool/cashmere: their occurrence may describe an avoidance.
const searchVocabulary = [
  'teal', 'navy', 'blue', 'coral', 'olive', 'cream', 'ivory', 'ecru', 'beige',
  'white', 'black', 'grey', 'gray', 'brown', 'pink', 'red', 'green', 'purple',
  'cotton', 'linen', 'denim', 'seersucker', 'textured', 'wide leg', 'wide-leg',
  'straight leg', 'straight-leg', 'tapered', 'fluid', 'relaxed', 'midi', 'maxi',
  'scoop neck', 'scoop-neck', 'notch neck', 'notch-neck', 'v-neck', 'open neckline',
  'short sleeve', 'short-sleeve', 'elbow sleeve', 'elbow-sleeve',
];
const categories = ['trousers', 'skirt', 'dress', 'overshirt', 'shirt', 'blouse', 'top', 'shell', 'trainers', 'sandals', 'loafers', 'jacket', 'jeans'];
function containsTerm(text: string, term: string) {
  return new RegExp(`\\b${term}\\b`, 'i').test(text);
}
export function approvedGarmentQueries(look: { title: string; description?: string }) {
  const text = `${look.description ?? ''}. ${look.title}`.toLowerCase().slice(0, 2400).replace(/https?:\/\/\S+|\S+@\S+/g, '');
  const clauses = text.split(/(?:[.,;]|\bwith\b|\bover\b|\bworn\b)/);
  const queries: string[] = [];
  for (const clause of clauses) {
    if (/\b(no|not|avoid|without|never)\b/.test(clause)) continue;
    const garments = categories.filter(term => containsTerm(clause, term));
    if (!garments.length) continue;
    const terms = searchVocabulary.filter(term => containsTerm(clause, term));
    for (const garment of garments) {
      const query = [...terms.slice(0, 7), garment].join(' ');
      if (!queries.includes(query)) queries.push(query);
    }
  }
  return queries.filter(query => !queries.some(other => other !== query && other.endsWith(query))).slice(0, 6);
}

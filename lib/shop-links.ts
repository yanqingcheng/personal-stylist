/** UK retailer searches, not verified products. No network requests are made here. */
export function retailerSearchLinks(query: string) {
  const terms = query.trim().replace(/\s+/g, ' ').slice(0, 240);
  if (!terms) return [];
  const marks = new URL('https://www.marksandspencer.com/l/search');
  marks.searchParams.set('searchTerm', terms);
  const johnLewis = new URL('https://www.johnlewis.com/search');
  johnLewis.searchParams.set('search-term', terms);
  return [
    { retailer: 'M&S', href: marks.href },
    { retailer: 'John Lewis', href: johnLewis.href },
  ];
}

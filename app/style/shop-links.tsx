'use client';

import { useState } from 'react';
import { approvedGarmentQueries, retailerSearchLinks } from '@/lib/shop-links';

type Look = { id: string; title: string; description?: string };
type Props = { approved: boolean; outputId: string; documentRevision: string; looks: Look[]; constraints?: string[] };

function LookSearch({ look }: { look: Look }) {
  // Do not transmit consultation prose, photos, or personal details to a retailer.
  const suggestions = approvedGarmentQueries(look);
  const [query, setQuery] = useState(suggestions[0] ?? '');
  const links = retailerSearchLinks(query);
  return <details style={{ borderTop: '1px solid #c5c9bb', padding: '16px 0' }}>
    <summary style={{ cursor: 'pointer' }}>{look.title}</summary>
    {look.description && <p>{look.description}</p>}
    {suggestions.length > 1 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>{suggestions.map(suggestion => <button type="button" key={suggestion} aria-pressed={query === suggestion} onClick={() => setQuery(suggestion)}>{suggestion}</button>)}</div>}
    <label style={{ display: 'block', margin: '12px 0' }}>
      Garment and colour to search for
      <input value={query} maxLength={240} onChange={event => setQuery(event.target.value)} placeholder="e.g. teal textured notch neck top" style={{ display: 'block', width: '100%', padding: 12, marginTop: 8 }} />
    </label>
    {links.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      {links.map(link => <a key={link.retailer} href={link.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Search {link.retailer} ↗</a>)}
    </div>}
  </details>;
}

export default function ShopLinks({ approved, outputId, documentRevision, looks, constraints = [] }: Props) {
  if (!approved || !looks.length) return null;
  return <section aria-label="Search for similar pieces" style={{ marginTop: 32 }}>
    <h3>Search for similar pieces</h3>
    <p>Start with the garment and colour terms from your approved looks. Choose a piece, then edit its search to keep the details you love.</p>
    {constraints.length > 0 && <><p>Keep these requirements in view:</p><ul>{constraints.map((constraint, index) => <li key={index}>{constraint}</li>)}</ul></>}
    <div key={`${outputId}:${documentRevision}`}>
      {looks.map(look => <LookSearch key={look.id} look={look} />)}
    </div>
    <p style={{ fontSize: 13 }}>These links open UK retailer searches for the words you enter. Use clothing terms only; leave personal details out. Results are similar pieces, with no verified match, stock, price or fit. Check the full composition, measurements and returns on the retailer’s page, including any materials you avoid. Set your size and budget there.</p>
  </section>;
}

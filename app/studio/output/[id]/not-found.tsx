import Link from 'next/link';
import './output.css';
export default function MissingSavedImage(){
 return <main className="saved-output"><nav aria-label="Saved image navigation"><Link href="/studio#library">← Your library</Link><Link href="/style">Return to consultation ↗</Link></nav><p className="saved-output-kicker">THE PERSONAL EDIT / SAVED IMAGE</p><h1>Saved image unavailable.</h1><p>This exact image could not be opened. Return to your library and try again.</p></main>;
}

import { BRAND } from '../shared/brand';
import Link from 'next/link';

export default function NotFound() {
  return <main className="jn-notice-page">
    <Link href="/" className="jn-notice-page__brand" aria-label="Ryuu home"><img src={BRAND.houseLogo} width="104" height="68" alt=""/>Ryuu<span className="jn-dot" aria-hidden="true"/></Link>
    <span className="jn-notice-page__eyebrow">404</span>
    <h1>A little lost<span className="jn-dot" aria-hidden="true"/></h1>
    <p>This page isn’t part of Ryuu. Let’s get you back home.</p>
    <div className="jn-notice-page__actions"><Link className="jn-pill" href="/">Back to home</Link><Link className="jn-pill ghost" href="/login">Portal login</Link></div>
  </main>;
}

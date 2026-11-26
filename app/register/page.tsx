import Auth from '../../components/portal/Auth';
import Link from 'next/link';
import {connection} from 'next/server';
import {registrationOpen} from '../../server/config';
export default async function RegisterPage() {
 await connection();
 if(!registrationOpen())return <main className="jn-notice-page">
  <Link href="/" className="jn-notice-page__brand" aria-label="Ryuu home"><img src="/images/ryuu-house-logo.png" width="104" height="68" alt=""/>Ryuu<span className="jn-dot" aria-hidden="true"/></Link>
  <span className="jn-notice-page__eyebrow">Opening shortly</span>
  <h1>Admissions open soon<span className="jn-dot" aria-hidden="true"/></h1>
  <p>We’re getting Ryuu ready to welcome you. Please contact the hostel team for admission enquiries: <a href="tel:+000000000000">00000 00000</a> or <a href="mailto:hello@example.com">hello@example.com</a>.</p>
  <div className="jn-notice-page__actions"><Link className="jn-pill" href="/login">Already have an account? Sign in</Link><Link className="jn-pill ghost" href="/">Back to home</Link></div>
 </main>;
 return <Auth registration />;
}

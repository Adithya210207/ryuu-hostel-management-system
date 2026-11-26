'use client';

import { BRAND } from '../../shared/brand';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icons';
import './homepage-sequences.css';

const steps = [
  { title: 'Say hello.', label: '01 / YOUR APPLICATION', text: 'Create your resident account and verify your email and phone. Add your details, guardian and admission documents.', image: '/images/quiet-corner-concept.webp' },
  { title: 'Find your space.', label: '02 / ROOM & BED', text: 'Explore the room layout and choose your preferred bed. Three- and four-sharing rooms, with AC and an attached bathroom.', image: '/images/room-concept.webp' },
  { title: 'Make it official.', label: '03 / ADMISSION REVIEW', text: 'The hostel team reviews your application and confirms admission. Then submit your first rent and deposit payment details within 48 hours.', image: BRAND.exterior },
  { title: 'Make yourself at home.', label: '04 / YOUR NEW CHAPTER', text: 'After payment verification and check-in, manage meals, monthly payments, outpasses and messages through your account.', image: '/images/dining-concept.webp' },
];
const pictures = [
  { src: BRAND.exterior, alt: BRAND.exteriorAlt, zoom: 4 },
  { src: '/images/dining-concept.webp', alt: 'Illustrative shared dining space', zoom: 5 },
  { src: '/images/quiet-corner-concept.webp', alt: 'Illustrative peaceful reading corner', zoom: 6 },
  { src: '/images/room-concept.webp', alt: 'Illustrative three-sharing room', zoom: 5 },
  { src: '/images/quiet-corner-concept.webp', alt: '', zoom: 6 },
  { src: '/images/room-concept.webp', alt: '', zoom: 8 },
  { src: '/images/dining-concept.webp', alt: '', zoom: 9 },
];
const clamp = (n: number) => Math.min(1, Math.max(0, n));
// Pinned scenes need room for both their heading and content.
const staticMotionQuery = '(prefers-reduced-motion: reduce), (max-height: 600px)';

export default function HomepageSequences({ paused, imageSources = {} }: { paused: boolean; imageSources?: Record<string, string> }) {
  const photo = (src: string) => imageSources[src] || src;
  const root = useRef<HTMLDivElement>(null);
  const [word, setWord] = useState(0);
  const words = ['peace.', 'possibility.', 'belonging.'];

  useEffect(() => {
    const surface = root.current;
    if (!surface) return;
    const media = matchMedia(staticMotionQuery);
    const timeline = surface.querySelector<HTMLElement>('.jn-sequence-timeline')!;
    const track = surface.querySelector<HTMLElement>('.jn-journey-track')!;
    const zoom = surface.querySelector<HTMLElement>('.jn-sequence-zoom-run')!;
    const layers = [...surface.querySelectorAll<HTMLElement>('.jn-zoom-layer')];
    const chapters = [...surface.querySelectorAll<HTMLElement>('.jn-journey-step')];
    const cta = surface.querySelector<HTMLElement>('.jn-sequence-invitation')!;
    let frame = 0, distance = 0;
    const visible = new Set<Element>();
    const measure = () => { distance = Math.max(0, track.scrollWidth - timeline.clientWidth + timeline.clientWidth * .05); };
    const update = () => {
      frame = 0;
      if (paused || media.matches || document.hidden) return;
      // Read all geometry before writing transforms, to avoid repeated layout work.
      const h = innerHeight;
      const tr = visible.has(timeline) ? timeline.getBoundingClientRect() : null;
      const zr = visible.has(zoom) ? zoom.getBoundingClientRect() : null;
      const cr = visible.has(cta) ? cta.getBoundingClientRect() : null;
      if (tr) {
        const p = clamp(-tr.top / Math.max(1, tr.height - h));
        track.style.transform = `translate3d(${-p * distance}px,0,0)`;
        timeline.style.setProperty('--journey-progress', String(p));
        const active = Math.round(p * (steps.length - 1));
        chapters.forEach((chapter, i) => chapter.classList.toggle('is-current', i === active));
      }
      if (zr) {
        // Reach the full-screen image before the invitation scrolls over it.
        const p = clamp(-zr.top / Math.max(1, zr.height - h * 2));
        layers.forEach((layer, i) => { layer.style.transform = `scale(${1 + p * (pictures[i].zoom - 1)})`; });
        zoom.style.setProperty('--zoom-progress', String(p));
      }
      if (cr) {
        const p = clamp((h - cr.top) / (h + cr.height));
        cta.style.setProperty('--ribbon-travel', `${p * -240}px`);
        if (cr.top < h * .72) cta.classList.add('is-revealed');
      }
    };
    const schedule = () => { if (!frame && visible.size) frame = requestAnimationFrame(update); };
    const resize = () => { measure(); schedule(); };
    const motion = () => {
      const still = paused || media.matches;
      const wasAnimated = surface.classList.contains('jn-sequences-animated');
      const changing = wasAnimated !== !still;
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const focusedRect = focused?.getBoundingClientRect();
      const keepFocus = changing && focused && focused !== document.body && focusedRect && focusedRect.top >= 0 && focusedRect.bottom <= innerHeight;
      const timelineRect = timeline.getBoundingClientRect();
      const inTimeline = changing && timelineRect.top < innerHeight && timelineRect.bottom > 0;
      const zoomRect = zoom.getBoundingClientRect();
      const inZoom = changing && zoomRect.top < innerHeight && zoomRect.bottom > 0;
      const chapter = inTimeline ? (wasAnimated
        ? chapters.find(el => el.classList.contains('is-current'))
        : chapters.reduce((best, el) => Math.abs(el.getBoundingClientRect().top - innerHeight * .4) < Math.abs(best.getBoundingClientRect().top - innerHeight * .4) ? el : best)) : undefined;
      const chapterTop = chapter?.getBoundingClientRect().top;
      surface.classList.toggle('jn-sequences-animated', !still);
      if (still) {
        track.style.removeProperty('transform');
        layers.forEach(layer => layer.style.removeProperty('transform'));
        cta.classList.add('is-revealed');
      }
      measure();
      // Keep the reader at their control or chapter when the long scenes collapse.
      if (keepFocus) {
        window.scrollBy({ top: focused.getBoundingClientRect().top - focusedRect.top, behavior: 'instant' });
      } else if (chapter && chapterTop !== undefined) {
        if (still) window.scrollBy({ top: chapter.getBoundingClientRect().top - chapterTop, behavior: 'instant' });
        else {
          const r = timeline.getBoundingClientRect();
          const p = distance ? clamp((chapter.offsetLeft - timeline.clientWidth * .06) / distance) : 0;
          window.scrollTo({ top: scrollY + r.top + p * Math.max(0, r.height - innerHeight), behavior: 'instant' });
        }
      } else if (inZoom) {
        const r = (still ? layers[0] : zoom).getBoundingClientRect();
        const p = clamp(Number(zoom.style.getPropertyValue('--zoom-progress')) || 0);
        const offset = still ? (r.height - innerHeight) / 2 : p * Math.max(0, r.height - innerHeight * 2);
        window.scrollTo({ top: scrollY + r.top + offset, behavior: 'instant' });
      }
      schedule();
    };
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
      schedule();
    }, { rootMargin: '150px' });
    [timeline, zoom, cta].forEach(el => observer.observe(el));
    const sizes = new ResizeObserver(resize); sizes.observe(track);
    motion();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', schedule);
    media.addEventListener('change', motion);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); sizes.disconnect();
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', schedule); media.removeEventListener('change', motion);
    };
  }, [paused]);

  useEffect(() => {
    const media = matchMedia(staticMotionQuery);
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      if (paused || media.matches) return;
      timer = setInterval(() => {
        const cta = root.current?.querySelector('.jn-sequence-invitation')?.getBoundingClientRect();
        if (!document.hidden && cta && cta.top < innerHeight && cta.bottom > 0) setWord(w => (w + 1) % words.length);
      }, 2500);
    };
    sync();
    media.addEventListener('change', sync);
    return () => { clearInterval(timer); media.removeEventListener('change', sync); };
  }, [paused, words.length]);

  return <div ref={root} className="jn-home-sequences" id="your-journey">
    <section className="jn-sequence-timeline" aria-labelledby="jn-journey-title">
      <div className="jn-journey-sticky">
        <header className="jn-sequence-heading"><span>THE WAY TO YOUR NEXT CHAPTER</span><h2 id="jn-journey-title">Your journey to Ryuu.</h2><p>From your first hello to feeling at home.<br/>A little guidance, every step of the way.</p></header>
        <ol className="jn-journey-track">{steps.map((step, i) => <li key={step.label} className={`jn-journey-step ${i === 0 ? 'is-current' : ''}`}><span className="jn-journey-dot"/><div className="jn-journey-card"><span>{step.label}</span><h3>{step.title}</h3><p>{step.text}</p><img src={photo(step.image)} alt="" loading="lazy" decoding="async"/><small>{i === 2 ? 'PROPOSED EXTERIOR' : 'ILLUSTRATIVE CONCEPT'}</small></div></li>)}</ol>
        <div className="jn-journey-footer"><span>SCROLL TO FOLLOW THE JOURNEY →</span><span className="jn-journey-meter"><i/></span><a href="#jn-nest-gallery">Explore the spaces <Icon name="down"/></a></div>
      </div>
    </section>

    <section className="jn-sequence-gallery" id="jn-nest-gallery" aria-labelledby="jn-gallery-title">
      <header className="jn-sequence-heading"><span>A GLIMPSE OF WHAT’S TO COME</span><h2 id="jn-gallery-title">Life, at Ryuu.</h2><p>Space to settle in. Company to share a meal with.<br/>Quiet moments to make your own.</p><small>AI-generated building concept and illustrative interiors. Actual photographs coming before launch.</small></header>
      <div className="jn-sequence-zoom-run"><div className="jn-zoom-sticky">{pictures.map((picture, i) => <div className={`jn-zoom-layer jn-zoom-layer-${i}`} key={i} aria-hidden={i > 3 || undefined}><figure><img src={photo(picture.src)} alt={picture.alt} loading="lazy" decoding="async"/>{i === 0 && <figcaption><span>RYUU</span><strong>A little closer<br/>to home.</strong><span>PROPOSED EXTERIOR · ARCHITECTURAL RENDER</span></figcaption>}</figure></div>)}<a className="jn-zoom-link" href="#rooms">Explore rooms <Icon name="arrow"/></a></div></div>
    </section>

    <section className="jn-sequence-invitation" aria-labelledby="jn-invitation-title">
      <div className="jn-crossing-ribbons" aria-hidden="true">{['AC ROOMS · ATTACHED BATHROOMS · PERSONAL WARDROBES · FOOD OPTION · LIFT ACCESS · CAR PARKING · ', 'PEACE · LOVE · BELONGING · YOUR OWN SPACE · YOUR NEXT CHAPTER · RYUU · '].map((text, i) => <div className={`jn-ribbon jn-ribbon-${i}`} key={i}><div className="jn-ribbon-scroll"><div className="jn-ribbon-loop">{[0,1,2,3].map(n => <span key={n}>{text}</span>)}</div></div></div>)}</div>
      <div className="jn-invitation-copy"><span className="jn-sequence-kicker">FOR STUDENTS & WORKING MEN · 18+</span><h2 id="jn-invitation-title">Your next chapter.<br/>A place for <span className="jn-invitation-word" aria-label="peace, possibility and belonging"><span aria-hidden="true" className="jn-word-space">possibility.</span><span aria-hidden="true" key={paused ? 'paused' : word} className="jn-word-current">{paused ? words[0] : words[word]}</span></span></h2><p>An air-conditioned men’s hostel in the heart of Bengaluru.<br/>Make room for the life you’re building.</p><div className="jn-invitation-actions"><Link href="/register">Find your space <Icon name="arrow"/></Link><Link href="/login">Open your portal <Icon name="arrow"/></Link></div><small>Opening date and prices will be announced.</small></div>
    </section>
  </div>;
}

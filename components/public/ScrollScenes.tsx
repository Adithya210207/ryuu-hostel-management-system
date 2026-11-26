'use client';

import { useEffect, type RefObject } from 'react';
import './scroll-scenes.css';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const selectors = [
  ['.jn-split-heading h2', 'heading'],
  ['.jn-gallery-item', 'gallery'],
  ['.jn-amenity', 'tile'],
  ['.jn-room-layout > div:first-child', 'room-intro'],
  ['.jn-room-option', 'room'],
  ['.jn-portal-strip', 'portal'],
  ['.jn-faq-layout > h2', 'heading'],
  ['.jn-faq-item', 'question'],
  ['.jn-contact-layout > div:first-child', 'contact-copy'],
  ['.jn-building', 'building'],
] as const;

// Offset geometry stays stable while the visual layer translates or scales.
function layoutTop(element: HTMLElement) {
  let top = 0;
  for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
}

export default function ScrollScenes({ root, paused }: { root: RefObject<HTMLDivElement | null>; paused: boolean }) {
  useEffect(() => {
    const surface = root.current;
    if (!surface) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const scenes = selectors.flatMap(([selector, kind]) => [...surface.querySelectorAll<HTMLElement>(selector)].map((element, index) => {
      element.dataset.scrollKind = kind;
      element.style.setProperty('--scene-direction', index % 2 ? '-1' : '1');
      return { element, top: 0, height: 0 };
    }));
    const visible = new Set<HTMLElement>();
    let frame = 0;
    let measureNeeded = true;
    let active = false;
    let disposed = false;

    const draw = () => {
      frame = 0;
      if (!active || document.hidden) return;
      // Read layout only when something changes size, never on ordinary scrolls.
      if (measureNeeded) {
        scenes.forEach(scene => { scene.top = layoutTop(scene.element); scene.height = scene.element.offsetHeight; });
        measureNeeded = false;
      }
      const y = scrollY, height = innerHeight;
      scenes.forEach(scene => {
        if (!visible.has(scene.element)) return;
        const top = scene.top - y;
        const entry = clamp((height * .94 - top) / Math.min(height * .75, Math.max(240, scene.height * .75)));
        const travel = clamp((height - top) / (height + scene.height));
        scene.element.style.setProperty('--scene-entry', entry.toFixed(4));
        scene.element.style.setProperty('--scene-drift', (1 - travel * 2).toFixed(4));
      });
    };
    const schedule = () => { if (active && !frame && !disposed) frame = requestAnimationFrame(draw); };
    const measure = () => { measureNeeded = true; schedule(); };
    const setMotion = () => {
      active = !paused && !media.matches;
      if (active) surface.dataset.scrollScenes = 'on';
      else { delete surface.dataset.scrollScenes; cancelAnimationFrame(frame); frame = 0; }
      measure();
    };
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const el = entry.target as HTMLElement;
        if (entry.isIntersecting) visible.add(el); else visible.delete(el);
      });
      schedule();
    }, { rootMargin: '180px' });
    scenes.forEach(({ element }) => observer.observe(element));
    const sizes = new ResizeObserver(measure);
    sizes.observe(surface);
    scenes.forEach(({ element }) => sizes.observe(element));
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', measure);
    surface.addEventListener('toggle', measure, true);
    document.addEventListener('visibilitychange', schedule);
    media.addEventListener('change', setMotion);
    document.fonts.ready.then(() => { if (!disposed) measure(); });
    setMotion();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect(); sizes.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', measure);
      surface.removeEventListener('toggle', measure, true);
      document.removeEventListener('visibilitychange', schedule);
      media.removeEventListener('change', setMotion);
      delete surface.dataset.scrollScenes;
      scenes.forEach(({ element }) => {
        delete element.dataset.scrollKind;
        ['--scene-entry', '--scene-drift', '--scene-direction'].forEach(property => element.style.removeProperty(property));
      });
    };
  }, [root, paused]);

  return null;
}

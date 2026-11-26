'use client';

import { useEffect, useRef, useState } from 'react';

const reducedMotion = '(prefers-reduced-motion: reduce)';

/** Animate a changed form step without changing its DOM identity or input state. */
export function useFormStepMotion(step: string) {
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = ref.current;
    const media = matchMedia(reducedMotion);
    if (!form || media.matches || typeof form.animate !== 'function') return;

    const animation = form.animate(
      [{ opacity: .65, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 180, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
    const finish = () => animation.cancel();
    // An interaction always takes priority over a decorative entrance.
    form.addEventListener('focusin', finish);
    form.addEventListener('pointerdown', finish);
    form.addEventListener('beforeinput', finish);
    media.addEventListener('change', finish);
    return () => {
      animation.cancel();
      form.removeEventListener('focusin', finish);
      form.removeEventListener('pointerdown', finish);
      form.removeEventListener('beforeinput', finish);
      media.removeEventListener('change', finish);
    };
  }, [step]);

  return ref;
}

export function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const media = matchMedia(reducedMotion);
    let frame = 0;
    let start: number | undefined;
    const from = current.current;
    const finish = () => {
      cancelAnimationFrame(frame);
      current.current = value;
      setDisplay(value);
    };
    if (media.matches || from === value) { finish(); return; }

    const draw = (time: number) => {
      start ??= time;
      const progress = Math.min(1, (time - start) / 320);
      current.current = from + (value - from) * (1 - Math.pow(1 - progress, 3));
      setDisplay(Math.round(current.current));
      if (progress < 1) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    media.addEventListener('change', finish);
    return () => { cancelAnimationFrame(frame); media.removeEventListener('change', finish); };
  }, [value]);

  return <span aria-label={String(value)}>{display}</span>;
}

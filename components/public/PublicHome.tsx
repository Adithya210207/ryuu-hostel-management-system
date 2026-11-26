"use client";

import { BRAND } from '../../shared/brand';
import BrandLogo from "../BrandLogo";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import HandwrittenIntro from "./HandwrittenIntro";
import Icon from "./Icons";
import ReferenceMotion from './ReferenceMotion';
import HomepageSequences from './HomepageSequences';
import ScrollScenes from './ScrollScenes';

const gallery = [
  { src: "/images/room-concept.webp", title: "Room to make it yours.", label: "YOUR OWN LITTLE CORNER", alt: "Illustrative three-sharing room with single beds and personal wardrobes", className: "jn-gallery-room" },
  { src: "/images/dining-concept.webp", title: "Good food. Better company.", label: "THE EVERYDAY MOMENTS", alt: "Illustrative hostel dining area with a South Indian breakfast setting", className: "jn-gallery-dining" },
  { src: "/images/quiet-corner-concept.webp", title: "A moment, just for you.", label: "MAKE SPACE FOR YOURSELF", alt: "Illustrative peaceful reading corner beside a sunlit window", className: "jn-gallery-quiet" },
];
const amenities = [
  { name: "AC rooms", detail: "A comfortable place to unwind.", icon: "sun" },
  { name: "Attached bathrooms", detail: "A bathroom within every room.", icon: "bath" },
  { name: "Personal wardrobes", detail: "Your belongings. Your own space.", icon: "locker" },
  { name: "Food option", detail: "Make meals part of your routine.", icon: "food" },
  { name: "Lift access", detail: "Move between floors with ease.", icon: "lift" },
  { name: "Car parking", detail: "A place for your vehicle, too.", icon: "car" },
];
const faq = [
  { title: "Who can stay at Ryuu?", answer: "Ryuu welcomes men aged 18 and above — both students and working professionals. Your next chapter deserves a comfortable place to begin." },
  { title: "What are the room options?", answer: "Rooms are primarily three-sharing and four-sharing, with AC, an attached bathroom and a personal wardrobe. Final room inventory and prices will be set by the hostel team." },
  { title: "How does admission work?", answer: "Create an account, verify your contacts and select your preferred bed. An admin reviews your application. Once approved, submit your first month’s rent and refundable deposit details within 48 hours. Your booking is confirmed after payment verification." },
  { title: "Can I choose my meals?", answer: "Active residents can select breakfast, lunch and dinner for the next day through their account. The form opens at 6 PM and closes at 11 PM, with reminders at 9 PM and 10 PM. Meal plans and prices will be confirmed by the hostel team." },
  { title: "When will Ryuu open?", answer: "Our opening date is yet to be announced. The building shown here is an AI-generated concept image, and the interior images are illustrative concepts. We’ll replace these with actual photographs before launch." },
];

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const defaultContent = { hostelName: "Ryuu", address: "No. 00, 80 Feet Road, 5th Block, Koramangala, Bengaluru, Karnataka — 560034", phone: "0000000000", email: "hello@example.com", openingDate: "" };
function stored(key: string) { try { return sessionStorage.getItem(key); } catch { return null; } }
function remember(key: string, value: string) { try { sessionStorage.setItem(key, value); } catch { /* Private browsing may disallow storage. */ } }

export default function PublicHome({imageSources = {}}: {imageSources?: Record<string, string>}) {
  const photo = (src: string) => imageSources[src] || src;
  const root = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const stage = useRef<HTMLElement>(null);
  const manifesto = useRef<HTMLHeadingElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wipe = useRef<HTMLDivElement>(null);
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useRef(false);
  const navBusy = useRef(false);
  const [intro, setIntro] = useState<"off" | "playing" | "leaving">("off");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [focus, setFocus] = useState(false);
  const [time, setTime] = useState("BENGALURU");
  const [phrase, setPhrase] = useState(0);
  const [motionPaused, setMotionPaused] = useState(false);
  const [content, setContent] = useState(defaultContent);
  const phrases = ["next home.", "own space.", "new chapter."];
  const placeholderContact = content.phone === defaultContent.phone && content.email === defaultContent.email;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public", { signal: controller.signal, cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!data) return;
        setContent(previous => Object.fromEntries(Object.entries(previous).map(([key, value]) => [key, typeof data[key] === "string" ? data[key] : value])) as typeof defaultContent);
      }).catch(() => { /* Keep the truthful placeholder content when the API is unavailable. */ });
    return () => controller.abort();
  }, []);

  function endIntro() {
    if (introTimer.current) clearTimeout(introTimer.current);
    if (reduced.current) { setIntro("off"); return; }
    setIntro("leaving");
    introTimer.current = setTimeout(() => { setIntro("off"); remember("ryuu-intro-v2", "seen"); }, 1100);
  }
  function replayIntro() {
    if (reduced.current) return;
    if (introTimer.current) clearTimeout(introTimer.current);
    window.scrollTo({ top: 0, behavior: "instant" });
    setMenuOpen(false);
    setIntro("playing");
    introTimer.current = setTimeout(endIntro, 4450);
  }

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = media.matches;
    setDark(stored("ryuu-public-theme") === "dark");
    setMotionPaused(stored("ryuu-motion-paused") === "yes");
    root.current?.classList.add("jn-enhanced");
    if (!media.matches && !stored("ryuu-intro-v2")) {
      setIntro("playing");
      introTimer.current = setTimeout(endIntro, 4450);
    }
    const handleMotion = () => { reduced.current = media.matches; if (media.matches) setIntro("off"); };
    media.addEventListener("change", handleMotion);
    const tick = () => setTime(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
    tick();
    const clock = setInterval(tick, 1000);
    const words = setInterval(() => { if (!document.hidden && !reduced.current) setPhrase(p => (p + 1) % 3); }, 3600);
    return () => {
      clearInterval(clock); clearInterval(words);
      if (introTimer.current) clearTimeout(introTimer.current);
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
      media.removeEventListener("change", handleMotion);
    };
  // Intro timers are deliberately initialized once per mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (page.current) page.current.inert = intro !== "off";
    if (intro === "off") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") endIntro(); };
    document.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", escape); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro]);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("jn-visible"); observer.unobserve(entry.target); }
    }), { threshold: 0.08 });
    root.current?.querySelectorAll(".jn-reveal").forEach(el => observer.observe(el));
    let frame = 0;
    let previousY = window.scrollY;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const nav = header.current;
      nav?.classList.toggle("jn-scrolled", y > 40);
      if (Math.abs(y - previousY) > 4) nav?.classList.toggle("jn-nav-hidden", y > previousY && y > 500 && !menuOpen);
      previousY = y;
      if (reduced.current || motionPaused) return;
      const rect = manifesto.current?.getBoundingClientRect();
      if (rect) {
        const words = manifesto.current?.querySelectorAll<HTMLElement>(".jn-reveal-word");
        const p = clamp((innerHeight * 0.88 - rect.top) / (innerHeight * 0.5));
        words?.forEach((word, i) => { word.style.opacity = String(clamp((p * words.length - i) * 1.8, 0.2, 1)); });
      }
      const storyRect = stage.current?.getBoundingClientRect();
      if (storyRect && stage.current) {
        const p = clamp(-storyRect.top / (storyRect.height - innerHeight));
        stage.current.style.setProperty("--jn-story-fill", `${clamp(p * 1.7) * 100}%`);
        stage.current.style.setProperty("--jn-story-scale", `${1 + p * 0.46}`);
        stage.current.style.setProperty("--jn-story-shift", `${p * -5}vw`);
        stage.current.style.setProperty("--jn-image-shift", `${(p - 0.5) * -110}px`);
        stage.current.style.setProperty("--jn-image-rotate", `${(p - 0.5) * 9}deg`);
      }
      root.current?.querySelectorAll<HTMLElement>("[data-parallax]").forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < innerHeight && r.bottom > 0) el.style.setProperty("--jn-parallax", `${clamp((r.top - innerHeight / 2) / innerHeight, -1, 1) * 35}px`);
      });
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("scroll", scroll); window.removeEventListener("resize", scroll); };
  }, [menuOpen, motionPaused]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuOpen(false); document.getElementById("jn-menu-button")?.focus(); } };
    const outside = (e: globalThis.MouseEvent) => { if (!header.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("keydown", close);
    document.addEventListener("click", outside);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("click", outside); };
  }, [menuOpen]);

  useEffect(() => {
    const surface = canvas.current;
    const ctx = surface?.getContext("2d");
    if (!surface || !ctx) return;
    let frame = 0;
    let particles: { x: number; y: number; start: number }[] = [];
    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      surface.width = innerWidth * ratio; surface.height = innerHeight * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const draw = (now: number) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      particles = particles.filter(p => now - p.start < 450);
      ctx.strokeStyle = "#da6946"; ctx.lineWidth = 1.5;
      particles.forEach(p => {
        const progress = (now - p.start) / 450;
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4, distance = 26 * progress, length = 12 * (1 - progress);
          ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * distance, p.y + Math.sin(a) * distance);
          ctx.lineTo(p.x + Math.cos(a) * (distance + length), p.y + Math.sin(a) * (distance + length)); ctx.stroke();
        }
      });
      frame = particles.length ? requestAnimationFrame(draw) : 0;
    };
    const spark = (e: globalThis.MouseEvent) => {
      if (reduced.current || motionPaused || e.detail === 0) return;
      particles.push({ x: e.clientX, y: e.clientY, start: performance.now() });
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const surfaceRoot = root.current;
    surfaceRoot?.addEventListener("click", spark);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(frame); surfaceRoot?.removeEventListener("click", spark); window.removeEventListener("resize", resize); ctx.clearRect(0, 0, innerWidth, innerHeight); };
  }, [motionPaused]);

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    const hash = event.currentTarget.hash;
    const destination = document.getElementById(hash.substring(1));
    if (!destination || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setMenuOpen(false);
    if (navBusy.current) return;
    const go = () => {
      destination.scrollIntoView({ behavior: "instant", block: "start" });
      history.replaceState(null, "", hash);
      destination.setAttribute("tabindex", "-1"); destination.focus({ preventScroll: true });
    };
    if (reduced.current || motionPaused || !wipe.current) { go(); return; }
    navBusy.current = true;
    const curtain = wipe.current;
    const label = curtain.querySelector("span");
    if (label) label.textContent = event.currentTarget.dataset.title || "Make yourself at home.";
    curtain.classList.add("jn-wiping");
    navigationTimer.current = setTimeout(() => {
      go();
      navigationTimer.current = setTimeout(() => { curtain.classList.remove("jn-wiping"); navBusy.current = false; }, 680);
    }, 600);
  }

  function pointer(event: PointerEvent<HTMLDivElement>) {
    if (reduced.current || motionPaused || event.pointerType !== "mouse" || !halo.current) return;
    halo.current.style.left = `${event.clientX}px`; halo.current.style.top = `${event.clientY}px`; halo.current.style.opacity = "1";
  }
  function magnetic(event: PointerEvent<HTMLAnchorElement>) {
    if (reduced.current || motionPaused || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.translate = `${(event.clientX - rect.left - rect.width / 2) * 0.1}px ${(event.clientY - rect.top - rect.height / 2) * 0.14}px`;
  }
  function toggleTheme() {
    const change = () => setDark(value => { remember("ryuu-public-theme", value ? "light" : "dark"); return !value; });
    if ("startViewTransition" in document && !reduced.current && !motionPaused) {
      (document as Document & { startViewTransition: (fn: () => void) => unknown }).startViewTransition(change);
    } else change();
  }

  return <div ref={root} className={`jn-site ${dark ? "jn-dark" : ""} ${focus ? "jn-focus" : ""} ${motionPaused ? "jn-motion-paused" : ""} ${intro === "off" ? "jn-entered" : ""}`} onPointerMove={pointer}>
    <ReferenceMotion paused={motionPaused || intro !== 'off'}/>
    <ScrollScenes root={root} paused={motionPaused || intro !== 'off'}/>
    {intro !== "off" && <HandwrittenIntro leaving={intro === "leaving"} onSkip={endIntro} />}
    <div className="jn-halo" ref={halo} aria-hidden="true" />
    <canvas className="jn-sparks" ref={canvas} aria-hidden="true" />
    <div className="jn-wipe" ref={wipe} aria-hidden="true"><span>Make yourself at home.</span></div>
    <div ref={page}>
      <a className="jn-skip" href="#jn-main">Skip to content</a>
      <header ref={header} className={`jn-header ${menuOpen ? "jn-menu-open" : ""}`}>
        <a href="#home" onClick={navigate} data-title="Welcome home." className="jn-wordmark" aria-label={`${content.hostelName} home`}><BrandLogo/><span>{content.hostelName.toUpperCase()}<small>BENGALURU, INDIA</small></span></a>
        <nav className="jn-desktop-nav" aria-label="Main navigation">
          <a href="#about" onClick={navigate} data-title="About Ryuu.">About</a>
          <a href="#living" onClick={navigate} data-title="Your everyday.">Living here</a>
          <a href="#contact" onClick={navigate} data-title="Say hello.">Find us</a>
        </nav>
        <div className="jn-header-right"><button className="jn-icon-button jn-theme" aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={toggleTheme}><Icon name="sun" /></button><Link className="jn-login" href="/login">Portal login <Icon name="arrow" /></Link><button className="jn-icon-button jn-menu-button" id="jn-menu-button" aria-controls="jn-mobile-nav" aria-expanded={menuOpen} aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? "close" : "menu"} /></button></div>
        {menuOpen && <nav className="jn-mobile-nav" id="jn-mobile-nav" aria-label="Mobile navigation"><a href="#about" onClick={navigate}>About <span>01</span></a><a href="#living" onClick={navigate}>Living here <span>02</span></a><a href="#rooms" onClick={navigate}>Your room <span>03</span></a><a href="#contact" onClick={navigate}>Find us <span>04</span></a><Link href="/register">Start your application <Icon name="arrow" /></Link></nav>}
      </header>

      <main id="jn-main">
        <section className="jn-hero" id="home" aria-labelledby="jn-hero-title">
          <div className="jn-spotlights" aria-hidden="true"><span /><span /></div>
          <div className="jn-hero-topline"><span><i className="jn-live-dot" /> A NEW HOME IN BENGALURU</span><span>FOR MEN. FOR YOUR NEXT CHAPTER.</span></div>
          <h1 id="jn-hero-title" className="jn-visually-hidden">{content.hostelName} — Men’s hostel in Bengaluru</h1>
          <div className="jn-type-composition" aria-hidden="true">
            <div className="jn-type-row jn-row-one"><span className="jn-side-copy">COOL ROOMS.<br />CALM DAYS.<br />SAFE NIGHTS.</span><span className="jn-shine">{content.hostelName.toUpperCase()}</span><Icon name="star" className="jn-float jn-float-star" /></div>
            <div className="jn-type-row jn-row-two"><span className="jn-shine">MEN’S</span><span className="jn-orange-label">MAKE YOURSELF<br />AT HOME ↗</span></div>
            <div className="jn-type-row jn-row-three"><span className="jn-shine">HOSTEL</span><span className="jn-hero-thumbnail"><img src={photo(BRAND.exterior)} alt="" /></span><Icon name="heart" className="jn-float jn-float-heart" /></div>
          </div>
          <div className="jn-hero-bottom"><p>Big city. Cool rooms.<br /><span>A calm, fully air-conditioned home in the heart of Bengaluru.</span></p><div className="jn-hero-actions"><a href="#living" onClick={navigate} className="jn-text-link" data-title="Take a look inside.">Explore Ryuu <Icon name="down" /></a><Link href="/register" className="jn-pill jn-pill-dark" onPointerMove={magnetic} onPointerLeave={e => { e.currentTarget.style.translate = "0 0"; }}>Find your space <Icon name="arrow" /></Link></div></div>
          <div className="jn-hero-floor"><span>SCROLL TO FEEL AT HOME <Icon name="down" /></span><span>18+ · STUDENTS & WORKING MEN</span><time suppressHydrationWarning>{time} IST</time></div>
        </section>

        <section className="jn-about jn-section" id="about">
          <div className="jn-section-label jn-reveal"><span>01 / RYUU</span><span>A FEELING, BEFORE A PLACE</span></div>
          <div className="jn-about-layout"><h2 ref={manifesto} className="jn-manifesto" aria-label="A new chapter. A familiar feeling. A place of your own.">{["A new chapter.", "A familiar feeling.", "A place of your own."].map((line, index) => <span className={index === 1 ? "jn-serif" : ""} key={line}>{line.split(" ").map((word, i) => <span key={i} className="jn-reveal-word">{word} </span>)}<br /></span>)}</h2><div className="jn-about-aside jn-reveal"><span className="jn-orbit-icon"><Icon name="home" /><span>✳</span></span><p>For the life you’re building,<br />and the person you’re becoming.</p></div></div>
          <div className="jn-about-bottom"><p className="jn-reveal">A new city. A fresh routine. A world of possibilities. Ryuu is a men’s hostel with a simple idea: a comfortable place to come back to, and the freedom to move forward.</p><div className="jn-reveal"><span className="jn-micro">ROOTED IN BENGALURU</span><p>AC rooms, space for your belongings, a food option, and a peaceful atmosphere — right in the middle of the city.</p></div><span className="jn-signature jn-reveal">Welcome to<br /><em>Ryuu.</em></span></div>
        </section>


        <section ref={stage} className="jn-story" aria-label="Room for your next chapter">
          <div className="jn-story-sticky"><p className="jn-micro">COOL, CALM AND ALL YOURS</p><div className="jn-story-title" aria-hidden="true"><span className="jn-story-outline">FEEL AT HOME</span><span className="jn-story-fill">FEEL AT HOME</span></div><div className="jn-story-photo jn-story-left"><img src={photo("/images/quiet-corner-concept.webp")} alt="Illustrative quiet corner concept" loading="lazy" /><span>YOUR QUIET MOMENTS</span></div><div className="jn-story-photo jn-story-right"><img src={photo("/images/room-concept.webp")} alt="Illustrative bedroom concept" loading="lazy" /><span>A LITTLE SPACE FOR YOU</span></div><p className="jn-story-bottom">YOUR EVERYDAY. YOUR NEXT CHAPTER.<small>Illustrative interior concepts</small></p></div>
        </section>

        <section className="jn-living jn-section" id="living"><div className="jn-section-label jn-reveal"><span>02 / THE EVERYDAY</span><span>LITTLE THINGS. A BIG DIFFERENCE.</span></div><div className="jn-split-heading"><h2 className="jn-reveal">Life, with a<br /><span className="jn-serif">little more ease.</span></h2><p className="jn-reveal">A room to call yours.<br />The comforts that make it home.</p></div>
          <div className="jn-gallery">{gallery.map((item, i) => <figure className={`jn-gallery-item jn-reveal ${item.className}`} key={item.src}><div className="jn-image-window" data-parallax><img src={photo(item.src)} alt={item.alt} loading="lazy" /><span className="jn-image-tag">ILLUSTRATIVE CONCEPT</span><span className="jn-image-index">0{i + 1}</span></div><figcaption><span className="jn-micro">{item.label}</span><h3>{item.title}</h3><Icon name="arrow" /></figcaption></figure>)}</div><p className="jn-gallery-note">A glimpse of the feeling we’re creating. These AI-generated interior concepts are placeholders; actual rooms and furnishings may differ.</p>
          <div className="jn-amenities">{amenities.map((amenity, i) => <article key={amenity.name} className="jn-amenity jn-reveal"><div><span>0{i + 1}</span><Icon name={amenity.icon} /></div><h3>{amenity.name}</h3><p>{amenity.detail}</p></article>)}</div>
        </section>

        <section className="jn-rooms jn-section" id="rooms"><div className="jn-section-label jn-reveal"><span>03 / YOUR OWN SPACE</span><span>SHARED ROOMS. INDIVIDUAL STORIES.</span></div><div className="jn-room-layout"><div><h2 className="jn-reveal">Settle in.<br /><span className="jn-serif">Make it yours.</span></h2><p className="jn-room-intro jn-reveal">A little space for your things, your routines, and everything that makes you, you.</p><Link href="/register" className="jn-pill jn-pill-outline jn-reveal">Explore room & bed selection <Icon name="arrow" /></Link></div><div className="jn-room-options"><article className="jn-room-option jn-reveal"><span className="jn-micro">ROOM TYPE / 01</span><h3>Three sharing <span>03</span></h3><p>AC · Attached bathroom · Personal wardrobe</p><span className="jn-room-price">Pricing to be announced</span><div className="jn-bed-drawing" aria-hidden="true"><Icon name="bed" /><Icon name="bed" /><Icon name="bed" /></div></article><article className="jn-room-option jn-reveal"><span className="jn-micro">ROOM TYPE / 02</span><h3>Four sharing <span>04</span></h3><p>AC · Attached bathroom · Personal wardrobe</p><span className="jn-room-price">Pricing to be announced</span><div className="jn-bed-drawing" aria-hidden="true"><Icon name="bed" /><Icon name="bed" /><Icon name="bed" /><Icon name="bed" /></div></article></div></div><p className="jn-room-note">Select a preferred bed in your account. Admission and availability are confirmed by the hostel team. The current booking layout is a demonstration until the final floor plan is ready.</p></section>

        <section className="jn-portal-strip"><span className="jn-reveal">YOUR STAY, AT YOUR FINGERTIPS.</span><h2 className="jn-reveal">Less paperwork.<br /><span className="jn-serif">More living.</span></h2><p className="jn-reveal">Meals, payments, outpasses and a direct line to the hostel team. One place to take care of your everyday.</p><Link href="/login" className="jn-pill jn-pill-light jn-reveal">Open your portal <Icon name="arrow" /></Link><div className="jn-portal-ring jn-ring-one" aria-hidden="true" /><div className="jn-portal-ring jn-ring-two" aria-hidden="true" /><Icon name="star" className="jn-portal-star" /></section>

        <section className="jn-faq jn-section"><div className="jn-section-label jn-reveal"><span>04 / GOOD TO KNOW</span><span>A FEW THINGS, ANSWERED.</span></div><div className="jn-faq-layout"><h2 className="jn-reveal">Before you<br /><span className="jn-serif">settle in.</span></h2><div>{faq.map((item, i) => <details key={item.title} className="jn-faq-item jn-reveal"><summary><span className="jn-faq-number">0{i + 1}</span>{item.title}<span className="jn-plus">+</span></summary><p>{item.answer}</p></details>)}</div></div></section>

        <HomepageSequences paused={motionPaused} imageSources={imageSources}/>

        <section className="jn-contact" id="contact"><div className="jn-contact-marquee" aria-hidden="true"><div>{[0, 1].map(i => <span key={i}>YOUR NEXT CHAPTER <Icon name="star" /> STARTS HERE <Icon name="star" /> </span>)}</div></div><div className="jn-section jn-contact-layout"><div><span className="jn-micro jn-reveal">05 / FIND YOUR WAY HOME</span><h2 className="jn-reveal">Hello,<br /><span className="jn-serif jn-rotating-word" key={motionPaused ? "paused" : phrase}>{motionPaused ? phrases[0] : phrases[phrase]}</span></h2><p className="jn-contact-address jn-reveal">{content.address}</p><div className="jn-contact-status jn-reveal"><span className="jn-live-dot" /> {content.openingDate ? `Opening: ${content.openingDate}` : "Opening date to be announced"}</div><Link href="/register" className="jn-pill jn-pill-dark jn-reveal">Start your application <Icon name="arrow" /></Link><div className="jn-demo-contact jn-reveal"><span>{placeholderContact ? "CONTACT DETAILS · PLACEHOLDERS" : "GET IN TOUCH"}</span><p>{content.phone}<br />{content.email}</p>{placeholderContact && <small>Confirmed contact details will be shared before opening.</small>}</div></div><figure className="jn-building jn-reveal"><div data-parallax><img src={photo(BRAND.exterior)} alt={BRAND.exteriorAlt} loading="lazy" /></div><figcaption><span>RYUU / THE VISION</span><span>{BRAND.exteriorCaption}</span></figcaption></figure></div></section>
      </main>

      <footer className="jn-footer"><div className="jn-footer-top"><a className="jn-footer-brand" href="#home" onClick={navigate} data-title="Welcome home."><img src={photo(BRAND.wordmark)} alt="Ryuu — Cool rooms. Calm days. Your city" loading="lazy" /></a><p>Cool rooms.<br />Calm days.</p><div><Link href="/login">Resident & guardian login <Icon name="arrow" /></Link><Link href="/register">Apply to stay <Icon name="arrow" /></Link><a href="#home" onClick={navigate}>Back to top <Icon name="arrow" /></a></div></div><div className="jn-footer-bottom"><span>© 2026 RYUU</span><span>MADE FOR YOUR NEXT CHAPTER.</span><div className="jn-motion-controls"><button onClick={replayIntro}><Icon name="replay" /> Replay intro</button><button aria-pressed={motionPaused} onClick={() => setMotionPaused(p => { remember("ryuu-motion-paused", p ? "no" : "yes"); return !p; })}>{motionPaused ? "Resume motion" : "Pause motion"}</button><button aria-pressed={focus} onClick={() => setFocus(!focus)}><Icon name="focus" /> {focus ? "Show details" : "Focus mode"}</button></div></div><p className="jn-credit">Motion inspiration & handwritten hello: <a href="https://www.syahrilarfianalmazril.my.id/" target="_blank" rel="noreferrer">Syahril Arfian Almazril ↗</a></p></footer>
    </div>
  </div>;
}

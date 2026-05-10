import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";

function BrandStar({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0 L10.5 5.5 L16 8 L10.5 10.5 L8 16 L5.5 10.5 L0 8 L5.5 5.5 Z" />
    </svg>
  );
}
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const IMG_HERO =
  "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=2400&q=80";
const IMG_STORY =
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=80";
const IMG_FLEET =
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=2400&q=80";

const MANIFESTO_PLAIN =
  "We built this service for people who need the car to be there. Every time.";
const MANIFESTO_LIME = "Without Exception.";

const HOW_PANELS = [
  {
    num: "01",
    label: "Before you board",
    body: "Driver confirmed. Route verified. Your details cross-checked with the booking before we ever put a vehicle on the road.",
  },
  {
    num: "02",
    label: "While you travel",
    body: "Live dispatch oversight throughout your journey. Your driver has direct contact. We have direct contact. There is no gap.",
  },
  {
    num: "03",
    label: "After every ride",
    body: "Every journey reviewed. Exceptions logged and resolved. We do not accept a pattern of failure and move on.",
  },
];

const STATS = [
  "10+ years on the road.",
  "24 hours. 365 days.",
  "One standard. Always.",
];

// Design tokens (hex so inline styles always parse)
const INK = "#131313";
const SURFACE = "#f9f9f9";
const LIME = "#98fe00";
const MID = "#3a3a3a";
const MUTED = "#7d8082";

export default function About() {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroImgRef = useRef<HTMLDivElement>(null);
  const hSectionRef = useRef<HTMLElement>(null);
  const hTrackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      // All motion gated on prefers-reduced-motion
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Hero parallax
        gsap.to(heroImgRef.current, {
          yPercent: 22,
          ease: "none",
          scrollTrigger: {
            trigger: ".about-hero",
            scrub: true,
            start: "top top",
            end: "bottom top",
          },
        });

        // Hero words entrance
        gsap.from(".hero-word", {
          y: 48,
          opacity: 0,
          stagger: 0.09,
          duration: 1,
          ease: "power3.out",
          delay: 0.2,
        });

        // Manifesto character scrub (opacity 0.07 → 1 as you scroll)
        gsap.from(".m-char", {
          opacity: 0.07,
          stagger: 0.012,
          scrollTrigger: {
            trigger: ".about-manifesto",
            scrub: 1,
            start: "top 90%",
            end: "bottom 55%",
          },
        });

        // Story: image clip-path wipe reveal
        gsap.from(".story-img", {
          clipPath: "inset(0 100% 0 0)",
          ease: "none",
          scrollTrigger: {
            trigger: ".about-story",
            scrub: 1.2,
            start: "top 90%",
            end: "center 60%",
          },
        });

        // Story text cascade
        gsap.from(".story-text > *", {
          y: 28,
          opacity: 0,
          stagger: 0.1,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".about-story",
            start: "top 90%",
            toggleActions: "play none none reverse",
          },
        });

        // Fleet scale
        gsap.from(".fleet-img", {
          scale: 1.1,
          ease: "none",
          scrollTrigger: {
            trigger: ".about-fleet",
            scrub: 1,
            start: "top bottom",
            end: "bottom top",
          },
        });

        // Numbers stagger
        gsap.from(".stat-line", {
          y: 56,
          opacity: 0,
          stagger: 0.14,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".about-numbers",
            start: "top 75%",
            toggleActions: "play none none reverse",
          },
        });

        // CTA
        gsap.from(".cta-content > *", {
          y: 32,
          opacity: 0,
          stagger: 0.1,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".about-cta",
            start: "top 75%",
            toggleActions: "play none none reverse",
          },
        });
      });

      // Horizontal scroll: desktop + no reduced motion
      mm.add(
        "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
        () => {
          const hTrack = hTrackRef.current;
          const hSection = hSectionRef.current;
          if (!hTrack || !hSection) return;

          gsap.set(hTrack, { display: "flex", width: "300vw" });
          gsap.set(".h-panel", { flexShrink: 0, width: "100vw", height: "100vh" });

          const scrollDist = () => hTrack.scrollWidth - window.innerWidth;

          gsap.to(hTrack, {
            x: () => -scrollDist(),
            ease: "none",
            scrollTrigger: {
              trigger: hSection,
              pin: true,
              scrub: 1,
              end: () => "+=" + scrollDist(),
              invalidateOnRefresh: true,
            },
          });

          return () => {
            gsap.set(hTrack, { clearProps: "display,width,x" });
            gsap.set(".h-panel", { clearProps: "flexShrink,width,height" });
          };
        },
      );
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="about-page">

      {/* ── 1. HERO ── */}
      <section
        className="about-hero relative flex h-screen items-end overflow-hidden"
        style={{ background: INK }}
      >
        <div
          ref={heroImgRef}
          className="absolute inset-0 scale-[1.15]"
          style={{
            backgroundImage: `url(${IMG_HERO})`,
            backgroundSize: "cover",
            backgroundPosition: "center 40%",
          }}
          role="img"
          aria-label="Long-exposure motorway at night, headlights trailing into the distance"
        />
        {/* Gradient overlay — darkens top and strongly at bottom */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, ${INK}88 0%, ${INK}55 35%, ${INK}cc 80%, ${INK}f5 100%)`,
          }}
        />

        <div className="relative z-10 w-full px-8 pb-16 md:px-20 md:pb-24">
          <div className="max-w-5xl">
            <span className="brand-mark mb-8 block w-fit" aria-hidden="true">
              <BrandStar />
            </span>
            <p className="mono-label mb-5" style={{ color: MUTED }}>
              LONDONTAXI
            </p>
            <h1
              className="font-bold leading-[0.9] tracking-[-0.04em]"
              style={{ fontSize: "clamp(52px, 9vw, 120px)", color: SURFACE }}
            >
              {["Every", "journey,", "handled."].map((w) => (
                <span key={w} className="hero-word mr-[0.18em] inline-block last:mr-0">
                  {w}
                </span>
              ))}
            </h1>
            <p
              className="mt-7 max-w-sm text-[17px] font-medium leading-[1.6] tracking-[-0.01em]"
              style={{ color: MUTED }}
            >
              Premium transfers across the UK.
            </p>
          </div>
        </div>

        <p
          className="mono-label absolute bottom-8 right-8 md:right-20"
          style={{ color: "#ffffff30" }}
          aria-hidden="true"
        >
          SCROLL
        </p>
      </section>

      {/* ── 2. MANIFESTO ── */}
      <section
        className="about-manifesto px-8 py-32 md:px-20 md:py-52"
        style={{ background: SURFACE }}
      >
        <p
          className="font-bold leading-[1.1] tracking-[-0.035em]"
          style={{ fontSize: "clamp(26px, 4vw, 58px)", color: INK, maxWidth: "18em" }}
          aria-label={`${MANIFESTO_PLAIN} ${MANIFESTO_LIME}`}
        >
          {/* Plain segment — words wrapped in nowrap so browser only breaks at spaces */}
          {MANIFESTO_PLAIN.split(" ").map((word, wi) => (
            <span key={wi} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
              {word.split("").map((char, ci) => (
                <span key={ci} className="m-char" style={{ display: "inline-block" }}>
                  {char}
                </span>
              ))}
              {/* Space after word — sits outside the nowrap wrapper so line-wrap can happen here */}
              <span className="m-char" style={{ display: "inline-block" }}>&nbsp;</span>
            </span>
          ))}
          {/* Lime segment on its own line — force break then nowrap the whole phrase */}
          <br />
          <span style={{ display: "inline-block", whiteSpace: "nowrap", color: LIME }}>
            {MANIFESTO_LIME.split("").map((char, i) => (
              <span key={i} className="m-char" style={{ display: "inline-block" }}>
                {char}
              </span>
            ))}
          </span>
        </p>
      </section>

      {/* ── 3. STORY ── */}
      <section
        className="about-story px-8 pb-32 md:px-20 md:pb-52"
        style={{ background: SURFACE }}
      >
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-20">
          <div className="story-text space-y-6">
            <p className="mono-label" style={{ color: MUTED }}>/ Our story</p>
            <h2
              className="font-bold leading-[1.05] tracking-[-0.035em]"
              style={{ fontSize: "clamp(28px, 3vw, 44px)", color: INK }}
            >
              Built on the belief that reliable isn't a luxury.
            </h2>
            <p className="text-[17px] leading-[1.7]" style={{ color: MID, maxWidth: "52ch" }}>
              LondonTaxi started with a straightforward observation: business
              travellers and families booking airport transfers were being let down by
              services that treated reliability as optional. We started small, local, and
              deliberate. Every driver vetted. Every vehicle maintained. Every booking
              personally tracked.
            </p>
            <p className="text-[17px] leading-[1.7]" style={{ color: MID, maxWidth: "52ch" }}>
              That hasn't changed. What's changed is the technology behind it, the team
              operating it, and the number of people who depend on us when it counts.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[4px]">
            <div className="aspect-[4/3]">
              <img
                src={IMG_STORY}
                alt="A sleek matte black luxury vehicle"
                className="story-img h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. HOW WE OPERATE (pinned horizontal scroll on desktop) ── */}
      <section
        ref={hSectionRef}
        className="about-how"
        style={{ background: INK }}
      >
        <div ref={hTrackRef} className="block">
          {HOW_PANELS.map((panel) => (
            <div
              key={panel.num}
              className="h-panel flex min-h-[60vh] items-end px-8 pb-16 md:min-h-0 md:px-20 md:pb-24"
            >
              <div className="h-panel-inner max-w-lg space-y-5 md:space-y-7">
                <p
                  className="font-bold leading-none tracking-[-0.06em] select-none"
                  style={{ fontSize: "clamp(72px, 14vw, 160px)", color: LIME }}
                  aria-hidden="true"
                >
                  {panel.num}
                </p>
                <h2
                  className="font-bold leading-[1.05] tracking-[-0.03em]"
                  style={{ fontSize: "clamp(28px, 3.5vw, 48px)", color: SURFACE }}
                >
                  {panel.label}
                </h2>
                <p
                  className="text-[17px] leading-[1.65]"
                  style={{ color: "#ffffff80", maxWidth: "42ch" }}
                >
                  {panel.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5. FLEET ── */}
      <section className="about-fleet relative flex h-[72vh] items-end overflow-hidden">
        <div
          className="fleet-img absolute inset-0"
          style={{
            backgroundImage: `url(${IMG_FLEET})`,
            backgroundSize: "cover",
            backgroundPosition: "center 55%",
          }}
          role="img"
          aria-label="A Porsche on an open road at speed"
        />
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(to top, ${INK}dd 0%, transparent 60%)` }}
        />
        <div className="relative z-10 px-8 pb-14 md:px-20 md:pb-20">
          <p className="mono-label mb-4" style={{ color: LIME }}>/ The fleet</p>
          <h2
            className="font-bold leading-[0.95] tracking-[-0.04em]"
            style={{ fontSize: "clamp(36px, 5.5vw, 72px)", color: SURFACE }}
          >
            One standard.<br />No exceptions.
          </h2>
        </div>
      </section>

      {/* ── 6. NUMBERS ── */}
      <section
        className="about-numbers px-8 py-32 md:px-20 md:py-52"
        style={{ background: SURFACE }}
      >
        <p className="mono-label mb-14" style={{ color: MUTED }}>/ By the numbers</p>
        <div className="space-y-1">
          {STATS.map((line, i) => (
            <p
              key={i}
              className="stat-line font-bold leading-[1.05] tracking-[-0.04em]"
              style={{
                fontSize: "clamp(32px, 6vw, 88px)",
                color: i === STATS.length - 1 ? LIME : INK,
              }}
            >
              {line}
            </p>
          ))}
        </div>
      </section>

      {/* ── 7. CTA ── */}
      <section
        className="about-cta px-8 py-32 md:px-20 md:py-52"
        style={{ background: INK }}
      >
        <div className="cta-content flex flex-col items-start gap-10">
          <div>
            <p className="mono-label mb-5" style={{ color: "#ffffff30" }}>/ Start here</p>
            <h2
              className="font-bold leading-[0.95] tracking-[-0.04em]"
              style={{ fontSize: "clamp(40px, 7vw, 96px)", color: SURFACE }}
            >
              Ready when<br />you are.
            </h2>
          </div>
          <Link to="/book" className="btn-green">
            <span>Book a transfer</span>
            <span className="btn-icon" aria-hidden="true">
              <span className="btn-icon-glyph">↗</span>
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}

import { useEffect } from "react";

// Liquid Glass refraction for the web port (CONTEXT §6). `backdrop-filter: url(#…)` only
// works in Chromium and can't be feature-detected, so Chromium gets the refraction class
// and every other browser keeps the plain blur(3px) saturate(125%) fallback from the CSS.
// A native iPad build should use the system Liquid Glass materials instead.

function isChromium(): boolean {
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  if (brands) return brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand));
  return /Chrome\//.test(navigator.userAgent);
}

export function GlassFilters() {
  useEffect(() => {
    if (isChromium()) document.documentElement.classList.add("lg-refract");
  }, []);
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <filter id="lg-refraction" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="18" xChannelSelector="R" yChannelSelector="G" result="bent" />
        <feGaussianBlur in="bent" stdDeviation="1.5" />
      </filter>
    </svg>
  );
}

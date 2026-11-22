// Liquid glass behaviour. Pure enhancement: without this file the glass still renders as
// blurred, tinted, rimmed surfaces. This adds (1) a pointer-following highlight and (2) the lens.

// ---------------------------------------------------------------- pointer highlight
if (window.matchMedia('(hover: hover)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const glass = '.nav, .icon-button, .fab, .btn-tonal, .stat, .card-body, .github-card';
    let frame = 0;
    document.addEventListener('pointermove', (event) => {
        const el = event.target instanceof Element ? event.target.closest(glass) : null;
        if (!el || frame) return;
        frame = requestAnimationFrame(() => {
            const rect = el.getBoundingClientRect();
            el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
            el.style.setProperty('--my', `${event.clientY - rect.top}px`);
            frame = 0;
        });
    }, {passive: true});
}

// ---------------------------------------------------------------- lens (Chromium: SVG backdrop filters)
// A convex glass edge bends the backdrop only in a band along the rim, following the element's
// real rounded outline, and leaves the middle untouched.
//
// Tuning (set on :root or on a single element in CSS):
//   --lens-strength  0..0.98, default 0.9. How hard the edge stretches what is underneath.
//                    The content at the very rim is magnified by 1 / (1 - strength): 0.9 is 10x,
//                    0.95 is 20x. 0 turns the lens off.
//   --lens-rim       px, default 20. How wide the stretching band is.
//   --lens-curve     >= 1, default 1. 1 stretches the whole band evenly (wide smears), higher
//                    concentrates the stretch at the very edge.
// Strength is capped below 1 on purpose. At 1 or more the image folds over itself, which is the
// "things flip upside down" bug; below 1 the mapping can never reverse.
//
// Maths: the backdrop at depth u (px inside the outline) is sampled from depth u + push(u), with
// push(u) = S * t^P, t = 1 - u / rim. Its slope is at most strength, so the sampling position is
// always increasing in u: stretched, never folded.
const LENS_SELECTOR = '.nav, .icon-button, .fab, .scroll-cue';
const DEFAULT_STRENGTH = 0.9;
const DEFAULT_RIM = 20;   // px
const MAX_STRENGTH = 0.98;
const DEFAULT_CURVE = 1.0; // profile exponent: lower stretches further into the band, higher hugs the edge
const MAP_SCALE = 2;      // map resolution multiplier, for smooth edges on high-DPI screens

const supportsLens = CSS.supports('backdrop-filter', 'url(#x)') || CSS.supports('-webkit-backdrop-filter', 'url(#x)');

if (supportsLens) {
    const NS = 'http://www.w3.org/2000/svg';
    const host = document.createElementNS(NS, 'svg');
    host.setAttribute('width', '0');
    host.setAttribute('height', '0');
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('focusable', 'false');
    host.style.position = 'absolute';
    document.body.prepend(host);

    const readNumber = (style, name, fallback) => {
        const value = parseFloat(style.getPropertyValue(name));
        return Number.isFinite(value) ? value : fallback;
    };

    const lensMap = (width, height, radius, strength, rimWanted, P) => {
        const rim = Math.max(1, Math.min(rimWanted, Math.min(width, height) * 0.4));
        const maxPush = (strength * rim) / P;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * MAP_SCALE));
        canvas.height = Math.max(1, Math.round(height * MAP_SCALE));
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(canvas.width, canvas.height);
        const halfW = width / 2;
        const halfH = height / 2;
        const innerX = halfW - radius;
        const innerY = halfH - radius;

        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const px = (x + 0.5) / MAP_SCALE - halfW;      // position relative to the centre
                const py = (y + 0.5) / MAP_SCALE - halfH;
                const qx = Math.abs(px) - innerX;
                const qy = Math.abs(py) - innerY;
                // Rounded-rectangle signed distance (negative inside) and outward normal.
                const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
                const signed = outside + Math.min(Math.max(qx, qy), 0) - radius;
                const depth = -signed;                          // how far inside the outline
                let nx = 0;
                let ny = 0;
                if (qx > 0 && qy > 0) {
                    nx = (qx / outside) * Math.sign(px);
                    ny = (qy / outside) * Math.sign(py);
                } else if (qx > qy) {
                    nx = Math.sign(px);
                } else {
                    ny = Math.sign(py);
                }

                let dx = 0;
                let dy = 0;
                if (depth < rim) {
                    const t = 1 - Math.max(depth, 0) / rim;      // 1 at the outline, 0 at the inner edge
                    const push = maxPush * Math.pow(t, P);       // smooth, reaches zero at the inner edge
                    dx = -nx * push;                             // sample from slightly further inside
                    dy = -ny * push;
                }
                const i = (y * canvas.width + x) * 4;
                image.data[i] = Math.round(255 * (0.5 + dx / (2 * maxPush)));
                image.data[i + 1] = Math.round(255 * (0.5 + dy / (2 * maxPush)));
                image.data[i + 2] = 128;
                image.data[i + 3] = 255;
            }
        }
        ctx.putImageData(image, 0, 0);
        return {url: canvas.toDataURL('image/png'), scale: 2 * maxPush};
    };

    const lenses = new Map();   // element -> filter id
    let counter = 0;

    const build = (el) => {
        // Layout size, not getBoundingClientRect(): the latter includes transforms and the `scale`
        // property, so a button that is hidden at scale 0.5 got a half-size map (one quarter of it).
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        if (!width || !height) return;

        const style = getComputedStyle(el);
        const cssRadius = parseFloat(style.borderTopLeftRadius) || 0;
        const radius = Math.min(cssRadius, width / 2, height / 2);
        const strength = Math.min(Math.max(readNumber(style, '--lens-strength', DEFAULT_STRENGTH), 0), MAX_STRENGTH);
        const rimWanted = Math.max(readNumber(style, '--lens-rim', DEFAULT_RIM), 1);
        const P = Math.max(readNumber(style, '--lens-curve', DEFAULT_CURVE), 1);
        if (strength === 0) {
            el.style.removeProperty('--lens');
            return;
        }
        const {url, scale} = lensMap(width, height, radius, strength, rimWanted, P);

        let id = lenses.get(el);
        if (!id) {
            id = `lg-lens-${counter++}`;
            lenses.set(el, id);
        }
        let filter = host.querySelector(`#${id}`);
        if (!filter) {
            filter = document.createElementNS(NS, 'filter');
            filter.id = id;
            host.append(filter);
        }
        filter.setAttribute('filterUnits', 'userSpaceOnUse');
        filter.setAttribute('x', '0');
        filter.setAttribute('y', '0');
        filter.setAttribute('width', String(width));
        filter.setAttribute('height', String(height));
        filter.setAttribute('color-interpolation-filters', 'sRGB');
        filter.innerHTML =
            `<feImage href="${url}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="map"/>` +
            `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>`;
        el.style.setProperty('--lens', `url(#${id})`);
    };

    // Rebuild when an element's size changes (the nav changes shape between desktop and phone).
    let pending = new Set();
    let scheduled = 0;
    const observer = new ResizeObserver((entries) => {
        entries.forEach((entry) => pending.add(entry.target));
        if (scheduled) return;
        scheduled = requestAnimationFrame(() => {
            pending.forEach(build);
            pending = new Set();
            scheduled = 0;
        });
    });
    document.querySelectorAll(LENS_SELECTOR).forEach((el) => {
        observer.observe(el);
        // Hover and press morph the corner radius; refit the map to the shape it ends up with.
        el.addEventListener('transitionend', (event) => {
            if (event.target === el && event.propertyName.startsWith('border')) build(el);
        });
    });

    // Rebuild when the theme or the tuning variables change (they live on :root or on the element).
    new MutationObserver(() => document.querySelectorAll(LENS_SELECTOR).forEach(build))
        .observe(document.documentElement, {attributes: true, attributeFilter: ['style', 'class', 'data-theme']});
}

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
// A convex glass edge magnifies the backdrop more and more towards the rim, in every direction,
// and leaves the middle untouched. It is a zoom about the element's centre whose strength grows
// towards the outline, so near the edge things spread outwards both across the edge (stretched)
// and along it (widened), and more so the closer they are.
//
// Tuning (set on :root or on a single element in CSS):
//   --lens-strength  0..0.98, default 0.5. How hard the very rim is magnified: 1 / (1 - strength),
//                    so 0.5 is 2x (subtle), 0.9 is 10x (heavy). 0 turns the lens off.
//   --lens-rim       px, default 24. How wide the band is in which the magnification builds up.
//   --lens-dispersion 0..0.6, default 0.35. Colour fringing at the rim (red and blue bend differently).
//   --lens-curve     >= 1, default 1.5. Higher keeps the middle of the band calmer and crowds the
//                    magnification towards the edge.
// Strength is scaled against a fold limit: the map is sampled at c + (p - c) * (1 - k * s(depth)),
// and k is chosen so that the local Jacobian always keeps eigenvalues >= 1 - strength > 0. A
// mapping with a positive determinant cannot fold, which is the "things flip upside down" bug.
const LENS_SELECTOR = '.nav, .icon-button, .fab, .scroll-cue';
const DEFAULT_STRENGTH = 0.5;
const DEFAULT_RIM = 24;   // px
const MAX_STRENGTH = 0.98;
const DEFAULT_CURVE = 1.5;
const DEFAULT_DISPERSION = 0.35;   // colour fringing at the rim, 0 = none
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
        const rim = Math.max(1, Math.min(rimWanted, Math.min(width, height) * 0.45));
        const halfW = width / 2;
        const halfH = height / 2;
        // Fold limit. Zoom about the centre with weight s(depth): the Jacobian is
        // (1 - k s) I - k p (grad s)^T. Its eigenvalues are (1 - k s) and (1 - k s) - k p.grad s,
        // and |p.grad s| <= diag * P / rim, so k = strength / (1 + diag * P / rim) keeps both
        // >= 1 - strength.
        const diag = Math.hypot(halfW, halfH);
        const k = strength / (1 + (diag * P) / rim);
        const maxPush = k * Math.max(halfW, halfH);     // largest possible displacement, for encoding
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * MAP_SCALE));
        canvas.height = Math.max(1, Math.round(height * MAP_SCALE));
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(canvas.width, canvas.height);
        const innerX = halfW - radius;
        const innerY = halfH - radius;

        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const px = (x + 0.5) / MAP_SCALE - halfW;      // position relative to the centre
                const py = (y + 0.5) / MAP_SCALE - halfH;
                const qx = Math.abs(px) - innerX;
                const qy = Math.abs(py) - innerY;
                // Rounded-rectangle signed distance (negative inside).
                const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
                const depth = radius - (outside + Math.min(Math.max(qx, qy), 0));   // how far inside the outline

                let dx = 0;
                let dy = 0;
                if (depth < rim) {
                    const t = 1 - Math.max(depth, 0) / rim;      // 1 at the outline, 0 at the inner edge
                    const weight = k * Math.pow(t, P);
                    dx = -px * weight;                           // sample from nearer the centre: magnifies
                    dy = -py * weight;
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
        // Dispersion: glass bends blue more than red, so each colour channel is displaced by a
        // slightly different amount and the three are added back together. Colour fringes appear
        // only where the lens actually bends the image (the rim).
        const dispersion = Math.min(Math.max(readNumber(style, '--lens-dispersion', DEFAULT_DISPERSION), 0), 0.6);
        const channel = (name, factor, matrix) =>
            `<feDisplacementMap in="SourceGraphic" in2="map" scale="${(scale * factor).toFixed(3)}" xChannelSelector="R" yChannelSelector="G" result="d${name}"/>` +
            `<feColorMatrix in="d${name}" type="matrix" values="${matrix}" result="c${name}"/>`;
        const channels = dispersion > 0.001
            ? channel('r', 1 - dispersion, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0') +
              channel('g', 1, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0') +
              channel('b', 1 + dispersion, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0') +
              '<feComposite in="cr" in2="cg" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rg"/>' +
              '<feComposite in="rg" in2="cb" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>'
            : `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>`;
        filter.innerHTML =
            `<feImage href="${url}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="map"/>` +
            channels;
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

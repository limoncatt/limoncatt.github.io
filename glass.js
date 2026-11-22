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
// A convex glass edge bends the backdrop only in a thin band along the rim, following the
// element's real rounded outline, and leaves the middle untouched.
//
// For each lens element we draw a displacement map with the same size and corner radius:
//   - distance to the outline comes from a rounded-rectangle signed distance field,
//   - the push direction is the outline's normal (so corners bend around the curve),
//   - strength falls off smoothly to zero at the inner edge of the band.
// The maximum push S and the band width RIM are chosen so the profile's steepest slope is
// 2*S/RIM = 0.84 < 1. A slope of 1 or more makes the image fold over itself, which looks like
// things flipping upside down; staying below 1 guarantees the mapping never reverses.
const LENS_SELECTOR = '.nav, .icon-button, .fab, .scroll-cue';
const RIM_MAX = 14;       // px, width of the bending band
const SLOPE = 0.84;       // steepest slope of the displacement profile (must stay < 1)
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

    const lensMap = (width, height, radius) => {
        const rim = Math.min(RIM_MAX, Math.min(width, height) / 2);
        const maxPush = (SLOPE * rim) / 2;
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
                    const push = maxPush * t * t;                // smooth, zero slope at the inner edge
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
        const rect = el.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (!width || !height) return;

        const cssRadius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
        const radius = Math.min(cssRadius, width / 2, height / 2);
        const {url, scale} = lensMap(width, height, radius);

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
    document.querySelectorAll(LENS_SELECTOR).forEach((el) => observer.observe(el));
}

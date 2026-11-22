// Liquid glass: moves a soft light across a glass surface to follow the pointer.
// Pure enhancement. Without it the glass still renders, it just doesn't track the cursor.
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

// Progressive enhancement only: with JS off the page is complete and readable.
// (index.html adds the `js` class to <html> before first paint; the reveal styles depend on it.)

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------- theme
const themeToggle = document.getElementById('theme-toggle');
const themeColor = document.querySelector('meta[name="theme-color"]');

const applyTheme = (theme, persist) => {
    root.dataset.theme = theme;
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    // Read the real surface colour back so the browser chrome always matches the page.
    themeColor?.setAttribute('content', getComputedStyle(root).getPropertyValue('--md-sys-color-surface').trim());
    if (persist) {
        try { localStorage.setItem('theme', theme); } catch { /* private mode: ignore */ }
    }
};

applyTheme(root.dataset.theme === 'light' ? 'light' : 'dark', false);
themeToggle.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));

// ---------------------------------------------------------------- app bar, FAB
const appBar = document.getElementById('app-bar');
const fab = document.getElementById('fab');
const progress = document.querySelector('.scroll-progress');
const hasScrollTimeline = CSS.supports('animation-timeline: scroll()');

let ticking = false;
const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
        const y = window.scrollY;
        appBar.classList.toggle('scrolled', y > 24);

        const showFab = y > window.innerHeight * 0.8;
        fab.classList.toggle('fab-visible', showFab);
        fab.tabIndex = showFab ? 0 : -1;

        // Browsers without scroll-driven animations get the progress bar from JS instead.
        if (!hasScrollTimeline) {
            const max = root.scrollHeight - window.innerHeight;
            progress.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
        }
        ticking = false;
    });
};
window.addEventListener('scroll', onScroll, {passive: true});
window.addEventListener('resize', onScroll);
onScroll();

// ---------------------------------------------------------------- scrollspy
const navItems = [...document.querySelectorAll('.nav-item')];
const sectionFor = new Map(navItems.map((item) => [item, document.querySelector(item.getAttribute('href'))]));

const setCurrent = (activeItem) => {
    navItems.forEach((item) => {
        if (item === activeItem) item.setAttribute('aria-current', 'location');
        else item.removeAttribute('aria-current');
    });
};

const spy = new IntersectionObserver((entries) => {
    // Use the section occupying the middle band of the viewport.
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const item = navItems.find((candidate) => sectionFor.get(candidate) === entry.target);
        if (item) setCurrent(item);
    }
}, {rootMargin: '-45% 0px -50% 0px'});

sectionFor.forEach((section) => section && spy.observe(section));

// Clear the highlight when back in the hero, above every nav section.
new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setCurrent(null); }, {rootMargin: '-45% 0px -50% 0px'})
    .observe(document.getElementById('top'));

// ---------------------------------------------------------------- reveal on scroll
const revealables = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const revealer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add('is-visible');
            revealer.unobserve(entry.target);
        }
    }, {threshold: 0.15, rootMargin: '0px 0px -8% 0px'});
    revealables.forEach((el) => revealer.observe(el));
} else {
    revealables.forEach((el) => el.classList.add('is-visible'));
}

// ---------------------------------------------------------------- count-up numbers
const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

const countUp = (el) => {
    const to = Number(el.dataset.count);
    const from = Number(el.dataset.from ?? 0);
    const duration = 1400;
    const start = performance.now();
    const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        el.textContent = String(Math.round(from + (to - from) * easeOutExpo(t)));
        if (t < 1) requestAnimationFrame(step);
    };
    el.textContent = String(from);
    requestAnimationFrame(step);
};

const counters = document.querySelectorAll('[data-count]');
if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const counter = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            countUp(entry.target);
            counter.unobserve(entry.target);
        }
    }, {threshold: 0.6});
    counters.forEach((el) => counter.observe(el));
}
// Otherwise the final numbers already in the HTML stay as they are.

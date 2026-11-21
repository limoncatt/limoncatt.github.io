// Tiny hash router: the URL hash (#home, #projects, #github, #aboutme) is the
// single source of truth, so refresh, back/forward and direct links all work.
const pages = ['home', 'projects', 'github', 'aboutme'];
const tabs = document.querySelector('#PageTabsSwitcher');

const currentPage = () => {
    const name = location.hash.slice(1);
    return pages.includes(name) ? name : 'home';
};

const go = (name) => {
    if (location.hash.slice(1) !== name) {
        location.hash = name;
    }
};

const render = () => {
    const page = currentPage();

    for (const name of pages) {
        document.getElementById(`panel-${name}`).hidden = name !== page;
    }

    // Keep the Material tab indicator in sync once the component is ready.
    customElements.whenDefined('md-tabs').then(() => {
        const index = pages.indexOf(page);
        if (tabs.activeTabIndex !== index) {
            tabs.activeTabIndex = index;
        }
    });
};

// 'change' covers keyboard navigation inside md-tabs; plain click listeners
// keep navigation working even if the Material components fail to load.
tabs.addEventListener('change', () => go(tabs.activeTab.dataset.action));
tabs.querySelectorAll('[data-action]').forEach((tab) => {
    tab.addEventListener('click', () => go(tab.dataset.action));
});

window.addEventListener('hashchange', render);
render();

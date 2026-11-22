// Entry point for the local Material Web bundle (see package.json "bundle").
// Only the component the site uses is imported: the Material ripple state layer.
// Everything else (shapes, motion, layout) is hand-written CSS, see style.css.
import '@material/web/ripple/ripple.js';

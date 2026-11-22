// Generates tokens.css: colour roles (dark + light), spring easings and morphable shapes.
// Run with `npm run tokens`. Everything tunable about the look lives at the top of this file.
import {writeFileSync} from 'node:fs';
import {
    argbFromHex,
    hexFromArgb,
    Hct,
    MaterialDynamicColors,
    SchemeVibrant,
} from '@material/material-color-utilities';

// ---------------------------------------------------------------- colour
// #765084 is the seed behind the site's original palette (its Tonal Spot scheme
// reproduces the old colours). Vibrant keeps the same purple but with far more chroma.
const SEED = '#765084';

const ROLES = {
    'primary': 'primary',
    'on-primary': 'onPrimary',
    'primary-container': 'primaryContainer',
    'on-primary-container': 'onPrimaryContainer',
    'secondary': 'secondary',
    'on-secondary': 'onSecondary',
    'secondary-container': 'secondaryContainer',
    'on-secondary-container': 'onSecondaryContainer',
    'tertiary': 'tertiary',
    'on-tertiary': 'onTertiary',
    'tertiary-container': 'tertiaryContainer',
    'on-tertiary-container': 'onTertiaryContainer',
    'error': 'error',
    'on-error': 'onError',
    'error-container': 'errorContainer',
    'on-error-container': 'onErrorContainer',
    'background': 'background',
    'on-background': 'onBackground',
    'surface': 'surface',
    'on-surface': 'onSurface',
    'surface-variant': 'surfaceVariant',
    'on-surface-variant': 'onSurfaceVariant',
    'outline': 'outline',
    'outline-variant': 'outlineVariant',
    'shadow': 'shadow',
    'scrim': 'scrim',
    'inverse-surface': 'inverseSurface',
    'inverse-on-surface': 'inverseOnSurface',
    'inverse-primary': 'inversePrimary',
    'surface-tint': 'surfaceTint',
    'surface-dim': 'surfaceDim',
    'surface-bright': 'surfaceBright',
    'surface-container-lowest': 'surfaceContainerLowest',
    'surface-container-low': 'surfaceContainerLow',
    'surface-container': 'surfaceContainer',
    'surface-container-high': 'surfaceContainerHigh',
    'surface-container-highest': 'surfaceContainerHighest',
    'primary-fixed': 'primaryFixed',
    'primary-fixed-dim': 'primaryFixedDim',
    'on-primary-fixed': 'onPrimaryFixed',
    'on-primary-fixed-variant': 'onPrimaryFixedVariant',
    'secondary-fixed': 'secondaryFixed',
    'secondary-fixed-dim': 'secondaryFixedDim',
    'on-secondary-fixed': 'onSecondaryFixed',
    'on-secondary-fixed-variant': 'onSecondaryFixedVariant',
    'tertiary-fixed': 'tertiaryFixed',
    'tertiary-fixed-dim': 'tertiaryFixedDim',
    'on-tertiary-fixed': 'onTertiaryFixed',
    'on-tertiary-fixed-variant': 'onTertiaryFixedVariant',
};

const mdc = typeof MaterialDynamicColors.prototype?.primary === 'function'
    ? new MaterialDynamicColors()
    : MaterialDynamicColors;

const roleColor = (key, scheme) => {
    const entry = mdc[key];
    const dynamicColor = typeof entry === 'function' ? mdc[key]() : entry;
    if (!dynamicColor) throw new Error(`Unknown colour role: ${key}`);
    return hexFromArgb(dynamicColor.getArgb(scheme));
};

const schemeBlock = (isDark) => {
    const scheme = new SchemeVibrant(Hct.fromInt(argbFromHex(SEED)), isDark, 0);
    const lines = Object.entries(ROLES).map(
        ([css, key]) => `    --md-sys-color-${css}: ${roleColor(key, scheme)};`,
    );
    lines.push(`    color-scheme: ${isDark ? 'dark' : 'light'};`);
    return lines.join('\n');
};

// ---------------------------------------------------------------- motion
// Spring tokens as [damping ratio, stiffness]. The "effects" values are the documented
// Material ones (damping 1, so no overshoot). The spatial values are tuned for the
// bouncier Expressive feel; adjust here if you want it calmer or livelier.
const SPRINGS = {
    'spatial-fast': [0.6, 800],
    'spatial-default': [0.8, 380],
    'spatial-slow': [0.8, 200],
    'effects-fast': [1, 3800],
    'effects-default': [1, 1600],
    'effects-slow': [1, 800],
};

// Unit-mass damped spring step response, from 0 to 1.
const springResponse = (zeta, stiffness) => {
    const w0 = Math.sqrt(stiffness);
    if (zeta >= 1) return (t) => 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return (t) => 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
};

const springToken = (zeta, stiffness) => {
    const x = springResponse(zeta, stiffness);
    // Settling time: last moment the response is more than 0.1% away from the target.
    let settle = 0;
    for (let t = 0; t < 4; t += 0.001) {
        if (Math.abs(1 - x(t)) > 0.001) settle = t;
    }
    const duration = Math.max(0.12, settle + 0.001);
    const points = 48;
    const stops = [];
    for (let i = 0; i <= points; i++) {
        const value = i === points ? 1 : x((duration * i) / points);
        stops.push(Number(value.toFixed(4)));
    }
    return {easing: `linear(${stops.join(', ')})`, ms: Math.round(duration * 1000)};
};

const motionLines = Object.entries(SPRINGS).flatMap(([name, [zeta, stiffness]]) => {
    const {easing, ms} = springToken(zeta, stiffness);
    return [`    --motion-${name}: ${easing};`, `    --motion-${name}-duration: ${ms}ms;`];
});

// ---------------------------------------------------------------- shapes
// Smooth lobed outlines with an identical point count, so clip-path can morph between any two.
const POINTS = 96;
const lobed = (lobes, amplitude, phase = 0) => {
    const coords = [];
    for (let i = 0; i < POINTS; i++) {
        const angle = (2 * Math.PI * i) / POINTS;
        const radius = (1 + amplitude * Math.cos(lobes * angle + phase)) / (1 + amplitude);
        const x = 50 + 50 * radius * Math.cos(angle);
        const y = 50 + 50 * radius * Math.sin(angle);
        coords.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
    }
    return `polygon(${coords.join(', ')})`;
};

const SHAPES = {
    circle: lobed(1, 0),
    cookie: lobed(9, 0.06),
    clover: lobed(4, 0.16),
    flower: lobed(6, 0.14),
    burst: lobed(12, 0.08),
    pebble: lobed(3, 0.1),
};

const shapeLines = Object.entries(SHAPES).map(([name, polygon]) => `    --shape-${name}: ${polygon};`);

const CORNERS = {
    'xs': '4px',
    'sm': '8px',
    'md': '12px',
    'lg': '16px',
    'lg-inc': '20px',
    'xl': '28px',
    'xl-inc': '32px',
    'xxl': '48px',
    'full': '9999px',
};
const cornerLines = Object.entries(CORNERS).map(([name, value]) => `    --shape-corner-${name}: ${value};`);

// ---------------------------------------------------------------- output
const css = `/* GENERATED by scripts/generate-tokens.mjs. Do not edit by hand; run \`npm run tokens\`. */

:root,
:root[data-theme="dark"] {
${schemeBlock(true)}
}

:root[data-theme="light"] {
${schemeBlock(false)}
}

:root {
${motionLines.join('\n')}

${cornerLines.join('\n')}

${shapeLines.join('\n')}
}
`;

// The script is bundled into node_modules/.cache before running, so write relative to the
// project root (npm scripts run from there) rather than relative to this file.
writeFileSync('tokens.css', css);
console.log(`tokens.css written (${(css.length / 1024).toFixed(1)} KB)`);
for (const [name] of Object.entries(SPRINGS)) {
    const {ms} = springToken(...SPRINGS[name]);
    console.log(`  ${name.padEnd(16)} ${String(ms).padStart(4)} ms`);
}

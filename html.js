// Small HTML helpers shared by the renderers. Pure functions, no SillyTavern imports.

// Values may be quoted either way or, as HTML allows, not quoted at all: from=@alice.
const ATTR_RE = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

// An "&" that already starts a character reference is left alone: a model may write "&lt;" in an attribute.
export const escapeHtml = s => s.replace(/&(?!(?:[a-z]+|#\d+|#x[\da-f]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const REFERENCES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
/** Undoes the character references a model may write in an attribute. */
export const unescapeHtml = s => s.replace(/&(lt|gt|amp|quot|apos);/gi, (_, name) => REFERENCES[name.toLowerCase()]);

/** Reads the attributes of a tag into an object, keys in lowercase. */
export function parseAttrs(text) {
    const attrs = {};
    for (const m of text.matchAll(ATTR_RE)) attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4]).trim();
    return attrs;
}

// The plain colour names. Each is mixed with the object's text colour, so it reads on a light or a dark theme.
const COLOURS = {
    red: '#f85149', orange: '#d9701f', gold: '#bd8c00', yellow: '#bd8c00', green: '#2ea043', teal: '#159aa5', cyan: '#159aa5',
    blue: '#2f81f7', purple: '#a371f7', pink: '#e85aad', gray: '#7d8590', grey: '#7d8590',
};
// A colour by its numbers, or a mix: rgb(255 0 0), hsl(200 80% 60% / 0.7), color-mix(in srgb, red 60%, gold).
// One level of brackets inside, and only the characters a colour needs, so it can never end the CSS it is put in.
const COLOUR_FUNCTION = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\((?:[\w\s.,%#/-]|\([\w\s.,%#/-]*\))*\)$/;

/** A colour from a color attribute, as CSS: a hex colour, a colour function, or a plain name. Otherwise ''. */
export function safeColour(value = '') {
    const text = value.trim().toLowerCase();
    if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.test(text)) return value.trim();
    if (COLOUR_FUNCTION.test(text) && !/\b(?:url|expression|var|env|attr)\(/.test(text)) return value.trim();
    if (text === 'white') return 'var(--element-ink)';
    return Object.hasOwn(COLOURS, text) ? `color-mix(in srgb, ${COLOURS[text]} 58%, var(--element-ink))` : '';
}

/** Where the model asked for text to stand, as a text-align value: left, center or right. Otherwise ''. */
export function safeAlign(value = '') {
    const text = value.trim().toLowerCase().replace('centre', 'center');
    return /^(?:left|center|right)$/.test(text) ? text : '';
}

// Markdown is not parsed inside an HTML block, so the two marks a model reaches for are converted here.
export const inlineMarks = s => quoteSafe(s
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g, '<i>$1</i>'));

export const span = (cls, text) => text ? `<span class="${cls}">${text}</span>` : '';
const unescapeCss = css => css
    .replace(/\\([\da-f]{1,6})\s?/gi, (_, hex) => CODE(parseInt(hex, 16)))
    .replace(/\\(.)/g, '$1');
let outside = false;
/** Set before each message is drawn, from SillyTavern's own rule for outside media in this chat. @param {boolean} on */
export const allowOutsideImages = on => { outside = on; };
/**
 * CSS with any image from another site taken out, unless outside media is allowed: an image written into the
 * message (data:) or a path from this site's root is kept. SillyTavern's "forbid external media" looks only at
 * img and video tags, never at CSS, so this stands in for it. CSS escapes are decoded first, so \75rl( is seen as
 * url(, and a url may run unclosed to the end, as CSS allows.
 */
const ownImages = css => outside ? css : unescapeCss(css)
    .replace(/(?:-webkit-)?image-set\((?:[^()]|\([^()]*\))*\)?/gi, 'none')
    .replace(/url\(\s*(['"]?)(.*?)(?:\1\s*\)|$)/gi, (whole, quote, target) =>
        /^(?:data:|\/(?![/\\]))/i.test(target.trim()) ? whole : 'none');

/** Puts CSS on the first tag of some drawn HTML. It is escaped, so CSS the model wrote cannot end the attribute, and kept on one line. */
// The CSS is read once, as the browser would read the attribute, then every & is escaped, so what is checked is
// what the browser sees.
const CODE = code => code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
const attributeText = s => s.replace(/&(?:(lt|gt|amp|quot|apos);|#(\d+);?|#x([\da-f]+);?)/gi,
    (_, name, dec, hex) => name ? REFERENCES[name.toLowerCase()] : CODE(dec ? parseInt(dec, 10) : parseInt(hex, 16)));
export function withStyle(html, ...css) {
    const all = css.filter(Boolean).map(c => ownImages(attributeText(c).trim().replace(/\s+/g, ' '))).join(';');
    return all ? html.replace('>', () => ` style="${escapeHtml(all.replace(/&/g, '&amp;'))}">`) : html;
}

/**
 * SillyTavern wraps each pair of quote marks on a line in <q>. A whole conversation is one line, so a
 * stray quote in one bubble would pair with one in another and wrap across both. Quote marks in the
 * text of an object are written as character references, which that step does not see. Tags are left alone.
 */
export const quoteSafe = html => html.replace(/<[^>]*>|["\u201C\u201D\u00AB\u00BB\u300C\u300D\u300E\u300F\uFF02]/g,
    m => m.length > 1 ? m : `&#${m.codePointAt(0)};`);

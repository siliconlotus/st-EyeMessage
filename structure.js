// The inside of a <screen>. The model may nest tags of its own naming; they are drawn by their
// shape, not by a fixed vocabulary. Pure functions, no SillyTavern imports.
import { escapeHtml, parseAttrs, inlineMarks, safeAlign, safeColour, span, withStyle } from './html.js';

// Tags that format text and are not structure. They are kept in the text as they are.
const INLINE = new Set(['b', 'i', 'em', 'strong', 'u', 's', 'code', 'small', 'sub', 'sup', 'span', 'font', 'q', 'mark']);
// A name ends at a space, "/" or ">", so <https://example.com> and <bob@example.com> are not tags.
const TAG = /<(\/?)([A-Za-z][\w.-]*)(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;

// The bare words straight after a tag's first one, as in <Total Volume>. Words with "=" are attributes.
const MORE_NAME = /^(?:\s+[A-Za-z][\w.-]*(?![\w.-]|\s*=))+/;
const moreName = rawAttrs => rawAttrs.match(MORE_NAME)?.[0].replace(/\s+/g, ' ') ?? '';

/** Closes a quote that was left open at the end of its tag: <lot name="Lot 2>. A ">" inside a closed quote is left alone. */
const closeQuotes = text => text.replace(/(<[A-Za-z][^<>]*="[^"<>]*)>(?=[^"<]*(?:<|$))/g, '$1">');

/**
 * Reads nested tags into a tree. A name of several words is one name when the closing tag repeats it, or
 * when the tag closes itself; otherwise the words after the first are not part of the name. It is forgiving: a tag left open is closed at the end, a closing tag
 * with no opener is ignored, and formatting tags stay in the text.
 * @param {string} text
 * @returns {XmlNode} The root; its children are the top-level text and elements.
 * @typedef {{name: string, words: string, attrs: Record<string, string>, children: (XmlNode|string)[]}} XmlNode
 */
export function parseTree(text) {
    const root = { name: '', words: '', attrs: {}, children: [] };
    const open = [root];
    const top = () => open[open.length - 1];
    let last = 0;
    for (const m of text.matchAll(TAG)) {
        const [whole, closing, rawName, rawAttrs, selfClosing] = m;
        const name = rawName.toLowerCase();
        if (INLINE.has(name)) continue;
        const before = text.slice(last, m.index);
        if (before) top().children.push(before);
        last = m.index + whole.length;
        if (name === 'br') { top().children.push('\n'); continue; }
        if (closing) {
            const at = open.map(n => n.name).lastIndexOf(name);
            if (at > 0) {
                open[at].words = name + moreName(rawAttrs);
                open.length = at;
            }
            continue;
        }
        const node = { name, words: name + (selfClosing ? moreName(rawAttrs) : ''), attrs: parseAttrs(rawAttrs), children: [] };
        top().children.push(node);
        if (!selfClosing) open.push(node);
    }
    if (last < text.length) top().children.push(text.slice(last));
    return root;
}

const elements = node => node.children.filter(c => typeof c !== 'string');
const textOf = node => node.children.filter(c => typeof c === 'string').join('').trim();
const html = raw => inlineMarks(raw.trim()).replace(/\r?\n/g, '<br>');

/** "quest_log" -> "Quest log", "active" -> "Active". */
function words(name) {
    const text = name.replace(/[_.-]+/g, ' ').trim();
    return text ? text[0].toUpperCase() + text.slice(1) : '';
}
/** As `words`, but a tag name of three letters or fewer is an abbreviation: "hp" -> "HP", "str" -> "STR". */
const label = name => name.replace(/[_.-]+/g, '').length <= 3 ? words(name).toUpperCase() : words(name);

const NAMING = ['name', 'label', 'title'];
const givenName = node => NAMING.map(k => node.attrs[k]).find(Boolean);
/** An id is what the thing is called on screen: a name if it has words ("File B: The Tank"), else a number or code after its tag ("Slot 2"). */
const idName = ({ attrs, words }, bare = false) => { const id = attrs.id?.trim(); return id && (bare || /\s/.test(id) ? id : `${label(words)} ${id}`); };
const naming = node => givenName(node) || idName(node) || '';
const isBar = node => node.attrs.value !== undefined && node.attrs.max !== undefined
    && Number.isFinite(Number(node.attrs.value)) && Number(node.attrs.max) > 0;

const css = (property, value) => value && `${property}:${value}`;
const colourOf = ({ attrs }) => safeColour(attrs.color ?? attrs.colour);
/** An element's align, as CSS. */
const alignOf = ({ attrs }) => css('text-align', safeAlign(attrs.align ?? attrs['text-align']));
const coloured = (node, value) => withStyle(span('eye-sw-value', value), css('color', colourOf(node)));
/** Attributes that are read as a look. A color or align that is only a fact about the thing (color="roan") is not one. */
const lookKeys = ({ attrs }) => Object.keys(attrs).filter(key => key === 'style' || key === 'class'
    || (key === 'color' || key === 'colour') && safeColour(attrs[key])
    || (key === 'align' || key === 'text-align') && safeAlign(attrs[key]));

// An attribute that modifies the value it is on: grade Fraction, badge "Platinum +40%".
const MODIFIERS = new Set(['badge', 'alert']);

/**
 * The attributes that say something more about a thing, as small tags beside it: level="2", new="true".
 * @param {boolean} [named] Whether the thing is called by its id when it has no name, so the id is not shown twice.
 */
function chips(node, named = true) {
    const used = new Set([...NAMING, ...(named && !givenName(node) ? ['id'] : []), ...lookKeys(node), 'section-style', ...(isBar(node) ? ['value', 'max', 'chart'] : [])]);
    return Object.entries(node.attrs).filter(([key]) => !used.has(key)).map(([key, value]) => {
        if (/^(false|no|0)$/i.test(value)) return '';
        if (MODIFIERS.has(key) && value) return span(`eye-sw-chip eye-sw-${key}`, escapeHtml(value));
        if (/^(true|yes)$/i.test(value) || value === '') return span('eye-sw-chip', escapeHtml(words(key)));
        if (/^(date|time|status|state|type|kind|rank|tier|rarity)$/.test(key)) return span('eye-sw-chip', escapeHtml(words(value)));
        return span('eye-sw-chip', `${escapeHtml(words(key))}${/^[+\-−#]?\d/.test(value) ? '' : ':'} ${escapeHtml(value)}`);
    }).join('');
}

/** A short value with nothing else to it but a look or a modifier, such as <str>7</str>. A run of these is laid out side by side. */
const isCell = node => !elements(node).length && Object.keys(node.attrs).every(key => MODIFIERS.has(key) || lookKeys(node).includes(key)) && textOf(node).length > 0 && textOf(node).length <= 16;

/** A bar drawn as a gauge: 'ring' for chart="ring" or "donut", 'column' for chart="column" or "vertical"; otherwise ''. */
const gaugeOf = ({ attrs }) => /^(ring|donut)$/i.test(attrs.chart ?? '') ? 'ring' : /^(column|vertical)$/i.test(attrs.chart ?? '') ? 'column' : '';
const isGauge = node => node && isBar(node) && gaugeOf(node);

/** A bar; with chart="ring" (or "donut") drawn round, its count in the hole; with chart="column" (or "vertical") standing up. */
// Classes the stylesheet draws, as eye-x-name: effects for any box, and themes for a screen.
const BUILT_INS = new Set(['banner', 'glow', 'pulse', 'blink', 'flicker', 'cut', 'brackets', 'scanlines', 'ticks', 'caps', 'hud', 'console', 'terminal', 'parchment']);
const classNames = attrs => (attrs.class ?? '').toLowerCase().split(/\s+/).filter(Boolean);
/** The built-in classes a tag asks for, as the classes to put on its box. */
export const builtIns = attrs => [...new Set(classNames(attrs).filter(name => BUILT_INS.has(name)))].map(name => `eye-x-${name}`);

// Styles defined by <styles> anywhere in the open chat, set before drawing, and the named styles of the screen
// being drawn: the chat's with the screen's own on top. CSS by lower-case name.
let chatStyles = new Map();
/** @param {Map<string, string>} styles From stylesInChat. */
export const setChatStyles = styles => { chatStyles = styles; };
let named = chatStyles;
const definitions = node => elements(node).map(def => [def.name.toLowerCase(), textOf(def)]);
/**
 * Every style defined in a chat's messages, by lower-case name, the later definition winning.
 * @param {string} [saved] Styles saved for the chat, as the inside of a <styles> block. The chat's own replace them.
 */
export const stylesInChat = (chat, saved = '') => new Map([{ mes: `<styles>${saved.replace(/<\/?styles>/gi, '')}</styles>` }, ...chat].flatMap(message => [...(message?.mes ?? '').matchAll(/<styles>([\s\S]*?)<\/styles>/gi)]
    .flatMap(([, inside]) => definitions(parseTree(closeQuotes(inside))))));
/**
 * The styles a new reply can count on. A swipe or a regenerate replaces the last reply, so its styles are left out.
 * @param {{mes?: string, is_user?: boolean}[]} chat
 * Saved styles count only once a message or the Author's Note uses them, so other chats are not told of them.
 * @param {string} [type] SillyTavern's generation type.
 * @param {string} [saved] As for stylesInChat.
 * @param {string[]} [notes] The Author's Notes in effect.
 */
export function stylesForReply(chat, type, saved = '', notes = []) {
    const kept = /^(swipe|regenerate)$/.test(type) && chat.at(-1)?.is_user === false ? chat.slice(0, -1) : chat;
    const used = new Set([...notes, ...kept.map(message => message?.mes ?? '')].flatMap(text =>
        [...text.matchAll(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].flatMap(([, a, b, c]) => classNames({ class: a ?? b ?? c }))));
    return new Map([...[...stylesInChat([], saved)].filter(([name]) => used.has(name)), ...stylesInChat(kept)]);
}
/** The CSS an element is given: its classes' named styles, in order, then its own style. */
export const ownCss = attrs => [...classNames(attrs).map(name => named.get(name)), attrs.style].filter(Boolean).join(';');
const own = node => ownCss(node.attrs);
/** Opens a box with its built-in classes, tinted by the tag's colour for them, then the given CSS, then its own. */
function look(open, node, ...css) {
    const classes = builtIns(node.attrs);
    const opened = classes.length ? open.replace(/class="([^"]*)"/, (_, c) => `class="${c} ${classes.join(' ')}"`) : open;
    return withStyle(opened, classes.length && colourOf(node) && `--element-tint:${colourOf(node)}`, ...css, own(node));
}

function bar(node) {
    const value = Number(node.attrs.value);
    const max = Number(node.attrs.max);
    const width = Math.max(0, Math.min(100, Math.round(value / max * 100)));
    const name = span('eye-sw-label', escapeHtml(naming(node) || label(node.words)));
    const count = span('eye-sw-count', `${escapeHtml(node.attrs.value)} / ${escapeHtml(node.attrs.max)}`);
    const kind = gaugeOf(node);
    const open = look(`<span class="eye-sw-bar eye-sw-${kind}" data-name="${escapeHtml(node.name)}">`, node, `--element-fill:${width}%`, css('--element-bar', colourOf(node)));
    if (kind === 'ring') return `${open}<span class="eye-sw-dial">${count}</span>${name}${chips(node)}</span>`;
    if (kind === 'column') return `${open}${count}<span class="eye-sw-gauge"></span>${name}${chips(node)}</span>`;
    // Segments: one block for each unit of a small max, else twenty, filled to the nearest whole block.
    const segments = /^segments?$/i.test(node.attrs.chart ?? '') && (Number.isInteger(max) && max <= 20 ? max : 10);
    const filled = segments ? Math.round(Math.round(width / 100 * segments) / segments * 100) : width;
    return look(`<span class="eye-sw-bar${segments ? ' eye-sw-segments' : ''}" data-name="${escapeHtml(node.name)}">`, node, segments && `--element-segs:${segments}`, css('--element-bar', colourOf(node)))
        + name + `<span class="eye-sw-track"><span class="eye-sw-fill" style="width:${filled}%"></span></span>` + count
        + chips(node) + '</span>';
}

/**
 * One element, drawn by its shape:
 * - with value and max: a bar, a ring or a column;
 * - with elements inside: a section, headed by its own text if it has any, else by its name, and styled by the
 *   section-style of the screen and the sections around it, then by its own style;
 * - otherwise: a row. One of several siblings with the same name is a list item and shows no label.
 */
function draw(node, listed, sectionStyle) {
    if (isBar(node)) return bar(node);
    const inside = elements(node);
    const text = textOf(node);
    if (inside.length) {
        const heading = text ? html(text) : escapeHtml(naming(node) || label(node.words));
        const within = [sectionStyle, node.attrs['section-style']].filter(Boolean).join(';');
        return look('<span class="eye-sw-group">', node, css('--element-accent', colourOf(node)), sectionStyle)
            + `${withStyle(span('eye-sw-heading', heading + chips(node, !text)), alignOf(node), css('color', colourOf(node)))}${drawAll(node, within)}</span>`;
    }
    // A list item shows no label, so its id stands alone: "INV-809", not "Item INV-809".
    const title = listed ? givenName(node) || idName(node, true) || '' : naming(node);
    const value = text ? html(text) : '';
    const shown = listed
        ? coloured(node, title ? escapeHtml(title) + (value ? ` ${value}` : '') : value)
        : span('eye-sw-label', escapeHtml(title || label(node.words))) + coloured(node, value);
    return `${look('<span class="eye-sw-row">', node, alignOf(node))}${shown}${span('eye-sw-chips', chips(node))}</span>`;
}

/** The children of a node. Short plain values next to each other sit side by side; everything else is stacked. Loose text is a note. */
function drawAll(parent, sectionStyle) {
    const inside = elements(parent);
    const counts = new Map();
    for (const node of inside) counts.set(node.words, (counts.get(node.words) ?? 0) + 1);
    const repeated = node => counts.get(node.words) > 1;
    const allShort = inside.every(isCell);
    const isShort = node => node && isCell(node) && (allShort || !repeated(node));
    const cell = node => look('<span class="eye-sw-cell">', node, alignOf(node)) + span('eye-sw-label', escapeHtml(label(node.words)))
        + `${coloured(node, html(textOf(node)))}${span('eye-sw-chips', chips(node))}</span>`;
    let out = '';
    for (let i = 0; i < inside.length;) {
        let end = i;
        // Rings and columns next to each other are laid out together: in one row if they fit, else two to a row.
        // Short values in cells are laid out the same way.
        while (isGauge(inside[end])) end++;
        if (end - i > 1) {
            out += `<span class="eye-sw-gauges" style="--n:${end - i}">${inside.slice(i, end).map(node => draw(node)).join('')}</span>`;
            i = end;
            continue;
        }
        end = i;
        while (isShort(inside[end])) end++;
        if (end - i > 1) {
            out += `<span class="eye-sw-cells" style="--n:${end - i}">${inside.slice(i, end).map(cell).join('')}</span>`;
            i = end;
        } else {
            out += draw(inside[i], repeated(inside[i]), sectionStyle);
            i++;
        }
    }
    return `<span class="eye-sw-rows">${out}</span>`;
}

/**
 * Whether the text is built of tags. Words that only look like tags are never closed and carry no
 * attributes, as in a terminal's `cp <from> <to>`.
 */
const isStructured = text => [...text.matchAll(TAG)].some(([, closing, name, attrs, selfClosing]) =>
    (closing || selfClosing || attrs.includes('=')) && !INLINE.has(name.toLowerCase()) && name.toLowerCase() !== 'br');

/**
 * The body of a screen that uses nested tags, or null when it is plain lines.
 * @param {string} rawBody What is between the opening and the closing tag.
 * @returns {string|null}
 */
export function structuredBody(rawBody, { sectionStyle } = {}) {
    named = chatStyles;
    if (!isStructured(rawBody)) return null;
    const root = parseTree(closeQuotes(rawBody));
    // <styles> names some CSS once, for any tag to use with class="name". It is read, not drawn.
    const styles = root.children.filter(c => typeof c !== 'string' && c.name.toLowerCase() === 'styles');
    root.children = root.children.filter(c => !styles.includes(c));
    named = new Map([...chatStyles, ...styles.flatMap(definitions)]);
    if (!elements(root).length) return null;
    // Text that stands between the top-level elements is kept, each stretch as a note in its place.
    const parts = [];
    let run = [];
    const flush = () => { if (run.length) { parts.push(drawAll({ name: '', attrs: {}, children: run }, sectionStyle)); run = []; } };
    for (const child of root.children) {
        if (typeof child !== 'string') { run.push(child); continue; }
        if (!child.trim()) continue;
        flush();
        parts.push(span('eye-sw-note', html(child)));
    }
    flush();
    return `<span class="eye-sw">${parts.join('')}</span>`;
}

// The inside of a <system_window>. The model may nest tags of its own naming; they are drawn by their
// shape, not by a fixed vocabulary. Pure functions, no SillyTavern imports.
import { escapeHtml, parseAttrs, inlineMarks, span } from './html.js';

// Tags that format text and are not structure. They are kept in the text as they are.
const INLINE = new Set(['b', 'i', 'em', 'strong', 'u', 's', 'code', 'small', 'sub', 'sup', 'span', 'font', 'q', 'mark']);
const TAG = /<(\/?)([A-Za-z][\w.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;

/**
 * Reads nested tags into a tree. It is forgiving: a tag left open is closed at the end, a closing tag
 * with no opener is ignored, and formatting tags stay in the text.
 * @param {string} text
 * @returns {XmlNode} The root; its children are the top-level text and elements.
 * @typedef {{name: string, attrs: Record<string, string>, children: (XmlNode|string)[]}} XmlNode
 */
export function parseTree(text) {
    const root = { name: '', attrs: {}, children: [] };
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
            if (at > 0) open.length = at;
            continue;
        }
        const node = { name, attrs: parseAttrs(rawAttrs), children: [] };
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
const naming = node => NAMING.map(k => node.attrs[k]).find(Boolean) || '';
const isBar = node => node.attrs.value !== undefined && node.attrs.max !== undefined
    && Number.isFinite(Number(node.attrs.value)) && Number(node.attrs.max) > 0;

/** The attributes that say something more about a thing, as small tags beside it: level="2", new="true". */
function chips(node) {
    const used = new Set([...NAMING, ...(isBar(node) ? ['value', 'max'] : [])]);
    return Object.entries(node.attrs).filter(([key]) => !used.has(key)).map(([key, value]) => {
        if (/^(false|no|0)$/i.test(value)) return '';
        if (/^(true|yes)$/i.test(value) || value === '') return span('eye-sw-chip', escapeHtml(words(key)));
        if (/^(status|state|type|kind|rank|tier|rarity)$/.test(key)) return span('eye-sw-chip', escapeHtml(words(value)));
        return span('eye-sw-chip', `${escapeHtml(words(key))} ${escapeHtml(value)}`);
    }).join('');
}

/** A short value with nothing else to it, such as <str>7</str>. A run of these is laid out side by side. */
const isCell = node => !elements(node).length && !Object.keys(node.attrs).length && textOf(node).length > 0 && textOf(node).length <= 16;

function bar(node) {
    const value = Number(node.attrs.value);
    const max = Number(node.attrs.max);
    const width = Math.max(0, Math.min(100, Math.round(value / max * 100)));
    return `<span class="eye-sw-bar" data-name="${escapeHtml(node.name)}">`
        + span('eye-sw-label', escapeHtml(naming(node) || label(node.name)))
        + `<span class="eye-sw-track"><span class="eye-sw-fill" style="width:${width}%"></span></span>`
        + span('eye-sw-count', `${escapeHtml(node.attrs.value)} / ${escapeHtml(node.attrs.max)}`)
        + chips(node) + '</span>';
}

/**
 * One element, drawn by its shape:
 * - with value and max: a bar;
 * - with elements inside: a section, headed by its own text if it has any, else by its name;
 * - otherwise: a row. One of several siblings with the same name is a list item and shows no label.
 */
function draw(node, listed) {
    if (isBar(node)) return bar(node);
    const inside = elements(node);
    const text = textOf(node);
    if (inside.length) {
        const heading = text ? html(text) : escapeHtml(naming(node) || label(node.name));
        return `<span class="eye-sw-group">${span('eye-sw-heading', heading + chips(node))}${drawAll(node)}</span>`;
    }
    const title = naming(node);
    const value = text ? html(text) : '';
    const shown = listed
        ? span('eye-sw-value', title ? escapeHtml(title) + (value ? ` ${value}` : '') : value)
        : span('eye-sw-label', escapeHtml(title || label(node.name))) + span('eye-sw-value', value);
    return `<span class="eye-sw-row">${shown}${span('eye-sw-chips', chips(node))}</span>`;
}

/** The children of a node. Short plain values sit side by side; everything else is stacked. Loose text is a note. */
function drawAll(parent) {
    const inside = elements(parent);
    const counts = new Map();
    for (const node of inside) counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
    if (inside.length > 1 && inside.every(isCell)) {
        return `<span class="eye-sw-cells">${inside.map(node =>
            `<span class="eye-sw-cell">${span('eye-sw-label', escapeHtml(label(node.name)))}${span('eye-sw-value', html(textOf(node)))}</span>`).join('')}</span>`;
    }
    return `<span class="eye-sw-rows">${inside.map(node => draw(node, counts.get(node.name) > 1)).join('')}</span>`;
}

/**
 * The body of a system window that uses nested tags, or null when it is plain lines.
 * @param {string} rawBody What is between <system_window> and </system_window>.
 * @returns {string|null}
 */
export function systemWindowBody(rawBody) {
    const root = parseTree(rawBody);
    if (!elements(root).length) return null;
    // Text that stands between the top-level elements is kept, each stretch as a note in its place.
    const parts = [];
    let run = [];
    const flush = () => { if (run.length) { parts.push(drawAll({ name: '', attrs: {}, children: run })); run = []; } };
    for (const child of root.children) {
        if (typeof child !== 'string') { run.push(child); continue; }
        if (!child.trim()) continue;
        flush();
        parts.push(span('eye-sw-note', html(child)));
    }
    flush();
    return `<span class="eye-sw">${parts.join('')}</span>`;
}

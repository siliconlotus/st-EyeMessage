// Small HTML helpers shared by the renderers. Pure functions, no SillyTavern imports.

// Values may be quoted either way or, as HTML allows, not quoted at all: from=@alice.
const ATTR_RE = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

export const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Reads the attributes of a tag into an object, keys in lowercase. */
export function parseAttrs(text) {
    const attrs = {};
    for (const m of text.matchAll(ATTR_RE)) attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4]).trim();
    return attrs;
}

// Markdown is not parsed inside an HTML block, so the two marks a model reaches for are converted here.
export const inlineMarks = s => quoteSafe(s
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g, '<i>$1</i>'));

export const span = (cls, text) => text ? `<span class="${cls}">${text}</span>` : '';

/**
 * SillyTavern wraps each pair of quote marks on a line in <q>. A whole conversation is one line, so a
 * stray quote in one bubble would pair with one in another and wrap across both. Quote marks in the
 * text of an object are written as character references, which that step does not see. Tags are left alone.
 */
export const quoteSafe = html => html.replace(/<[^>]*>|["\u201C\u201D\u00AB\u00BB\u300C\u300D\u300E\u300F\uFF02]/g,
    m => m.length > 1 ? m : `&#${m.codePointAt(0)};`);

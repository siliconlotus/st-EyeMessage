// EyeMessage renderer. Pure functions, no SillyTavern imports, so node can test them (see test.mjs).

/**
 * The tags, each with the form shown to the model and what it is for.
 * A new object needs a row here and a `.custom-eye-<tag>` rule in style.css; nothing else lists the tags.
 */
const TAG_GUIDE = {
    sms: ['<sms from="Sender">', 'a phone text, one tag per message.'],
    dm: ['<dm app="App name" from="Sender">', 'a direct message inside an app, one tag per message.'],
    chat: ['<chat title="Channel or stream">', 'a live chat with many voices: a stream chat, a guild channel, a comment thread. Inside it, one line per message, written `Name: message`.'],
    email: ['<email from="Sender" subject="Subject line">', 'an email.'],
    letter: ['<letter from="Sender">', 'anything on paper: a letter, a note, a card, a receipt.'],
    sign: ['<sign>', 'anything posted or painted: a sign, a placard, a chalkboard.'],
    screen: ['<screen title="What it is">', 'anything else on a display: a terminal, a feed, an app.'],
};

/** Tags the model may write. */
export const TAGS = Object.keys(TAG_GUIDE);

/** What the model is told when "Tell the model about these tags" is on. {{user}} is filled in by SillyTavern. */
export const INSTRUCTION = `[Diegetic Artifacts: Tags]
When someone in the scene reads or looks at a written or on-screen thing, give its words inside one of these tags, where a blockquote would otherwise go. The interface draws the object. Write no HTML, styling or markdown for it.

${Object.values(TAG_GUIDE).map(([form, use]) => `- \`${form}\` ${use}`).join('\n')}

Texts and app messages go inside \`<thread>\`, one \`<thread>\` per conversation, with its messages in order. A different person or group is a different thread. An app thread can name its app once, as \`<thread app="App name">\`. A message can optionally carry a timestamp, as \`time="9:41 PM"\`. A plain line between messages in a thread is shown as a note, such as a date or \`Seen 2:14 PM\`.

{{user}}'s own sent messages appear in the history as \`<sms to="Recipient">\` or \`<dm to="Recipient">\`, with {{user}}'s screenname as \`from\` where one is used.

Inside the tag are only the object's own words, in its writer's voice and habits. Narration and reactions stay outside it, in plain prose. A turn in which nobody reads anything uses none of these tags.

Example, two conversations in one turn:
Two people answer while the kettle is still filling.
<thread><sms from="Mara">Running late. Save me the seat by the window?</sms>
<sms from="Mara">Ten minutes, I swear.</sms></thread>
<thread><sms from="Tobias">Call me when you are free.</sms></thread>`;

/** Number of sender hues. style.css defines one `.custom-eye-hue-N` class per bucket. */
export const HUES = 24;

// The attribute part allows ">" inside a quoted value, e.g. subject="Q3 > Q2".
const TAG_RE = new RegExp(`<(${[...TAGS, 'thread'].join('|')})\\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\\s\\S]*?)</\\1>`, 'gi');
// Values may be quoted either way or, as HTML allows, not quoted at all: from=@alice.
const ATTR_RE = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const CHAT_LINE = /^([^:\n]{1,32}?):\s+(\S.*)$/;

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "Bob Smith", "bob smith " and "@Bob_Smith" are one sender. Also used as the CSS key for a name. */
export const normaliseName = name => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Stable hue bucket for a sender name: FNV-1a over the normalised name, modulo the bucket count. */
export function hueOf(name) {
    let h = 0x811c9dc5;
    for (const ch of normaliseName(name)) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) % HUES;
}

function parseAttrs(text) {
    const attrs = {};
    for (const m of text.matchAll(ATTR_RE)) attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4]).trim();
    return attrs;
}

// Markdown is not parsed inside an HTML block, so the two marks a model reaches for are converted here.
const inlineMarks = s => quoteSafe(s
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g, '<i>$1</i>'));

const span = (cls, text) => text ? `<span class="${cls}">${text}</span>` : '';

/**
 * SillyTavern wraps each pair of quote marks on a line in <q>. A whole conversation is one line, so a
 * stray quote in one bubble would pair with one in another and wrap across both. Quote marks in the
 * text of an object are written as character references, which that step does not see. Tags are left alone.
 */
const quoteSafe = html => html.replace(/<[^>]*>|["\u201C\u201D\u00AB\u00BB\u300C\u300D\u300E\u300F\uFF02]/g,
    m => m.length > 1 ? m : `&#${m.codePointAt(0)};`);

/** "@A, @B" -> ["@A", "@B"]. A `to` may name several people, for a group thread. */
const people = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);

/** The hue class and the CSS key for a sender. Only senders get them: an outgoing bubble stays the user's own colour. */
const senderMarks = name => name ? { cls: `eye-hue-${hueOf(name)}`, data: ` data-from="${escapeHtml(normaliseName(name))}"` } : { cls: '', data: '' };

/** A live chat body is one `Name: message` per line. A line without a name is a system line. */
function chatRows(body) {
    return body.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean).map((line) => {
        const m = line.match(CHAT_LINE);
        if (!m) return span('eye-line eye-sys', inlineMarks(line));
        const { cls, data } = senderMarks(m[1].trim());
        return `<span class="eye-line"><span class="eye-nick ${cls}"${data}>${escapeHtml(m[1].trim())}</span> `
            + `<span class="eye-said">${inlineMarks(m[2])}</span></span>`;
    }).join('');
}

const MESSAGE_TAGS = new Set(['sms', 'dm']);

const bodyHtml = raw => `<span class="eye-body">${inlineMarks(raw.trim()).replace(/\r?\n/g, '<br>')}</span>`;
const noteHtml = raw => span('eye-note', inlineMarks(raw.trim()).replace(/\r?\n/g, '<br>'));

/**
 * Who wrote a message and how it is labelled. Both sides are labelled the same way, by the writer:
 * the sender, or the user's own screenname or persona name. A received message addressed to a third
 * person keeps its "A → B".
 */
function writer(a, own, userName) {
    const outgoing = a.from ? own.has(normaliseName(a.from)) : !!a.to;
    const toUser = people(a.to).some(n => own.has(normaliseName(n)));
    const thirdParty = !outgoing && a.to && !toUser ? ` → ${people(a.to).join(', ')}` : '';
    return {
        outgoing,
        who: outgoing ? 'out' : `in|${normaliseName(a.from || '')}`,
        sender: senderMarks(outgoing ? '' : a.from || ''),
        head: span('eye-head',
            span('eye-who', escapeHtml(outgoing ? a.from || userName : (a.from || '') + thirdParty))
            + span('eye-time', escapeHtml(a.time || ''))),
    };
}

/** One text or app message as a bubble. A bubble whose writer is the same as the one before it is named once. */
function bubble(tag, a, rawBody, w, prevWho) {
    const classes = ['eye', `eye-${tag}`, w.outgoing ? 'eye-out' : 'eye-in', w.sender.cls, prevWho === w.who && !a.time && 'eye-same'];
    return `<span class="${classes.filter(Boolean).join(' ')}"${w.sender.data}>${w.head}${bodyHtml(rawBody)}</span>`;
}

/** The start of a conversation panel. Its top line names the app and, on a conversation the user opens, who it is to. */
function panelOpen(tag, app, to) {
    const line = span('eye-app', escapeHtml(app)) + span('eye-to', to ? `To ${escapeHtml(people(to).join(', '))}` : '');
    const classes = ['eye-convo', `eye-convo-${tag}`, app && `eye-app-${normaliseName(app)}`];
    return `<div class="${classes.filter(Boolean).join(' ')}">${span('eye-thread', line)}`;
}

/** A <thread>: everything inside is one conversation, drawn on one panel. Text between messages becomes a note line. */
function threadPanel(rawAttrs, rawBody, own, userName) {
    const t = parseAttrs(rawAttrs);
    let html = '';
    let first = null;
    let prevWho = null;
    let last = 0;
    const note = (text) => { if (text.trim()) { html += noteHtml(text); prevWho = null; } };
    for (const m of rawBody.matchAll(TAG_RE)) {
        note(rawBody.slice(last, m.index));
        last = m.index + m[0].length;
        const tag = m[1].toLowerCase();
        if (!MESSAGE_TAGS.has(tag)) { note(m[3]); continue; }
        const a = parseAttrs(m[2]);
        a.app ||= t.app;
        const w = writer(a, own, userName);
        first ??= { tag, a, outgoing: w.outgoing };
        html += bubble(tag, a, m[3], w, prevWho);
        prevWho = w.who;
    }
    note(rawBody.slice(last));
    if (!html) return '';
    const app = t.app || first?.a.app || '';
    return `\n\n${panelOpen(first?.tag ?? (app ? 'dm' : 'sms'), app, first?.outgoing ? first.a.to : '')}${html}</div>\n\n`;
}

/**
 * Replaces every artifact tag in a message with a styled container.
 *
 * Texts and app messages are drawn as conversations, each on its own panel. A <thread> is one conversation.
 * Messages outside a <thread> are grouped by who is in them: one app and the people other than the user,
 * for as long as such messages follow each other. A message with different people starts a new panel.
 *
 * Each container is emitted on a single line with blank lines around it, so Markdown passes it through as
 * one block. Class names carry no `custom-` prefix: SillyTavern's sanitiser adds it.
 * @param {string} mes Message text.
 * @param {Set<string>} [own] The user's own names and screennames, normalised. A message from one of them is drawn as sent.
 * @param {string} [userName] The persona name: the label on a sent message that carries no screenname.
 */
export function renderArtifacts(mes, own = new Set(), userName = '') {
    if (!mes || !mes.includes('<')) return mes;
    let out = '';
    let last = 0;
    let open = null; // the panel being filled with messages that stand outside a <thread>: { key, who }
    const close = () => { if (open) { out += '</div>\n\n'; open = null; } };

    for (const match of mes.matchAll(TAG_RE)) {
        const [whole, rawTag, rawAttrs, rawBody] = match;
        const tag = rawTag.toLowerCase();
        const between = mes.slice(last, match.index);
        last = match.index + whole.length;

        if (tag === 'thread') {
            close();
            out += between + threadPanel(rawAttrs, rawBody, own, userName);
            continue;
        }

        const a = parseAttrs(rawAttrs);
        const app = a.app || '';
        const w = writer(a, own, userName);

        if (!MESSAGE_TAGS.has(tag)) {
            close();
            const classes = ['eye', `eye-${tag}`, w.outgoing ? 'eye-out' : 'eye-in', w.sender.cls, app && `eye-app-${normaliseName(app)}`];
            const recipient = span('eye-thread', span('eye-to', w.outgoing && a.to ? `To ${escapeHtml(people(a.to).join(', '))}` : ''));
            const title = span('eye-title', escapeHtml(a.subject || a.title || ''));
            const body = tag === 'chat' ? chatRows(rawBody) : bodyHtml(rawBody);
            out += `${between}\n\n<div class="${classes.filter(Boolean).join(' ')}"${w.sender.data}>${recipient}${w.head}${title}${body}</div>\n\n`;
            continue;
        }

        const others = [a.from, ...people(a.to)].filter(Boolean).map(normaliseName).filter(n => !own.has(n));
        const key = `${tag}|${normaliseName(app)}|${[...new Set(others)].sort().join(',')}`;
        const joins = open && open.key === key && !between.trim();
        if (!joins) {
            close();
            out += `${between}\n\n${panelOpen(tag, app, w.outgoing ? a.to : '')}`;
        }
        out += bubble(tag, a, rawBody, w, joins ? open.who : null);
        open = { key, who: w.who };
    }
    close();
    return out + mes.slice(last);
}

/**
 * Lists who appears in a message's tags, for the colour picker.
 * `kind` is "sender" for a `from` on a message tag and "chat" for a name in a live chat.
 * @returns {{name: string, kind: 'sender'|'chat'}[]}
 */
export function collectContacts(mes) {
    const found = [];
    if (!mes || !mes.includes('<')) return found;
    for (const [, rawTag, rawAttrs, rawBody] of mes.matchAll(TAG_RE)) {
        if (rawTag.toLowerCase() === 'thread') {
            found.push(...collectContacts(rawBody));
        } else if (rawTag.toLowerCase() === 'chat') {
            for (const line of rawBody.split(/\r?\n/)) {
                const m = line.trim().match(CHAT_LINE);
                if (m) found.push({ name: m[1].trim(), kind: 'chat' });
            }
        } else {
            const from = parseAttrs(rawAttrs).from;
            if (from) found.push({ name: from, kind: 'sender' });
        }
    }
    return found;
}

// ---- Typed shorthand for the user's own messages ----

// A recipient is one to three words. It counts when it starts with a capital letter or "@", or when it is
// a name the chat already knows, so ordinary prose ("Text me when you land: ...") is left alone.
const WORD = String.raw`[\p{L}\p{N}_.'’-]+`;
const RECIPIENT = String.raw`(@?${WORD}(?: (?!(?:on|via|as) )${WORD}){0,2})`;
const APP = String.raw`(?: (?:on|via) ((?!as )${WORD}(?: (?!as )${WORD})?))?`;
const AS = String.raw`(?: as (@?${WORD}))?`;
// keyword, then everything up to the colon that ends the heading, then the message.
// The heading may hold one clock colon ("Bob 10:29PM:").
const TYPED_LINE = /^(text|sms|dm|e-?mail) (?:to )?([^:\n]{1,80}?(?::\d{2}[^:\n]{0,4})?):[ \t]*(\S.*)$/gimu;
const HEAD_PLAIN = new RegExp(`^${RECIPIENT}$`, 'u');
// Only "dm" takes an app and a screenname, so "Text Bob on Monday: ..." stays prose.
const HEAD_DM = new RegExp(`^${RECIPIENT}${APP}${AS}$`, 'u');
const HEAD_TIME = /^(.*?\S)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?)$/i;
const appName = raw => raw ? raw.replace(/^\p{Ll}/u, c => c.toUpperCase()) : '';
const attr = s => s.trim().replace(/"/g, '\'');
/** The recipient as it should be written, or null when the line is prose. */
const recipient = (typed, canon) => canon(typed) ?? (/^(?:@|\p{Lu})/u.test(typed) ? typed : null);

/**
 * Reads a clock time and writes it one way: "10:29PM" and "22:29" are both "10:29 PM".
 * With no am or pm it is read as a 24-hour clock, so "9:13" is "9:13 AM" and "13:05" is "1:05 PM".
 * @returns {string|null} null when the text is not a clock time.
 */
export function clockTime(text) {
    const m = String(text ?? '').trim().match(/^(\d{1,2})(?::(\d{2}))?(?:\s?([ap])\.?m\.?)?$/i);
    if (!m || (!m[2] && !m[3])) return null;
    const hour = Number(m[1]);
    const minute = Number(m[2] ?? 0);
    if (hour > 23 || minute > 59) return null;
    const pm = m[3] && hour >= 1 && hour <= 12 ? m[3].toLowerCase() === 'p' : hour >= 12;
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${pm ? 'PM' : 'AM'}`;
}

/** Writes a message tag from its parts. Empty parts are left out. */
function buildTag(kind, { from, to, app, subject, time }, body) {
    const attrs = [
        from && `from="${attr(from)}"`,
        `to="${attr(to)}"`,
        app && `app="${attr(app)}"`,
        subject && `subject="${attr(subject)}"`,
        time && `time="${attr(time)}"`,
    ].filter(Boolean).join(' ');
    return `<${kind} ${attrs}>${body.trim()}</${kind}>`;
}

/**
 * Reads one typed line. Returns null when it is prose.
 * @returns {{kind: string, to: string, app: string, as: string, time: string, subject: string, body: string}|null}
 */
function readTypedLine(word, head, body, canon) {
    const kind = /^(?:text|sms)$/i.test(word) ? 'sms' : /^dm$/i.test(word) ? 'dm' : 'email';
    // A clock time at the end of the heading: "Bob 10:29PM", "Bob at 22:29".
    let time = '';
    const timed = head.match(HEAD_TIME);
    if (timed && clockTime(timed[2])) [head, time] = [timed[1], clockTime(timed[2])];

    const m = head.trim().match(kind === 'dm' ? HEAD_DM : HEAD_PLAIN);
    // A bare number is neither a time nor part of a name ("text Bob 10: ..."), so such a line is left alone.
    const to = m && !/\s\d+$/.test(m[1]) && recipient(m[1], canon);
    if (!to) return null;
    let subject = '';
    if (kind === 'email') {
        const split = body.match(/^([^|\n]+?)[ \t]*\|[ \t]*(\S.*)$/);
        if (split) [subject, body] = [split[1], split[2]];
    }
    return { kind, to, app: appName(m[2]), as: m[3] || '', time, subject, body };
}

/**
 * Turns the typed shorthand in a user message into tags.
 * The line starts with "text" (or "sms"), "dm" or "email", then the recipient, then a colon.
 * A clock time may follow the recipient. Only "dm" takes "on App" (or "via App") and "as @screenname".
 *   text Bob: running late                             -> <sms to="Bob">running late</sms>
 *   text bob: running late                             -> the same, once Bob is a name in the chat's messages
 *   text Bob 10:29PM: hey                              -> <sms to="Bob" time="10:29 PM">hey</sms>
 *   text Bob 22:29: hey                                -> the same
 *   dm Dave on Chatter: 2pm works                     -> <dm to="Dave" app="Chatter">2pm works</dm>
 *   dm Dave on Chatter as @alice: 2pm works    -> <dm from="@alice" to="Dave" app="Chatter">2pm works</dm>
 *   email Frank: Invoice | see attached                 -> <email to="Frank" subject="Invoice">see attached</email>
 * A line that is already a tag does not match, so running this twice changes nothing.
 * @param {string} mes Message text.
 * @param {Record<string, string>} [handles] The user's screenname per app, keyed by the app's normalised name.
 *   Used when a line names an app but no "as".
 * @param {(name: string) => string|null} [canon] Returns a known name as the chat writes it, or null.
 */
export function expandShorthand(mes, handles = {}, canon = () => null) {
    if (!mes) return mes;
    const expand = text => text.replace(TYPED_LINE, (line, word, head, body) => {
        const read = readTypedLine(word, head, body, canon);
        if (!read) return line;
        const from = read.kind === 'dm' ? read.as || (read.app && handles[normaliseName(read.app)]) || '' : '';
        return buildTag(read.kind, { ...read, from }, read.body);
    });
    // A line inside a tag that is already there belongs to that message, so only the text between tags is read.
    let out = '';
    let last = 0;
    for (const match of mes.matchAll(TAG_RE)) {
        out += expand(mes.slice(last, match.index)) + match[0];
        last = match.index + match[0].length;
    }
    return out + expand(mes.slice(last));
}

/**
 * The screennames the user typed with "as" in a message, before it is expanded. Only these are remembered:
 * a tag the user pasted or quoted teaches nothing, so a contact can never be mistaken for the user.
 * @returns {{app: string, handle: string}[]} `app` is the normalised app name, or "" when no app was named.
 */
export function typedHandles(mes, canon = () => null) {
    const found = [];
    if (!mes) return found;
    for (const [, word, head, body] of mes.matchAll(TYPED_LINE)) {
        const read = readTypedLine(word, head, body, canon);
        if (read?.as) found.push({ app: normaliseName(read.app), handle: read.as });
    }
    return found;
}

/** Every name a message's tags are from or to, as written. Used to recognise a recipient typed in lowercase. */
export function namesIn(mes) {
    const found = [];
    if (!mes || !mes.includes('<')) return found;
    for (const [, rawTag, rawAttrs, rawBody] of mes.matchAll(TAG_RE)) {
        if (rawTag.toLowerCase() === 'thread') { found.push(...namesIn(rawBody)); continue; }
        const a = parseAttrs(rawAttrs);
        found.push(...[a.from, ...people(a.to)].filter(Boolean));
    }
    return found;
}

// ---- Slash commands ----

/** Takes the first word, or the first quoted phrase, off the front of a string. */
function takeToken(text) {
    const m = text.match(/^\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s*/);
    return m ? [m[1] ?? m[2] ?? m[3], text.slice(m[0].length)] : ['', text];
}

const COMMAND_KINDS = { sms: 'sms', text: 'sms', dm: 'dm', email: 'email' };
const COMMAND_LINE = /\r?\n(?=\/(?:sms|text|dm|email)\b)/i;
const COMMAND_ARG = /^\s*(to|app|as|time|subject)=(?:"([^"]*)"|'([^']*)'|(\S+))\s*/i;

/**
 * SillyTavern ends a command only at a pipe, so when several commands are written one per line, the
 * later lines arrive as part of the first command's message. This splits them back out.
 * @param {'sms'|'dm'|'email'} kind The command SillyTavern ran.
 * @param {string} text Its message, which may hold further "/sms ...", "/dm ..." or "/email ..." lines.
 * @param {object} [named] Its named arguments.
 * @returns {{kind: string, text: string, named: object}[]} One entry per command, in order.
 */
export function splitCommands(kind, text, named = {}) {
    const [first, ...lines] = String(text ?? '').split(COMMAND_LINE);
    const commands = [{ kind, text: first, named }];
    for (const line of lines) {
        const [, word, after] = line.match(/^\/(sms|text|dm|email)\b([\s\S]*)$/i);
        const args = {};
        let rest = after;
        for (let m; (m = rest.match(COMMAND_ARG)); rest = rest.slice(m[0].length)) args[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
        commands.push({ kind: COMMAND_KINDS[word.toLowerCase()], text: rest, named: args });
    }
    return commands;
}

/**
 * Builds the tag for /sms, /dm and /email. Returns "" when something required is missing.
 *   /sms Bob I'm gonna be late                        -> <sms to="Bob">I'm gonna be late</sms>
 *   /sms "Carol Jones" see you at 9?                        -> <sms to="Carol Jones">see you at 9?</sms>
 *   /dm chatter @Dave_88,@Erin free tonight -> <dm to="@Dave_88, @Erin" app="Chatter">free tonight</dm>
 *   /dm as=@alice chatter @Dave_88 hi    -> <dm from="@alice" to="@Dave_88" app="Chatter">hi</dm>
 *   /email subject="Invoice" Frank see attached        -> <email to="Frank" subject="Invoice">see attached</email>
 *   /sms time=22:29 Bob hey                            -> <sms to="Bob" time="10:29 PM">hey</sms>
 * @param {'sms'|'dm'|'email'} kind
 * @param {string} text Everything after the command and its named arguments.
 * @param {{to?: string, app?: string, as?: string, subject?: string, time?: string}} [named] Named arguments; `to` and `app` replace the leading words.
 *   A `time` that is a clock time is written one way (see clockTime); anything else is kept as given.
 * @param {Record<string, string>} [handles] The user's remembered screenname per app.
 * @param {(name: string) => string|null} [canon] Returns a known name as the chat writes it, or null.
 */
export function commandToTag(kind, text, named = {}, handles = {}, canon = () => null) {
    let rest = String(text ?? '');
    let app = kind === 'dm' ? named.app || '' : '';
    if (kind === 'dm' && !app) [app, rest] = takeToken(rest);
    let to = named.to || '';
    if (!to) [to, rest] = takeToken(rest.replace(/^\s*to\s+/i, ''));
    const body = rest.trim();
    if (!people(to).length || !body || (kind === 'dm' && !app)) return '';

    return buildTag(kind, {
        from: kind === 'dm' ? named.as || handles[normaliseName(app)] || '' : '',
        to: people(to).map(n => canon(n) ?? n).join(', '),
        app: appName(app),
        subject: kind === 'email' ? named.subject || '' : '',
        time: named.time ? clockTime(named.time) ?? named.time : '',
    }, body);
}

// ---- Colours for the picker ----

const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const luminance = rgb => rgb.map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

/** The automatic bubble colour for a name, as hex: the picker's starting value. Matches hsl(hue 32% 24%) in style.css. */
export function autoHex(name) {
    const h = hueOf(name) * (360 / HUES), s = 0.32, l = 0.24;
    const f = (n) => {
        const k = (n + h / 30) % 12;
        return 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    };
    return rgbToHex([f(0), f(8), f(4)]);
}

/** The live chat panel's background in style.css. A picked colour is lightened until a name reads on it. */
const CHAT_PANEL = [24, 24, 27];

/**
 * The CSS rule for one picked colour. The pick is the bubble background; the text colour on it is
 * black or white, whichever reads better; the name colour for the dark live chat panel is the pick,
 * lightened if it would be too dark to read there.
 */
export function overrideRule(key, hex) {
    const rgb = hexToRgb(hex);
    const fg = contrast(rgb, [255, 255, 255]) >= contrast(rgb, [0, 0, 0]) ? '#ffffff' : '#000000';
    let nick = rgb;
    for (let i = 0; i < 20 && contrast(nick, CHAT_PANEL) < 4.5; i++) nick = nick.map(v => v + (255 - v) * 0.15);
    const selector = `.mes_text [data-from="${key.replace(/["\\]/g, '\\$&')}"]`;
    return `${selector} { --eye-bg: ${hex}; --eye-fg: ${fg}; --eye-name: ${fg}; --eye-nick: ${rgbToHex(nick)}; }`;
}

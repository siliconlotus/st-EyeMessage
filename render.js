// EyeMessage renderer. Pure functions, no SillyTavern imports, so node can test them (see test.mjs).
import { escapeHtml, parseAttrs, inlineMarks, safeAlign, safeColour, span, unescapeHtml, withStyle } from './html.js';
import { structuredBody, builtIns, ownCss } from './structure.js';

/**
 * The tags, each with the form shown to the model and what it is for.
 * A new object needs a row here and a `.custom-eye-<tag>` rule in style.css; nothing else lists the tags.
 */
const TAG_GUIDE = {
    sms: ['<sms from="Contact name">', 'a phone text, one tag per message. `from` is the sender as the reader\'s phone names them.'],
    dm: ['<dm app="App name" from="@handle" display_name="Display name">', 'a direct message inside an app, one tag per message. `from` is the account\'s handle. `display_name` is the name that account shows; give it on the account\'s first message in a thread.'],
    chat: ['<chat title="Channel or stream">', 'a live text chat with many participants: a stream chat, a guild channel, a comment thread. Inside it, one line per message, written `Name: message`.'],
    email: ['<email from="Sender" subject="Subject line">', 'an email. An optional `attachments` names the files on it, with commas between.'],
    letter: ['<letter from="Sender">', 'anything on paper: a letter, a note, a card, a receipt. It is drawn handwritten; mark printed paper, such as a receipt or a typed letter, with `typed`: `<letter from="Harbour Café" typed>`.'],
    sign: ['<sign>', 'anything posted or painted: a sign, a placard, a chalkboard.'],
    screen: ['<screen title="What it is">', 'anything else on a display: a terminal, a feed, an app, a record, the status window of a game-like System. A record, form or listing gets structure, with nested tags of your own naming; a tag with `value` and `max` is drawn as a bar, as a ring with `chart=ring`, standing up with `chart=column`, or in blocks with `chart=segments`. A terminal or a running feed stays as plain lines.'],
};

/** Tags the model may write. */
export const TAGS = Object.keys(TAG_GUIDE);

/** What each tag is called in the settings panel. */
export const TAG_LABELS = {
    sms: 'Texts', dm: 'App messages', chat: 'Live chats', email: 'Emails', letter: 'Letters and notes',
    sign: 'Signs', screen: 'Screens',
};

const MESSAGES_EXAMPLE = `Example, two conversations in one turn:
Two people answer while the kettle is still filling.
<thread><sms from="Mara">Running late. Save me the seat by the window?</sms>
<sms from="Mara">Ten minutes, I swear.</sms></thread>
<thread><sms from="Tobias">Call me when you are free.</sms></thread>`;

const SCREEN_EXAMPLE = `Example, a screen with structure:
<screen title="MV Corrigan · Engine Room" class="console">
<heading>214°</heading><speed>11.2 kn</speed><rudder>3° port</rudder>
<engines><port value=88 max=100 chart=ring color="red" badge="Vibration"/><starboard value=74 max=100 chart=ring color="#3fc1ff"/></engines>
<tanks><fuel value=62 max=100 chart=column color="color-mix(in srgb, orange 70%, gold)"/><ballast value=40 max=100 chart=column color="blue"/><fresh_water value=85 max=100 chart=column color="#5fe0c0b3"/><lube_oil value=18 max=100 chart=column color="red" alert="Low"/></tanks>
<log><entry time="04:10">Bilge pump 2 cycled twice in ten minutes</entry><entry time="05:30">Chief Okafor took the watch</entry></log>
</screen>`;

const HUD_EXAMPLE = `Example, a screen in a built-in theme, with built-in classes and one style of its own:
<screen title="ISV KESTREL // BRIDGE" class="hud">
<styles><hot>color:#ff3b3b;text-shadow:0 0 8px #ff3b3b</hot></styles>
<condition class="banner pulse" color="#ff3b3b" alert="Hull breach · Deck 4">Red alert</condition>
<shields><fore value=34 max=100 chart=ring color="#ff3b3b"/><aft value=91 max=100 chart=ring/><port value=78 max=100 chart=ring/><starboard value=80 max=100 chart=ring/></shields>
<power><engines value=6 max=10 chart=column/><weapons value=9 max=10 chart=column color="#ff3b3b"/><shields value=8 max=10 chart=column color="#5ab0ff"/><life_support value=3 max=10 chart=column color="#ffb000" alert="Rerouted"/></power>
<hull value=62 max=100 chart=segments color="#ffb000"/>
<targeting color="#ff3b3b"><contact class="hot flicker">Raider</contact><range>4.2 km</range><bearing>032°</bearing><lock value=87 max=100 chart=segments badge="Locked"/></targeting>
<comms><msg time="T+00:14">Raider hailing on open channel</msg><msg time="T+00:31">Damage control team to deck 4</msg></comms>
</screen>`;

/**
 * The instructions injected into the system prompt, for the tags that are switched on. Each tag brings
 * its own line, and its example where it has one; the notes on threads come with texts and app messages.
 * {{user}} is filled in by SillyTavern.
 * @param {string[]} [tags] The tags to teach. Defaults to all of them.
 * @param {{hud?: boolean, styles?: string[]}} [options] hud: also show the advanced HUD example with the screen one.
 *   styles: the names of the styles already defined in the chat.
 * @returns {string} Empty when no tag is taught.
 */
export function instructionFor(tags = TAGS, { hud = false, styles = [] } = {}) {
    // Names from the chat go into the system prompt, so only plain short ones, and not too many.
    const defined = styles.filter(name => /^[a-z][\w-]{0,31}$/i.test(name)).slice(0, 20).map(name => `\`${name}\``).join(', ');
    const taught = TAGS.filter(tag => tags.includes(tag));
    if (!taught.length) return '';
    const has = tag => taught.includes(tag);
    const messages = has('sms') || has('dm');
    return [
        `[Diegetic Artifacts: Tags]
When someone in the scene reads or looks at a written or on-screen thing, give its words inside one of these tags, where a blockquote would otherwise go. The interface draws the object. Write no HTML or markdown for it.`,
        taught.map(tag => `- \`${TAG_GUIDE[tag][0]}\` ${TAG_GUIDE[tag][1]}`).join('\n'),
        has('screen') && `In a screen's structure, put each fact in a tag of its own. A \`badge\` or \`alert\` attribute is a short modifier drawn as a lozenge beside the value it is on. Its tags, and the screen itself, may carry \`color\` (a plain name such as \`red\`, hex, which may carry alpha, or a CSS colour function such as \`color-mix()\` or \`hsl()\`), \`align\` and \`style\` (inline CSS) where the display itself would show it. Colours otherwise follow the reader's theme, light or dark, so a \`style\` that sets a background sets the text colour with it. \`color\` on the screen is its accent, \`align\` there places its title, and \`title-style\` styles it. \`section-style\` on the screen, or on a section, styles every section inside it. \`class\` takes built-in looks, combined as \`class=\"banner pulse\"\` and coloured by the tag's \`color\`: \`banner\`, \`glow\`, \`pulse\`, \`blink\`, \`flicker\`, \`cut\`, \`brackets\`, \`scanlines\`, \`ticks\` (round rings) and \`caps\`. On the screen it also takes a theme: \`hud\`, \`console\`, \`terminal\` or \`parchment\`. A \`<styles>\` tag in a screen names your own CSS for the whole chat, as \`<styles><warning>color:red;font-weight:bold</warning></styles>\`, for this and any later tag to use with \`class=\"warning\"\`: define a style once, and never repeat it.`,
        messages && `Texts and app messages go inside \`<thread>\`, one \`<thread>\` per conversation, with its messages in order. A different person or group is a different thread. An app thread can name its app once, as \`<thread app="App name">\`. A group conversation that has a name carries it as \`<thread title="Group name">\`. A message can optionally carry a timestamp, as \`time="9:41 PM"\`. A plain line between messages in a thread is shown as a note, such as a date or \`Seen 2:14 PM\`.`,
        has('email') && `An exchange of several emails goes inside one \`<thread>\`, in order.`,
        messages && `{{user}}'s own sent messages appear in the history as \`<sms to="Recipient">\` or \`<dm to="Recipient">\`, with {{user}}'s own handle as \`from\` where one is used.`,
        `Inside the tag are only the object's own words, in its writer's voice and habits. Narration and reactions stay outside it, in plain prose. A turn in which nobody reads anything uses none of these tags.`,
        has('sms') && MESSAGES_EXAMPLE,
        has('screen') && defined && `Styles already defined in this chat, to use with \`class\`: ${defined}.`,
        has('screen') && SCREEN_EXAMPLE,
        has('screen') && hud && HUD_EXAMPLE,
    ].filter(Boolean).join('\n\n');
}

/** Number of sender hues. style.css defines one `.custom-eye-hue-N` class per bucket. */
export const HUES = 24;

/** Tags no longer taught that older chats hold, and the tag each is drawn as. */
const FORMER = { system_window: 'screen' };

// The attribute part allows ">" inside a quoted value, e.g. subject="Q3 > Q2".
const TAG_RE = new RegExp(`<(${[...TAGS, 'thread', ...Object.keys(FORMER)].join('|')})\\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\\s\\S]*?)</\\1>`, 'gi');
const CHAT_LINE = /^([^:\n]{1,32}?):\s+(\S.*)$/;

// Code: a fenced block, or a span in backticks on one line. A tag in code is quoted, not written: "use the `<screen>` tag".
const CODE = /(```|~~~)[\s\S]*?\1|(`+)[^`\n]+?\2(?!`)/g;

/**
 * The tags in a text, outside code, each as [whole, tag, attributes, body] with its index, as matchAll gives them.
 * Matching runs on a copy with the "<" in code hidden; what is returned is the text itself.
 */
function* tagsIn(text) {
    const masked = text.includes('`') || text.includes('~~~') ? text.replace(CODE, code => code.replace(/</g, '\u0001')) : text;
    for (const m of masked.matchAll(TAG_RE)) {
        const end = m.index + m[0].length;
        const bodyStart = end - m[1].length - 3 - m[3].length;
        const found = [text.slice(m.index, end), m[1], text.slice(m.index + 1 + m[1].length, bodyStart - 1), text.slice(bodyStart, end - m[1].length - 3)];
        found.index = m.index;
        yield found;
    }
}

// The address an email sender may have after the name: "Bob <bob@example.com>".
const ADDRESS = /(?<=\S)\s*<([^<>\s]+@[^<>\s]+)>\s*$/;
/** A name as it reads, without that address: "Bob <bob@example.com>" is Bob. */
const plainName = name => unescapeHtml(name).replace(ADDRESS, '');

/** "Bob Smith", "bob smith " and "@Bob_Smith" are one sender. Also used as the CSS key for a name. */
export const normaliseName = name => plainName(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Stable hue bucket for a sender name: FNV-1a over the normalised name, modulo the bucket count. */
export function hueOf(name) {
    let h = 0x811c9dc5;
    for (const ch of normaliseName(name)) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) % HUES;
}

/** "@A, @B" -> ["@A", "@B"]. A `to` may name several people, for a group thread. */
const people = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);

/** The hue class and the CSS key for a sender. Only senders get them: an outgoing bubble stays the user's own colour. */
const senderMarks = name => name ? { cls: `eye-hue-${hueOf(name)}`, data: ` data-from="${escapeHtml(normaliseName(name))}"` } : { cls: '', data: '' };

/**
 * A live chat body is one `Name: message` per line. A line without a name is a system line.
 * A line by one of the user's own names is marked as theirs and keeps the user's colour.
 */
function chatRows(body, own = new Set()) {
    return body.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean).map((line) => {
        const m = line.match(CHAT_LINE);
        if (!m) return span('eye-line eye-sys', inlineMarks(line));
        const mine = own.has(normaliseName(m[1]));
        const { cls, data } = mine ? { cls: 'eye-own', data: '' } : senderMarks(m[1].trim());
        return `<span class="eye-line"><span class="eye-nick ${cls}"${data}>${escapeHtml(m[1].trim())}</span> `
            + `<span class="eye-said">${inlineMarks(m[2])}</span></span>`;
    }).join('');
}

const MESSAGE_TAGS = new Set(['sms', 'dm']);

/** An app value that only says "the phone's own texts": app="sms". */
const isPhone = app => /^(?:sms|text|texts)$/i.test((app || '').trim());
/** The name of a group conversation, given on its <thread>. Models write the attribute several ways. */
const threadTitle = t => t.title || t.name || t.display_name || t['display-name'] || '';

/**
 * A message's tag and attributes. The app may be given once on the <thread>. An app of "sms" is read as
 * what it means: a phone text, which has no app, so <dm app="sms"> is an <sms>.
 * @returns {[string, Record<string, string>]}
 */
function readMessage(rawTag, rawAttrs, thread = {}) {
    const a = parseAttrs(rawAttrs);
    let tag = rawTag.toLowerCase();
    tag = FORMER[tag] ?? tag;
    a.app ||= thread.app;
    // A letter is handwritten; `typed`, a bare word, marks one that is printed.
    if (tag === 'letter' && /(?:^|\s)typed(?=\s|$)/i.test(rawAttrs.replace(/"[^"]*"|'[^']*'/g, ''))) a.typed ||= 'typed';
    if (isPhone(a.app)) {
        a.app = '';
        if (tag === 'dm') tag = 'sms';
    }
    return [tag, a];
}

const bodyHtml = raw => `<span class="eye-body">${inlineMarks(raw.trim()).replace(/\r?\n/g, '<br>')}</span>`;
const noteHtml = raw => span('eye-note', inlineMarks(raw.trim()).replace(/\r?\n/g, '<br>'));

// The name an account shows beside its handle. Models write the attribute several ways.
const displayName = a => a.display_name || a['display-name'] || a.displayname || '';

/**
 * Who wrote a message and how it is labelled. Both sides are labelled the same way, by the writer:
 * the sender, or the user's own handle or persona name. A received message addressed to a third
 * person keeps its "A → B".
 *
 * An account has a handle (`from`) and may have a display name. The label shows the display name with
 * the handle beside it; colour and grouping always go by the handle. A display name is given once:
 * `names` carries it to later messages from the same handle in the same chat message.
 * @param {Map<string, string>} names Display name by normalised handle.
 */
function writer(a, own, userName, names) {
    const outgoing = a.from ? own.has(normaliseName(a.from)) : !!a.to;
    const toUser = people(a.to).some(n => own.has(normaliseName(n)));
    const thirdParty = !outgoing && a.to && !toUser ? ` → ${people(a.to).join(', ')}` : '';

    const key = normaliseName(a.from || '');
    if (key && displayName(a)) names.set(key, displayName(a));
    const display = displayName(a) || names.get(key) || '';
    const base = (outgoing ? a.from || userName : a.from || '') + thirdParty;
    const label = display
        ? span('eye-who', escapeHtml(display)) + span('eye-handle', a.from ? escapeHtml(base) : '')
        : span('eye-who', escapeHtml(base));
    return {
        outgoing,
        display,
        who: outgoing ? 'out' : `in|${key}`,
        sender: senderMarks(outgoing ? '' : a.from || ''),
        head: span('eye-head', label + span('eye-time', escapeHtml(a.time || ''))),
    };
}

/** One text or app message as a bubble. A bubble whose writer is the same as the one before it is named once. */
function bubble(tag, a, rawBody, w, prevWho) {
    const classes = ['eye', `eye-${tag}`, w.outgoing ? 'eye-out' : 'eye-in', w.sender.cls, prevWho === w.who && !a.time && 'eye-same'];
    return `<span class="${classes.filter(Boolean).join(' ')}"${w.sender.data}>${w.head}${bodyHtml(rawBody)}</span>`;
}

/**
 * The start of a conversation panel. Its top line names the app, the group when the conversation has a
 * name and, on a conversation the user opens, who it is to.
 */
function panelOpen(tag, app, to, title = '') {
    const line = span('eye-app', escapeHtml(app)) + span('eye-group', escapeHtml(title))
        + span('eye-to', to ? `To ${escapeHtml(people(to).join(', '))}` : '');
    const classes = ['eye-convo', `eye-convo-${tag}`, app && `eye-app-${normaliseName(app)}`];
    return `<div class="${classes.filter(Boolean).join(' ')}">${span('eye-thread', line)}`;
}

/** Who an email is from and to: a badge with the sender's initial, the name, the address, the To line and the time. */
function emailHead(a, w, userName) {
    const raw = a.from || (w.outgoing ? userName : '');
    const name = w.display || plainName(raw);
    const address = unescapeHtml(raw).match(ADDRESS)?.[1] ?? (w.display ? raw : '');
    const initial = name.match(/[\p{L}\p{N}]/u)?.[0].toUpperCase();
    const badge = initial ? `<span class="eye-badge" aria-hidden="true">${escapeHtml(initial)}</span>` : '';
    // The time comes first so that it floats beside the name, and the lines under it keep the full width.
    const names = span('eye-time', escapeHtml(a.time || '')) + span('eye-who', escapeHtml(name)) + span('eye-handle', escapeHtml(address))
        + span('eye-to', a.to ? `To ${escapeHtml(people(a.to).map(plainName).join(', '))}` : '');
    return span('eye-head', badge + span('eye-names', names));
}

/** A subject without the RE and FWD in front. */
const withoutPrefixes = subject => subject.replace(/^(?:(?:re|fwd?)\s*:\s*)+/i, '');

/** The subject, with a leading RE or FWD in a pill. One is taken: "FWD: Re: Lease" keeps its "Re:". */
function emailSubject(subject) {
    const [, prefix, rest] = subject.match(/^(re|fwd?)\s*:\s*(\S.*)$/i) ?? ['', '', subject];
    return span('eye-re', prefix.toUpperCase()) + escapeHtml(rest);
}

/** An email's paragraphs, with a closing line such as "— Frank" apart from them, and its attachments. */
function emailBody(raw, attachments = '') {
    const text = inlineMarks(raw.trim());
    const [, main, signoff] = text.match(/^([\s\S]*\S)\s*\n[ \t]*((?:[—–]|--).{1,60})$/) ?? ['', text, ''];
    // SillyTavern squashes a blank line made of <br>s, so each paragraph is a block of its own.
    const paragraphs = main.split(/\r?\n(?:[ \t]*\r?\n)+/).map(p => span('eye-par', p.replace(/\r?\n/g, '<br>'))).join('');
    const files = people(attachments).map(f => span('eye-file', escapeHtml(f))).join('');
    return span('eye-body', paragraphs + span('eye-par eye-signoff', signoff)) + span('eye-files', files);
}

/** The start of an object's container. An object drawn in the theme's colours may override them, with `color` and `style`. */
function boxOpen(tag, a, w, themed) {
    const classes = ['eye', `eye-${tag}`, w.outgoing ? 'eye-out' : 'eye-in', w.sender.cls, a.app && `eye-app-${normaliseName(a.app)}`, ...(tag === 'screen' ? builtIns(a) : []), tag === 'letter' && a.typed && 'eye-typed'];
    const accent = themed && safeColour(a.color ?? a.colour);
    return withStyle(`<div class="${classes.filter(Boolean).join(' ')}"${w.sender.data}>`, accent && `--element-accent:${accent}`, themed && (tag === 'screen' ? ownCss(a) : a.style));
}

const subjectOf = a => a.subject || a.title || '';
/** What an email is about, without the RE and FWD in front: how a reply is told from an email on something else. */
const topicOf = a => withoutPrefixes(subjectOf(a)).toLowerCase();

/**
 * Emails that follow each other, as one card; one alone is a card by itself. An email repeats no subject the
 * card already shows. `group` is the title of the thread they are in.
 * @param {{a: Record<string, string>, w: ReturnType<typeof writer>, rawBody: string}[]} emails
 */
function emailsHtml(emails, userName, group = '') {
    let topic = '';
    const boxes = emails.map(({ a, w, rawBody }, i) => {
        const top = i || withoutPrefixes(group).toLowerCase() === topicOf(a) ? '' : span('eye-thread', span('eye-group', escapeHtml(group)));
        const repeats = i > 0 && (!topicOf(a) || topicOf(a) === topic);
        topic = topicOf(a) || topic;
        const title = repeats ? '' : span('eye-title', emailSubject(subjectOf(a)));
        return `${boxOpen('email', a, w, true)}${top}${title}${emailHead(a, w, userName)}${emailBody(rawBody, a.attachments ?? a.attachment)}</div>`;
    }).join('');
    return `\n\n${emails.length > 1 ? `<div class="eye-mails">${boxes}</div>` : boxes}\n\n`;
}

/** Anything else that is not a text or an app message, in a container of its own. */
function objectHtml(tag, a, rawBody, w, own, group = '') {
    if (tag === 'chat') {
        // `title` is the channel's own name. `channel` only says what kind it is ("party", "whisper"),
        // which is all a game's chat command knows; the heading is then made from that.
        const kind = (a.channel || '').replace(/^./, c => c.toUpperCase());
        const heading = a.title || group || [kind, a.to && `to ${people(a.to).join(', ')}`].filter(Boolean).join(' ');
        return `\n\n<div class="eye eye-chat">${span('eye-title', escapeHtml(heading))}${chatRows(rawBody, own)}</div>\n\n`;
    }
    const top = span('eye-thread', span('eye-group', escapeHtml(group))
        + span('eye-to', w.outgoing && a.to ? `To ${escapeHtml(people(a.to).join(', '))}` : ''));
    const structured = tag === 'screen';
    const align = structured && safeAlign(a.align ?? a['text-align']);
    const title = withStyle(span('eye-title', escapeHtml(subjectOf(a))), align && `text-align:${align}`, structured && a['title-style']);
    // A screen may hold nested tags; it is then drawn as a hierarchy, not as lines.
    const nested = structured ? structuredBody(rawBody, { sectionStyle: a['section-style'] }) : null;
    return `\n\n${boxOpen(tag, a, w, structured)}${top}${w.head}${title}${nested ?? bodyHtml(rawBody)}</div>\n\n`;
}

/**
 * A <thread>: the messages inside are one conversation, drawn on one panel. Text between them becomes a note
 * line. Emails that follow each other are one card, and any other object stands on its own; both end the panel.
 */
function threadPanel(rawAttrs, rawBody, own, userName, names) {
    const t = parseAttrs(rawAttrs);
    let out = '';
    let html = '';
    let first = null;
    let prevWho = null;
    let last = 0;
    let emails = [];
    let group = threadTitle(t); // on the first object; a panel always carries it
    const closeEmails = () => {
        if (!emails.length) return;
        out += emailsHtml(emails, userName, group);
        emails = [];
        group = '';
    };
    const note = (text) => { if (text.trim()) { closeEmails(); html += noteHtml(text); prevWho = null; } };
    const closePanel = (besideObject = !!out) => {
        if (!html) return;
        // Plain lines between emails, with no message among them, need no panel.
        if (!first && besideObject) {
            out += `\n\n<div>${html}</div>\n\n`;
            html = '';
            return;
        }
        group = '';
        const app = isPhone(t.app) ? '' : t.app || first?.a.app || '';
        out += `\n\n${panelOpen(first?.tag ?? (app ? 'dm' : 'sms'), app, first?.outgoing ? first.a.to : '', threadTitle(t))}${html}</div>\n\n`;
        html = '';
        first = prevWho = null;
    };
    for (const m of tagsIn(rawBody)) {
        note(rawBody.slice(last, m.index));
        last = m.index + m[0].length;
        // The thread's app is its messages' app.
        const [tag, a] = readMessage(m[1], m[2], MESSAGE_TAGS.has(m[1].toLowerCase()) ? t : {});
        const w = writer(a, own, userName, names);
        if (!MESSAGE_TAGS.has(tag)) {
            closePanel(true);
            if (tag === 'email') {
                emails.push({ a, w, rawBody: m[3] });
                continue;
            }
            closeEmails();
            out += objectHtml(tag, a, m[3], w, own, group);
            group = '';
            continue;
        }
        closeEmails();
        first ??= { tag, a, outgoing: w.outgoing };
        html += bubble(tag, a, m[3], w, prevWho);
        prevWho = w.who;
    }
    note(rawBody.slice(last));
    closePanel();
    closeEmails();
    return out;
}

/**
 * Replaces every artifact tag in a message with a styled container.
 *
 * Texts and app messages are drawn as conversations, each on its own panel. A <thread> is one conversation.
 * Messages outside a <thread> are grouped by who is in them: one app and the people other than the user,
 * for as long as such messages follow each other. A message with different people starts a new panel.
 * Emails outside a <thread> that follow each other on one subject share a card.
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
    const names = new Map(); // display names given so far in this message, by handle
    let open = null; // the panel being filled with messages that stand outside a <thread>: { key, who }
    let emails = []; // emails outside a <thread> that go on one card
    const close = () => {
        if (open) out += '</div>\n\n';
        if (emails.length) out += emailsHtml(emails, userName);
        open = null;
        emails = [];
    };

    for (const match of tagsIn(mes)) {
        const [whole, rawTag, rawAttrs, rawBody] = match;
        const between = mes.slice(last, match.index);
        last = match.index + whole.length;

        if (rawTag.toLowerCase() === 'thread') {
            close();
            out += between + threadPanel(rawAttrs, rawBody, own, userName, names);
            continue;
        }

        const [tag, a] = readMessage(rawTag, rawAttrs);
        const app = a.app || '';
        const w = writer(a, own, userName, names);

        if (tag === 'email') {
            const joins = emails.length && topicOf(a) && topicOf(a) === topicOf(emails[0].a) && !between.trim();
            if (!joins) {
                close();
                out += between;
            }
            emails.push({ a, w, rawBody });
            continue;
        }
        if (!MESSAGE_TAGS.has(tag)) {
            close();
            out += between + objectHtml(tag, a, rawBody, w, own);
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
 * Lists who appears in a message's tags, for the colour picker. Only where a colour is drawn: on texts, app
 * messages, emails and live chats.
 * `kind` is "sender" for a `from` on a message tag and "chat" for a name in a live chat.
 * @returns {{name: string, kind: 'sender'|'chat'}[]}
 */
export function collectContacts(mes) {
    const found = [];
    if (!mes || !mes.includes('<')) return found;
    for (const [, rawTag, rawAttrs, rawBody] of tagsIn(mes)) {
        if (rawTag.toLowerCase() === 'thread') {
            found.push(...collectContacts(rawBody));
        } else if (rawTag.toLowerCase() === 'chat') {
            for (const line of rawBody.split(/\r?\n/)) {
                const m = line.trim().match(CHAT_LINE);
                if (m) found.push({ name: m[1].trim(), kind: 'chat' });
            }
        } else if (/^(?:sms|dm|email)$/i.test(rawTag)) {
            const from = parseAttrs(rawAttrs).from;
            if (from) found.push({ name: plainName(from), kind: 'sender' });
        }
    }
    return found;
}

// ---- Typed shorthand for the user's own messages ----

// A recipient is one to three words. It counts when it starts with a capital letter or "@", or when it is
// a name the chat already knows, so ordinary prose ("Text me when you land: ...") is left alone.
// A word of a name: letters, digits, a little punctuation, and emoji (with their joiners and variation selectors).
const WORD = String.raw`[\p{L}\p{N}\p{Extended_Pictographic}\u200D\uFE0F_.'’-]+`;
const RECIPIENT = String.raw`(@?${WORD}(?: (?!(?:on|via|as) )${WORD}){0,2})`;
const APP = String.raw`(?: (?:on|via) ((?!as )${WORD}(?: (?!as )${WORD})?))?`;
const AS = String.raw`(?: (?:as|from(?= @)) (@?${WORD}))?`;
// keyword, then everything up to the colon that ends the heading, then the message.
// The heading may hold one clock colon ("Bob 10:29PM:").
// With no heading at all ("email: thanks") the line answers the most recent conversation of its kind.
const TYPED_LINE = /^(text|sms|dm|e-?mail)(?: (?:to )?([^:\n]{1,80}?(?::\d{2}[^:\n]{0,4})?))?:[ \t]*(\S.*)$/gimu;
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
    // "dm Bob on sms: ..." is a phone text.
    if (kind === 'dm' && isPhone(app)) [kind, app, from] = ['sms', '', ''];
    const attrs = [
        from && `from="${attr(from)}"`,
        `to="${attr(to)}"`,
        app && `app="${attr(app)}"`,
        subject && `subject="${attr(subject)}"`,
        time && `time="${attr(time)}"`,
    ].filter(Boolean).join(' ');
    return `<${kind} ${attrs}>${body.trim()}</${kind}>`;
}

/** The subject of a reply to an email: the same subject under one "Re:". */
const replySubject = prev => prev.subject ? `Re: ${withoutPrefixes(prev.subject)}` : '';

/**
 * Reads one typed line. Returns null when it is prose.
 * @returns {{kind: string, to: string, app: string, as: string, time: string, subject: string, body: string}|null}
 */
function readTypedLine(word, head = '', body, canon, last = {}) {
    const kind = /^(?:text|sms)$/i.test(word) ? 'sms' : /^dm$/i.test(word) ? 'dm' : 'email';
    // A clock time at the end of the heading: "Bob 10:29PM", "Bob at 22:29". Alone, it is a reply with a time.
    let time = '';
    const timed = head.match(HEAD_TIME);
    if (timed && clockTime(timed[2])) [head, time] = [timed[1], clockTime(timed[2])];
    else if (clockTime(head)) [head, time] = ['', clockTime(head)];

    let subject = '';
    if (kind === 'email') {
        const split = body.match(/^([^|\n]+?)[ \t]*\|[ \t]*(\S.*)$/);
        if (split) [subject, body] = [split[1], split[2]];
    }
    if (!head) {
        // A reply: to whoever the last conversation of this kind was with. The word must be lowercase, so
        // "Email: sent this morning." is prose, and with nothing to answer the line is left alone.
        const prev = word === word.toLowerCase() && last[kind];
        if (!prev?.to) return null;
        subject ||= replySubject(prev);
        return { kind, to: prev.to, app: prev.app || '', as: '', time, subject, body };
    }
    const m = head.trim().match(kind === 'dm' ? HEAD_DM : HEAD_PLAIN);
    // A bare number is neither a time nor part of a name ("text Bob 10: ..."), so such a line is left alone.
    const to = m && !/\s\d+$/.test(m[1]) && recipient(m[1], canon);
    if (!to) return null;
    return { kind, to, app: appName(m[2]), as: m[3] || '', time, subject, body };
}

/**
 * The conversations in a message's tags, in order: what a bare reply ("email: thanks") needs to answer one.
 * `to` is everyone in it but the user, or the group's name when the thread has one. A <thread> is one
 * conversation; so is a message outside one.
 * @param {string} mes Message text.
 * @param {Set<string>} [own] The user's own names and screennames, normalised.
 * @returns {{kind: string, to: string, app: string, subject: string}[]}
 */
export function conversationsIn(mes, own = new Set()) {
    const found = [];
    if (!mes || !mes.includes('<')) return found;
    const REPLYABLE = new Set(['sms', 'dm', 'email']);
    // The other side of one message: its sender, or on the user's own message, who it was to.
    const others = a => (a.from && !own.has(normaliseName(a.from)) ? [a.from] : people(a.to)).filter(n => !own.has(normaliseName(n)));
    const add = (kind, names, app, subject) => {
        const unique = names.filter((n, i) => names.findIndex(x => normaliseName(x) === normaliseName(n)) === i);
        if (unique.length) found.push({ kind, to: unique.join(', '), app: app || '', subject: subject || '' });
    };
    for (const [, rawTag, rawAttrs, rawBody] of tagsIn(mes)) {
        if (rawTag.toLowerCase() === 'thread') {
            const t = parseAttrs(rawAttrs);
            const all = [...tagsIn(rawBody)].map(m => readMessage(m[1], m[2], MESSAGE_TAGS.has(m[1].toLowerCase()) ? t : {}));
            // An email in a thread is answered to its sender, like any other.
            for (const [tag, a] of all) if (tag === 'email') add(tag, others(a), a.app, a.subject);
            const inside = all.filter(([tag]) => MESSAGE_TAGS.has(tag));
            if (!inside.length) continue;
            // A group that has a name is answered by that name.
            const to = threadTitle(t) ? [threadTitle(t)] : inside.flatMap(([, a]) => others(a));
            add(inside[0][0], to, inside.find(([, a]) => a.app)?.[1].app);
            continue;
        }
        const [tag, a] = readMessage(rawTag, rawAttrs);
        if (REPLYABLE.has(tag)) add(tag, others(a), a.app, a.subject);
    }
    return found;
}

/**
 * Turns the typed shorthand in a user message into tags.
 * The line starts with "text" (or "sms"), "dm" or "email", then the recipient, then a colon.
 * A clock time may follow the recipient. Only "dm" takes "on App" (or "via App") and "as @screenname" (or "from @screenname").
 *   text Bob: running late                             -> <sms to="Bob">running late</sms>
 *   text bob: running late                             -> the same, once Bob is a name in the chat's messages
 *   text Bob 10:29PM: hey                              -> <sms to="Bob" time="10:29 PM">hey</sms>
 *   text Bob 22:29: hey                                -> the same
 *   dm Dave on Chatter: 2pm works                     -> <dm to="Dave" app="Chatter">2pm works</dm>
 *   dm Dave on Chatter as @alice: 2pm works    -> <dm from="@alice" to="Dave" app="Chatter">2pm works</dm>
 *   email Frank: Invoice | see attached                 -> <email to="Frank" subject="Invoice">see attached</email>
 *   email: thanks                                       -> a reply to the last email: <email to="Frank" subject="Re: Invoice">thanks</email>
 * A line that is already a tag does not match, so running this twice changes nothing.
 * @param {string} mes Message text.
 * @param {Record<string, string>} [handles] The user's screenname per app, keyed by the app's normalised name.
 *   Used when a line names an app but no "as".
 * @param {(name: string) => string|null} [canon] Returns a known name as the chat writes it, or null.
 * @param {{channels?: string[], userName?: string, last?: object}} [info] What the chat holds so far: its live
 *   chats, the persona name, and `last`, the most recent conversation of each kind (see `conversationsIn`).
 */
export function expandShorthand(mes, handles = {}, canon = () => null, info = {}) {
    if (!mes) return mes;
    // A line with a recipient becomes what a bare line after it in the same message answers.
    const last = { ...info.last };
    const expand = text => text.replace(TYPED_LINE, (line, word, head, body) => {
        const read = readTypedLine(word, head, body, canon, last);
        if (!read) return line;
        last[read.kind] = read;
        const from = read.kind === 'dm' ? read.as || (read.app && handles[normaliseName(read.app)]) || '' : '';
        return buildTag(read.kind, { ...read, from }, read.body);
    }).replace(TYPED_CHAT, (line, word, head, body) => {
        const read = readTypedChat(word, head, info, canon);
        return read ? chatTag(read, body, handles, info) : line;
    });
    // A line inside a tag that is already there belongs to that message, so only the text between tags is read.
    let out = '';
    let at = 0;
    for (const match of tagsIn(mes)) {
        out += expand(mes.slice(at, match.index)) + match[0];
        at = match.index + match[0].length;
    }
    return wrapThreads(mergeChatBlocks(out + expand(mes.slice(at))));
}

/**
 * The screennames the user typed with "as" in a message, before it is expanded. Only these are remembered:
 * a tag the user pasted or quoted teaches nothing, so a contact can never be mistaken for the user.
 * @returns {{app: string, handle: string}[]} `app` is the normalised app name, or "" when no app was named.
 */
export function typedHandles(mes, canon = () => null, info = {}) {
    const found = [];
    if (!mes) return found;
    for (const [, word, head, body] of mes.matchAll(TYPED_LINE)) {
        const read = readTypedLine(word, head, body, canon);
        if (read?.as) found.push({ app: normaliseName(read.app), handle: read.as });
    }
    for (const [, word, head] of mes.matchAll(TYPED_CHAT)) {
        const read = readTypedChat(word, head, info, canon);
        if (read?.as) found.push({ app: channelKey(read.title || read.channel), handle: read.as });
    }
    return found;
}

// ---- Posting in a live chat ----

// "chat: hi", "chat as Ace: hi", "chat Guild Hall: hi", "chat Guild Hall as Ace: hi"
// A kind of game channel can also stand first, without "chat": "party: hi", "whisper Bob: hey".
// The first word must be lowercase. A sentence starts with a capital, so "Party: four of us." is prose.
const TYPED_CHAT = /^(chat|party|guild|yell|reply|whisper)(?: ([^:\n]{1,80}?))?:[ \t]*(\S.*)$/gm;

/**
 * Reads the heading of a typed chat line. Returns null when the line is prose.
 * @param {string} word The line's first word: "chat", or a kind of game channel.
 * @param {string} [head] What stands between that word and the colon.
 */
function readTypedChat(word, head, info, canon) {
    const viaChat = word === 'chat';
    const read = readChatHead(viaChat ? head ?? '' : `${word} ${head ?? ''}`, info);
    if (!read) return null;
    if (read.channel === 'whisper') {
        // Who it is to follows the rule for any recipient, so "whisper it softly: ..." stays prose.
        read.to = recipient(read.to, canon);
        if (!read.to) return null;
    }
    // A line that opens with a kind must be about that kind, or a chat really called that:
    // "Party of five: we set out" is prose.
    if (!viaChat && !read.channel && !(info.channels ?? []).includes(read.title)) return null;
    return read;
}

/** The name a chat name is remembered under, per channel. It shares the store of app handles, marked with "#". */
export const channelKey = title => `#${normaliseName(title)}`;
/** The key for the chat name last used in any channel. */
export const ANY_CHANNEL = '#';

/** The titles of the live chats in a message, in order. */
export function channelsIn(mes) {
    const found = [];
    if (!mes || !mes.includes('<')) return found;
    for (const [, rawTag, rawAttrs] of tagsIn(mes)) {
        const title = rawTag.toLowerCase() === 'chat' && parseAttrs(rawAttrs).title;
        if (title) found.push(title);
    }
    return found;
}

/**
 * Works out which chat a line is for. With no channel named it is the chat most recently seen, which is
 * the usual case: answering in a chat that is already open. A channel that is named must be one already
 * in the chat, a kind of game channel ("party", "guild", "yell", "reply", "whisper to Bob"), or start with a
 * capital letter or "#", so that prose ("Chat with Bob: went fine") is left alone. "in" before it is allowed.
 * @param {string} head What stands between "chat" and the colon.
 * @param {{channels?: string[]}} info The chat titles seen so far, oldest first.
 * @param {boolean} [strict] False for a command, where the channel is given on purpose and taken as it is.
 * @returns {{title?: string, channel?: string, to?: string, as: string}|null} Either a title, or a kind of channel.
 */
function readChatHead(head, info, strict = true) {
    const titles = info.channels ?? [];
    const known = name => titles.findLast(title => normaliseName(title) === normaliseName(name));
    let channel = (head ?? '').trim();
    let as = '';
    if (!known(channel)) {
        const m = channel.match(/^(?:(.*) )?as (\S(?:.*\S)?)$/i);
        if (m) [channel, as] = [(m[1] ?? '').trim(), m[2]];
    }
    channel = channel.replace(/^in /i, '');
    if (!known(channel)) {
        // A kind of game channel, as the /p, /g, /y, /w and /r commands write: "party", "whisper to Bob".
        const game = channel.match(/^(party|guild|yell|reply)$|^whisper(?: to)? (\S(?:.*\S)?)$/i);
        if (game) return { channel: (game[1] ?? 'whisper').toLowerCase(), to: game[2] ?? '', as };
    }
    const title = !channel ? titles.at(-1)
        : known(channel) ?? (!strict || /^(?:#|\p{Lu})/u.test(channel) ? channel : null);
    return title ? { title, as } : null;
}

/**
 * The tag for one line the user posts in a live chat, under the name they use there.
 * A chat is named by its `title` when that is known. A game's chat command knows only the kind of
 * channel, so it writes `channel` (and `to` for a whisper) and claims no title.
 */
function chatTag({ title, channel, to, as }, message, handles, info) {
    const name = as || handles[channelKey(title || channel)] || handles[ANY_CHANNEL] || info.userName || 'Me';
    const attrs = title ? `title="${attr(title)}"` : [`channel="${attr(channel)}"`, to && `to="${attr(to)}"`].filter(Boolean).join(' ');
    return `<chat ${attrs}>${name}: ${message.trim()}</chat>`;
}

/** Lines posted one after another in the same chat become one block. */
export function mergeChatBlocks(text) {
    let out = '';
    let last = 0;
    let open = '';   // the opening tag of the chat block most recently seen
    let closed = -1; // where that block's </chat> ended, in `out`
    for (const m of text.matchAll(/<chat\b(?:[^>"']|"[^"]*"|'[^']*')*>|<\/chat>/gi)) {
        const before = text.slice(last, m.index);
        last = m.index + m[0].length;
        if (m[0].startsWith('</')) { out += before + m[0]; closed = out.length; continue; }
        if (m[0] === open && closed === out.length && before === '\n') {
            out = out.slice(0, closed - '</chat>'.length) + '\n'; // drop the close and this open
        } else {
            out += before + m[0];
        }
        open = m[0];
    }
    return out + text.slice(last);
}

/**
 * Texts or app messages from the same writer to the same people, one line after another, are put in one
 * <thread>: a double text is one conversation, written the way the model is told a conversation is written.
 * A message alone is left as it is, and so is anything already in a <thread>.
 */
export function wrapThreads(text) {
    let out = '';
    let at = 0;
    let run = null; // the messages being gathered: { key, start, count }; `start` is where the first begins in `out`
    const close = () => {
        if (run?.count > 1) out = `${out.slice(0, run.start)}<thread>${out.slice(run.start)}</thread>`;
        run = null;
    };
    for (const m of tagsIn(text)) {
        const between = text.slice(at, m.index);
        at = m.index + m[0].length;
        const a = parseAttrs(m[2]);
        const tag = m[1].toLowerCase();
        const key = MESSAGE_TAGS.has(tag) ? [tag, a.from, a.to, a.app].map(x => normaliseName(x || '')).join('|') : null;
        if (!(run && key === run.key && between === '\n')) {
            close();
            if (key) run = { key, start: out.length + between.length, count: 0 };
        }
        if (run) run.count++;
        out += between + m[0];
    }
    close();
    return out + text.slice(at);
}

/** Every name a message's tags are from or to, as written. Used to recognise a recipient typed in lowercase. */
export function namesIn(mes) {
    const found = [];
    if (!mes || !mes.includes('<')) return found;
    for (const [, rawTag, rawAttrs, rawBody] of tagsIn(mes)) {
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

// Every command has an "eye-" name. Short names are aliases where SillyTavern has no command of that name;
// "chat" is left alone, since many of its own commands contain the word.
// The one-letter names are the chat commands of online games: party, guild, yell, whisper, reply.
const COMMAND_KINDS = {
    sms: 'sms', text: 'sms', dm: 'dm', email: 'email', chat: 'chat',
    party: 'party', guild: 'guild', yell: 'yell', whisper: 'whisper', reply: 'reply',
    p: 'party', g: 'guild', y: 'yell', w: 'whisper', r: 'reply',
};
const COMMAND_NAME = '(?:eye-(?:sms|text|dm|email|chat|party|guild|yell|whisper|reply)|sms|text|dm|email|[pgywr])';
const COMMAND_LINE = new RegExp(String.raw`\r?\n(?=\/${COMMAND_NAME}(?![\w-]))`, 'i');
/** A game's chat commands. Each knows only the kind of channel; the model knows which chat that is. */
const GAME_CHANNELS = new Set(['party', 'guild', 'yell', 'whisper', 'reply']);
const COMMAND_ARG = /^\s*(to|app|as|time|subject|title)=(?:"([^"]*)"|'([^']*)'|(\S+))\s*/i;

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
        const [, name, after] = line.match(new RegExp(String.raw`^\/(${COMMAND_NAME})(?![\w-])([\s\S]*)$`, 'i'));
        const word = name.replace(/^eye-/i, '');
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
 *   /sms on my way                                     -> a reply to the last text: <sms to="Bob">on my way</sms>
 *   /eye-chat as=Ace anyone on tonight?             -> <chat title="(the open chat)">Ace: anyone on tonight?</chat>
 *   /p ready when you are                                -> <chat channel="party">Alice: ready when you are</chat>
 *   /w Bob hey                                         -> <chat channel="whisper" to="Bob">Alice: hey</chat>
 * @param {'sms'|'dm'|'email'} kind
 * @param {string} text Everything after the command and its named arguments.
 * @param {{to?: string, app?: string, as?: string, subject?: string, time?: string}} [named] Named arguments; `to` and `app` replace the leading words.
 *   A `time` that is a clock time is written one way (see clockTime); anything else is kept as given.
 * @param {Record<string, string>} [handles] The user's remembered screenname per app.
 * @param {(name: string) => string|null} [canon] Returns a known name as the chat writes it, or null.
 */
export function commandToTag(kind, text, named = {}, handles = {}, canon = () => null, info = {}) {
    if (kind === 'chat') {
        // /eye-chat [title=...] [as=...] message. With no title it is the chat most recently seen.
        const message = String(text ?? '').trim();
        const read = message && readChatHead(named.title ?? '', info, false);
        return read ? chatTag({ ...read, as: named.as || read.as }, message, handles, info) : '';
    }
    if (GAME_CHANNELS.has(kind)) {
        // /p, /g, /y message; /w Name message; /r message.
        let message = String(text ?? '');
        let to = '';
        if (kind === 'whisper') {
            [to, message] = takeToken(message.replace(/^\s*to\s+/i, ''));
            if (!to) return '';
            to = canon(to) ?? to;
        }
        return message.trim() ? chatTag({ channel: kind, to, as: named.as || '' }, message, handles, info) : '';
    }
    const whole = String(text ?? '');
    let rest = whole;
    let app = kind === 'dm' ? named.app || '' : '';
    if (kind === 'dm' && !app) [app, rest] = takeToken(rest);
    let to = named.to || '';
    const quoted = /^\s*(?:to\s+)?["']/i.test(rest);
    if (!to) [to, rest] = takeToken(rest.replace(/^\s*to\s+/i, ''));
    let subject = kind === 'email' ? named.subject || '' : '';

    // With no to=, the leading word is the recipient when it reads as one: quoted, or by the rule for a typed
    // line (a known name, a capital letter or "@"). When it does not and there is a conversation of this kind
    // to answer, the whole text is a reply to it: "/sms on my way".
    const prev = info.last?.[kind];
    const names = people(to);
    if (prev && !named.to && !quoted && !(names.length && names.every(n => recipient(n, canon)))) {
        [to, rest, app] = [prev.to, whole, named.app || prev.app];
        subject ||= replySubject(prev);
    } else {
        to = names.map(n => canon(n) ?? n).join(', ');
    }
    const body = rest.trim();
    if (!to || !body || (kind === 'dm' && !app)) return '';

    return buildTag(kind, {
        from: kind === 'dm' ? named.as || handles[normaliseName(app)] || '' : '',
        to,
        app: appName(app),
        subject,
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
 * The CSS rule for one picked colour, for a name's key or several. The pick is the bubble background; the text colour on it is
 * black or white, whichever reads better; the name colour for the dark live chat panel is the pick,
 * lightened if it would be too dark to read there.
 */
export function overrideRule(keys, hex) {
    const rgb = hexToRgb(hex);
    const fg = contrast(rgb, [255, 255, 255]) >= contrast(rgb, [0, 0, 0]) ? '#ffffff' : '#000000';
    let nick = rgb;
    for (let i = 0; i < 20 && contrast(nick, CHAT_PANEL) < 4.5; i++) nick = nick.map(v => v + (255 - v) * 0.15);
    return `${fromSelector(keys)} { --element-bg: ${hex}; --element-fg: ${fg}; --element-name: ${fg}; --element-nick: ${rgbToHex(nick)}; }`;
}

const fromSelector = keys => [keys].flat().map(key => `.mes_text [data-from="${key.replace(/["\\]/g, '\\$&')}"]`).join(', ');

/**
 * The CSS rules for the picked colours, and for aliases: all of a person's names are drawn in the main
 * name's colour, picked or automatic.
 * @param {{colors: Record<string, string>, aliases: Record<string, string>}} store
 * @returns {string[]}
 */
export function pickRules({ colors, aliases }) {
    const people = new Map(Object.keys(colors).filter(key => !Object.hasOwn(aliases, key)).map(key => [key, []]));
    for (const [key, main] of Object.entries(aliases)) people.set(main, [...people.get(main) ?? [], key]);
    return [...people].map(([main, others]) => {
        if (/^#[0-9a-f]{6}$/i.test(colors[main] ?? '')) return overrideRule([main, ...others], colors[main]);
        return others.length ? `${fromSelector(others)} { --element-hue: ${hueOf(main) * (360 / HUES)}; }` : '';
    }).filter(Boolean);
}

// ---- App icons ----

/** The app of each conversation in a message that shows one, for the settings panel. */
export function appsIn(mes) {
    if (!mes?.includes('<')) return [];
    const found = [];
    for (const [, rawTag, rawAttrs, rawBody] of tagsIn(mes)) {
        const tag = rawTag.toLowerCase();
        if (tag !== 'thread' && !MESSAGE_TAGS.has(tag)) continue;
        const app = parseAttrs(rawAttrs).app || (tag === 'thread' ? appsIn(rawBody)[0] : '');
        if (app && !isPhone(app)) found.push(app);
    }
    return found;
}

/** An icon as typed: a Font Awesome name ("fa-camera", without any style class), or else its first character. */
export function readIcon(typed = '') {
    const fa = typed.match(/\bfa-(?!(?:solid|brands|regular)\b)[\w-]+/i);
    if (fa) return fa[0].toLowerCase();
    const [first] = new Intl.Segmenter().segment(typed.trim());
    return first?.segment ?? '';
}

/**
 * The CSS rule for one app's icon, which takes the place of the dot before the app's name.
 * @param {string} glyph The character to draw.
 * @param {boolean} [fa] Whether it is a Font Awesome glyph. Brand icons are in a font of their own, which has
 *   no bold; the solid font is tried first.
 */
export function iconRule(key, glyph, fa = false) {
    const app = normaliseName(key);
    if (!app || !glyph) return '';
    const font = fa ? ' font-family: "Font Awesome 6 Free", "Font Awesome 6 Brands"; font-weight: 900; font-synthesis: none;' : '';
    return `.custom-eye-app-${app} .custom-eye-app::before { content: ${JSON.stringify(glyph)}; width: auto; height: auto; border-radius: 0; `
        + `background: none; color: var(--element-app-accent, currentColor); font-size: 1.2em; line-height: 1; letter-spacing: 0;${font} }`;
}

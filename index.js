// EyeMessage: draws <sms>, <dm>, <email>, <letter>, <sign>, <screen> and <chat> tags as styled objects in chat.
// The chat file and the prompt keep the plain tags; only the display changes. The look lives in style.css.
import {
    renderArtifacts, expandShorthand, typedHandles, commandToTag, collectContacts, namesIn, normaliseName, autoHex, overrideRule, INSTRUCTION,
} from './render.js';

const { messageFormatter, eventSource, eventTypes } = SillyTavern.getContext();

/**
 * Saved with SillyTavern's settings, so it applies in every chat.
 * @returns {{colors: Record<string, string>, handles: Record<string, string>, inject: boolean}}
 *   colors: picked colour per normalised contact name. handles: the user's screenname per normalised app name.
 *   inject: whether the model is told about the tags.
 */
function settings() {
    const { extensionSettings } = SillyTavern.getContext();
    const s = extensionSettings.eyeMessage ??= {};
    s.colors ??= {};
    s.handles ??= {};
    s.inject ??= false;
    return s;
}
const save = () => SillyTavern.getContext().saveSettingsDebounced();

/** The persona name and every saved screenname. A message from one of these is drawn as sent, in the user's colour. */
const ownNames = () => new Set([SillyTavern.getContext().name1, ...Object.values(settings().handles)]
    .filter(Boolean).map(normaliseName));

/** Looks a typed name up among the names in this chat's messages, so "bob" is written "Bob". */
function knownNames() {
    const known = new Map();
    for (const message of SillyTavern.getContext().chat) {
        for (const name of namesIn(message?.mes)) if (!known.has(normaliseName(name))) known.set(normaliseName(name), name);
    }
    return name => known.get(normaliseName(name)) ?? null;
}

// ---- Drawing. Registered first, so a fault in the settings panel below cannot stop it. ----
if (!messageFormatter) {
    console.warn('[EyeMessage] This SillyTavern has no messageFormatter hook; tags will not be drawn.');
} else {
    // After the user's regex scripts, before Markdown and the sanitiser.
    messageFormatter.addHook(
        (mes, ctx) => ctx.isReasoning ? mes : renderArtifacts(mes, ownNames(), SillyTavern.getContext().name1),
        { stage: messageFormatter.stage.AFTER_REGEX },
    );
}

// Typed shorthand ("text Bob: running late") becomes a tag before the message is drawn or sent to the model.
eventSource.on(eventTypes.MESSAGE_SENT, async (id) => {
    const { chat, saveChat } = SillyTavern.getContext();
    const message = chat[id];
    if (!message?.is_user || typeof message.mes !== 'string') return;
    const { handles } = settings();
    // A screenname typed once ("dm Dave on Chatter as @alice: ...") is remembered for that app.
    let learned = false;
    const canon = knownNames();
    for (const { app, handle } of typedHandles(message.mes, canon)) {
        if (handles[app] !== handle) { handles[app] = handle; learned = true; }
    }
    if (learned) save();
    const expanded = expandShorthand(message.mes, handles, canon);

    if (expanded === message.mes) return;
    message.mes = expanded;
    // MESSAGE_SENT fires after SillyTavern's own save, so save the rewritten text too.
    await saveChat?.();
});

// ---- Telling the model about the tags ----
// The text goes into the main prompt, in the system section, and is the same every turn.
const IN_PROMPT = 0; // extension_prompt_types.IN_PROMPT in SillyTavern's script.js
function setInstruction() {
    const { setExtensionPrompt, substituteParams } = SillyTavern.getContext();
    setExtensionPrompt('eyemessage', settings().inject ? substituteParams(INSTRUCTION) : '', IN_PROMPT, 0);
}
// SillyTavern clears extension prompts when the chat changes, so it is set again then and before each generation.
eventSource.on(eventTypes.CHAT_CHANGED, setInstruction);
eventSource.on(eventTypes.GENERATION_STARTED, setInstruction);

// ---- Slash commands ----
// /sms, /dm and /email write the tag into the message box, after whatever is already there, so a turn
// can hold prose and several messages. Nothing is sent until the user sends it.

function registerCommands() {
    const { SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } = SillyTavern.getContext();
    const text = (description) => SlashCommandArgument.fromProps({ description, typeList: [ARGUMENT_TYPE.STRING], isRequired: true });
    const named = (name, description) => SlashCommandNamedArgument.fromProps({ name, description, typeList: [ARGUMENT_TYPE.STRING] });

    const run = (kind) => (args, value) => {
        const { handles } = settings();
        const raw = Array.isArray(value) ? value.join(' ') : String(value ?? '');
        const tag = commandToTag(kind, raw, args, handles, knownNames());
        if (!tag) {
            globalThis.toastr?.warning(`/${kind} needs ${kind === 'dm' ? 'an app, ' : ''}a recipient and a message.`, 'EyeMessage');
            return '';
        }
        // A screenname given with as= is remembered for that app, like the typed "as".
        const app = normaliseName(tag.match(/ app="([^"]*)"/)?.[1] ?? '');
        if (kind === 'dm' && args.as && handles[app] !== args.as) { handles[app] = args.as; save(); }

        const box = /** @type {HTMLTextAreaElement} */ (document.getElementById('send_textarea'));
        if (box) {
            box.value = box.value.trim() ? `${box.value.replace(/\s+$/, '')}\n${tag}` : tag;
            box.dispatchEvent(new Event('input', { bubbles: true }));
            box.focus();
        }
        return tag;
    };

    const commands = [
        ['sms', [text('recipient, then the message')], [named('time', 'when it was sent, e.g. 10:29PM or 22:29'), named('to', 'recipient, when the name has spaces')],
            'Writes a phone text into the message box. /text is the same command.',
            ['/sms Bob I\'m gonna be late', '/text "Carol Jones" see you at 9?', '/sms time=10:29PM Bob hey'], ['text']],
        ['dm', [text('app, then recipient(s) separated by commas, then the message')],
            [named('as', 'your screenname on this app; remembered once given'), named('time', 'when it was sent, e.g. 10:29PM or 22:29'), named('app', 'app, when the name has spaces'), named('to', 'recipient(s), when a name has spaces')],
            'Writes a direct message inside an app into the message box. Several recipients make a group thread.',
            ['/dm chatter @Dave_88 on my way', '/dm chatter @Dave_88,@Erin anyone free tonight', '/dm as=@alice chatter @Dave_88 on my way']],
        ['email', [text('recipient, then the message')], [named('subject', 'subject line'), named('time', 'when it was sent, e.g. 10:29PM or 22:29'), named('to', 'recipient, when the name has spaces')],
            'Writes an email into the message box.',
            ['/email subject="Invoice" Frank see attached']],
    ];
    for (const [name, unnamedArgumentList, namedArgumentList, summary, examples, aliases = []] of commands) {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name,
            aliases,
            callback: run(name),
            // Quotes are kept so a quoted recipient ("Carol Jones") can be told from the message.
            rawQuotes: true,
            unnamedArgumentList,
            namedArgumentList,
            returns: 'the tag that was written',
            helpString: `<div>${summary} It is not sent until you send it, so you can add prose or more messages.</div>`
                + `<div><strong>Examples:</strong><ul>${examples.map(e => `<li><pre><code class="language-stscript">${e}</code></pre></li>`).join('')}</ul></div>`,
        }));
    }
}

// ---- Contact colours ----

/** Writes the picked colours as CSS variables. Messages already on screen pick them up without redrawing. */
function applyColours() {
    let style = document.getElementById('eyemessage-colours');
    if (!style) {
        style = document.createElement('style');
        style.id = 'eyemessage-colours';
        document.head.append(style);
    }
    style.textContent = Object.entries(settings().colors)
        .filter(([, hex]) => /^#[0-9a-f]{6}$/i.test(hex))
        .map(([key, hex]) => overrideRule(key, hex)).join('\n');
}

/** Everyone else named in this chat's tags, most frequent first. */
function contactsInChat() {
    const found = new Map();
    const own = ownNames();
    for (const message of SillyTavern.getContext().chat) {
        for (const { name, kind } of collectContacts(message?.mes)) {
            const key = normaliseName(name);
            if (!key || own.has(key)) continue;
            const entry = found.get(key) ?? { key, name, count: 0, sender: false };
            entry.count++;
            entry.sender ||= kind === 'sender';
            found.set(key, entry);
        }
    }
    return [...found.values()].sort((a, b) => b.count - a.count);
}

const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
};

function contactRow(contact, list) {
    const saved = settings().colors;
    const picker = el('input', { type: 'color', value: saved[contact.key] ?? autoHex(contact.name), title: 'Pick a colour' });
    const reset = el('div', { className: 'menu_button', textContent: 'Auto', title: 'Go back to the automatic colour' });
    reset.hidden = !saved[contact.key];
    const change = (hex) => {
        if (hex) saved[contact.key] = hex; else delete saved[contact.key];
        picker.value = hex ?? autoHex(contact.name);
        reset.hidden = !hex;
        applyColours();
        save();
    };
    picker.addEventListener('input', () => change(picker.value));
    reset.addEventListener('click', () => change(null));
    list.append(el('div', { className: 'eyemessage-row' },
        picker,
        el('span', { className: 'eyemessage-name', textContent: contact.name }),
        el('span', { className: 'eyemessage-count', textContent: contact.count ? `×${contact.count}` : 'not in this chat' }),
        reset,
    ));
}

/** Throwaway live-chat handles would swamp the list, so only the most frequent are shown. */
const CHAT_NAMES_SHOWN = 20;

function fillPanel(body) {
    const { colors, handles } = settings();
    const inChat = contactsInChat();
    const known = new Set(inChat.map(c => c.key));
    const elsewhere = Object.keys(colors).filter(key => !known.has(key)).map(key => ({ key, name: key, count: 0 }));
    const groups = [
        ['Message senders', inChat.filter(c => c.sender)],
        ['Live chat names', inChat.filter(c => !c.sender).slice(0, CHAT_NAMES_SHOWN)],
        ['Coloured in other chats', elsewhere],
    ].filter(([, contacts]) => contacts.length);

    body.replaceChildren();
    if (!groups.length) {
        body.append(el('div', {
            className: 'eyemessage-empty',
            textContent: 'No senders in this chat yet. They appear here once a message uses an EyeMessage tag.',
        }));
    }
    for (const [title, contacts] of groups) {
        const list = el('div', { className: 'eyemessage-list' });
        contacts.forEach(contact => contactRow(contact, list));
        body.append(el('div', { className: 'eyemessage-group', textContent: title }), list);
    }

    if (Object.keys(handles).length) {
        const list = el('div', { className: 'eyemessage-list' });
        for (const [app, handle] of Object.entries(handles)) {
            const forget = el('div', { className: 'menu_button', textContent: 'Forget' });
            forget.addEventListener('click', () => { delete handles[app]; save(); fillPanel(body); });
            list.append(el('div', { className: 'eyemessage-row' },
                el('span', { className: 'eyemessage-name', textContent: `${handle} on ${app || 'texts'}` }), forget));
        }
        body.append(el('div', { className: 'eyemessage-group', textContent: 'Your screennames' }), list);
    }

    const refresh = el('div', { className: 'menu_button', textContent: 'Refresh list' });
    refresh.addEventListener('click', () => fillPanel(body));
    body.append(refresh);
}

function addPanel() {
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host) return;
    const body = el('div');
    const inject = el('input', { type: 'checkbox', checked: settings().inject });
    inject.addEventListener('change', () => { settings().inject = inject.checked; setInstruction(); save(); });
    const header = el('div', { className: 'inline-drawer-toggle inline-drawer-header' },
        el('b', { textContent: 'EyeMessage' }),
        el('div', { className: 'inline-drawer-icon fa-solid fa-circle-chevron-down down' }),
    );
    host.append(el('div', { className: 'eyemessage-settings' },
        el('div', { className: 'inline-drawer' }, header,
            el('div', { className: 'inline-drawer-content' },
                el('label', { className: 'checkbox_label', title: 'Adds the tag instructions to the system prompt in every chat.' },
                    inject, el('span', { textContent: 'Tell the model about these tags' })),
                el('small', { textContent: 'A colour for each contact. It applies in every chat where that name appears.' }),
                body,
            ),
        ),
    ));
    // The chat can be large, so it is scanned when the panel is opened or the chat changes, not on every message.
    header.addEventListener('click', () => fillPanel(body));
    eventSource.on(eventTypes.CHAT_CHANGED, () => fillPanel(body));
    fillPanel(body);
}

try {
    registerCommands();
} catch (error) {
    console.error('[EyeMessage] The slash commands failed to register; tags are still drawn.', error);
}

try {
    setInstruction();
    applyColours();
    addPanel();
} catch (error) {
    console.error('[EyeMessage] The settings panel failed to load; tags are still drawn.', error);
}

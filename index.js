// EyeMessage: draws message and object tags (<thread>, <sms>, <dm>, <chat>, <email>, <letter>, <sign>, <screen>,
// <system_window>) as styled objects in chat. The tags themselves are listed in render.js.
// The chat file and the prompt keep the plain tags; only the display changes. The look lives in style.css.
import {
    renderArtifacts, expandShorthand, typedHandles, conversationsIn, commandToTag, splitCommands, collectContacts, namesIn, channelsIn, channelKey, mergeChatBlocks, wrapThreads, ANY_CHANNEL, normaliseName, autoHex, overrideRule,
    instructionFor, taughtByDefault, TAGS, TAG_LABELS,
} from './render.js';
import { emptyStore, complete, personaIn, learnHandle, forgetHandle, rememberNames, mergeStores, copyStore, takeLegacy } from './store.js';

const { messageFormatter, eventSource, eventTypes } = SillyTavern.getContext();

// ---- Where things are remembered ----
// Colours, the user's accounts and whether the instructions are injected are kept with the chat, in its metadata.
// A character's chats can share one set instead; that set is kept in the extension's settings under the
// character, not in the card, so sharing a card does not carry it along. Nothing is kept for all chats.

const CHAT_KEY = 'eyemessage';

/** What the open chat is, and which set applies to it. */
function scope() {
    const ctx = SillyTavern.getContext();
    const ext = ctx.extensionSettings.eyeMessage ??= {};
    ext.shared ??= {};
    ext.characters ??= {};
    if (!ctx.getCurrentChatId?.()) return { ctx, ext, kind: 'none', key: null, title: '' };
    const character = ctx.characters?.[ctx.characterId];
    const group = ctx.groupId ? ctx.groups?.find(g => g.id === ctx.groupId) : null;
    const key = ctx.groupId ? `group:${ctx.groupId}` : character?.avatar ? `character:${character.avatar}` : null;
    const title = group?.name ?? character?.name ?? '';
    return { ctx, ext, key, title, kind: key && ext.shared[key] ? 'character' : 'chat' };
}

/** The set that applies now, for reading. Reading never creates or saves anything. */
function store() {
    const s = scope();
    const found = s.kind === 'character' ? s.ext.characters[s.key] : s.kind === 'chat' ? s.ctx.chatMetadata[CHAT_KEY] : null;
    return found ? complete(found) : emptyStore();
}

/** Changes the set that applies now and saves it where it lives. Does nothing when no chat is open. */
function edit(change) {
    const s = scope();
    if (s.kind === 'none') return;
    if (s.kind === 'character') {
        change(complete(s.ext.characters[s.key] ??= emptyStore()));
        s.ctx.saveSettingsDebounced();
    } else {
        change(complete(s.ctx.chatMetadata[CHAT_KEY] ??= emptyStore()));
        s.ctx.saveMetadataDebounced();
    }
}

const personaName = () => SillyTavern.getContext().name1 || '';
/** The accounts of the persona being played, in the set that applies now. */
const mine = () => personaIn(store(), personaName());

/** The persona name and every handle it has sent as. A message from one of these is drawn as sent. */
const ownNames = () => new Set([personaName(), ...mine().accounts].filter(Boolean).map(normaliseName));

/**
 * Looks a typed name up among the names in this chat's messages, so "bob" is written "Bob".
 * When the character's chats share a set, names seen in its other chats count too.
 */
function knownNames() {
    const known = new Map(Object.entries(store().names));
    for (const message of SillyTavern.getContext().chat) {
        for (const name of namesIn(message?.mes)) if (!known.has(normaliseName(name))) known.set(normaliseName(name), name);
    }
    return name => known.get(normaliseName(name)) ?? null;
}

/**
 * What a typed line needs to know about the chat: the live chats seen so far, oldest first, the persona's
 * name, and the most recent conversation of each kind, which a line with no recipient answers.
 */
const chatInfo = () => {
    const { chat } = SillyTavern.getContext();
    const own = ownNames();
    return {
        channels: chat.flatMap(message => channelsIn(message?.mes)),
        userName: personaName(),
        last: Object.fromEntries(chat.flatMap(message => conversationsIn(message?.mes, own)).map(c => [c.kind, c])),
    };
};

/** Remembers the name the user posted under in a live chat: for that channel, and as the one last used. */
const learnChatName = (store, title, name) => {
    learnHandle(store, personaName(), channelKey(title), name);
    learnHandle(store, personaName(), ANY_CHANNEL, name);
};

/** Turns sharing on or off for the open chat's character. Nothing is lost either way. */
function setShared(on) {
    const s = scope();
    if (!s.key) return;
    if (on) {
        // The chat's set joins the character's.
        const shared = complete(s.ext.characters[s.key] ??= emptyStore());
        if (s.ctx.chatMetadata[CHAT_KEY]) mergeStores(shared, copyStore(s.ctx.chatMetadata[CHAT_KEY]));
        s.ext.shared[s.key] = true;
    } else {
        // The chat takes a copy of the character's set and keeps its own from here on.
        if (s.ext.characters[s.key]) s.ctx.chatMetadata[CHAT_KEY] = copyStore(s.ext.characters[s.key]);
        delete s.ext.shared[s.key];
        s.ctx.saveMetadataDebounced();
    }
    s.ctx.saveSettingsDebounced();
}

/** While a character's chats share a set, the names used in each chat are added to it. */
function collectNames() {
    if (scope().kind !== 'character') return;
    const names = SillyTavern.getContext().chat.flatMap(message => namesIn(message?.mes));
    if (names.some(name => normaliseName(name) && !store().names[normaliseName(name)])) edit(s => rememberNames(s, names));
}

/** Earlier versions kept one set for every chat. It is moved into the first chat opened, once. */
function moveLegacy() {
    const s = scope();
    if (s.kind === 'none') return;
    const old = takeLegacy(s.ext, personaName());
    if (!old) return;
    edit(current => mergeStores(current, old));
    s.ctx.saveSettingsDebounced();
}

// ---- Drawing. Registered first, so a fault further down cannot stop it. ----
if (!messageFormatter) {
    console.warn('[EyeMessage] This SillyTavern has no messageFormatter hook; tags will not be drawn.');
} else {
    // After the user's regex scripts, before Markdown and the sanitiser.
    messageFormatter.addHook(
        (mes, ctx) => ctx.isReasoning ? mes : renderArtifacts(mes, ownNames(), personaName()),
        { stage: messageFormatter.stage.AFTER_REGEX },
    );
}

// Typed shorthand ("text Bob: running late") becomes a tag before the message is drawn or sent to the model.
eventSource.on(eventTypes.MESSAGE_SENT, async (id) => {
    const { chat, saveChat } = SillyTavern.getContext();
    const message = chat[id];
    if (!message?.is_user || typeof message.mes !== 'string') return;
    const canon = knownNames();
    // A handle typed once ("dm Dave on Chatter as @alice: ...") is remembered as one of the user's accounts.
    const info = chatInfo();
    const typed = typedHandles(message.mes, canon, info);
    if (typed.length) {
        edit(s => typed.forEach(({ app, handle }) => {
            learnHandle(s, personaName(), app, handle);
            if (app.startsWith('#')) learnHandle(s, personaName(), ANY_CHANNEL, handle);
        }));
    }
    const expanded = expandShorthand(message.mes, mine().handles, canon, info);

    if (expanded !== message.mes) {
        message.mes = expanded;
        // MESSAGE_SENT fires after SillyTavern's own save, so save the rewritten text too.
        await saveChat?.();
    }
    collectNames();
});
eventSource.on(eventTypes.MESSAGE_RECEIVED, collectNames);

// ---- Telling the model about the tags ----
// The text goes into the main prompt, in the system section, and is the same every turn.
const IN_PROMPT = 0; // extension_prompt_types.IN_PROMPT in SillyTavern's script.js
function setInstruction() {
    const { setExtensionPrompt, substituteParams } = SillyTavern.getContext();
    const { inject, tags } = store();
    const taught = TAGS.filter(tag => tags[tag] ?? taughtByDefault(tag));
    setExtensionPrompt('eyemessage', inject ? substituteParams(instructionFor(taught)) : '', IN_PROMPT, 0);
}
// SillyTavern clears extension prompts when the chat changes, so it is set again then and before each generation.
eventSource.on(eventTypes.GENERATION_STARTED, setInstruction);

// ---- Slash commands ----
// /sms, /dm and /email write the tag into the message box, after whatever is already there, so a turn
// can hold prose and several messages. Nothing is sent until the user sends it.

function registerCommands() {
    const { SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } = SillyTavern.getContext();
    const text = (description) => SlashCommandArgument.fromProps({ description, typeList: [ARGUMENT_TYPE.STRING], isRequired: true });
    const named = (name, description) => SlashCommandNamedArgument.fromProps({ name, description, typeList: [ARGUMENT_TYPE.STRING] });

    const run = (kind) => (args, value) => {
        const canon = knownNames();
        const info = chatInfo();
        const raw = Array.isArray(value) ? value.join(' ') : String(value ?? '');
        // Several commands written one per line arrive as one; each line becomes its own tag.
        const tags = [];
        for (const command of splitCommands(kind, raw, args)) {
            const tag = commandToTag(command.kind, command.text, command.named, mine().handles, canon, info);
            if (!tag) {
                globalThis.toastr?.warning(`/eye-${command.kind} is missing something: see its help.`, 'EyeMessage');
                continue;
            }
            // A name given with as= is remembered, like the typed "as": per app for a direct message, per channel for a chat.
            if (command.named.as && command.kind === 'dm') {
                const app = normaliseName(tag.match(/ app="([^"]*)"/)?.[1] ?? '');
                edit(s => learnHandle(s, personaName(), app, command.named.as));
            } else if (command.named.as && tag.startsWith('<chat')) {
                const title = tag.match(/^<chat (?:title|channel)="([^"]*)"/)?.[1] ?? '';
                edit(s => learnChatName(s, title, command.named.as));
            }
            tags.push(tag);
            // A command with no recipient on a later line answers this one.
            Object.assign(info.last, Object.fromEntries(conversationsIn(tag, ownNames()).map(c => [c.kind, c])));
        }
        if (!tags.length) return '';

        const written = wrapThreads(mergeChatBlocks(tags.join('\n')));
        const box = /** @type {HTMLTextAreaElement} */ (document.getElementById('send_textarea'));
        if (box) {
            box.value = box.value.trim() ? `${box.value.replace(/\s+$/, '')}\n${written}` : written;
            box.dispatchEvent(new Event('input', { bubbles: true }));
            box.focus();
        }
        return written;
    };

    const REPLY_HELP = 'The first word is read as the recipient when it is a name already in the chat\'s messages, starts with a capital letter or @, or is in quotes. '
        + 'Otherwise the whole text is a reply to the most recent conversation of this kind; with none to answer, the first word is the recipient.';
    const time = named('time', 'when it was sent, e.g. 10:29PM or 22:29');
    const as = named('as', 'the name you post under; remembered once given');
    // [kind, short names, unnamed arguments, named arguments, what it does, examples]
    const commands = [
        ['sms', ['sms', 'text', 'eye-text'], [text('recipient, then the message; or only the message, to reply to the last text')], [time, named('to', 'recipient, when the first word would not be read as one')],
            `Writes a phone text into the message box. ${REPLY_HELP}`,
            ['/sms Bob I\'m gonna be late', '/text "Carol Jones" see you at 9?', '/sms time=10:29PM Bob hey', '/sms on my way', '/sms to=bob hey']],
        ['dm', ['dm'], [text('app, then recipient(s) separated by commas, then the message; or only the message, to reply to the last direct message')],
            [named('as', 'your handle on this app; remembered once given'), time, named('app', 'app, when the name has spaces'), named('to', 'recipient(s), when the word after the app would not be read as one')],
            `Writes a direct message inside an app into the message box. Several recipients make a group thread. ${REPLY_HELP}`,
            ['/dm chatter @Dave_88 on my way', '/dm chatter @Dave_88,@Erin anyone free tonight', '/dm as=@alice chatter @Dave_88 on my way', '/dm the cafe']],
        ['email', ['email'], [text('recipient, then the message; or only the message, to reply to the last email')], [named('subject', 'subject line'), time, named('to', 'recipient, when the first word would not be read as one')],
            `Writes an email into the message box. ${REPLY_HELP}`,
            ['/email subject="Invoice" Frank see attached', '/email thanks, got it']],
        ['chat', [], [text('the message')], [as, named('title', 'the channel; left out, it is the live chat most recently seen')],
            'Writes a line you post in a live chat into the message box.',
            ['/eye-chat anyone on tonight?', '/eye-chat as=Ace anyone on tonight?', '/eye-chat title="Guild Hall" selling ore']],
        ['party', ['p'], [text('the message')], [as], 'Writes a line in party chat into the message box.', ['/p ready when you are']],
        ['guild', ['g'], [text('the message')], [as], 'Writes a line in guild chat into the message box.', ['/g anyone up for the cellar?']],
        ['yell', ['y'], [text('the message')], [as], 'Writes a line you yell to everyone nearby into the message box.', ['/y selling ore, cheap']],
        ['whisper', ['w'], [text('who to, then the message')], [as], 'Writes a private whisper to one player into the message box.', ['/w Bob hey']],
        ['reply', ['r'], [text('the message')], [as], 'Writes a reply to the last whisper into the message box.', ['/r on my way']],
    ];
    for (const [kind, shortNames, unnamedArgumentList, namedArgumentList, summary, examples] of commands) {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            // Every command is /eye-<kind>, so typing "/eye" lists them all.
            name: `eye-${kind}`,
            // A short name is only taken when nothing else has it.
            aliases: shortNames.filter(short => !Object.hasOwn(SlashCommandParser.commands ?? {}, short)),
            callback: run(kind),
            // Quotes are kept so a quoted recipient ("Carol Jones") can be told from the message.
            rawQuotes: true,
            unnamedArgumentList,
            namedArgumentList,
            returns: 'the tag or tags that were written',
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
    style.textContent = Object.entries(store().colors)
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
    const saved = store().colors[contact.key];
    const picker = el('input', { type: 'color', value: saved ?? autoHex(contact.name), title: 'Pick a colour' });
    const reset = el('div', { className: 'menu_button', textContent: 'Auto', title: 'Go back to the automatic colour' });
    reset.hidden = !saved;
    const change = (hex) => {
        edit((s) => { if (hex) s.colors[contact.key] = hex; else delete s.colors[contact.key]; });
        picker.value = hex ?? autoHex(contact.name);
        reset.hidden = !hex;
        applyColours();
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
    const { colors, names } = store();
    const { accounts, handles } = mine();
    const inChat = contactsInChat();
    const known = new Set(inChat.map(c => c.key));
    const elsewhere = Object.keys(colors).filter(key => !known.has(key)).map(key => ({ key, name: names[key] ?? key, count: 0 }));
    const groups = [
        ['Message senders', inChat.filter(c => c.sender)],
        ['Live chat names', inChat.filter(c => !c.sender).slice(0, CHAT_NAMES_SHOWN)],
        ['Coloured, not in this chat', elsewhere],
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

    if (accounts.length) {
        const list = el('div', { className: 'eyemessage-list' });
        for (const handle of accounts) {
            const defaultOn = Object.keys(handles).filter(app => handles[app] === handle).map(app => app || 'texts');
            const forget = el('div', { className: 'menu_button', textContent: 'Forget' });
            forget.addEventListener('click', () => { edit(s => forgetHandle(s, personaName(), handle)); fillPanel(body); });
            list.append(el('div', { className: 'eyemessage-row' },
                el('span', { className: 'eyemessage-name', textContent: handle }),
                el('span', { className: 'eyemessage-count', textContent: defaultOn.length ? `default on ${defaultOn.join(', ')}` : '' }),
                forget));
        }
        body.append(el('div', { className: 'eyemessage-group', textContent: `Your accounts as ${personaName()}` }), list);
    }

    const refresh = el('div', { className: 'menu_button', textContent: 'Refresh list' });
    refresh.addEventListener('click', () => fillPanel(body));
    body.append(refresh);
}

function addPanel() {
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host) return () => {};
    const body = el('div');
    const where = el('small');
    const inject = el('input', { type: 'checkbox' });
    // One box per kind of object: which ones the instructions cover. Every kind is drawn either way.
    const taughtBoxes = TAGS.map((tag) => {
        const box = el('input', { type: 'checkbox' });
        box.addEventListener('change', () => { edit((s) => { s.tags[tag] = box.checked; }); setInstruction(); });
        return { tag, box };
    });
    const taughtList = el('div', { className: 'eyemessage-taught' },
        ...taughtBoxes.map(({ tag, box }) => el('label', { className: 'checkbox_label' }, box, el('span', { textContent: TAG_LABELS[tag] ?? tag }))));
    const share = el('input', { type: 'checkbox' });
    const header = el('div', { className: 'inline-drawer-toggle inline-drawer-header' },
        el('b', { textContent: 'EyeMessage' }),
        el('div', { className: 'inline-drawer-icon fa-solid fa-circle-chevron-down down' }),
    );
    host.append(el('div', { className: 'eyemessage-settings' },
        el('div', { className: 'inline-drawer' }, header,
            el('div', { className: 'inline-drawer-content' },
                el('label', { className: 'checkbox_label', title: 'Adds the instructions for writing messages as tags to the system prompt. On unless you turn it off.' },
                    inject, el('span', { textContent: 'Inject message template instructions into system prompt' })),
                taughtList,
                el('label', { className: 'checkbox_label', title: 'Off: this chat keeps its own colours and accounts, and its branches inherit them. On: every chat of this character uses one set.' },
                    share, el('span', { textContent: 'Share with all of this character\'s chats' })),
                where,
                body,
            ),
        ),
    ));

    /** Shows the set that applies to the open chat. */
    const refresh = () => {
        const s = scope();
        inject.checked = store().inject;
        share.checked = s.kind === 'character';
        inject.disabled = s.kind === 'none';
        for (const { tag, box } of taughtBoxes) {
            box.checked = store().tags[tag] ?? taughtByDefault(tag);
            box.disabled = s.kind === 'none' || !inject.checked;
        }
        share.disabled = !s.key;
        where.textContent = s.kind === 'none' ? 'Open a chat to set colours and accounts.'
            : s.kind === 'character' ? `Colours and accounts are shared by all chats of ${s.title}.`
                : 'Colours and accounts are kept in this chat.';
        fillPanel(body);
    };
    inject.addEventListener('change', () => { edit((s) => { s.inject = inject.checked; }); setInstruction(); refresh(); });
    share.addEventListener('change', () => { setShared(share.checked); collectNames(); onChatChanged(); });
    // The chat can be large, so it is scanned when the panel is opened or the chat changes, not on every message.
    header.addEventListener('click', refresh);
    refresh();
    return refresh;
}

let refreshPanel = () => {};

/** Everything that depends on which chat is open. */
function onChatChanged() {
    moveLegacy();
    collectNames();
    setInstruction();
    applyColours();
    refreshPanel();
}
eventSource.on(eventTypes.CHAT_CHANGED, () => {
    try {
        onChatChanged();
    } catch (error) {
        console.error('[EyeMessage] Could not load this chat\'s colours and accounts; tags are still drawn.', error);
    }
});

try {
    registerCommands();
} catch (error) {
    console.error('[EyeMessage] The slash commands failed to register; tags are still drawn.', error);
}

try {
    refreshPanel = addPanel();
    onChatChanged();
} catch (error) {
    console.error('[EyeMessage] The settings panel failed to load; tags are still drawn.', error);
}

// EyeMessage: draws message and object tags (<thread>, <sms>, <dm>, <chat>, <email>, <letter>, <sign>, <screen>)
// as styled objects in chat. The tags themselves are listed in render.js.
// The chat file and the prompt keep the plain tags; only the display changes. The look lives in style.css.
import {
    renderArtifacts, expandShorthand, typedHandles, conversationsIn, commandToTag, splitCommands, collectContacts, namesIn, channelsIn, channelKey, mergeChatBlocks, wrapThreads, ANY_CHANNEL, normaliseName, autoHex, pickRules, appsIn, readIcon, iconRule,
    instructionFor, TAGS, TAG_LABELS,
} from './render.js';
import { allowOutsideImages } from './html.js';
import { setChatStyles, stylesInChat, stylesForReply } from './structure.js';
import { emptyStore, complete, personaIn, learnHandle, forgetHandle, rememberNames, mergeStores, copyStore, takeLegacy, personOf, linkAlias, unlinkAlias } from './store.js';

const { messageFormatter, eventSource, eventTypes } = SillyTavern.getContext();
// SillyTavern's own rule for outside media in the open chat, which it does not put in the context. If it moves,
// images from other sites stay blocked.
const { isExternalMediaAllowed = () => false } = await import('../../../chats.js').catch(() => ({}));

// ---- Where things are remembered ----
// Colours, aliases, app icons, the user's accounts and whether the instructions are injected are kept with the chat, in its metadata.
// A character's chats can share one set instead; that set is kept in the extension's settings under the
// character, not in the card, so sharing a card does not carry it along. Only saved styles are kept for all chats.

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
// Saved styles are kept for every chat, in the extension's settings: any message may use one.
const savedStyles = () => scope().ext.styles ?? '';
/** The Author's Notes in effect: the chat's own and its character's. */
function authorsNotes() {
    const ctx = SillyTavern.getContext();
    const avatar = ctx.characters?.[ctx.characterId]?.avatar?.replace(/\.[^.]*$/, '');
    return [ctx.chatMetadata?.note_prompt, ...(ctx.extensionSettings.note?.chara ?? []).filter(note => avatar && note.name === avatar).map(note => note.prompt)]
        .filter(Boolean);
}

// The saved styles, then those defined by <styles> anywhere in the open chat, for any message to use. Read again
// when the chat, its length, a message or the saved styles change.
let stylesRead = '';
function readChatStyles() {
    const { chatId, chat = [] } = SillyTavern.getContext();
    const saved = savedStyles();
    const key = `${chatId}:${chat.length}:${saved}`;
    if (key === stylesRead) return;
    stylesRead = key;
    setChatStyles(stylesInChat(chat, saved));
}
for (const event of ['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_UPDATED']) {
    if (eventTypes[event]) eventSource.on(eventTypes[event], () => { stylesRead = ''; });
}
if (!messageFormatter) {
    console.warn('[EyeMessage] This SillyTavern has no messageFormatter hook; tags will not be drawn.');
} else {
    // After the user's regex scripts, before Markdown and the sanitiser.
    messageFormatter.addHook(
        (mes, ctx) => {
            if (ctx.isReasoning) return mes;
            allowOutsideImages(isExternalMediaAllowed());
            readChatStyles();
            return renderArtifacts(mes, ownNames(), personaName());
        },
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
function setInstruction(type) {
    const { setExtensionPrompt, substituteParams } = SillyTavern.getContext();
    const { inject, tags, hud } = store();
    const taught = TAGS.filter(tag => tags[tag] ?? true);
    const styles = [...stylesForReply(SillyTavern.getContext().chat ?? [], type, savedStyles(), authorsNotes()).keys()];
    setExtensionPrompt('eyemessage', inject ? substituteParams(instructionFor(taught, { hud, styles })) : '', IN_PROMPT, 0);
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

// ---- Contact colours, aliases and app icons ----

/** The character an icon is drawn with, or "" for a Font Awesome name that SillyTavern's icons do not have. */
function glyphOf(icon) {
    if (!icon.startsWith('fa-')) return icon;
    const probe = el('i', { className: icon });
    document.body.append(probe);
    const content = getComputedStyle(probe, '::before').content;
    probe.remove();
    return content.match(/^"(.+)"$/)?.[1] ?? '';
}

/** Writes the picked colours and icons as CSS. Messages already on screen pick them up without redrawing. */
function applyPicks() {
    let style = document.getElementById('eyemessage-colours');
    if (!style) {
        style = document.createElement('style');
        style.id = 'eyemessage-colours';
        document.head.append(style);
    }
    style.textContent = [
        ...pickRules(store()),
        ...Object.entries(store().icons).map(([key, saved]) => {
            const icon = readIcon(saved);
            return iconRule(key, glyphOf(icon), icon.startsWith('fa-'));
        }),
    ].join('\n');
}

/**
 * Everyone else with a colour in this chat's tags: those with a picked one, then the most frequent, then the
 * latest. A person's aliases are counted with them; `aliases` is each one's name by its key.
 */
function contactsInChat() {
    const found = new Map();
    const own = ownNames();
    const current = store();
    const contact = key => found.get(key) ?? found.set(key, { key, name: current.names[key] ?? key, count: 0, at: -1, sender: false, aliases: new Map() }).get(key);
    for (const [at, message] of SillyTavern.getContext().chat.entries()) {
        for (const { name, kind } of collectContacts(message?.mes)) {
            const key = normaliseName(name);
            if (!key || own.has(key)) continue;
            const person = personOf(current, key);
            const entry = contact(person);
            if (key === person && !entry.seen) Object.assign(entry, { name, seen: true });
            if (key !== person && !entry.aliases.has(key)) entry.aliases.set(key, name);
            entry.count++;
            entry.at = at;
            entry.sender ||= kind === 'sender';
        }
    }
    // Colours and aliases for names that are not in this chat.
    for (const key of Object.keys(current.colors)) if (personOf(current, key) === key) contact(key);
    for (const [key, person] of Object.entries(current.aliases)) {
        const { aliases } = contact(person);
        if (!aliases.has(key)) aliases.set(key, current.names[key] ?? key);
    }
    const picked = entry => Number(Object.hasOwn(current.colors, entry.key));
    return [...found.values()].sort((a, b) => picked(b) - picked(a) || b.count - a.count || b.at - a.at);
}

const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
};

/**
 * @param {(change: (s: object) => void) => void} relist Changes the set and draws the list again.
 * @param {(typed: string) => string|null} find The key of the listed contact with this name.
 */
function contactRow(contact, list, relist, find) {
    const saved = store().colors[contact.key];
    const picker = el('input', { type: 'color', value: saved ?? autoHex(contact.key), title: 'Pick a colour' });
    const reset = el('div', { className: 'menu_button', textContent: 'Auto', title: 'Go back to the automatic colour' });
    reset.hidden = !saved;
    const change = (hex) => {
        edit((s) => { if (hex) s.colors[contact.key] = hex; else delete s.colors[contact.key]; });
        picker.value = hex ?? autoHex(contact.key);
        reset.hidden = !hex;
        applyPicks();
    };
    picker.addEventListener('input', () => change(picker.value));
    reset.addEventListener('click', () => change(null));

    const same = el('input', { type: 'text', className: 'text_pole eyemessage-same', placeholder: 'Same person as…', hidden: true });
    same.setAttribute('list', 'eyemessage-people');
    same.addEventListener('change', () => {
        const typed = same.value.trim();
        const main = find(typed);
        if (main && main !== contact.key) relist(s => linkAlias(s, contact.key, main));
        else if (typed) globalThis.toastr?.warning(main ? 'That is the same row.' : `No one called ${typed} is in the list.`, 'EyeMessage');
    });
    // Some browsers report a suggestion that was picked as input only, until the box is left.
    same.addEventListener('input', (event) => {
        const picked = !event.inputType || event.inputType === 'insertReplacementText';
        if (picked && find(same.value.trim())) same.dispatchEvent(new Event('change'));
    });
    const link = el('div', { className: 'menu_button fa-solid fa-link', title: 'This is the same person as another in the list' });
    link.addEventListener('click', () => { same.hidden = !same.hidden; if (!same.hidden) same.focus(); });

    list.append(el('div', { className: 'eyemessage-row' },
        picker,
        el('span', { className: 'eyemessage-name', textContent: contact.name }),
        el('span', { className: 'eyemessage-count', textContent: contact.count ? `×${contact.count}` : 'not in this chat' }),
        reset,
        link,
    ), same);
    if (!contact.aliases.size) return;
    list.append(el('div', { className: 'eyemessage-aliases' }, ...[...contact.aliases].map(([key, name]) => {
        const part = el('button', { type: 'button', textContent: '✕', title: `${name} is someone else` });
        part.addEventListener('click', () => relist(s => unlinkAlias(s, key)));
        return el('span', {}, name, part);
    })));
}

/** Every app named in this chat's conversations, most used first, then those with an icon that are not in it. */
function appsToList() {
    const found = new Map();
    for (const message of SillyTavern.getContext().chat) {
        for (const name of appsIn(message?.mes)) {
            const key = normaliseName(name);
            if (!key) continue;
            const entry = found.get(key) ?? { key, name, count: 0 };
            entry.count++;
            found.set(key, entry);
        }
    }
    const elsewhere = Object.keys(store().icons).filter(key => !found.has(key)).map(key => ({ key, name: key, count: 0 }));
    return [...[...found.values()].sort((a, b) => b.count - a.count), ...elsewhere];
}

function appRow(app, list) {
    const input = el('input', {
        type: 'text', className: 'text_pole eyemessage-icon-box', placeholder: 'emoji or fa-name',
        title: 'An emoji, or a Font Awesome name such as fa-camera or fa-instagram. Empty for the dot.',
    });
    const preview = el('span', { className: 'eyemessage-icon' });
    const pick = el('div', { className: 'menu_button fa-solid fa-icons', title: 'Pick from SillyTavern\'s icons' });
    const show = () => {
        const icon = readIcon(store().icons[app.key]);
        input.value = icon;
        preview.className = icon.startsWith('fa-') ? `eyemessage-icon eyemessage-fa ${icon}` : 'eyemessage-icon';
        preview.textContent = icon.startsWith('fa-') ? '' : icon;
    };
    const change = (typed) => {
        const icon = readIcon(typed);
        if (icon && !glyphOf(icon)) {
            globalThis.toastr?.warning(`SillyTavern has no icon called ${icon}.`, 'EyeMessage');
        } else {
            edit((s) => { if (icon) s.icons[app.key] = icon; else delete s.icons[app.key]; });
            applyPicks();
        }
        show();
    };
    input.addEventListener('change', () => change(input.value));
    pick.addEventListener('click', async () => {
        // Imported when used, so that a SillyTavern without it only loses this button.
        const { showFontAwesomePicker } = await import('../../../utils.js');
        const picked = await showFontAwesomePicker();
        if (picked !== null) change(picked);
    });
    show();
    list.append(el('div', { className: 'eyemessage-row' },
        preview,
        el('span', { className: 'eyemessage-name', textContent: app.name }),
        el('span', { className: 'eyemessage-count', textContent: `×${app.count}`, title: 'Conversations in this chat' }),
        input,
        pick,
    ));
}

/** Throwaway live-chat handles would swamp the list, so only the most frequent are shown. */
const CHAT_NAMES_SHOWN = 20;
/** A long chat has dozens of contacts, most of them seen once. The rest of a group is folded under these. */
const ROWS_SHOWN = 8;

function fillPanel(body) {
    const { accounts, handles } = mine();
    const contacts = contactsInChat();
    const inChat = contacts.filter(c => c.count);
    const groups = [
        ['Message senders', inChat.filter(c => c.sender)],
        ['Live chat names', inChat.filter(c => !c.sender).slice(0, CHAT_NAMES_SHOWN)],
        ['Not in this chat', contacts.filter(c => !c.count)],
    ].filter(([, listed]) => listed.length);
    const listed = groups.flatMap(([, group]) => group);
    const find = typed => listed.find(c => c.key === normaliseName(typed) || c.aliases.has(normaliseName(typed)))?.key ?? null;
    const relist = (change) => { edit(change); applyPicks(); fillPanel(body); };
    // A fold that was open stays open when the list is drawn again.
    const open = new Set([...body.querySelectorAll('details[open]')].map(fold => fold.dataset.group));

    body.replaceChildren(el('datalist', { id: 'eyemessage-people' }, ...listed.map(c => el('option', { value: c.name }))));
    if (!groups.length) {
        body.append(el('div', {
            className: 'eyemessage-empty',
            textContent: 'No senders yet.',
        }));
    }
    for (const [title, group] of groups) {
        const list = el('div', { className: 'eyemessage-list' });
        const shown = group.length > ROWS_SHOWN + 2 ? ROWS_SHOWN : group.length; // a fold of one or two saves nothing
        group.slice(0, shown).forEach(contact => contactRow(contact, list, relist, find));
        body.append(el('div', { className: 'eyemessage-group', textContent: title }), list);
        const rest = group.slice(shown);
        if (!rest.length) continue;
        const more = el('div', { className: 'eyemessage-list' });
        rest.forEach(contact => contactRow(contact, more, relist, find));
        const fold = el('details', { className: 'eyemessage-more', open: open.has(title) }, el('summary', { textContent: `${rest.length} more` }), more);
        fold.dataset.group = title;
        body.append(fold);
    }

    const apps = appsToList();
    if (apps.length) {
        const list = el('div', { className: 'eyemessage-list' });
        apps.forEach(app => appRow(app, list));
        body.append(el('div', { className: 'eyemessage-group', textContent: 'Apps' }), list);
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

    const refresh = el('div', { className: 'menu_button', textContent: 'Refresh' });
    refresh.addEventListener('click', () => fillPanel(body));
    body.append(refresh);
}

function addPanel() {
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host) return () => {};
    const body = el('div');
    const where = el('small');
    const inject = el('input', { type: 'checkbox' });
    const hud = el('input', { type: 'checkbox' });
    hud.addEventListener('change', () => { edit((s) => { s.hud = hud.checked; }); setInstruction(); });
    const hudLabel = el('label', { className: 'checkbox_label', title: 'Adds a styled HUD screen to the prompt (about 1,100 characters).' },
        hud, el('span', { textContent: 'HUD example' }));
    // One box per kind of object: which ones the instructions cover. Every kind is drawn either way.
    const taughtBoxes = TAGS.map((tag) => {
        const box = el('input', { type: 'checkbox' });
        box.addEventListener('change', () => {
            edit((s) => { s.tags[tag] = box.checked; });
            setInstruction();
            if (tag === 'screen') hud.disabled = !box.checked;
        });
        return { tag, box };
    });
    const taughtList = el('div', { className: 'eyemessage-taught' },
        ...taughtBoxes.flatMap(({ tag, box }) => [el('label', { className: 'checkbox_label' }, box, el('span', { textContent: TAG_LABELS[tag] ?? tag })),
            ...(tag === 'screen' ? [hudLabel] : [])]));
    const styles = el('textarea', { className: 'text_pole eyemessage-styles', rows: 3, spellcheck: false,
        placeholder: '<club>color:gold;background:#080808</club>' });
    styles.addEventListener('change', () => { scope().ext.styles = styles.value.trim(); SillyTavern.getContext().saveSettingsDebounced(); });
    const share = el('input', { type: 'checkbox' });
    const header = el('div', { className: 'inline-drawer-toggle inline-drawer-header' },
        el('b', { textContent: 'EyeMessage' }),
        el('div', { className: 'inline-drawer-icon fa-solid fa-circle-chevron-down down' }),
    );
    host.append(el('div', { className: 'eyemessage-settings' },
        el('div', { className: 'inline-drawer' }, header,
            el('div', { className: 'inline-drawer-content' },
                el('label', { className: 'checkbox_label', title: 'Adds the instructions for writing messages as tags to the system prompt. On unless you turn it off.' },
                    inject, el('span', { textContent: 'Instruct the model' })),
                taughtList,
                el('label', { title: 'CSS by name, used with class="name" in any chat.' },
                    el('span', { textContent: 'Saved styles' }), styles),
                el('label', { className: 'checkbox_label', title: 'Off: this chat keeps its own colours, aliases, icons and accounts, and its branches inherit them. On: every chat of this character uses one set.' },
                    share, el('span', { textContent: 'Share with character' })),
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
            box.checked = store().tags[tag] ?? true;
            box.disabled = s.kind === 'none' || !inject.checked;
        }
        hud.checked = store().hud;
        hud.disabled = s.kind === 'none' || !inject.checked || !(store().tags.screen ?? true);
        styles.value = savedStyles();
        share.disabled = !s.key;
        where.textContent = s.kind === 'none' ? 'Open a chat.'
            : s.kind === 'character' ? `Shared by all of ${s.title}'s chats.`
                : 'Kept in this chat.';
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
    applyPicks();
    refreshPanel();
}
eventSource.on(eventTypes.CHAT_CHANGED, () => {
    try {
        onChatChanged();
    } catch (error) {
        console.error('[EyeMessage] Could not load this chat\'s colours, aliases, icons and accounts; tags are still drawn.', error);
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

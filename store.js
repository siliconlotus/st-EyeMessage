// What EyeMessage remembers, and how two sets of it are combined. Pure functions, no SillyTavern imports.
//
// One set belongs to a chat, or to a character when its chats share one. There is no set for "everywhere".
//
// @typedef {object} Store
// @property {Record<string, string>} colors    Picked colour by normalised contact name.
// @property {Record<string, string>} aliases   The person a name belongs to, by normalised name: both are keys.
//                                              Never a chain: a person is not itself an alias.
// @property {Record<string, string>} icons     Picked icon by normalised app name: "fa-camera", or an emoji.
// @property {boolean} inject                   Whether the tag instructions are injected into the system prompt.
//                                              On unless it has been turned off.
// @property {boolean} hud                      Whether the screen instructions also show the advanced HUD example.
// @property {Record<string, boolean>} tags     Which tags the model is told about, where that was chosen.
//                                              A tag not listed follows its default.
// @property {Record<string, Persona>} personas The user's accounts, by persona name: a handle belongs
//                                              to the person being played, not to the chat's character.
// @property {Record<string, string>} names     Names seen in a character's chats, by normalised name, as
//                                              written. Only kept when a character's chats share a set.
// @typedef {{accounts: string[], handles: Record<string, string>}} Persona
//   accounts: every handle sent as. handles: the one last used on each app, by normalised app name.

import { normaliseName } from './render.js';

/** @returns {Store} */
export const emptyStore = () => ({ colors: {}, aliases: {}, icons: {}, inject: true, hud: false, tags: {}, personas: {}, names: {} });

/** Fills in anything missing, so a set saved by an older version still reads. */
export function complete(store) {
    store.colors ??= {};
    store.aliases ??= {};
    store.icons ??= {};
    store.inject ??= true;
    store.hud ??= false;
    store.tags ??= {};
    store.personas ??= {};
    store.names ??= {};
    return store;
}

/** The accounts of one persona in a set. `create` adds the record when it is missing. */
export function personaIn(store, name, create = false) {
    const key = name || '';
    if (create) return store.personas[key] ??= { accounts: [], handles: {} };
    return store.personas[key] ?? { accounts: [], handles: {} };
}

/**
 * Adds a handle to the persona's accounts.
 * @returns {boolean} whether it was new
 */
function addAccount(store, personaName, handle) {
    const mine = personaIn(store, personaName, true);
    if (mine.accounts.some(known => normaliseName(known) === normaliseName(handle))) return false;
    mine.accounts.push(handle);
    return true;
}

/**
 * Records a handle the persona sent as. A person can have several accounts on one app, so every one is
 * kept; the last one used on an app becomes that app's default.
 * @returns {boolean} whether anything changed
 */
export function learnHandle(store, personaName, app, handle) {
    const isNew = addAccount(store, personaName, handle);
    const mine = personaIn(store, personaName, true);
    if (mine.handles[app] === handle && !isNew) return false;
    mine.handles[app] = handle;
    return true;
}

/** Forgets one of the persona's handles everywhere it is used. */
export function forgetHandle(store, personaName, handle) {
    const mine = personaIn(store, personaName, true);
    mine.accounts = mine.accounts.filter(known => known !== handle);
    for (const app of Object.keys(mine.handles)) if (mine.handles[app] === handle) delete mine.handles[app];
}

/** The person a normalised name belongs to: itself, unless it is an alias. */
export const personOf = (store, key) => Object.hasOwn(store.aliases, key) ? store.aliases[key] : key;

/**
 * Makes one name, and everything linked to it, an alias of another. The person keeps their own picked
 * colour, or takes the alias's when they have none.
 */
export function linkAlias(store, key, main) {
    const { aliases, colors } = store;
    const [from, to] = [personOf(store, key), personOf(store, main)];
    if (!from || !to || from === to) return;
    for (const other of Object.keys(aliases)) if (aliases[other] === from) aliases[other] = to;
    aliases[from] = to;
    giveColour(colors, from, to);
}

/** A person keeps the colour picked for them, or takes the one picked for an alias. */
function giveColour(colors, alias, person) {
    if (colors[alias]) colors[person] ??= colors[alias];
    delete colors[alias];
}

/** Makes an alias its own person again, with its automatic colour. */
export function unlinkAlias(store, key) {
    delete store.aliases[key];
}

/**
 * Adds names to a set's remembered names. A name already known keeps its first spelling.
 * @returns {boolean} whether any were new
 */
export function rememberNames(store, names) {
    let added = false;
    for (const name of names) {
        const key = normaliseName(name);
        if (key && !store.names[key]) { store.names[key] = name; added = true; }
    }
    return added;
}

/**
 * Combines `from` into `into`. Where both say something different, `from` wins: it is the set the user
 * was just looking at. Accounts and names are added together; nothing is removed.
 * @returns {Store} `into`
 */
export function mergeStores(into, from) {
    complete(into);
    complete(from);
    Object.assign(into.colors, from.colors);
    for (const [key, main] of Object.entries(from.aliases)) linkAlias(into, key, main);
    // A name with a colour in one set may be an alias in the other.
    for (const [key, main] of Object.entries(into.aliases)) giveColour(into.colors, key, main);
    Object.assign(into.icons, from.icons);
    into.inject = from.inject;
    into.hud = from.hud;
    Object.assign(into.tags, from.tags);
    for (const [name, theirs] of Object.entries(from.personas)) {
        for (const handle of theirs.accounts ?? []) addAccount(into, name, handle);
        Object.assign(personaIn(into, name, true).handles, theirs.handles ?? {});
    }
    for (const [key, name] of Object.entries(from.names)) into.names[key] ??= name;
    return into;
}

/** A separate copy of a set, so changing one never changes the other. */
export const copyStore = store => JSON.parse(JSON.stringify(complete(store)));

/**
 * Early versions kept everything for all chats at once. This takes that out of the extension's
 * settings and returns it as a set, or null when there is nothing to move. The old injection choice is
 * dropped, not moved: it was off unless ticked, and injection is now on unless turned off.
 * @param {object} settings The extension's settings object; the old fields are deleted from it.
 * @param {string} personaName Whose accounts the old handles were.
 * @returns {Store|null}
 */
export function takeLegacy(settings, personaName) {
    const hasAny = ['colors', 'handles', 'accounts', 'inject'].some(field => field in settings);
    if (!hasAny) return null;
    const store = emptyStore();
    Object.assign(store.colors, settings.colors ?? {});
    for (const handle of settings.accounts ?? []) addAccount(store, personaName, handle);
    for (const [app, handle] of Object.entries(settings.handles ?? {})) learnHandle(store, personaName, app, handle);
    for (const field of ['colors', 'handles', 'accounts', 'inject']) delete settings[field];
    const empty = !Object.keys(store.colors).length && !personaIn(store, personaName).accounts.length;
    return empty ? null : store;
}

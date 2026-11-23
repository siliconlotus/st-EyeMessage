// Checks for render.js. Run with:  node test.mjs
import assert from 'node:assert/strict';
import { emptyStore, personaIn, learnHandle, forgetHandle, rememberNames, mergeStores, copyStore, takeLegacy } from './store.js';
import { parseTree, systemWindowBody } from './system-window.js';
import { channelsIn, channelKey, mergeChatBlocks, ANY_CHANNEL, conversationsIn, wrapThreads } from './render.js';
import { renderArtifacts, expandShorthand, typedHandles, commandToTag, splitCommands, clockTime, namesIn, collectContacts, hueOf, normaliseName, autoHex, overrideRule, HUES, TAGS, TAG_LABELS, instructionFor, taughtByDefault } from './render.js';
const INSTRUCTION = instructionFor(TAGS); // everything switched on

// ---- names and hues ----
assert.equal(normaliseName('@Bob_Smith '), normaliseName('bob smith'));
assert.equal(hueOf('Bob'), hueOf('  bob'));
assert.ok(Number.isInteger(hueOf('Bob')) && hueOf('Bob') >= 0 && hueOf('Bob') < HUES);
const names = ['Alice', 'Bob', 'Carol Jones', 'Dave', 'Erin', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy', 'Mallory', 'Niaj'];
assert.ok(new Set(names.map(hueOf)).size >= 8, 'hash spreads a small cast across the hues');

// ---- message tags ----
const incoming = renderArtifacts('Before.\n<sms from="Bob" time="8:08 PM">Running *very* late.\nSave me a seat?</sms>\nAfter.');
assert.match(incoming, /\n\n<div class="eye-convo eye-convo-sms"><span class="eye eye-sms eye-in eye-hue-\d+" data-from="bob">.*<\/span><\/div>\n\n/);
assert.ok(!incoming.split('\n').some(l => l.startsWith('<div') && !l.endsWith('</div>')), 'container is one line');
assert.ok(incoming.includes('Running <i>very</i> late.<br>Save me a seat?'));
assert.ok(incoming.includes('<span class="eye-time">8:08 PM</span>'));

const outgoing = renderArtifacts('<sms to="Bob">on my way</sms>', new Set(['alice']), 'Alice');
assert.ok(outgoing.includes('eye-out') && outgoing.includes('<span class="eye-to">To Bob</span>'));
assert.ok(outgoing.includes('<span class="eye-who">Alice</span>'), 'a sent text is labelled with the persona name');
assert.ok(!outgoing.includes('data-from') && !outgoing.includes('eye-hue-'), 'your own bubble never takes the recipient\'s colour');

assert.ok(renderArtifacts('<email from="A>B" subject=\'Q "3"\'>x</email>').includes('Q &quot;3&quot;'), 'attribute values are escaped');
assert.equal(renderArtifacts('<sms from="Bob">never closed'), '<sms from="Bob">never closed', 'unclosed tag is left alone');
assert.equal(renderArtifacts('<details><summary>Ledger</summary>x</details>'), '<details><summary>Ledger</summary>x</details>');
assert.equal(renderArtifacts('plain prose'), 'plain prose');
for (const tag of TAGS) assert.ok(renderArtifacts(`<${tag}>x</${tag}>`).includes(`eye-${tag}`));

// ---- the user's own screenname ----
const mine = '<dm app="Chatter" from="@alice" to="@Dave_88">on my way</dm>';
const asMine = renderArtifacts(mine, new Set(['alice']));
assert.ok(asMine.includes('eye-out') && !asMine.includes('data-from') && !asMine.includes('eye-hue-'), 'a message from your own screenname is drawn as sent');
assert.ok(asMine.includes('<span class="eye-who">@alice</span>') && !asMine.includes('→'), 'labelled with the screenname alone, like the other side');
assert.ok(asMine.includes('<span class="eye-to">To @Dave_88</span>'), 'the recipient is on the conversation line');
assert.ok(renderArtifacts('<sms from="Bob" to="Alice">x</sms>', new Set(['alice'])).includes('<span class="eye-who">Bob</span>'), 'a message to you names only its sender');
assert.ok(renderArtifacts('<sms from="Bob" to="Carol">x</sms>', new Set(['alice'])).includes('Bob → Carol'), 'a message between two other people keeps both names');
assert.ok(renderArtifacts(mine).includes('eye-in'), 'an unknown sender is drawn as received');

// ---- what the model is told ----
for (const tag of [...TAGS, 'thread']) assert.ok(INSTRUCTION.includes(`\`<${tag}`), `instructions list <${tag}>`);
for (const tag of TAGS) assert.ok(TAG_LABELS[tag], `<${tag}> has a name for the settings panel`);
// each tag brings its own line and example; the model is told only about the ones switched on
const usual = instructionFor();
assert.ok(!usual.includes('system_window') && !usual.includes('quest_log'), 'system windows are left out unless chosen');
assert.ok(usual.includes('`<sms') && usual.includes('`<thread>`') && usual.includes('Example, two conversations'));
assert.equal(taughtByDefault('system_window'), false);
assert.ok(TAGS.filter(t => t !== 'system_window').every(taughtByDefault));
const onlySigns = instructionFor(['sign']);
assert.ok(onlySigns.includes('`<sign>`') && !onlySigns.includes('<thread') && !onlySigns.includes('Example') && !onlySigns.includes('{{user}}'), 'with no messages taught, the notes on threads and the example go too');
const onlyWindows = instructionFor(['system_window']);
assert.ok(onlyWindows.includes('Example, a system window') && !onlyWindows.includes('Example, two conversations'));
assert.equal(instructionFor([]), '', 'nothing switched on: nothing injected');
assert.equal(instructionFor(['system_window', 'sms']), instructionFor(['sms', 'system_window']), 'the order chosen does not matter');

// ---- conversations: each one is drawn on its own panel ----
/** The panels in a rendered message, each as the list of its bubbles. */
const panels = html => html.split('\n').filter(l => l.startsWith('<div class="eye-convo'))
    .map(panel => panel.match(/<span class="eye eye-(?:sms|dm)[^"]*"[^>]*>.*?<span class="eye-body">.*?<\/span><\/span>/g));

const thread = renderArtifacts('<dm app="Chatter" from="@Dave_88">one</dm>\n<dm app="Chatter" from="@Dave_88">two</dm>\n<dm app="Chatter" to="@Dave_88">three</dm>\nProse.\n<dm app="Chatter" from="@Dave_88">four</dm>');
assert.deepEqual(panels(thread).map(p => p.length), [3, 1], 'three messages in a row share a panel; prose in between starts a new one');
assert.ok(thread.includes('<div class="eye-convo eye-convo-dm eye-app-chatter"><span class="eye-thread"><span class="eye-app">Chatter</span></span>'), 'the app is named once, on the panel');
assert.ok(!panels(thread)[0][0].includes('eye-same') && panels(thread)[0][1].includes('eye-same'), 'same sender again: name shown once');
assert.ok(!panels(thread)[0][2].includes('eye-same'), 'the reply shows its own name');
assert.equal(panels(renderArtifacts('<sms from="A">x</sms>\n<dm app="Z" from="A">y</dm>')).length, 2, 'a text and an app message are different conversations');

const two = renderArtifacts('<sms to="Bob">first</sms>\n<sms to="Carol">second</sms>\n<sms to="Carol">third</sms>', new Set(['alice']), 'Alice');
assert.deepEqual(panels(two).map(p => p.length), [1, 2], 'texts to two people are two panels; a second text to the same person joins its panel');
assert.equal((two.match(/<span class="eye-to">To (Bob|Carol)<\/span>/g) || []).length, 2, 'each panel says who it is to, once');

const mixed = renderArtifacts('<sms from="Bob">a</sms>\n<sms from="Bob">b</sms>\n<sms to="Bob">c</sms>\n<sms from="Carol">d</sms>', new Set(['alice']), 'Alice');
assert.deepEqual(panels(mixed).map(p => p.length), [3, 1], 'a text from someone else breaks the panel, even with nothing in between');
assert.ok(!mixed.includes('eye-to'), 'a reply inside an open conversation needs no "To"');
assert.equal(panels(renderArtifacts('<sms from="Mara">a</sms>\n<sms from="Mara">b</sms>\n<sms from="Tobias">c</sms>')).length, 2, 'received texts from two people are two panels');

// ---- <thread>: an explicit conversation ----
const explicit = renderArtifacts('Two people answer.\n<thread><sms from="Mara">a</sms>\n<sms from="Mara">b</sms></thread>\n<thread><sms from="Tobias">c</sms></thread>\nAfter.');
assert.deepEqual(panels(explicit).map(p => p.length), [2, 1], 'each <thread> is one panel');
assert.ok(!explicit.includes('thread>') && explicit.startsWith('Two people answer.') && explicit.endsWith('After.'));
assert.ok(!explicit.split('\n').some(l => l.startsWith('<div') && !l.endsWith('</div>')), 'a panel is one line');
const groupThread = renderArtifacts('<thread app="Chatter"><dm from="@Dave_88">where</dm><dm from="@Erin">the cafe</dm>\nSeen 2:14 PM\n<dm to="@Dave_88, @Erin">on my way</dm></thread>', new Set(['alice']), 'Alice');
assert.deepEqual(panels(groupThread).map(p => p.length), [3], 'a thread holds different senders on one panel');
assert.ok(groupThread.includes('<div class="eye-convo eye-convo-dm eye-app-chatter"><span class="eye-thread"><span class="eye-app">Chatter</span></span>'), 'the thread names the app for its messages');
assert.ok(groupThread.includes('<span class="eye-note">Seen 2:14 PM</span>'), 'text between messages is a note line');
const streaming = renderArtifacts('<thread><sms from="Mara">a</sms>\n<sms from="Mara">b</sms>');
assert.deepEqual(panels(streaming).map(p => p.length), [2], 'an unclosed thread still draws the messages that are complete');
assert.equal(renderArtifacts('x <thread></thread> y'), 'x  y', 'an empty thread draws nothing');
assert.deepEqual(collectContacts('<thread><sms from="Mara">a</sms><sms to="Mara">b</sms></thread>'), [{ name: 'Mara', kind: 'sender' }]);

// ---- group threads ----
const me = new Set(['alice']);
const group = renderArtifacts('<dm from="@alice" to="@Dave_88, @Erin" app="Chatter">anyone free tonight</dm>\n<dm app="Chatter" from="@Erin" to="@Dave_88, @alice">always</dm>\n<dm app="Chatter" from="@Dave_88">just me</dm>', me, 'Alice');
assert.deepEqual(panels(group).map(p => p.length), [2, 1], 'a reply in the group joins its panel; a one-to-one message from a member does not');
assert.ok(group.includes('To @Dave_88, @Erin'));
assert.ok(panels(group)[0][1].includes('<span class="eye-who">@Erin</span>'), 'a group reply names only its sender');

// ---- slash commands ----
assert.equal(commandToTag('sms', "Bob I'm gonna be late"), '<sms to="Bob">I\'m gonna be late</sms>');
assert.equal(commandToTag('sms', '"Carol Jones" see you at 9?'), '<sms to="Carol Jones">see you at 9?</sms>');
assert.equal(commandToTag('sms', 'see you at 9?', { to: 'Carol Jones' }), '<sms to="Carol Jones">see you at 9?</sms>');
assert.equal(commandToTag('dm', 'chatter @Dave_88,@Erin anyone free tonight'),
    '<dm to="@Dave_88, @Erin" app="Chatter">anyone free tonight</dm>');
assert.equal(commandToTag('dm', 'chatter @Dave_88 hi', { as: '@alice' }), '<dm from="@alice" to="@Dave_88" app="Chatter">hi</dm>');
assert.equal(commandToTag('dm', 'chatter @Dave_88 hi', {}, { chatter: '@alice' }), '<dm from="@alice" to="@Dave_88" app="Chatter">hi</dm>');
assert.equal(commandToTag('dm', '"Chat Box" Carol thursday?'), '<dm to="Carol" app="Chat Box">thursday?</dm>');
assert.equal(commandToTag('email', 'Frank see attached', { subject: 'Invoice' }), '<email to="Frank" subject="Invoice">see attached</email>');
assert.equal(commandToTag('sms', 'Bob'), '', 'no message: nothing is built');
assert.equal(commandToTag('dm', 'chatter @Dave_88'), '', 'no message: nothing is built');
assert.equal(commandToTag('sms', ''), '');
for (const built of [commandToTag('sms', "Bob I'm gonna be late"), commandToTag('dm', 'chatter @A,@B hi')]) {
    assert.ok(renderArtifacts(built, me, 'Alice').includes('eye-out'), 'what a command builds draws as a sent message');
    assert.equal(expandShorthand(built), built, 'and sending it changes nothing');
}

// ---- several commands, one per line ----
// SillyTavern hands the later lines to the first command as part of its message.
const several = splitCommands('dm', 'first message\n/dm app=Chatter as=@alice to=@Dave_88 second message\n/text Bob "quoted" third\nnot a command, part of the third', { app: 'Chatter', as: '@alice', to: '@Dave_88' });
assert.deepEqual(several.map(c => commandToTag(c.kind, c.text, c.named)), [
    '<dm from="@alice" to="@Dave_88" app="Chatter">first message</dm>',
    '<dm from="@alice" to="@Dave_88" app="Chatter">second message</dm>',
    '<sms to="Bob">"quoted" third\nnot a command, part of the third</sms>',
]);
assert.equal(splitCommands('sms', 'Bob just one').length, 1);
assert.deepEqual(splitCommands('sms', 'Bob a\n/sms time=22:29 Carol b=1 stays in the message')[1], { kind: 'sms', text: 'Carol b=1 stays in the message', named: { time: '22:29' } });
assert.equal(splitCommands('sms', 'Bob see /sms for help\nand /dm too').length, 1, 'a command name in the middle of a line is just text');
assert.deepEqual(panels(renderArtifacts(several.slice(0, 2).map(c => commandToTag(c.kind, c.text, c.named)).join('\n'), new Set(['alice']), 'Alice')).map(p => p.length), [2], 'two commands to one person draw as one conversation');

// ---- a typed-looking line inside a tag stays part of that message ----
const multi = '<sms to="Bob">line one\ntext Carol: not a new message</sms>\ntext Carol: a new message';
assert.equal(expandShorthand(multi), '<sms to="Bob">line one\ntext Carol: not a new message</sms>\n<sms to="Carol">a new message</sms>');

// ---- an account's handle and its display name ----
const named = renderArtifacts('<thread app="Chatter"><dm from="@Dave_88" display_name="Dave R.">one</dm><dm from="@Erin">two</dm><dm from="@Dave_88">three</dm></thread>', new Set(['alice']));
assert.ok(named.includes('<span class="eye-who">Dave R.</span><span class="eye-handle">@Dave_88</span>'), 'the display name is shown with the handle beside it');
assert.ok(named.includes('<span class="eye-who">@Erin</span>') && !named.includes('<span class="eye-handle">@Erin'), 'an account with no display name shows its handle alone');
assert.equal((named.match(/<span class="eye-who">Dave R\.<\/span>/g) || []).length, 2, 'given once, the display name is reused for that handle');
assert.equal((named.match(/data-from="dave88"/g) || []).length, 2, 'colour and grouping go by the handle, not the display name');
assert.equal(
    renderArtifacts('<dm app="Chatter" from="@Dave_88" display-name="Dave R.">x</dm>'),
    renderArtifacts('<dm app="Chatter" from="@Dave_88" display_name="Dave R.">x</dm>'), 'display-name is read the same as display_name');
assert.equal(
    renderArtifacts('<dm app="Chatter" from="@Dave_88" displayName="Dave R.">x</dm>'),
    renderArtifacts('<dm app="Chatter" from="@Dave_88" display_name="Dave R.">x</dm>'), 'so is displayName');
const mineNamed = renderArtifacts('<dm app="Chatter" from="@alice" display_name="Alice P" to="@Dave_88">x</dm>', new Set(['alice']));
assert.ok(mineNamed.includes('eye-out') && mineNamed.includes('<span class="eye-who">Alice P</span><span class="eye-handle">@alice</span>'), 'your own account is labelled the same way');
assert.deepEqual(panels(renderArtifacts('<dm app="Chatter" from="@Dave_88" display_name="Dave R.">a</dm>\n<dm app="Chatter" to="@Dave_88">b</dm>', new Set(['alice']), 'Alice')).map(p => p.length), [2],
    'a display name does not split the conversation with that handle');
assert.ok(INSTRUCTION.includes('display_name="Display name"') && INSTRUCTION.includes('from="@handle"') && INSTRUCTION.includes('from="Contact name"'));

// ---- system window ----
const status = renderArtifacts('The air chimes.\n<system_window title="Status">Name: Alice\nLevel: 3  →  4\n[Skill gained: Appraisal]</system_window>\nShe blinks.');
assert.ok(status.includes('<div class="eye eye-system_window eye-in">') && status.includes('<span class="eye-title">Status</span>'));
assert.ok(status.includes('Name: Alice<br>Level: 3  →  4<br>[Skill gained: Appraisal]'), 'its lines are kept as written');
assert.ok(status.startsWith('The air chimes.') && status.endsWith('She blinks.'));
assert.equal(renderArtifacts('<system>not ours</system>'), '<system>not ours</system>', 'a bare <system> tag is left alone');

// ---- system window with nested tags of the model's own naming ----
const example = INSTRUCTION.slice(INSTRUCTION.indexOf('<system_window title="Status">'));
const win = renderArtifacts(example);
assert.equal(win.trim().split('\n').length, 1, 'the whole window is one line');
assert.ok(win.includes('<span class="eye-sw-heading">Identity</span><span class="eye-sw-cells"><span class="eye-sw-cell"><span class="eye-sw-label">Name</span><span class="eye-sw-value">Alice</span></span>'), 'short plain values sit side by side under a heading made from the tag name');
assert.ok(win.includes('<span class="eye-sw-bar" data-name="hp"><span class="eye-sw-label">HP</span><span class="eye-sw-track"><span class="eye-sw-fill" style="width:70%"></span></span><span class="eye-sw-count">42 / 60</span></span>'), 'value and max make a bar');
assert.ok(win.includes('<span class="eye-sw-label">STR</span><span class="eye-sw-value">7</span>'), 'a short tag name is an abbreviation');
assert.ok(win.includes('<span class="eye-sw-row"><span class="eye-sw-value">Night Sight</span><span class="eye-sw-chips"><span class="eye-sw-chip">Level 1</span><span class="eye-sw-chip">New</span></span></span>'), 'repeated tags are a list; other attributes are shown beside each');
assert.ok(win.includes('<span class="eye-sw-heading">Quest log</span>'));
assert.ok(win.includes('<span class="eye-sw-group"><span class="eye-sw-heading">Clear the cellar<span class="eye-sw-chip">Active</span></span><span class="eye-sw-rows"><span class="eye-sw-row"><span class="eye-sw-label">Reward</span><span class="eye-sw-value">40 silver</span></span></span></span>'), 'a tag with words and tags inside is a section headed by its words');
assert.equal(systemWindowBody('Name: Alice\nLevel: 3 < 4\n[Skill gained: Appraisal]'), null, 'plain lines are not nested');
assert.equal(systemWindowBody('A <b>bold</b> line and an <i>italic</i> one'), null, 'formatting tags are not structure');
// the reader is forgiving
assert.deepEqual(parseTree('<a><b2>x</a>tail').children.map(c => c.name ?? c), ['a', 'tail'], 'a tag left open is closed by its parent');
assert.equal(parseTree('</nope>text').children.join(''), 'text', 'a closing tag with no opener is ignored');
assert.ok(systemWindowBody('<hp value="12" max="0"/><hp value="x" max="10"/>').includes('eye-sw-row'), 'a bar needs real numbers; otherwise it is a row');
assert.ok(systemWindowBody('<hp value="90" max="60"/>').includes('width:100%'), 'a bar never overflows');
assert.ok(systemWindowBody('Level up!\n<stats><str>8</str><agi>11</agi></stats>').startsWith('<span class="eye-sw"><span class="eye-sw-note">Level up!</span>'), 'loose text between tags is kept as a note');
assert.ok(systemWindowBody('<item name="Potion" qty="3"/><item name="Rope"/>').includes('<span class="eye-sw-value">Potion</span><span class="eye-sw-chips"><span class="eye-sw-chip">Qty 3</span>'), 'a name attribute names the row');
assert.ok(systemWindowBody('<note>She said "wait</note><note>for me"</note>').includes('She said &#34;wait'), 'quote marks are made safe here too');

// ---- attribute values without quotes ----
const bare = renderArtifacts('<thread><dm from="@alice" to="@Dave_88" app="Chatter">one</dm>\n<dm from=@alice to=@Dave_88 app=Chatter> two</dm></thread>', new Set(['alice']));
assert.deepEqual(panels(bare).map(p => p.length), [2]);
assert.ok(panels(bare)[0].every(b => b.includes('eye-out')), 'both are drawn as sent');
assert.ok(panels(bare)[0][1].includes('eye-same'), 'the second is a double text: same writer, named once');
assert.equal(renderArtifacts('<sms from=Bob time=9:41>x</sms>'), renderArtifacts('<sms from="Bob" time="9:41">x</sms>'));
assert.deepEqual(namesIn('<dm from=@Dave_88 to=@alice app=Chatter>x</dm>'), ['@Dave_88', '@alice']);

// ---- attribute order does not matter ----
assert.equal(
    renderArtifacts('<dm time="9:41 PM" app="Chatter" to="@alice" from="@Dave_88">x</dm>', new Set(['alice'])),
    renderArtifacts('<dm from="@Dave_88" to="@alice" app="Chatter" time="9:41 PM">x</dm>', new Set(['alice'])),
);
assert.equal(commandToTag('dm', 'hi', { to: '@Dave_88', as: '@alice', app: 'Chatter' }), commandToTag('dm', 'hi', { app: 'Chatter', as: '@alice', to: '@Dave_88' }));

// ---- posting in a live chat yourself ----
const seen = channelsIn('<chat title="Dressed as Kings">A: x</chat> prose <chat title="Guild Hall">B: y</chat><chat>C: untitled</chat>');
assert.deepEqual(seen, ['Dressed as Kings', 'Guild Hall']);
const room = { channels: seen, userName: 'Alice' };
const post = (line, handles = {}) => expandShorthand(line, handles, undefined, room);
assert.equal(post('chat: anyone on tonight?'), '<chat title="Guild Hall">Alice: anyone on tonight?</chat>', 'no channel named: the chat most recently seen');
assert.equal(post('chat as Ace: hi'), '<chat title="Guild Hall">Ace: hi</chat>');
assert.equal(post('chat: hi', { [channelKey('Guild Hall')]: 'Ace' }), '<chat title="Guild Hall">Ace: hi</chat>', 'the name used in that channel is remembered');
assert.equal(post('chat: hi', { [ANY_CHANNEL]: 'Ace' }), '<chat title="Guild Hall">Ace: hi</chat>', 'else the name last used in any channel');
assert.equal(post('chat dressed as kings: hi'), '<chat title="Dressed as Kings">Alice: hi</chat>', 'a known channel is found in any case, even with "as" in its name');
assert.equal(post('chat dressed as kings as Ace: hi'), '<chat title="Dressed as Kings">Ace: hi</chat>');
assert.equal(post('chat Trade: selling ore'), '<chat title="Trade">Alice: selling ore</chat>', 'a new channel starts with a capital or #');
assert.equal(post('chat with bob: went fine'), 'chat with bob: went fine', 'prose is left alone');
assert.equal(expandShorthand('chat: hello', {}, undefined, { channels: [], userName: 'Alice' }), 'chat: hello', 'with no live chat yet there is nothing to answer in');
assert.equal(post('chat as Ace: one\nchat: two\ntext Bob: three\nchat Trade: four', { [channelKey('Guild Hall')]: 'Ace' }),
    '<chat title="Guild Hall">Ace: one\nAce: two</chat>\n<sms to="Bob">three</sms>\n<chat title="Trade">Alice: four</chat>', 'lines posted one after another in one chat are one block');
assert.deepEqual(typedHandles('chat as Ace: one', undefined, room), [{ app: channelKey('Guild Hall'), handle: 'Ace' }]);
// a kind of game channel can be typed too, and writes channel= like the commands
assert.equal(post('chat party as Ace: ready'), '<chat channel="party">Ace: ready</chat>');
assert.equal(post('chat in party as Ace: ready'), post('chat party as Ace: ready'), '"in" is allowed');
assert.equal(post('chat party: ready', { [channelKey('party')]: 'Ace' }), '<chat channel="party">Ace: ready</chat>', 'and the name is remembered for that kind');
assert.equal(post('chat whisper to Bob: hey'), '<chat channel="whisper" to="Bob">Alice: hey</chat>');
assert.equal(post('chat in guild hall: hi'), '<chat title="Guild Hall">Alice: hi</chat>', 'a channel that is really called that wins over the kind');
assert.deepEqual(typedHandles('chat party as Ace: ready', undefined, room), [{ app: channelKey('party'), handle: 'Ace' }]);
// the kind can stand first, without "chat"
assert.equal(post('party: ready'), '<chat channel="party">Alice: ready</chat>');
assert.equal(post('guild as Ace: hi'), '<chat channel="guild">Ace: hi</chat>');
assert.equal(post('whisper Bob: hey'), '<chat channel="whisper" to="Bob">Alice: hey</chat>');
assert.equal(post('whisper to Bob as Ace: hey'), '<chat channel="whisper" to="Bob">Ace: hey</chat>');
assert.equal(post('reply: on my way'), '<chat channel="reply">Alice: on my way</chat>');
assert.equal(expandShorthand('whisper bob: hey', {}, n => (n.toLowerCase() === 'bob' ? 'Bob \u{1F43A}' : null), room), '<chat channel="whisper" to="Bob \u{1F43A}">Alice: hey</chat>', 'a known name can be typed plainly');
assert.deepEqual(typedHandles('guild as Ace: hi', undefined, room), [{ app: channelKey('guild'), handle: 'Ace' }]);
// the first word of a chat line is lowercase; a sentence that starts with the same word is not one
for (const prose of ['whisper it softly: nobody is listening', 'Party of five: we set out at dawn', 'guild hall rules: no fighting', 'Yelling: pointless', 'chat whisper to nobody: hm',
    'Party: four of us.', 'Reply: none.', 'Chat: muted.', 'Whisper Bob: hey', 'Guild as Ace: hi']) {
    assert.equal(post(prose), prose, `left alone: ${prose}`);
}
assert.equal(post('chat party as Ace: one\nchat party: two', { [channelKey('party')]: 'Ace' }), '<chat channel="party">Ace: one\nAce: two</chat>');
const posted = renderArtifacts('<chat title="Party">Ace: ready\nFinn: lol</chat>', new Set(['ace']));
assert.ok(posted.includes('<span class="eye-nick eye-own">Ace</span>'), 'your own line is marked as yours');
assert.match(posted, /<span class="eye-nick eye-hue-\d+" data-from="finn">Finn<\/span>/);

// ---- commands for chats ----
const cmd = (kind, text, named = {}, handles = {}) => commandToTag(kind, text, named, handles, undefined, room);
assert.equal(cmd('chat', 'anyone on?', { as: 'Ace' }), '<chat title="Guild Hall">Ace: anyone on?</chat>');
assert.equal(cmd('chat', 'x', { title: 'lowercase room' }), '<chat title="lowercase room">Alice: x</chat>', 'a title given to the command is taken as it is');
assert.equal(commandToTag('chat', 'x', {}, {}, undefined, { channels: [] }), '', 'no chat to answer in');
// a game's chat command knows the kind of channel, not what the scene calls it, so it claims no title
assert.equal(cmd('party', 'ready when you are', {}, { [ANY_CHANNEL]: 'Ace' }), '<chat channel="party">Ace: ready when you are</chat>');
assert.equal(cmd('party', 'x', {}, { [channelKey('party')]: 'Tank', [ANY_CHANNEL]: 'Ace' }), '<chat channel="party">Tank: x</chat>', 'a name used in that kind of channel comes first');
assert.equal(cmd('guild', 'cellar?'), '<chat channel="guild">Alice: cellar?</chat>');
assert.equal(cmd('yell', 'ore'), '<chat channel="yell">Alice: ore</chat>');
assert.equal(cmd('whisper', 'Bob hey'), '<chat channel="whisper" to="Bob">Alice: hey</chat>');
assert.equal(cmd('reply', 'on my way'), '<chat channel="reply">Alice: on my way</chat>');
assert.equal(cmd('whisper', 'Bob'), '', 'a whisper needs a message');
const heads = html => [...html.matchAll(/<span class="eye-title">(.*?)<\/span>/g)].map(m => m[1]);
assert.deepEqual(heads(renderArtifacts('<chat channel="party">A: x</chat><chat channel="whisper" to="Bob">A: y</chat><chat title="Guild Hall" channel="guild">A: z</chat><chat>A: w</chat>')),
    ['Party', 'Whisper to Bob', 'Guild Hall'], 'the box is headed by its title, or failing that by the kind of channel');
assert.equal(mergeChatBlocks('<chat channel="party">A: one</chat>\n<chat channel="party">A: two</chat>\n<chat channel="guild">A: three</chat>\nprose\n<chat channel="guild">A: four</chat>'),
    '<chat channel="party">A: one\nA: two</chat>\n<chat channel="guild">A: three</chat>\nprose\n<chat channel="guild">A: four</chat>', 'only lines in the same chat, with nothing between, are joined');
assert.equal(mergeChatBlocks('<chat title="A > B">x: 1</chat>\n<chat title="A > B">x: 2</chat>'), '<chat title="A > B">x: 1\nx: 2</chat>');
assert.deepEqual(splitCommands('sms', 'Bob a\n/eye-dm chatter @Dave_88 b\n/eye-chat as=Ace c\n/chat-jump 3\n/p ready\n/w Bob hey\n/proxy x').map(c => `${c.kind}:${c.text.trim()}`),
    ['sms:Bob a', 'dm:chatter @Dave_88 b', 'chat:c\n/chat-jump 3', 'party:ready', 'whisper:Bob hey\n/proxy x'], 'only our own command names start a new command; others stay text');

// ---- live chat ----
const live = renderArtifacts('<chat title="Guild chat">\ngamer_one: anyone on?\npixel_x: anyone *selling* copper?\n* Zed joined the channel\n</chat>');
assert.equal(live.split('\n').filter(Boolean).length, 1, 'whole chat is one line');
assert.equal((live.match(/class="eye-line"/g) || []).length, 2);
assert.ok(live.includes('data-from="gamerone"') && live.includes('data-from="pixelx"'));
assert.ok(live.includes('<span class="eye-line eye-sys">* Zed joined the channel</span>'), 'a line without a name is a system line');
assert.ok(live.includes('anyone <i>selling</i> copper?'));

// ---- contacts for the picker ----
assert.deepEqual(
    collectContacts('<sms from="Bob">a</sms><sms to="Carol">b</sms><chat>\nHeidi: hi\nnot a name line\n</chat>'),
    [{ name: 'Bob', kind: 'sender' }, { name: 'Heidi', kind: 'chat' }],
);
assert.deepEqual(collectContacts('no tags here'), []);

// ---- shorthand ----
assert.equal(expandShorthand('text Bob: running late'), '<sms to="Bob">running late</sms>');
assert.equal(expandShorthand('I check the time.\nText to Carol Jones: see you at 9?\nThen I leave.'),
    'I check the time.\n<sms to="Carol Jones">see you at 9?</sms>\nThen I leave.');
assert.equal(expandShorthand('dm Dave on Chatter: 2pm works'), '<dm to="Dave" app="Chatter">2pm works</dm>');
assert.equal(expandShorthand('dm @Dave_88 via Chat Box: see you there'), '<dm to="@Dave_88" app="Chat Box">see you there</dm>');
assert.equal(expandShorthand('DM Carol: thursday?'), '<dm to="Carol">thursday?</dm>');
assert.equal(expandShorthand('dm Dave on chatter: hi'), '<dm to="Dave" app="Chatter">hi</dm>', 'app name in any case');
const withName = expandShorthand('dm Dave on Chatter as @alice: 2pm works');
assert.equal(withName, '<dm from="@alice" to="Dave" app="Chatter">2pm works</dm>');
assert.deepEqual(typedHandles('dm Dave on Chatter as @alice: 2pm works'), [{ app: 'chatter', handle: '@alice' }]);
assert.deepEqual(typedHandles('dm Dave on Chatter: no screenname given'), []);
assert.deepEqual(typedHandles('I read it again.\n<email from="Frank" to="Alice">pasted</email>\n<dm from="@Dave_88" to="@alice" app="Chatter">quoted</dm>'), [],
    'a pasted or quoted tag never teaches a screenname');
assert.equal(expandShorthand('dm Dave on Chatter: again', { chatter: '@alice' }),
    '<dm from="@alice" to="Dave" app="Chatter">again</dm>', 'a remembered screenname is filled in');
assert.equal(expandShorthand('text Bob: hi', { chatter: '@alice' }), '<sms to="Bob">hi</sms>', 'a plain text takes no screenname');
assert.equal(expandShorthand('sms @Dave_88: 2pm works'), '<sms to="@Dave_88">2pm works</sms>');
assert.equal(expandShorthand('email Frank: Invoice | see attached'), '<email to="Frank" subject="Invoice">see attached</email>');
assert.equal(expandShorthand('email Frank: see attached'), '<email to="Frank">see attached</email>');
assert.equal(expandShorthand('Email to Dr Frank Stone: Sunday | Still on?'), '<email to="Dr Frank Stone" subject="Sunday">Still on?</email>');
const once = expandShorthand('text Bob: hi\nemail Frank: A | b\ndm Dave on Chatter: c\ndm Dave on Chatter as @alice: d');
assert.equal(expandShorthand(once), once, 'running it twice changes nothing');
for (const prose of [
    'The text of the contract: twelve pages.',
    'I text him back.',
    'Text me when you land: I will wait up.',
    'Email from Frank: nothing yet.',
    'Text of the contract: twelve pages.',
    'text bob: a lowercase name the chat does not know is left alone',
    'Text reads: unknown number.',
    'Dm me on the app: I mean it.',
    'Text Bob as soon as you land: I will wait up.',
    'Text Bob on Monday: remind him.',
    'text Dave on Chatter: only dm takes an app',
]) assert.equal(expandShorthand(prose), prose, `left alone: ${prose}`);

// ---- a lowercase recipient the chat already knows ----
const known = new Map(namesIn('<thread><sms from="Bob">a</sms><sms to="Carol Jones">b</sms></thread><dm app="Chatter" from="@Dave_88" to="@Erin, Alice">c</dm>').map(n => [normaliseName(n), n]));
const canon = n => known.get(normaliseName(n)) ?? null;
assert.deepEqual([...known.values()], ['Bob', 'Carol Jones', '@Dave_88', '@Erin', 'Alice']);
assert.equal(expandShorthand("text bob: i'll be there in 5\ntext bob: ...okay maybe more like 20", {}, canon),
    '<thread><sms to="Bob">i\'ll be there in 5</sms>\n<sms to="Bob">...okay maybe more like 20</sms></thread>', 'a double text is one thread');
assert.equal(expandShorthand('text carol jones: see you at 9?', {}, canon), '<sms to="Carol Jones">see you at 9?</sms>');
assert.equal(expandShorthand('dm dave_88 on chatter: hi', {}, canon), '<dm to="@Dave_88" app="Chatter">hi</dm>');
assert.equal(expandShorthand('text me when: you land', {}, canon), 'text me when: you land', 'prose is still left alone');
assert.deepEqual(panels(renderArtifacts(expandShorthand("text bob: a\ntext bob: b", {}, canon), new Set(['alice']), 'Alice')).map(p => p.length), [2], 'a double text lands on one panel');
assert.equal(commandToTag('sms', 'to bob running late', {}, {}, canon), '<sms to="Bob">running late</sms>');
assert.equal(commandToTag('sms', 'Tobias running late'), '<sms to="Tobias">running late</sms>', '"to" is only dropped as a word of its own');

// ---- a name with an emoji is found by typing it plainly ----
const emojiNames = new Map(namesIn('<thread><sms from="Bob \u{1F43A}">hi</sms></thread><sms to="Mum \u2764\uFE0F">x</sms>').map(n => [normaliseName(n), n]));
const emojiCanon = n => emojiNames.get(normaliseName(n)) ?? null;
assert.equal(expandShorthand('text bob: on my way', {}, emojiCanon), '<sms to="Bob \u{1F43A}">on my way</sms>');
assert.equal(expandShorthand('text mum 9:13: hi', {}, emojiCanon), '<sms to="Mum \u2764\uFE0F" time="9:13 AM">hi</sms>');
assert.equal(commandToTag('sms', 'bob on my way', {}, {}, emojiCanon), '<sms to="Bob \u{1F43A}">on my way</sms>');
assert.equal(expandShorthand('text Bob \u{1F43A}: on my way'), '<sms to="Bob \u{1F43A}">on my way</sms>', 'typing the emoji works too');
assert.equal(hueOf('Bob \u{1F43A}'), hueOf('bob'), 'the emoji does not change the colour');
assert.deepEqual(panels(renderArtifacts('<sms from="Bob \u{1F43A}">a</sms>\n<sms to="Bob">b</sms>', new Set(['alice']), 'Alice')).map(p => p.length), [2], 'or split the conversation');

// ---- quote marks never pair across bubbles ----
const quoteStep = mes => mes.replace(/<([^>]+)>/g, (_, c) => '<' + c.replace(/"/g, '\ufffe') + '>')
    .replace(/(".*?")|(\u201C.*?\u201D)/g, m => `<q>${m}</q>`).replace(/\ufffe/g, '"');
for (const src of [
    '<thread><sms from="A">she said "wait</sms><sms from="A">ok</sms><sms from="B">for me" then left</sms></thread>',
    '<chat>\nA: 6" tall\nB: sure\nC: 5" at most\n</chat>',
    '<sms from="A">\u201Cone</sms>\n<sms from="A">two\u201D</sms>',
    '<thread><sms from="A">a</sms>\nSeen "today</thread> and "later" prose',
]) {
    const wrapped = quoteStep(renderArtifacts(src)).match(/<q>.*?<\/q>/g) || [];
    assert.ok(!wrapped.some(q => q.slice(3, -4).includes('<')), `no quote pair reaches across markup: ${src}`);
}
assert.ok(renderArtifacts('<sms from="A">a <b title="x">bold</b> "q"</sms>').includes('<b title="x">bold</b> &#34;q&#34;'), 'quotes inside a tag are left alone');

// ---- a time typed after the recipient ----
for (const [typed, written] of [['10:29PM', '10:29 PM'], ['22:29', '10:29 PM'], ['9:13', '9:13 AM'], ['12:05', '12:05 PM'], ['0:15', '12:15 AM'], ['12am', '12:00 AM'], ['10 pm', '10:00 PM']]) {
    assert.equal(clockTime(typed), written);
}
for (const notATime of ['7', '25:00', '9:75', 'Tue', '']) assert.equal(clockTime(notATime), null);
assert.equal(expandShorthand('text Bob 10:29PM: hey'), '<sms to="Bob" time="10:29 PM">hey</sms>');
assert.equal(expandShorthand('text Bob 22:29: hey'), expandShorthand('text Bob 10:29PM: hey'), '24-hour and 12-hour forms are the same');
assert.equal(expandShorthand('text Bob 9:13: hey'), '<sms to="Bob" time="9:13 AM">hey</sms>', 'no am or pm: read as a 24-hour clock, so morning');
assert.equal(expandShorthand('text Bob at 9:13: hey'), '<sms to="Bob" time="9:13 AM">hey</sms>');
assert.equal(expandShorthand('text Bob: 10:30 works?'), '<sms to="Bob">10:30 works?</sms>', 'a time in the message is not the message\'s time');
assert.equal(expandShorthand('text Bob:30 mins: ok'), '<sms to="Bob">30 mins: ok</sms>');
assert.equal(expandShorthand('dm Dave on Chatter as @alice 10:29 pm: hi'), '<dm from="@alice" to="Dave" app="Chatter" time="10:29 PM">hi</dm>');
assert.deepEqual(typedHandles('dm Dave on Chatter as @alice 10:29 pm: hi'), [{ app: 'chatter', handle: '@alice' }]);
assert.equal(expandShorthand('text Bob 10: hey'), 'text Bob 10: hey', 'a bare number is not a time, and not part of a name');
assert.equal(expandShorthand('text bob 22:29: hey', {}, canon), '<sms to="Bob" time="10:29 PM">hey</sms>');
assert.equal(commandToTag('sms', 'Bob hey', { time: '22:29' }), '<sms to="Bob" time="10:29 PM">hey</sms>');
assert.equal(commandToTag('dm', 'chatter @A hi', { time: 'Tue' }), '<dm to="@A" app="Chatter" time="Tue">hi</dm>', 'a time that is not a clock time is kept as given');
const timedOnce = expandShorthand('text Bob 22:29: hey');
assert.equal(expandShorthand(timedOnce), timedOnce, 'running it twice changes nothing');

// ---- timestamps ----
const timed = renderArtifacts('<thread><sms from="Mara" time="9:41 PM">a</sms><sms from="Mara" time="9:44 PM">b</sms></thread>');
assert.equal((timed.match(/<span class="eye-time">9:4[14] PM<\/span>/g) || []).length, 2);
assert.ok(!timed.includes('eye-same'), 'a message with a time keeps its name and time line');
assert.ok(INSTRUCTION.includes('time="9:41 PM"') && INSTRUCTION.includes('Seen 2:14 PM'));

// ---- picker colours ----
assert.match(autoHex('Bob'), /^#[0-9a-f]{6}$/);
assert.ok(overrideRule('bob', '#050505').includes('--eye-fg: #ffffff'), 'near-black pick gets white text');
assert.ok(overrideRule('bob', '#fafafa').includes('--eye-fg: #000000'), 'near-white pick gets black text');
assert.ok(!overrideRule('bob', '#050505').includes('--eye-nick: #050505'), 'near-black pick is lightened for the dark chat panel');
assert.ok(overrideRule('bob', '#ffcc00').includes('--eye-nick: #ffcc00'), 'a bright pick is used as it is in the chat panel');
assert.ok(overrideRule('bob', '#7a2e4d').startsWith('.mes_text [data-from="bob"] {'));

// ---- what is remembered: one set per chat, or per character when its chats share one ----
const chatSet = emptyStore();
learnHandle(chatSet, 'Alice', 'chatter', '@alice');
assert.equal(learnHandle(chatSet, 'Alice', 'chatter', '@alice'), false, 'the same handle again changes nothing');
learnHandle(chatSet, 'Alice', 'chatter', '@AliceCo');
assert.deepEqual(personaIn(chatSet, 'Alice'), { accounts: ['@alice', '@AliceCo'], handles: { chatter: '@AliceCo' } }, 'two accounts on one app are both kept; the last used is the default');
assert.deepEqual(personaIn(chatSet, 'Someone else'), { accounts: [], handles: {} }, 'another persona has its own accounts');
assert.ok(!('Someone else' in chatSet.personas), 'reading a persona does not create it');
forgetHandle(chatSet, 'Alice', '@AliceCo');
assert.deepEqual(personaIn(chatSet, 'Alice'), { accounts: ['@alice'], handles: {} });

const characterSet = emptyStore();
characterSet.colors.bob = '#000000';
characterSet.colors.carol = '#ffffff';
learnHandle(characterSet, 'Alice', 'chatter', '@old');
rememberNames(characterSet, ['Bob \u{1F43A}', 'Carol']);
assert.equal(rememberNames(characterSet, ['bob', 'CAROL']), false, 'a name already known keeps its first spelling');
chatSet.colors.bob = '#112233';
chatSet.inject = false;
chatSet.tags.system_window = true;
learnHandle(chatSet, 'Alice', 'chatter', '@AliceCo');
const before = JSON.stringify(chatSet);
const shared = mergeStores(copyStore(characterSet), chatSet);
assert.deepEqual(shared.colors, { bob: '#112233', carol: '#ffffff' }, 'the set being merged in wins a clash; nothing else is lost');
assert.equal(emptyStore().inject, true, 'injection is on unless turned off');
assert.deepEqual(shared.tags, { system_window: true }, 'which tags are taught carries over');
assert.equal(shared.inject, false, 'turning it off in the set merged in carries over');
assert.deepEqual(shared.personas.Alice, { accounts: ['@old', '@alice', '@AliceCo'], handles: { chatter: '@AliceCo' } });
assert.deepEqual(shared.names, { bob: 'Bob \u{1F43A}', carol: 'Carol' });
assert.equal(JSON.stringify(chatSet), before, 'merging does not change the set merged in');
const copied = copyStore(shared);
copied.colors.bob = '#abcdef';
assert.equal(shared.colors.bob, '#112233', 'a copy is separate');

// ---- moving what earlier versions kept for every chat ----
const oldSettings = { colors: { bob: '#112233' }, handles: { chatter: '@alice' }, accounts: ['@alice', '@AliceCo'], inject: false, shared: { x: true } };
const moved = takeLegacy(oldSettings, 'Alice');
assert.deepEqual(moved, { colors: { bob: '#112233' }, inject: true, tags: {}, personas: { Alice: { accounts: ['@alice', '@AliceCo'], handles: { chatter: '@alice' } } }, names: {} });
assert.deepEqual(oldSettings, { shared: { x: true } }, 'the old fields are removed and nothing else is touched');
assert.equal(takeLegacy(oldSettings, 'Alice'), null, 'there is nothing to move a second time');
assert.equal(takeLegacy({ colors: {}, handles: {}, accounts: [], inject: false }, 'Alice'), null, 'an empty old set is not moved, and its old off-by-default choice is dropped');


// ---- A line with no recipient answers the last conversation of its kind ----
{
    const own = new Set(['alice', 'alice1']);
    const seen = [
        '<thread><sms from="Bob">hi</sms>\n<sms from="Carol">hello</sms>\n<sms to="Bob, Carol">hey both</sms></thread>',
        '<thread app="Chatter"><dm from="@Dave_88" display_name="Dave R.">where</dm></thread>',
        '<email from="Frank Stone &lt;frank@example.com&gt;" to="Alice" subject="FWD: Re: Invoice">see below</email>',
    ];
    const convos = seen.flatMap(mes => conversationsIn(mes, own));
    assert.deepEqual(convos, [
        { kind: 'sms', to: 'Bob, Carol', app: '', subject: '' },
        { kind: 'dm', to: '@Dave_88', app: 'Chatter', subject: '' },
        { kind: 'email', to: 'Frank Stone &lt;frank@example.com&gt;', app: '', subject: 'FWD: Re: Invoice' },
    ], 'a thread is one conversation with everyone else in it; an email answers its sender');
    assert.deepEqual(conversationsIn('<sms to="Bob">mine</sms> <sms from="Alice" to="Erin">also mine</sms>', own).map(c => c.to), ['Bob', 'Erin'],
        'the user\'s own message answers to who it was sent to');
    const info = { last: Object.fromEntries(convos.map(c => [c.kind, c])) };
    const handles = { chatter: '@alice1' };

    assert.equal(expandShorthand('email: thanks', handles, undefined, info),
        '<email to="Frank Stone &lt;frank@example.com&gt;" subject="Re: Invoice">thanks</email>', 'a bare email is a reply, with one Re:');
    assert.equal(expandShorthand('email: Other | thanks', handles, undefined, info),
        '<email to="Frank Stone &lt;frank@example.com&gt;" subject="Other">thanks</email>', 'a typed subject wins');
    assert.equal(expandShorthand('text: on my way\nsms 10:29PM: nearly there', handles, undefined, info),
        '<thread><sms to="Bob, Carol">on my way</sms>\n<sms to="Bob, Carol" time="10:29 PM">nearly there</sms></thread>', 'a bare text goes to the whole thread; a time may stand alone');
    assert.equal(expandShorthand('dm: the cafe', handles, undefined, info),
        '<dm from="@alice1" to="@Dave_88" app="Chatter">the cafe</dm>', 'a bare dm keeps the app and the user\'s handle on it');
    assert.equal(expandShorthand('text Erin: hi\ntext: you there?', handles, undefined, info),
        '<thread><sms to="Erin">hi</sms>\n<sms to="Erin">you there?</sms></thread>', 'a line with a recipient earlier in the same message is what a bare line answers');
    assert.equal(expandShorthand('email Gina: Lunch | Friday?\nemail: or Saturday', handles, undefined, info),
        '<email to="Gina" subject="Lunch">Friday?</email>\n<email to="Gina" subject="Re: Lunch">or Saturday</email>');
    for (const prose of ['Email: sent this morning.', 'Text: none.', 'email: thanks']) {
        const with_ = prose === 'email: thanks' ? {} : info;
        assert.equal(expandShorthand(prose, handles, undefined, with_), prose, `left alone: ${prose}`);
    }
    assert.deepEqual(typedHandles('email: thanks\ndm: hi', undefined, info), [], 'a bare line teaches no handle');

    // ---- Messages to the same people, one after another, become one thread ----
    const three = '<sms to="Bob">a</sms>\n<sms to="Bob">b</sms>\n<sms to="Bob">c</sms>';
    assert.equal(wrapThreads(three), `<thread>${three}</thread>`);
    assert.equal(wrapThreads(wrapThreads(three)), wrapThreads(three), 'wrapping twice changes nothing');
    assert.equal(wrapThreads('<sms to="Bob">a</sms>'), '<sms to="Bob">a</sms>', 'one message is left alone');
    assert.equal(wrapThreads('Prose.\n<sms to="Bob">a</sms>\n<sms to="Bob">b</sms>\n<sms to="Carol">c</sms>\nMore.'),
        'Prose.\n<thread><sms to="Bob">a</sms>\n<sms to="Bob">b</sms></thread>\n<sms to="Carol">c</sms>\nMore.', 'a different recipient is a different conversation');
    assert.equal(wrapThreads('<sms to="Bob">a</sms>\nI waited.\n<sms to="Bob">b</sms>'), '<sms to="Bob">a</sms>\nI waited.\n<sms to="Bob">b</sms>', 'prose between keeps them apart');
    assert.equal(wrapThreads('<dm to="@Dave_88" app="Chatter">a</dm>\n<dm to="@Dave_88" app="Other">b</dm>'), '<dm to="@Dave_88" app="Chatter">a</dm>\n<dm to="@Dave_88" app="Other">b</dm>', 'so does a different app');
    const drawn = mes => renderArtifacts(mes, own, 'Alice').replace(/\n+/g, '\n').trim();
    assert.equal(drawn(wrapThreads(three)), drawn(three), 'a wrapped double text is drawn as it was before');

    // ---- A group conversation with a name; app="sms" is the phone's own texts ----
    const club = '<thread app="sms" title="Book Club"><sms from="Bob">who is hosting</sms>\n<sms from="Carol">me</sms></thread>';
    const clubDrawn = renderArtifacts(club, own, 'Alice');
    assert.ok(clubDrawn.includes('<span class="eye-group">Book Club</span>'), 'the group name is in the heading');
    assert.ok(clubDrawn.includes('eye-convo-sms') && !clubDrawn.includes('eye-app') && !clubDrawn.includes('eye-dm'), 'a thread of texts marked app="sms" shows no app');
    assert.ok(!renderArtifacts('<thread app="sms"><dm from="Carol">me</dm></thread>').includes('eye-dm'), 'a dm written into one is tolerated and drawn as a text');
    assert.ok(renderArtifacts('<thread app="Chatter" name="Book Club"><dm from="@Dave_88">hi</dm></thread>').includes('<span class="eye-app">Chatter</span><span class="eye-group">Book Club</span>'), 'an app thread shows both; name is read as title');
    assert.ok(!renderArtifacts('<thread><sms from="Bob">hi</sms></thread>').includes('eye-group'), 'no title, no group name');
    assert.ok(renderArtifacts('<dm app="SMS" from="Bob">hi</dm>').includes('eye-convo-sms'), 'a loose dm marked sms is a text');
    assert.deepEqual(conversationsIn(club, own), [{ kind: 'sms', to: 'Book Club', app: '', subject: '' }], 'a named group is answered by its name');
    assert.deepEqual(conversationsIn('<thread app="Chatter" title="Book Club"><dm from="@Dave_88">hi</dm></thread>', own),
        [{ kind: 'dm', to: 'Book Club', app: 'Chatter', subject: '' }]);
    assert.equal(expandShorthand('text: i can host', handles, undefined, { last: { sms: conversationsIn(club, own)[0] } }), '<sms to="Book Club">i can host</sms>');
    assert.equal(expandShorthand('dm Bob on sms: hi'), '<sms to="Bob">hi</sms>', 'a typed dm on sms is a text');
    assert.equal(commandToTag('dm', 'sms Bob hi'), '<sms to="Bob">hi</sms>', 'and so is the command');
    assert.ok(instructionFor(['sms']).includes('<thread title="Group name">'), 'the model is told a group can carry its name');

    // The same from a command, which has no colon: the leading word is the recipient only when it reads as one.
    const canon = name => ({ bob: 'Bob' })[name.toLowerCase()] ?? null;
    const cmd = (kind, text, named = {}) => commandToTag(kind, text, named, handles, canon, info);
    assert.equal(cmd('sms', 'on my way'), '<sms to="Bob, Carol">on my way</sms>', 'no recipient: a reply');
    assert.equal(cmd('sms', 'to be honest i forgot'), '<sms to="Bob, Carol">to be honest i forgot</sms>', 'a reply keeps its leading "to"');
    assert.equal(cmd('sms', 'bob hey'), '<sms to="Bob">hey</sms>', 'a known name is the recipient');
    assert.equal(cmd('sms', 'Zed hey'), '<sms to="Zed">hey</sms>', 'so is a capitalised one');
    assert.equal(cmd('sms', '"zed" hey'), '<sms to="zed">hey</sms>', 'and a quoted one');
    assert.equal(cmd('sms', 'hey', { to: 'zed' }), '<sms to="zed">hey</sms>', 'to= is always the recipient');
    assert.equal(cmd('sms', 'hey', { time: '22:29' }), '<sms to="Bob, Carol" time="10:29 PM">hey</sms>');
    assert.equal(cmd('dm', 'the cafe'), '<dm from="@alice1" to="@Dave_88" app="Chatter">the cafe</dm>', 'a dm reply keeps the app and handle');
    assert.equal(cmd('dm', 'ok'), '<dm from="@alice1" to="@Dave_88" app="Chatter">ok</dm>', 'a one-word dm reply');
    assert.equal(cmd('dm', 'chatter @Erin hi'), '<dm from="@alice1" to="@Erin" app="Chatter">hi</dm>', 'a dm with a recipient is unchanged');
    assert.equal(cmd('email', 'thanks, got it'), '<email to="Frank Stone &lt;frank@example.com&gt;" subject="Re: Invoice">thanks, got it</email>');
    assert.equal(cmd('email', 'thanks', { subject: 'Other' }), '<email to="Frank Stone &lt;frank@example.com&gt;" subject="Other">thanks</email>');
    assert.equal(commandToTag('sms', 'on my way', {}, handles, canon, {}), '<sms to="on">my way</sms>', 'with nothing to answer, the first word is the recipient');
    assert.ok(renderArtifacts('<email from="Frank Stone &lt;frank@example.com&gt;">x</email>').includes('Frank Stone &lt;frank@example.com&gt;'),
        'a character reference in an attribute is not escaped twice');
    assert.ok(renderArtifacts('<email from="A & B">x</email>').includes('A &amp; B'), 'a plain ampersand still is');
}

console.log('ok: all checks passed');

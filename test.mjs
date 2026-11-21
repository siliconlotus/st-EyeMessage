// Checks for render.js. Run with:  node test.mjs
import assert from 'node:assert/strict';
import { renderArtifacts, expandShorthand, typedHandles, commandToTag, splitCommands, clockTime, namesIn, collectContacts, hueOf, normaliseName, autoHex, overrideRule, HUES, TAGS, INSTRUCTION } from './render.js';

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
    '<sms to="Bob">i\'ll be there in 5</sms>\n<sms to="Bob">...okay maybe more like 20</sms>');
assert.equal(expandShorthand('text carol jones: see you at 9?', {}, canon), '<sms to="Carol Jones">see you at 9?</sms>');
assert.equal(expandShorthand('dm dave_88 on chatter: hi', {}, canon), '<dm to="@Dave_88" app="Chatter">hi</dm>');
assert.equal(expandShorthand('text me when: you land', {}, canon), 'text me when: you land', 'prose is still left alone');
assert.deepEqual(panels(renderArtifacts(expandShorthand("text bob: a\ntext bob: b", {}, canon), new Set(['alice']), 'Alice')).map(p => p.length), [2], 'a double text lands on one panel');
assert.equal(commandToTag('sms', 'to bob running late', {}, {}, canon), '<sms to="Bob">running late</sms>');
assert.equal(commandToTag('sms', 'Tobias running late'), '<sms to="Tobias">running late</sms>', '"to" is only dropped as a word of its own');

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

console.log('ok: all checks passed');

// Checks for render.js. Run with:  node test.mjs
import assert from 'node:assert/strict';
import { emptyStore, personaIn, learnHandle, forgetHandle, rememberNames, mergeStores, copyStore, takeLegacy, personOf, linkAlias, unlinkAlias } from './store.js';
import { parseTree, structuredBody, stylesInChat, stylesForReply, setChatStyles } from './structure.js';
import { safeColour, allowOutsideImages } from './html.js';
import { channelsIn, channelKey, mergeChatBlocks, ANY_CHANNEL, conversationsIn, wrapThreads } from './render.js';
import { renderArtifacts, expandShorthand, typedHandles, commandToTag, splitCommands, clockTime, namesIn, collectContacts, hueOf, normaliseName, autoHex, overrideRule, pickRules, appsIn, readIcon, iconRule, HUES, TAGS, TAG_LABELS, instructionFor } from './render.js';
const INSTRUCTION = instructionFor(TAGS); // everything switched on

// ---- aliases: several names, one person ----
{
    const s = emptyStore();
    s.colors = { rob: '#007d00' };
    linkAlias(s, 'rob', 'bob');
    assert.deepEqual(s.aliases, { rob: 'bob' });
    assert.deepEqual(s.colors, { bob: '#007d00' }, 'the main name takes a colour only the alias had');
    assert.equal(personOf(s, 'rob'), 'bob');
    assert.equal(personOf(s, 'bob'), 'bob');
    assert.equal(personOf(s, 'constructor'), 'constructor', 'a name is never read off the object itself');

    s.colors.bobby = '#112233';
    linkAlias(s, 'bobby', 'rob');
    assert.deepEqual(s.aliases, { rob: 'bob', bobby: 'bob' }, 'an alias of an alias is an alias of the person');
    assert.deepEqual(s.colors, { bob: '#007d00' }, 'the main name keeps its own colour');

    linkAlias(s, 'bob', 'rob');
    linkAlias(s, 'bob', 'bob');
    linkAlias(s, '', 'bob');
    linkAlias(s, 'bob', '');
    assert.deepEqual(s.aliases, { rob: 'bob', bobby: 'bob' }, 'nothing can be its own alias, or no one\'s');

    linkAlias(s, 'bob', 'robert');
    assert.deepEqual(s.aliases, { rob: 'robert', bobby: 'robert', bob: 'robert' }, 'a person\'s aliases move with them');
    assert.deepEqual(s.colors, { robert: '#007d00' });
    unlinkAlias(s, 'bob');
    assert.deepEqual(s.aliases, { rob: 'robert', bobby: 'robert' });

    const merged = mergeStores({ ...emptyStore(), aliases: { a: 'b' } }, { ...emptyStore(), aliases: { b: 'a', c: 'a' } });
    assert.deepEqual(merged.aliases, { a: 'b', c: 'b' }, 'two sets that name a person differently still make one person');
    assert.deepEqual(copyStore({}).aliases, {});
    assert.equal(emptyStore().hud, false, 'the HUD example is off in a new set');
    assert.equal(copyStore({}).hud, false, 'and in one saved before it existed');
    assert.equal(mergeStores(emptyStore(), { ...emptyStore(), hud: true }).hud, true, 'a merge carries it');
    assert.deepEqual(mergeStores({ ...emptyStore(), aliases: { rob: 'bob' } }, { ...emptyStore(), colors: { rob: '#007d00' } }).colors, { bob: '#007d00' },
        'a colour picked for what is an alias in the other set goes to the person');
    assert.deepEqual(mergeStores({ ...emptyStore(), aliases: { rob: 'bob' }, colors: { bob: '#112233' } }, { ...emptyStore(), colors: { rob: '#007d00' } }).colors, { bob: '#112233' });

    const picked = pickRules({ colors: { bob: '#007d00', rob: '#ffffff', x: 'red;}' }, aliases: { rob: 'bob' } });
    assert.equal(picked.length, 1, 'one rule for the person; an alias has no colour of its own, and only hex is written');
    assert.ok(picked[0].startsWith('.mes_text [data-from="bob"], .mes_text [data-from="rob"] { --element-bg: #007d00;'));
    const auto = pickRules({ colors: {}, aliases: { rob: 'bob', bobby: 'bob' } });
    assert.deepEqual(auto, [`.mes_text [data-from="rob"], .mes_text [data-from="bobby"] { --element-hue: ${hueOf('bob') * (360 / HUES)}; }`], 'an automatic colour is shared too');
    assert.deepEqual(pickRules({ colors: {}, aliases: {} }), []);
}

// ---- app icons ----
{
    assert.deepEqual(appsIn('<thread app="Chatter"><dm from="@A">a</dm><dm from="@B">b</dm></thread> and <dm app="Other" from="@A">c</dm>'), ['Chatter', 'Other'], 'one per conversation');
    assert.deepEqual(appsIn('<thread><dm app="Chatter" from="@A">a</dm><dm app="Chatter" from="@B">b</dm></thread>'), ['Chatter'], 'an app named on the messages counts once');
    assert.deepEqual(appsIn('<thread app="Signal"><sms from="Bob">a</sms></thread>'), ['Signal'], 'texts in an app too');
    assert.deepEqual(appsIn('<thread app="sms"><dm app="Chatter" from="Bob">a</dm></thread><dm app="text" from="Bob">a</dm><screen app="Maps">a</screen>'), [], 'nothing that shows no app name');
    assert.deepEqual([undefined, 'prose'].flatMap(appsIn), []);

    assert.equal(readIcon(' fa-camera '), 'fa-camera');
    assert.equal(readIcon('fa-brands fa-Instagram'), 'fa-instagram', 'a style class in front is dropped');
    assert.equal(readIcon('fa-instagram fa-brands'), 'fa-instagram');
    assert.equal(readIcon('<i class="fa-solid fa-camera"></i>'), 'fa-camera', 'pasted from the Font Awesome site');
    assert.equal(readIcon('\u{1F4F8}'), '\u{1F4F8}');
    assert.equal(readIcon('\u{1F469}\u200D\u{1F4BB} work'), '\u{1F469}\u200D\u{1F4BB}', 'one character, joined emoji kept whole');
    assert.equal(readIcon('  '), '');
    assert.equal(readIcon(undefined), '');

    const emoji = iconRule('chatter', '\u{1F4F8}');
    assert.ok(emoji.startsWith('.custom-eye-app-chatter .custom-eye-app::before {') && emoji.includes('content: "\u{1F4F8}"'));
    assert.ok(!emoji.includes('Font Awesome'), 'the icon font has its own glyphs for emoji, so it is not used for one');
    const fa = iconRule('chatter', '\uF16D', true);
    assert.ok(fa.includes('"Font Awesome 6 Free", "Font Awesome 6 Brands"') && fa.includes('font-synthesis: none'), 'a brand icon is not made bold');
    assert.equal(iconRule('chatter', ''), '');
    assert.equal(iconRule('!!!', 'x'), '', 'an app with no letters has no class to aim at');
    assert.ok(iconRule('a{}b', '"').startsWith('.custom-eye-app-ab ') && iconRule('a', '"').includes('content: "\\""'), 'a saved set cannot add rules of its own');

    const target = mergeStores({ ...emptyStore(), icons: { a: 'fa-x', b: 'B' } }, { ...emptyStore(), icons: { a: 'A' } });
    assert.deepEqual(target.icons, { a: 'A', b: 'B' });
    assert.deepEqual(copyStore({}).icons, {}, 'a set saved before icons reads as having none');
}

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
assert.equal(usual, INSTRUCTION, 'every tag is taught unless switched off');
assert.ok(!TAGS.includes('system_window') && !INSTRUCTION.includes('system_window'), 'a system window is taught as a screen');
assert.match(INSTRUCTION, /`<screen[^\n]*System/);
assert.ok(usual.includes('`<sms') && usual.includes('`<thread>`') && usual.includes('Example, two conversations'));
const onlySigns = instructionFor(['sign']);
assert.ok(onlySigns.includes('`<sign>`') && !onlySigns.includes('<thread') && !onlySigns.includes('Example') && !onlySigns.includes('{{user}}'), 'with no messages taught, the notes on threads and the example go too');
assert.equal(instructionFor(['system_window']), '', 'a choice saved for a tag that is no longer taught does nothing');
assert.equal(instructionFor([]), '', 'nothing switched on: nothing injected');
assert.equal(instructionFor(['screen', 'sms']), instructionFor(['sms', 'screen']), 'the order chosen does not matter');

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

// ---- Emails ----
{
    const me = new Set(['alice']);
    const mail = renderArtifacts('<email from="Frank Stone &lt;frank@example.com&gt;" to="Alice, Gina" subject="FWD: Re: Lease" time="9:41 AM" attachments="plan.pdf, sizes <1>.xlsx">\nAlice —\n\nOne,\nstill one. She said "yes\n\nNo" then.\n\n— Frank\n</email>', me, 'Alice');
    assert.ok(mail.includes('<span class="eye-title"><span class="eye-re">FWD</span>Re: Lease</span>'), 'the first RE or FWD is a pill, and only that one');
    assert.ok(mail.includes('<span class="eye-badge" aria-hidden="true">F</span>'), 'the badge holds the sender\'s initial');
    assert.ok(mail.includes('<span class="eye-who">Frank Stone</span><span class="eye-handle">frank@example.com</span><span class="eye-to">To Alice, Gina</span>'), 'the name, the address, and who it is to');
    assert.ok(!mail.includes('→'), 'the To line says it, so no arrow');
    assert.ok(mail.includes('<span class="eye-time">9:41 AM</span>'));
    assert.deepEqual([...mail.matchAll(/<span class="eye-par">(.*?)<\/span>/g)].map(m => m[1]), ['Alice —', 'One,<br>still one. She said &#34;yes', 'No&#34; then.'], 'a paragraph each; SillyTavern would squash a blank line made of line breaks');
    assert.ok(mail.includes('<span class="eye-par eye-signoff">— Frank</span>'));
    assert.ok(mail.includes('<span class="eye-files"><span class="eye-file">plan.pdf</span><span class="eye-file">sizes &lt;1&gt;.xlsx</span></span>'));
    assert.equal(mail.trim().split('\n').length, 1, 'one line, so Markdown leaves it alone');

    const sent = renderArtifacts('<email to="Gina (Print Works)" subject="Re: Posters">tonight</email>', me, 'Alice');
    assert.ok(sent.includes('eye-out') && sent.includes('>A</span>') && sent.includes('<span class="eye-who">Alice</span><span class="eye-to">To Gina (Print Works)</span>'), 'a sent one is labelled the same way');
    assert.ok(!sent.includes('eye-signoff') && !sent.includes('eye-files') && !sent.includes('eye-thread'), 'nothing is drawn for what it does not have');
    assert.ok(renderArtifacts('<email from="f.vale@example.com">x</email>').includes('>F</span><span class="eye-names"><span class="eye-who">f.vale@example.com</span></span>'), 'a bare address is the name');
    assert.ok(renderArtifacts('<email from="@fs" display_name="Frank">x</email>').includes('<span class="eye-who">Frank</span><span class="eye-handle">@fs</span>'));
    assert.ok(!renderArtifacts('<email subject="Notice">x</email>').includes('eye-head'), 'no sender, no header');
    assert.ok(renderArtifacts('<email from="B" subject="Re:">x</email>').includes('<span class="eye-title">Re:</span>'), 'a prefix with nothing after it is the subject');
    assert.ok(renderArtifacts('<email from="B" subject="Reading list">x</email>').includes('>Reading list<'));
    assert.ok(!renderArtifacts('<email from="B" subject="">\n— just this\n</email>').includes('eye-signoff'), 'a body that is only a dashed line is not a sign-off');
    assert.ok(renderArtifacts('<email from="B">Bye\n— B</email>').includes('<span class="eye-par">Bye</span><span class="eye-par eye-signoff">— B</span>'), 'a sign-off on the line below');
    assert.ok(!renderArtifacts('<email from="B">Buy:\n\n- milk</email>').includes('eye-signoff'), 'a list is not one');
    assert.ok(!renderArtifacts(`<email from="B">Hi\n\n— ${'and on '.repeat(20)}</email>`).includes('eye-signoff'), 'nor is a long line');
    assert.ok(/<div class="eye eye-email[^"]*"[^>]* style="--element-accent:color-mix\([^"]*;background:#fff">/.test(renderArtifacts('<email from="B" color="red" style="background:#fff">x</email>')), 'a color or a style on the tag overrides the theme');
    assert.ok(!renderArtifacts('<letter from="B" style="background:#fff">x</letter>').includes('style='), 'other objects still take none');
    assert.ok(!renderArtifacts('<letter from="Mara">Hi</letter>').includes('eye-typed'), 'a letter is handwritten');
    assert.ok(instructionFor(['letter']).includes('`typed`') && !instructionFor(['sms']).includes('`typed`'), 'the model is told how to mark print');
    assert.ok(renderArtifacts('<letter from="Harbour Café" typed>Total 4.20</letter>').includes('eye-typed"'), 'unless it is typed');
    assert.ok(renderArtifacts('<letter typed="yes" from="A">x</letter>').includes('eye-typed"'), 'written either way');
    assert.ok(!renderArtifacts('<letter from="Mara typed it">x</letter>').includes('eye-typed') && !renderArtifacts('<sms from="A" typed>x</sms>').includes('eye-typed'), 'but not inside a value, nor on anything else');
    assert.ok(instructionFor(['email']).includes('`attachments`'));
}

// ---- A tag in code is quoted, not written ----
{
    const quoted = 'Plan: use a `<screen>` tag for the till, and `<sms>` later.\n[Monday, 2 PM]\n<screen title="Till">Total: 40</screen>\nAfter.';
    const drawn = renderArtifacts(quoted);
    assert.ok(drawn.startsWith('Plan: use a `<screen>` tag for the till, and `<sms>` later.\n[Monday, 2 PM]\n'), 'the quoted tags and the text after them stay as written');
    assert.equal(drawn.split('class="eye ').length - 1, 1);
    assert.ok(drawn.includes('<span class="eye-title">Till</span><span class="eye-body">Total: 40</span>'), 'the real screen is drawn');
    const fenced = 'Like this:\n```\n<sms from="Bob">hi</sms>\n```\nand ``<email>`` too.';
    assert.equal(renderArtifacts(fenced), fenced, 'nor in a fenced block or a double-backtick span');
    assert.deepEqual(collectContacts(fenced), [], 'and nobody in one is listed');
    const inside = renderArtifacts('<email from="Frank">run `ls <dir>` first</email>');
    assert.ok(inside.includes('run `ls &lt;dir&gt;` first') || inside.includes('run `ls <dir>` first'), 'code inside a tag is kept');
    assert.ok(!inside.includes('\u0001'));
    const whole = 'Check her reply to `<sms to="Gina">bring the ladder</sms>` first.\n<thread><sms from="Gina">done</sms></thread>';
    const wholeDrawn = renderArtifacts(whole, new Set(['alice']), 'Alice');
    assert.ok(wholeDrawn.startsWith('Check her reply to `<sms to="Gina">bring the ladder</sms>` first.'), 'a whole tag in backticks is quoted too');
    assert.equal(wholeDrawn.split('class="eye ').length - 1, 1, 'only the real text is drawn');
    assert.deepEqual(conversationsIn(whole, new Set(['alice'])).map(c => c.to), ['Gina'], 'and only it is answered');
}

// ---- Several emails as one card ----
{
    const me = new Set(['alice']);
    const cards = html => [...html.matchAll(/<div class="(eye-mails|eye eye-email)/g)].map(m => m[1]);
    const subjects = html => [...html.matchAll(/<span class="eye-title">(.*?)<\/span>(?=<span class="eye-head)/g)].map(m => m[1].replace(/<[^>]+>/g, '|'));
    const J = 'eye-mails';
    const E = 'eye eye-email';

    const thread = renderArtifacts('<thread title="Lettings">\n<email from="Frank &lt;frank@example.com&gt;" to="Alice" subject="Lease">a</email>\n<email to="Frank &lt;frank@example.com&gt;, Gina" subject="Re: lease">b</email>\n<email from="Gina" subject="RE: Re: Lease">c</email>\n<email from="Gina">d</email>\n<email from="Frank" subject="Keys">e</email>\n</thread>', me, 'Alice');
    assert.deepEqual(cards(thread), [J, E, E, E, E, E], 'the emails of a thread are one card');
    assert.deepEqual(subjects(thread), ['Lease', 'Keys'], 'a reply repeats no subject; a new subject is shown');
    assert.equal(thread.split('Lettings').length, 2, 'the title is shown once');
    assert.ok(thread.includes('<span class="eye-to">To Frank, Gina</span>'), 'the To line gives names, not addresses');
    assert.equal(thread.trim().split('\n').length, 1);
    assert.equal(thread.split('<div').length, thread.split('</div>').length);

    assert.ok(!renderArtifacts('<thread title="Lease"><email from="Frank" subject="RE: Lease">a</email></thread>').includes('eye-group'), 'a title that only repeats the subject is not shown');
    assert.deepEqual(cards(renderArtifacts('<thread><email from="Frank" subject="Lease">a</email></thread>')), [E], 'one email is a card by itself');
    const loose = '<email from="Frank" subject="Lease">a</email>\n\n<email from="Gina" subject="Fwd: Lease">b</email>';
    assert.deepEqual(cards(renderArtifacts(loose)), [J, E, E], 'the same subject joins outside a thread too');
    assert.deepEqual(cards(renderArtifacts(`${loose}\nShe scrolls.\n${loose}`)), [J, E, E, J, E, E], 'prose between starts a new card');
    assert.ok(/<\/div>\s*She scrolls\.\s*<div class="eye-mails/.test(renderArtifacts(`${loose}\nShe scrolls.\n${loose}`)), 'and stays where it was');
    assert.deepEqual(cards(renderArtifacts('<email from="Frank" subject="Lease">a</email>\n<email from="Gina" subject="Keys">b</email>')), [E, E], 'another subject does not');
    assert.deepEqual(cards(renderArtifacts('<email from="Frank">a</email>\n<email from="Gina">b</email>')), [E, E], 'nor do emails with no subject');
    assert.deepEqual(cards(renderArtifacts('<email from="Frank" subject="Lease">a</email>\n<thread><email from="Gina" subject="Re: Lease">b</email></thread>')), [E, E], 'a thread is a card of its own');
    const order = html => [...html.matchAll(/eye-mails|eye eye-email|eye-convo |eye-note/g)].map(m => m[0].trim());
    const mail = n => `<email from="${n}" subject="Lease">x</email>`;
    assert.deepEqual(order(renderArtifacts(`<thread>${mail('A')}${mail('B')}<sms from="Bob">t</sms>${mail('C')}</thread>`)), [J, E, E, 'eye-convo', E], 'a text between them ends the card');
    assert.deepEqual(order(renderArtifacts(`<thread>${mail('A')}\nTwo days later\n${mail('B')}</thread>`)), [E, 'eye-note', E], 'and so does a plain line, with no panel of its own');
    assert.equal(renderArtifacts(`<thread title="Lettings">Monday\n${mail('A')}\nTwo days later\n${mail('B')}</thread>`).split('Lettings').length, 2, 'and no title: that is on the first email');
    assert.deepEqual(order(renderArtifacts('<thread>Seen 2:14 PM</thread>')), ['eye-convo', 'eye-note'], 'a thread of only a plain line is still a panel');
    assert.ok(renderArtifacts('<email from="Frank" time="9:41 AM">x</email>').includes('<span class="eye-names"><span class="eye-time">'), 'the time comes first, so it floats beside the name');
    assert.equal(conversationsIn('<thread app="Chatter"><email from="Frank">a</email></thread>')[0].app, '', 'a thread\'s app is not an email\'s');
    assert.deepEqual(subjects(renderArtifacts(`<thread>${mail('A')}\nTwo days later\n${mail('B')}</thread>`)), ['Lease', 'Lease'], 'a new card names its subject again');
    assert.deepEqual(order(renderArtifacts(`${mail('A')}\n<sms from="Bob">t</sms>\n${mail('B')}`)), [E, 'eye-convo', E]);
    assert.ok(instructionFor(['email']).includes('`<thread>`') && !instructionFor(['letter']).includes('<thread>'), 'the model is told emails can go in a thread');
}

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
// Models put other objects in a thread too. They are drawn as themselves, off the messages' panel.
{
    const mailIn = '<thread title="Stone & Sons">\n<email from="frank@example.com" subject="RE: Lease">\nDear Alice,\n\nTwo?\n</email>\n</thread>';
    const drawn = renderArtifacts(mailIn);
    assert.ok(drawn.includes('class="eye eye-email') && drawn.includes('<span class="eye-title"><span class="eye-re">RE</span>Lease</span>') && drawn.includes('frank@example.com'), 'an email in a thread keeps its subject and sender');
    assert.ok(!drawn.includes('eye-note') && !drawn.includes('eye-convo'), 'and is neither a note nor on a panel');
    assert.equal(drawn.split('Stone &amp; Sons').length, 2, 'the thread\'s title is shown once');
    const two = renderArtifacts('<thread title="Lease"><email from="Frank">a</email><email from="Gina">b</email></thread>');
    assert.deepEqual([two.split('class="eye eye-email').length - 1, two.split('eye-group').length - 1], [2, 1]);
    const mixed = renderArtifacts('<thread title="Club"><sms from="Bob">a</sms><screen title="Map">b</screen><sms from="Bob">c</sms></thread>');
    assert.deepEqual([...mixed.matchAll(/eye-convo |eye eye-screen/g)].map(m => m[0].trim()), ['eye-convo', 'eye eye-screen', 'eye-convo'], 'a screen between texts stands between their panels');
    assert.ok(!/<div class="eye-convo(?:(?!<\/div>).)*<div class="eye eye-screen/s.test(mixed), 'not inside one');
    assert.ok(renderArtifacts('<thread title="Club"><chat>Bob: hi</chat></thread>').includes('<span class="eye-title">Club</span>'), 'a live chat with no title takes the thread\'s');
    assert.ok(!renderArtifacts('<thread app="Chatter"><email from="Frank">a</email></thread>').includes('eye-app-'), 'a thread\'s app themes its messages, not an email in it');
    assert.equal(renderArtifacts('<thread title="Club"><email from="Frank">a</email><sms from="Bob">b</sms></thread>').split('eye-group').length, 3, 'a panel after an email still names its conversation');
    assert.ok(drawn.trim().split('\n').length === 1, 'still one line, so Markdown leaves it alone');
}
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

// ---- a system window, as older chats have it, is a screen ----
const status = renderArtifacts('The air chimes.\n<system_window title="Status">Name: Alice\nLevel: 3  →  4\n[Skill gained: Appraisal]</system_window>\nShe blinks.');
assert.ok(status.includes('<div class="eye eye-screen eye-in">') && status.includes('<span class="eye-title">Status</span>'));
assert.ok(status.includes('Name: Alice<br>Level: 3  →  4<br>[Skill gained: Appraisal]'), 'its lines are kept as written');
assert.ok(status.startsWith('The air chimes.') && status.endsWith('She blinks.'));
assert.equal(renderArtifacts('<system>not ours</system>'), '<system>not ours</system>', 'a bare <system> tag is left alone');

// ---- nested tags of the model's own naming ----
const statusBody = `
<identity><name>Alice</name><class>Wanderer</class><level>4</level></identity>
<vitals><hp value="42" max="60"/><mp value="18" max="18"/></vitals>
<attributes><str>7</str><agi>11</agi><int>14</int></attributes>
<skills><skill level="2">Appraisal</skill><skill level="1" new="true">Night Sight</skill></skills>
<quest_log><quest status="active">Clear the cellar<reward>40 silver</reward></quest></quest_log>
`;
const win = renderArtifacts(`<screen title="Status">${statusBody}</screen>`);
assert.equal(renderArtifacts(`<system_window title="Status">${statusBody}</system_window>`), win, 'drawn the same by either name');
assert.equal(win.trim().split('\n').length, 1, 'the whole window is one line');
assert.ok(win.includes('<span class="eye-sw-heading">Identity</span><span class="eye-sw-rows"><span class="eye-sw-cells" style="--n:3"><span class="eye-sw-cell"><span class="eye-sw-label">Name</span><span class="eye-sw-value">Alice</span></span>'), 'short plain values sit side by side under a heading made from the tag name');
assert.ok(win.includes('<span class="eye-sw-bar" data-name="hp"><span class="eye-sw-label">HP</span><span class="eye-sw-track"><span class="eye-sw-fill" style="width:70%"></span></span><span class="eye-sw-count">42 / 60</span></span>'), 'value and max make a bar');
assert.ok(win.includes('<span class="eye-sw-label">STR</span><span class="eye-sw-value">7</span>'), 'a short tag name is an abbreviation');
assert.ok(win.includes('<span class="eye-sw-row"><span class="eye-sw-value">Night Sight</span><span class="eye-sw-chips"><span class="eye-sw-chip">Level 1</span><span class="eye-sw-chip">New</span></span></span>'), 'repeated tags are a list; other attributes are shown beside each');
assert.ok(win.includes('<span class="eye-sw-heading">Quest log</span>'));
assert.ok(win.includes('<span class="eye-sw-group"><span class="eye-sw-heading">Clear the cellar<span class="eye-sw-chip">Active</span></span><span class="eye-sw-rows"><span class="eye-sw-row"><span class="eye-sw-label">Reward</span><span class="eye-sw-value">40 silver</span></span></span></span>'), 'a tag with words and tags inside is a section headed by its words');
assert.equal(structuredBody('Name: Alice\nLevel: 3 < 4\n[Skill gained: Appraisal]'), null, 'plain lines are not nested');
assert.equal(structuredBody('A <b>bold</b> line and an <i>italic</i> one'), null, 'formatting tags are not structure');
// the reader is forgiving
assert.deepEqual(parseTree('<a><b2>x</a>tail').children.map(c => c.name ?? c), ['a', 'tail'], 'a tag left open is closed by its parent');
assert.equal(parseTree('</nope>text').children.join(''), 'text', 'a closing tag with no opener is ignored');
assert.ok(structuredBody('<hp value="12" max="0"/><hp value="x" max="10"/>').includes('eye-sw-row'), 'a bar needs real numbers; otherwise it is a row');
assert.ok(structuredBody('<hp value="90" max="60"/>').includes('width:100%'), 'a bar never overflows');

// a ring: a bar drawn round
const ring = structuredBody('<hp value=42 max=60 chart=ring/>');
assert.ok(ring.includes('<span class="eye-sw-bar eye-sw-ring" data-name="hp" style="--element-fill:70%"><span class="eye-sw-dial"><span class="eye-sw-count">42 / 60</span></span><span class="eye-sw-label">HP</span>'), 'chart=ring draws the bar as a ring, the count in its hole');
assert.ok(!ring.includes('eye-sw-track') && !ring.includes('Chart'), 'with no track, and chart is not shown as a fact');
assert.ok(structuredBody('<hp value=4 max=8 chart=donut/>').includes('eye-sw-ring'), 'donut is a ring too');
assert.ok(structuredBody('<fuel value=60 max=100 chart=column/>').includes('<span class="eye-sw-bar eye-sw-column" data-name="fuel" style="--element-fill:60%"><span class="eye-sw-count">60 / 100</span><span class="eye-sw-gauge"></span><span class="eye-sw-label">Fuel</span>'), 'chart=column draws a bar standing up, the count over it');
assert.ok(structuredBody('<fuel value=6 max=10 chart=vertical/>').includes('eye-sw-column') && !structuredBody('<fuel value=6 max=10 chart=vertical/>').includes('Chart'), 'vertical is a column too');
const gauges = structuredBody('<shields><fore value=1 max=2 chart=ring/><aft value=1 max=2 chart=ring/><port value=1 max=2 chart=column/><note>x</note><hp value=1 max=2 chart=ring/></shields>');
assert.ok(gauges.includes('<span class="eye-sw-gauges" style="--n:3"><span class="eye-sw-bar eye-sw-ring" data-name="fore"'), 'rings and columns next to each other are laid out as a group, which knows its size');
assert.equal(gauges.match(/eye-sw-gauges/g).length, 1, 'a ring on its own is not a group');
assert.ok(!structuredBody('<a1><hp value=1 max=2/><mp value=1 max=2/></a1>').includes('eye-sw-gauges'), 'plain bars are not gauges');
assert.ok(structuredBody('<hp value=90 max=60 chart=ring/>').includes('--element-fill:100%'), 'a ring never overflows');
assert.ok(structuredBody('<hp value=4 max=8 chart=ring color="#00ff00"/>').includes('style="--element-fill:50%;--element-bar:#00ff00"'), 'a ring takes the colour');
assert.ok(!structuredBody('<hp value=4 max=8 chart=bar/>').includes('eye-sw-ring') && !structuredBody('<hp value=4 max=8 chart=bar/>').includes('Chart'), 'any other chart is a bar');
assert.ok(structuredBody('Level up!\n<stats><str>8</str><agi>11</agi></stats>').startsWith('<span class="eye-sw"><span class="eye-sw-note">Level up!</span>'), 'loose text between tags is kept as a note');
assert.ok(structuredBody('<item name="Potion" qty="3"/><item name="Rope"/>').includes('<span class="eye-sw-value">Potion</span><span class="eye-sw-chips"><span class="eye-sw-chip">Qty 3</span>'), 'a name attribute names the row');
assert.ok(structuredBody('<note>She said "wait</note><note>for me"</note>').includes('She said &#34;wait'), 'quote marks are made safe here too');

// tag-like text is not structure
assert.equal(structuredBody('$ cp <from> <to>\nUsage: grep <pattern> [file]'), null, 'when no tag is closed or carries attributes, the lines are plain');
assert.equal(structuredBody('<b>Usage</b><br/>cp <from> <to>'), null, 'a closed formatting tag or a line break does not count');
assert.ok(structuredBody('<hp value="42" max="60">').includes('eye-sw-bar'), 'a lone bar left open is still a bar');
assert.equal(structuredBody('See <https://example.com/> or <bob@example.com>'), null, 'an address in angle brackets is not a tag');
assert.ok(structuredBody('<entry date="Mar 14" time="9:40">One</entry><entry>Two</entry>').includes('<span class="eye-sw-chip">Mar 14</span><span class="eye-sw-chip">9:40</span>'), 'a date or time needs no label');

// ---- screens: plain lines, or nested tags drawn the same way ----
assert.ok(renderArtifacts('<screen title="Shell">$ cp <from> <to>\nName   Size</screen>').includes('<span class="eye-body">$ cp <from> <to><br>Name   Size</span>'), 'plain lines are kept as written');
const screenGuide = instructionFor(['screen']);
assert.ok(screenGuide.includes('chart=ring'), 'the model is taught the ring');
// the advanced HUD example: off unless asked for, and only with screens
assert.ok(!screenGuide.includes('ISV KESTREL'), 'the HUD example is off by default');
const hudGuide = instructionFor(['screen'], { hud: true });
assert.ok(hudGuide.includes('ISV KESTREL') && hudGuide.indexOf('ISV KESTREL') > hudGuide.indexOf('MV Corrigan'), 'when asked for, it comes after the console');
assert.ok(!instructionFor(['sms'], { hud: true }).includes('ISV KESTREL'), 'and only when screens are taught');
const hud = renderArtifacts(hudGuide.slice(hudGuide.indexOf('<screen title="ISV')));
assert.ok(screenGuide.includes('`chart=segments`') && screenGuide.includes('`title-style`'), 'the model is told of segments and title-style');
assert.ok(screenGuide.includes('`banner`') && screenGuide.includes('`hud`') && !screenGuide.includes('eye-pulse') && !screenGuide.includes('--element-ticks'), 'and of the built-in classes and themes, not the stylesheet hooks behind them');
assert.ok(screenGuide.includes('whole chat'), 'it is told a <styles> lasts the whole chat');
assert.equal(hud.trim().split('\n').length, 1, 'the HUD is one screen');
assert.ok(hud.includes('eye-x-hud') && hud.includes('eye-x-banner eye-x-pulse') && hud.includes('eye-sw-gauges') && hud.includes('eye-sw-chip eye-sw-alert">Hull breach') && hud.includes('eye-sw-segments') && hud.includes('>Targeting<'), 'with its theme, classes, gauges, alert, segments and targeting');
assert.ok(hudGuide.length - screenGuide.length < 1300, `and it is short: ${hudGuide.length - screenGuide.length}`);
assert.ok(screenGuide.includes('Example, a screen with structure') && !onlySigns.includes('Example, a screen'), 'the example comes with the tag');
assert.ok(screenGuide.includes('plain lines'));
const screen = renderArtifacts(screenGuide.slice(screenGuide.indexOf('<screen title="MV Corrigan')));
assert.equal(screen.trim().split('\n').length, 1, 'the whole screen is one line');
assert.ok(screen.includes('<div class="eye eye-screen eye-in eye-x-console">') && !screen.includes('eye-body'), 'a screen in a built-in theme, with no CSS of its own');
assert.ok(screen.includes('<span class="eye-sw-cells" style="--n:3"><span class="eye-sw-cell"><span class="eye-sw-label">Heading</span>'), 'short values side by side');
assert.ok(screen.includes('<span class="eye-sw-bar eye-sw-ring" data-name="port"') && screen.includes('<span class="eye-sw-chip eye-sw-badge">Vibration</span>'), 'a ring with a badge');
assert.ok(screen.includes('<span class="eye-sw-bar eye-sw-column" data-name="lube_oil"') && screen.includes('<span class="eye-sw-chip eye-sw-alert">Low</span>'), 'a column with an alert');
assert.ok(screen.includes('<span class="eye-sw-value">Chief Okafor took the watch</span><span class="eye-sw-chips"><span class="eye-sw-chip">05:30</span></span>'), 'a list');
assert.ok(renderArtifacts('<screen title="Card"><email>bob@example.com</email><sign>Open</sign></screen>').match(/class="eye /g).length === 1, 'a nested tag named like one of ours is part of the screen');

// ---- nested tags: short values among long ones, names with spaces, a quote left open ----
const cellsIn = html => [...html.matchAll(/eye-sw-cells" style="--n:\d+">(.*?)<\/span><\/span><\/span>/g)].map(m => m[1].match(/eye-sw-cell"/g)?.length);
const lotBody = structuredBody('<lot><name>Bob</name><volume>3 L</volume><grade>A long value that is no cell</grade><solo>x</solo></lot>');
assert.deepEqual(cellsIn(lotBody), [2], 'short values next to each other are cells even when a long one follows');
assert.ok(lotBody.includes('<span class="eye-sw-label">Grade</span>') && lotBody.includes('<span class="eye-sw-row"><span class="eye-sw-label">Solo</span>'), 'a long value, and a short one on its own, are rows');
assert.deepEqual(cellsIn(structuredBody('<a><avoid>Cold</avoid><avoid>Noise</avoid><why>A long value that is no cell</why></a>')), [], 'repeated tags among others stay a list');
const spaced = structuredBody('<lot><Donor ID>#1</Donor ID><Total Volume>7 L</Total Volume></lot>');
assert.ok(spaced.includes('>Donor ID</span>') && spaced.includes('>Total Volume</span>'), 'a name with spaces is kept whole');
assert.ok(structuredBody('<Storage used value="3" max="5"/>').includes('<span class="eye-sw-label">Storage used</span>'), 'on a self-closing tag too');
assert.ok(!structuredBody('<skill new>Night Sight</skill><skill>Appraisal</skill>').includes('Skill new'), 'a bare word the closing tag does not repeat is no part of the name');
const unquoted = structuredBody('<lot name="LOT 01"><id>1</id></lot><lot name="LOT 02><id>2</id></lot>');
assert.ok(unquoted.includes('<span class="eye-sw-heading">LOT 02</span>'), 'a quote left open ends with its tag');
assert.deepEqual(parseTree('<a t="Q3 > Q2">x</a>').children[0].attrs, { t: 'Q3 > Q2' });
assert.ok(structuredBody('<a name="Q3 > Q2"><b2>x</b2></a>').includes('Q3 &gt; Q2'), 'a ">" inside quotes is left alone');

// ---- colour ----
const valueOf = (tag) => structuredBody(`<x>${tag}</x>`).match(/<span class="eye-sw-value"[^>]*>/)[0];
assert.equal(valueOf('<hp color=#ffffff>7</hp>'), '<span class="eye-sw-value" style="color:#ffffff">');
assert.match(valueOf('<hp color="red">7</hp>'), /style="color:color-mix\(in srgb, #[\da-f]{6} 58%, var\(--element-ink\)\)"/, 'a colour name is mixed with the text colour, so it reads on a light or a dark theme');
assert.equal(valueOf('<hp color="White">7</hp>'), '<span class="eye-sw-value" style="color:var(--element-ink)">', 'white is the text colour');
assert.ok(renderArtifacts('<screen title="T" color="teal">x</screen>').includes('style="--element-accent:color-mix('), 'a name works as the accent too');
assert.ok(!INSTRUCTION.includes('dark background'), 'the model is not told that the background is dark');
assert.ok(INSTRUCTION.includes('color="red"') && INSTRUCTION.includes('color="#3fc1ff"') && INSTRUCTION.includes('color="#5fe0c0b3"') && INSTRUCTION.includes('color="color-mix('), 'the example shows a colour name, a hex colour, one with alpha, and a mix');
assert.deepEqual(cellsIn(structuredBody('<s><a1 color="red">1</a1><b1>2</b1></s>')), [2], 'a coloured value is still a cell');
assert.ok(structuredBody('<x><horse color="roan">Dusty</horse></x>').includes('<span class="eye-sw-chip">Color: roan</span>'), 'a colour that is only a fact about the thing is shown');
assert.ok(structuredBody('<hp value="4" max="8" color="#00ff00"/>').includes('style="--element-bar:#00ff00"'), 'a bar takes the colour');
assert.ok(structuredBody('<hp value="4" max="8" color="#00ff0080"/>').includes('style="--element-bar:#00ff0080"') && structuredBody('<hp value="4" max="8" color="#0f08"/>').includes('style="--element-bar:#0f08"'), 'a hex colour may carry alpha');
assert.ok(!structuredBody('<hp value="4" max="8" color="#00ff008"/>').includes('--element-bar'), 'but only with 4 or 8 digits');

// a colour function: a mix, or a colour by its numbers
for (const fn of ['color-mix(in srgb, red 60%, gold)', 'hsl(200 80% 60% / 0.7)', 'rgb(255, 0, 0)', 'oklch(70% 0.1 200)', 'color-mix(in oklch, rgb(255 0 0) 40%, #00f)'])
    assert.equal(safeColour(fn), fn, fn);
for (const bad of ['red; background:url(x)', 'rgb(1 2 3);color:red', 'url(x)', 'rgb(1 2 3', 'expression(1)', 'color-mix(in srgb, url(x) 1%, red)', 'rgb("1")', 'rgb(a(b(c)))'])
    assert.equal(safeColour(bad), '', bad);
assert.ok(structuredBody('<fuel value=6 max=10 chart=column color="color-mix(in srgb, orange 70%, gold)"/>').includes('--element-bar:color-mix(in srgb, orange 70%, gold)'), 'a bar takes a mixed colour');
assert.ok(structuredBody('<quest color="#00ff00">Find it<reward>1</reward></quest>').includes('<span class="eye-sw-group" style="--element-accent:#00ff00"><span class="eye-sw-heading" style="color:#00ff00">Find it'), 'a section colours its heading');
assert.ok(renderArtifacts('<screen title="T" color="#c13584">x</screen>').includes('<div class="eye eye-screen eye-in" style="--element-accent:#c13584">'), 'color on the screen is its accent');
assert.ok(!renderArtifacts('<screen title="T" color="x;y"><x><hp color="expression(1)">7</hp></x></screen>').includes('style='), 'a color that is not one is never CSS');
assert.ok(!renderArtifacts('<sign color="#c13584">x</sign>').includes('style='), 'other objects take no accent');
for (const word of ['color', 'style', 'align', 'section-style', '<styles>', 'class']) assert.ok(screenGuide.includes(`\`${word}`), word);
assert.ok(!onlySigns.includes('`color`'), 'taught only where it applies');

// ---- section-style: one style for every section inside ----
const sectioned = renderArtifacts('<screen title="T" section-style="border-radius:0"><a><v1>1</v1></a><c style="color:red"><d>2</d></c></screen>');
assert.ok(sectioned.includes('<span class="eye-sw-group" style="border-radius:0"><span class="eye-sw-heading">A</span>'), 'section-style on the screen styles each section');
assert.ok(sectioned.includes('<span class="eye-sw-group" style="border-radius:0;color:red">'), 'and a section\'s own style comes after it, so it wins');
assert.ok(!sectioned.includes('eye-in" style=') && !sectioned.includes('Section style'), 'it is not put on the screen itself, nor shown as a fact');
const nestedSections = structuredBody('<a section-style="padding:0"><inner><c>1</c></inner></a>', { sectionStyle: 'border:0' });
assert.ok(nestedSections.includes('<span class="eye-sw-group" style="border:0"><span class="eye-sw-heading">A</span>') && nestedSections.includes('<span class="eye-sw-group" style="border:0;padding:0"><span class="eye-sw-heading">Inner</span>'), 'a section can set one for the sections inside it too');
assert.ok(!structuredBody('<a><v1>1</v1></a><c><d>2</d></c>', { sectionStyle: 'x" onmouseover="y' }).includes('" onmouseover'), 'quote marks cannot end the attribute');

// ---- images in CSS: drawn from the message itself or this site, never fetched from elsewhere ----
const SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";
assert.ok(structuredBody(`<a1 style="background:url(&quot;${SVG}&quot;) center/cover">1</a1><b1>2</b1>`).includes(`background:url(&quot;${SVG}&quot;) center/cover`), 'an image written into the message is kept');
assert.ok(structuredBody('<a1 style="background:url(/img/ship.png)">1</a1><b1>2</b1>').includes('url(/img/ship.png)'), 'and one from this site');
for (const far of ['url(https://example.com/x.png)', "url('//example.com/x.png')", 'url( "http://example.com/x.png" )', 'image-set("https://example.com/x.png" 1x)'])
    assert.ok(!structuredBody(`<a1 style="background:${far} no-repeat, red">1</a1><b1>2</b1>`).includes('example.com'), far);
assert.ok(structuredBody('<a1 style="background:url(https://example.com/x.png) no-repeat, red">1</a1><b1>2</b1>').includes('background:none no-repeat, red'), 'the rest of the CSS is kept');
for (const sly of ['\\75rl(https://example.com/x.png)', 'url(/\\/example.com/x.png)', 'url(/\\example.com/x.png)', 'url(https://example.com/x.png', "url('https://example.com/x.png", 'url(img/x.png)'])
    assert.ok(!/example\.com|img\/x/.test(structuredBody(`<a1 style="background:${sly}">1</a1><b1>2</b1>`)), sly);
for (const sly of ['&#117;rl(https://example.com/x.png)', 'url(&quot;https://example.com/x.png&quot;)', 'url(&#x2f;&#47;example.com/x.png)'])
    assert.ok(!structuredBody(`<a1 style="background:${sly}">1</a1><b1>2</b1>`).includes('example.com'), `${sly}: character references are read as the browser reads them`);
assert.ok(structuredBody('<a1 style="background:url(/&sol;example.com/x.png)">1</a1><b1>2</b1>').includes('url(/&amp;sol;example.com/x.png)'), 'and any left are escaped, so the browser reads them as written');
assert.ok(!renderArtifacts('<screen title="T" style="background:url(https://example.com/x.png)">x</screen>').includes('example.com'), 'on the screen too');
assert.ok(!renderArtifacts('<email from="a" subject="s" style="background:url(https://example.com/x.png)">x</email>').includes('example.com'), 'and on any other object');
allowOutsideImages(true);
assert.ok(structuredBody('<a1 style="background:url(https://example.com/x.png)">1</a1><b1>2</b1>').includes('url(https://example.com/x.png)'), 'where SillyTavern allows outside media, outside images are kept');
allowOutsideImages(false);

// ---- title-style: CSS for a screen's title bar ----
assert.ok(renderArtifacts('<screen title="T" align="center" title-style="letter-spacing:0.3em">x</screen>').includes('<span class="eye-title" style="text-align:center;letter-spacing:0.3em">T</span>'), 'title-style is put on the title bar, after align');
assert.ok(!renderArtifacts('<screen title="T" title-style="x" style="y:1">x</screen>').includes('y:1;x'), 'and not on the screen');
assert.ok(!renderArtifacts('<screen title="T" title-style="background:url(https://example.com/x.png)">x</screen>').includes('example.com'), 'nor any image from elsewhere');

// ---- segments: a bar drawn as blocks ----
const segs = structuredBody('<hull value=62 max=100 chart=segments/>');
assert.ok(segs.includes('<span class="eye-sw-bar eye-sw-segments" data-name="hull" style="--element-segs:10"><span class="eye-sw-label">Hull</span><span class="eye-sw-track"><span class="eye-sw-fill" style="width:60%"></span></span><span class="eye-sw-count">62 / 100</span>'), 'chart=segments: ten blocks for a large max, filled to the nearest whole block');
assert.ok(structuredBody('<ammo value=5 max=8 chart=segments/>').includes('style="--element-segs:8"') && structuredBody('<ammo value=5 max=8 chart=segments/>').includes('width:63%'), 'one block for each unit of a small max');
assert.ok(!structuredBody('<a1><x1 value=1 max=8 chart=segments/><x2 value=1 max=8 chart=segments/></a1>').includes('eye-sw-gauges'), 'segmented bars are bars, not gauges');

// ---- named styles: defined once in <styles>, used with class ----
const STYLES = '<styles><panel>border-radius:0</panel><Danger>color:red</Danger><loud>font-weight:800</loud></styles>';
const classed = structuredBody(`${STYLES}<a class="panel"><v1 class="danger loud">1</v1><v2 class="danger">2</v2></a><x><hp value=1 max=2 class="danger" style="opacity:1"/><r1 class="loud">A value too long for any cell</r1></x>`);
assert.ok(!classed.includes('Styles') && !classed.includes('Panel') && !classed.includes('border-radius:0</'), 'the styles are not drawn');
assert.ok(classed.includes('<span class="eye-sw-group" style="border-radius:0">'), 'a section takes its class');
assert.ok(classed.includes('<span class="eye-sw-cell" style="color:red;font-weight:800">'), 'a value box takes several, in order, and names are not case-sensitive');
assert.ok(classed.includes('data-name="hp" style="color:red;opacity:1">'), 'a bar takes one, and its own style comes after');
assert.ok(classed.includes('<span class="eye-sw-row" style="font-weight:800">'), 'and a row');
assert.ok(!classed.includes('Class'), 'class is not shown as a fact');
assert.ok(structuredBody('<styles><p1>x:1</p1></styles><a class="nope p1"><v1>1</v1></a>').includes('<span class="eye-sw-group" style="x:1">'), 'a class with no definition is ignored');
assert.ok(structuredBody('<a class="p1"><v1>1</v1></a><styles><p1>x:1</p1></styles>').includes('style="x:1"'), 'the styles may come anywhere at the top');
assert.ok(!structuredBody('<styles><p1>a:"b" onclick="c"</p1></styles><a class="p1"><v1>1</v1></a>').includes('" onclick'), 'quote marks cannot end the attribute');
assert.equal(structuredBody('<styles><p1>x:1</p1></styles>'), null, 'styles alone are not a screen of structure');
assert.ok(structuredBody('<a class="p1" section-style="y:2"><b1><v1>1</v1></b1></a><styles><p1>x:1</p1></styles>').includes('<span class="eye-sw-group" style="y:2">'), 'section-style and classes work together');

// ---- built-in classes and themes: real classes from a fixed list, coloured by the tag's own color ----
assert.ok(structuredBody('<condition class="banner pulse" color="#ff0000">Red alert</condition>').includes('<span class="eye-sw-row eye-x-banner eye-x-pulse" style="--element-tint:#ff0000">'), 'a built-in class is put on the box, with the tag\'s colour');
assert.ok(structuredBody('<condition class="nope Banner x&quot;y">Red alert</condition>').includes('<span class="eye-sw-row eye-x-banner">'), 'only names from the list are used');
assert.ok(structuredBody('<a1 color="#ff0000" class="p">1</a1>').includes('<span class="eye-sw-row">'), 'a colour alone adds no tint');
assert.ok(structuredBody('<styles><banner>x:1</banner></styles><a class="banner"><v1>1</v1></a>').includes('<span class="eye-sw-group eye-x-banner" style="x:1">'), 'a style of the same name is put on top');
assert.ok(structuredBody('<hp value=1 max=2 class="glow" color="#00ff00"/>').includes('<span class="eye-sw-bar eye-x-glow" data-name="hp" style="--element-tint:#00ff00;--element-bar:#00ff00">'), 'on bars too');
assert.ok(structuredBody('<a1 class="cut">1</a1><b1>2</b1>').includes('<span class="eye-sw-cell eye-x-cut">'), 'and cells');
assert.ok(renderArtifacts('<screen title="T" class="terminal glow">$ ls</screen>').includes('<div class="eye eye-screen eye-in eye-x-terminal eye-x-glow">'), 'a theme is a class on the screen, even of plain lines');
assert.ok(!renderArtifacts('<email from="a" subject="s" class="hud">x</email>').includes('eye-x-hud'), 'and only on a screen');

// ---- styles defined anywhere in the chat ----
const styledChat = [{ mes: 'hi' }, { mes: '<screen title="A"><styles><hot>color:red</hot><Warn>x:1</Warn></styles><a1>1</a1></screen>' }, {}, { mes: '<screen title="B"><styles><hot>color:blue</hot></styles><a1>1</a1></screen>' }];
assert.deepEqual([...stylesInChat(styledChat)], [['hot', 'color:blue'], ['warn', 'x:1']], 'every <styles> in the chat, the later definition winning');
setChatStyles(stylesInChat(styledChat));
assert.equal(stylesForReply([...styledChat.slice(0, 3), { mes: styledChat[3].mes, is_user: false }], 'swipe').get('hot'), 'color:red', 'a swipe does not count the styles of the reply it replaces');
assert.equal(stylesForReply([{ mes: '<styles><a1>x</a1></styles>', is_user: false }], 'regenerate').size, 0, 'nor does a regenerate');
assert.equal(stylesForReply([{ mes: '<styles><a1>x</a1></styles>', is_user: true }], 'regenerate').size, 1, 'but the user\'s own last message counts');
assert.equal(stylesForReply([{ mes: '<styles><a1>x</a1></styles>', is_user: false }], 'normal').size, 1, 'as does everything for a new reply');
assert.deepEqual([...stylesInChat([], '<club>color:gold</club>\n<Quiet>opacity:0.6</Quiet>')], [['club', 'color:gold'], ['quiet', 'opacity:0.6']], 'saved styles are read like a <styles> block');
assert.equal(stylesInChat([{ mes: '<styles><club>color:red</club></styles>' }], '<club>color:gold</club>').get('club'), 'color:red', 'a style defined in the chat replaces a saved one');
assert.equal(stylesInChat([], '<styles><club>color:gold</club></styles>').get('club'), 'color:gold', 'saved styles pasted with their <styles> tag still read');
{
    const saved = '<club>color:gold</club><quiet>opacity:0.6</quiet>';
    assert.deepEqual([...stylesForReply([{ mes: 'hi' }], 'normal', saved).keys()], [], 'the model is not told of saved styles the chat has not used');
    assert.deepEqual([...stylesForReply([{ mes: '<screen class="hud club">x</screen>' }], 'normal', saved).keys()], ['club'], 'it is told of one a message uses');
    assert.deepEqual([...stylesForReply([], 'normal', saved, ['Example: <screen title="A" class=Quiet>']).keys()], ['quiet'], 'or the Author\'s Note uses');
    assert.equal(stylesForReply([{ mes: '<styles><club>color:red</club></styles><x class="club">' }], 'normal', saved).get('club'), 'color:red', 'the chat\'s own definition wins');
}
assert.ok(structuredBody('<a1 class="warn">1</a1><b1>2</b1>').includes('<span class="eye-sw-cell" style="x:1">'), 'a style defined earlier in the chat is used');
assert.ok(structuredBody('<styles><warn>y:2</warn></styles><a1 class="warn">1</a1><b1>2</b1>').includes('<span class="eye-sw-cell" style="y:2">'), 'the message\'s own definition wins');
assert.ok(renderArtifacts('<screen title="T" class="warn">x</screen>').includes('style="x:1"'), 'a screen can use one on itself');
setChatStyles(new Map());
assert.ok(!structuredBody('<a1 class="warn">1</a1><b1>2</b1>').includes('x:1'), 'and they go with the chat');
assert.ok(instructionFor(['screen'], { styles: ['hot', 'warn'] }).includes('Styles already defined in this chat, to use with `class`: `hot`, `warn`.'), 'the model is told which styles the chat has');
const manyStyles = instructionFor(['screen'], { styles: ['x'.repeat(40), 'a b', ...Array.from({ length: 30 }, (_, i) => `s${i}`)] });
assert.ok(!manyStyles.includes('xxxxxxxxxx') && !manyStyles.includes('`a b`') && manyStyles.includes('`s19`') && !manyStyles.includes('`s20`'), 'only plain short names, and at most twenty');
assert.ok(!instructionFor(['sms'], { styles: ['hot'] }).includes('hot') && !instructionFor(['screen']).includes('already defined'), 'only with screens, and only when there are some');

// ---- style: CSS, passed through to the element's own box ----
const CSS = 'background:#300; transform:rotate(-1deg)';
assert.ok(structuredBody(`<a1 style="${CSS}">1</a1><b1>2</b1>`).includes(`<span class="eye-sw-cell" style="${CSS}">`), 'a short value: its cell, and it is still a cell');
assert.ok(structuredBody(`<x><a1 style="${CSS}">A value too long for any cell</a1></x>`).includes(`<span class="eye-sw-row" style="${CSS}">`), 'a longer value: its row');
assert.ok(structuredBody(`<x style="${CSS}"><a1>1</a1></x>`).includes(`<span class="eye-sw-group" style="${CSS}">`), 'a section: its card');
assert.ok(structuredBody(`<hp value="4" max="8" style="${CSS}"/>`).includes(`data-name="hp" style="${CSS}">`), 'a bar');
assert.ok(renderArtifacts(`<screen title="T" style="${CSS}">x</screen>`).includes(`<div class="eye eye-screen eye-in" style="${CSS}">`), 'the screen itself');
assert.ok(renderArtifacts(`<screen title="T" color="#c13584" style="${CSS}">x</screen>`).includes(`style="--element-accent:#c13584;${CSS}"`), 'beside a color');
assert.ok(structuredBody("<x><a1 style='font-family:\"A B\"'>1</a1></x>").includes('style="font-family:&quot;A B&quot;"'), 'quote marks cannot end the attribute');
assert.ok(structuredBody("<x><a1 style='a:b\"><img src=x>'>1</a1></x>").includes('style="a:b&quot;&gt;&lt;img src=x&gt;"'), 'nor can a tag be opened from it');
assert.ok(structuredBody("<x><a1 style=\"content:'$&'\">1</a1></x>").includes("style=\"content:'$&amp;'\""), 'a "$" is only a "$"');
assert.equal(renderArtifacts('<screen title="T" style="color:red;\n\n  top:0">x</screen>').trim().split('\n').length, 1, 'line breaks in it do not break the block');
assert.ok(!renderArtifacts('<sign style="color:red">x</sign>').includes('style='), 'only on tags that hold structure');

// ---- align: where an element's own words stand ----
assert.ok(renderArtifacts('<screen title="T" align="center">x</screen>').includes('<span class="eye-title" style="text-align:center">T</span>'), 'on a screen it places the title');
assert.ok(renderArtifacts('<system_window title="T" align="left"><a1>1</a1></system_window>').includes('<span class="eye-title" style="text-align:left">T</span>'), 'on a system window too');
assert.ok(renderArtifacts('<screen title="T" align=centre color=#c13584>x</screen>').includes('text-align:center'), 'either spelling');
assert.ok(renderArtifacts('<screen title="T" text-align="center">x</screen>').includes('<span class="eye-title" style="text-align:center">T</span>'), 'text-align is read as align');
assert.ok(structuredBody('<lot name="One" align="center"><id>1</id></lot>').includes('<span class="eye-sw-heading" style="text-align:center">One</span>'), 'on a section, its heading');
assert.ok(structuredBody('<x><hp text-align="right" style="top:0">7</hp></x>').includes('<span class="eye-sw-row" style="text-align:right;top:0">'), 'on a value, its row');
assert.ok(structuredBody('<a1 align="right">1</a1><b1>2</b1>').includes('<span class="eye-sw-cell" style="text-align:right">'), 'on a short value, its cell');
assert.ok(structuredBody('<x><hero align="Chaotic Good">Bo</hero></x>').includes('<span class="eye-sw-chip">Align: Chaotic Good</span>'), 'an align that is only a fact about the thing is shown');
for (const bad of ['align="center;color:red"', 'align="constructor"']) assert.ok(!renderArtifacts(`<screen title="T" ${bad}><x><hp ${bad}>7</hp></x></screen>`).includes(' style='), `${bad} never reaches the page as style`);

// ---- nested tags: what an attribute says, and a modifier ----
const chipsOf = attrs => [...structuredBody(`<x><lot ${attrs}>A value too long for any cell</lot></x>`).matchAll(/eye-sw-chip(?=[ "])[^>]*>([^<]*)</g)].map(m => m[1]);
assert.deepEqual(chipsOf('grade="Fraction"'), ['Grade: Fraction'], 'an attribute in words is a key and its value');
assert.deepEqual(chipsOf('level="2" qty="3" amount="+5" since="2018"'), ['Level 2', 'Qty 3', 'Amount +5', 'Since 2018'], 'a number needs no colon');
assert.deepEqual(chipsOf('badge="Platinum Seal +40%" alert="Cold chain"'), ['Platinum Seal +40%', 'Cold chain'], 'a badge and an alert are shown as they are');
const graded = structuredBody('<lot><volume>3 L</volume><grade badge="Platinum Seal +40%">Fraction</grade></lot>');
assert.deepEqual(cellsIn(graded), [2], 'a short value with a badge is still a cell');
assert.ok(graded.includes('<span class="eye-sw-value">Fraction</span><span class="eye-sw-chips"><span class="eye-sw-chip eye-sw-badge">Platinum Seal +40%</span></span></span>'), 'the badge is inside its cell');
assert.ok(structuredBody('<lot name="One" alert="Hold"><id>1</id></lot>').includes('One<span class="eye-sw-chip eye-sw-alert">Hold</span></span>'), 'a section can carry one');
assert.ok(screenGuide.includes('`badge`') && screenGuide.includes('`alert`'));

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
assert.deepEqual(collectContacts('<letter from="Bob">a</letter><sign from="Bob">b</sign><screen from="Bob">c</screen><system_window from="Bob">d</system_window>'), [],
    'no colour is drawn on these, so there is nothing to pick');
assert.equal(normaliseName('Frank Stone &lt;frank@example.com&gt;'), normaliseName('Frank Stone'), 'an address after a name is not part of it');
assert.equal(normaliseName('Frank Stone <frank@example.com>'), normaliseName('Frank Stone'));
assert.notEqual(normaliseName('<frank@example.com>'), '', 'an address alone is the name');
assert.equal(normaliseName('A &amp; B'), normaliseName('A & B'));
assert.deepEqual(collectContacts('<email from="Frank Stone &lt;frank@example.com&gt;">a</email><email from="A &amp; B">b</email>').map(c => c.name), ['Frank Stone', 'A & B'], 'listed as it reads');


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
// "from @handle" is the same as "as @handle"; without the "@" it may be part of the recipient's name
assert.equal(expandShorthand('dm to @Dave_88 from @alice at 9:27: hi'), '<dm from="@alice" to="@Dave_88" time="9:27 AM">hi</dm>');
assert.equal(expandShorthand('dm Dave on Chatter from @alice: hi'), '<dm from="@alice" to="Dave" app="Chatter">hi</dm>');
assert.deepEqual(typedHandles('dm Dave on Chatter from @alice: hi'), [{ app: 'chatter', handle: '@alice' }]);
assert.deepEqual(typedHandles('dm to @Dave_88 from @alice: hi'), typedHandles('dm to @Dave_88 as @alice: hi'));
assert.equal(expandShorthand('dm Bob from Accounting: hi'), '<dm to="Bob from Accounting">hi</dm>');
assert.equal(expandShorthand('Dm from @Dave_88: nothing yet.'), 'Dm from @Dave_88: nothing yet.');
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
assert.ok(overrideRule('bob', '#050505').includes('--element-fg: #ffffff'), 'near-black pick gets white text');
assert.ok(overrideRule('bob', '#fafafa').includes('--element-fg: #000000'), 'near-white pick gets black text');
assert.ok(!overrideRule('bob', '#050505').includes('--element-nick: #050505'), 'near-black pick is lightened for the dark chat panel');
assert.ok(overrideRule('bob', '#ffcc00').includes('--element-nick: #ffcc00'), 'a bright pick is used as it is in the chat panel');
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
chatSet.tags.sign = false;
learnHandle(chatSet, 'Alice', 'chatter', '@AliceCo');
const before = JSON.stringify(chatSet);
const shared = mergeStores(copyStore(characterSet), chatSet);
assert.deepEqual(shared.colors, { bob: '#112233', carol: '#ffffff' }, 'the set being merged in wins a clash; nothing else is lost');
assert.equal(emptyStore().inject, true, 'injection is on unless turned off');
assert.deepEqual(shared.tags, { sign: false }, 'which tags are taught carries over');
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
assert.deepEqual(moved, { colors: { bob: '#112233' }, aliases: {}, icons: {}, inject: true, hud: false, tags: {}, personas: { Alice: { accounts: ['@alice', '@AliceCo'], handles: { chatter: '@alice' } } }, names: {} });
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
    assert.deepEqual(conversationsIn('<thread title="Stone & Sons"><email from="Frank" to="Alice" subject="Lease">a</email></thread>', new Set(['alice'])),
        [{ kind: 'email', to: 'Frank', app: '', subject: 'Lease' }], 'an email in a thread is answered to its sender, not to the thread');
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
    assert.ok(renderArtifacts('<letter from="Frank Stone &lt;frank@example.com&gt;">x</letter>').includes('Frank Stone &lt;frank@example.com&gt;'),
        'a character reference in an attribute is not escaped twice');
    assert.ok(renderArtifacts('<email from="A & B">x</email>').includes('A &amp; B'), 'a plain ampersand still is');
}

{
    const board = structuredBody('<x><option id="2" badge="$400"><cargo>Crates</cargo></option><berth id="TUE-14-0900"><ship>Corrigan</ship></berth><file id="File B: The Tank"><note>Sealed</note></file><parcel id="SH-1922">Boxes</parcel><gauge id="P-4" value="3" max="5"/><lot id="7" name="Overflow">Rope</lot></x>');
    assert.ok(board.includes('<span class="eye-sw-heading">Option 2<span class="eye-sw-chip eye-sw-badge">$400</span>'), 'an id that is a number follows the name');
    assert.ok(board.includes('<span class="eye-sw-heading">Berth TUE-14-0900</span>'), 'so does an id that is a code');
    assert.ok(board.includes('<span class="eye-sw-heading">File B: The Tank</span>'), 'an id in words is the name');
    assert.ok(board.includes('<span class="eye-sw-label">Parcel SH-1922</span><span class="eye-sw-value">Boxes</span>'), 'a row is named by its id');
    assert.ok(board.includes('<span class="eye-sw-label">Gauge P-4</span>'), 'so is a bar');
    assert.ok(board.includes('<span class="eye-sw-label">Overflow</span><span class="eye-sw-value">Rope</span><span class="eye-sw-chips"><span class="eye-sw-chip">Id 7</span>'), 'a name wins, and the id is shown beside it');
    assert.ok(!/Id:? (2|TUE|File|SH|P-4)/.test(board), 'an id used as the name is not shown again');
    assert.ok(structuredBody('<x><lot id="7">Rope<weight>2 kg</weight></lot></x>').includes('Rope<span class="eye-sw-chip">Id 7</span>'), 'an id not used as the name is still shown');
    assert.ok(structuredBody('<x><item id="c1">Ana</item><item id="INV-809">Bo</item></x>').includes('<span class="eye-sw-value">INV-809 Bo</span>'), 'in a list, which shows no label, the id stands alone');
}

console.log('ok: all checks passed');

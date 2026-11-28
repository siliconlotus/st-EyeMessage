# EyeMessage

A SillyTavern extension that draws texts, app messages, emails, letters, signs, screens and live chats as styled objects in the chat.

The model writes short plain tags. EyeMessage draws them at display time. The chat file and the prompt keep the plain tags, so the model spends no tokens on HTML or CSS, and the look is yours to change in one stylesheet.

## Install

In SillyTavern, open **Extensions → Install extension** and paste this repository's address.

It needs a SillyTavern build that has the message formatter hook (`getContext().messageFormatter`, added in SillyTavern PR #5652).

## The tags

| Tag | Draws |
| --- | --- |
| `<sms from="Contact name">` | a phone text |
| `<dm app="App name" from="@handle" display_name="Display name">` | a direct message inside an app |
| `<thread>` | one conversation: the texts or app messages inside it share a panel, and emails share a card. `app` names its app once; `title` names a group |
| `<chat title="Channel or stream">` | a live text chat with many participants, one `Name: message` per line |
| `<email from="Sender" subject="Subject line">` | an email. `attachments` names the files on it |
| `<letter from="Sender">` | anything on paper, in handwriting; add `typed` for print, as on a receipt, drawn in typewriter letters with its spacing kept |
| `<sign>` | anything posted or painted |
| `<screen title="What it is">` | anything else on a display, or the status window of a game-like System |

```
<thread><sms from="Bob" time="9:41 PM">Running late.</sms>
<sms from="Bob">Ten minutes, I swear.</sms>
Seen 9:52 PM
</thread>
<thread app="Chatter"><dm from="@Dave_88" display_name="Dave R.">where are we meeting</dm>
<dm from="@Erin">the cafe</dm>
<dm from="@Dave_88">ten minutes</dm></thread>
```

Three kinds of name are kept apart:

- A **handle** (`from` on a `<dm>`) is the account's unique name in the app. Colour and grouping go by it.
- A **display name** (`display_name`) is the name that account chose to show. It is drawn beside the handle, and is only needed on the account's first message in a thread.
- A **contact name** (`from` on an `<sms>`) is the sender as the reader's own phone names them.

A screen can be plain lines, or nested tags of the model's own naming. Nothing in it is predefined; each tag is drawn by its shape, and each section is a card:

```
<screen title="MV Corrigan · Engine Room" class="console">
<heading>214°</heading><speed>11.2 kn</speed><rudder>3° port</rudder>
<engines><port value=88 max=100 chart=ring color="red" badge="Vibration"/><starboard value=74 max=100 chart=ring color="#3fc1ff"/></engines>
<tanks><fuel value=62 max=100 chart=column color="color-mix(in srgb, orange 70%, gold)"/><ballast value=40 max=100 chart=column color="blue"/><fresh_water value=85 max=100 chart=column color="#5fe0c0b3"/><lube_oil value=18 max=100 chart=column color="red" alert="Low"/></tanks>
<log><entry time="04:10">Bilge pump 2 cycled twice in ten minutes</entry><entry time="05:30">Chief Okafor took the watch</entry></log>
</screen>
```

- A tag with tags inside is a section, headed by its name (`visit_log` becomes "Visit log") or by its own words.
- A tag with `value` and `max` is a bar. Add `chart=ring` (or `donut`) to draw it as a ring instead, as in `<hp value=42 max=60 chart=ring/>`, `chart=column` (or `vertical`) to stand it up, or `chart=segments` to cut it into blocks: one for each unit up to a `max` of 20, otherwise ten.
- Short values next to each other sit side by side.
- Repeated tags are a list, and any other attribute is shown beside the item.
- A name of several words is kept whole when the closing tag repeats it: `<Donor ID>#12</Donor ID>`, or `<donor_id>`.
- `badge` and `alert` modify the value they are on, and are drawn as a lozenge beside it: `<grade badge="Gold +10%">A</grade>`.
- `style` is inline CSS, put as it is on the element's own box: a value's cell or row, a section's card, or the whole screen. An image in it, with `url()`, may be embedded (`data:`) or a path from the root of your own SillyTavern, such as an image in a character's gallery, `url(/user/images/Kestrel/bridge.png)`. An image from any other site follows SillyTavern's **Forbid external media** setting, including a character's own override: where outside media is forbidden, the extension drops it, because SillyTavern itself never looks inside CSS.
- `title-style` is inline CSS for the screen's title bar.
- `color` is a hex colour, with alpha if you like (`#ff000080`), a CSS colour function such as `color-mix(in srgb, red 60%, gold)` or `hsl(200 80% 60% / 0.7)`, or a plain name such as `red`; a name is shaded to suit the theme. It colours a value, a bar, or a section's heading and lozenges; on the screen itself it is the accent.
- `section-style` is inline CSS for every section inside the screen, or inside the section it is on, so a look is written once: `<screen section-style="border-radius:0">`. A section's own `style` comes after it.
- `class` takes built-in looks, combined as `class="banner pulse"`, each coloured by the tag's own `color`, else the accent:
  - `banner`: big, spaced, boxed and striped, for an alert.
  - `glow`: glowing text, and glowing rings and columns inside.
  - `pulse`, `blink` and `flicker`: motion, one to a tag. The extension stops them for a reader whose system asks for less motion, unless a style forces them with `!important`.
  - `cut`: corner cuts. `brackets`: corner brackets. `scanlines`: lines across, as on an old screen.
  - `ticks`: tick marks round the rings inside. `caps`: spaced capitals.
- On the screen, `class` also takes a theme: `hud`, `console`, `terminal` or `parchment`. A theme draws the screen and its sections in its own colours, so it looks the same in a light or a dark SillyTavern theme. `color` and `style` on the screen still come after it.
- `<styles>` names your own CSS, for any tag to use with `class`: `<styles><warning>color:red;font-weight:bold</warning></styles>` and then `<fuel class="warning">Low</fuel>`. A style defined in any message lasts the whole chat, so the model writes it once; the model is told which names the chat already has. A later definition replaces an earlier one, and messages already on screen show it when they are next drawn, such as when the chat is reopened. A tag can take several names, as `class="warning big"`; built-in looks come first, then named styles, then the tag's own `style`. The CSS is copied onto each tag as it is drawn, so it never reaches the rest of the page.
- Saved styles, in the EyeMessage panel, hold the same definitions without the `<styles>` tag, one per line: `<club>color:gold;background:#080808</club>`. They are kept for every chat, so any message can use one. The model is told a saved style's name, never its CSS, once a message or the Author's Note uses it with `class`, so a house style costs a word a turn in the chats that use it and nothing elsewhere. A `<styles>` definition in the chat replaces a saved one of the same name.
- `align` is `left`, `center` or `right`. It places a value or a section's heading; on the screen itself it places the title.

Beside **Screens** in the settings is a **HUD example** box, off by default. When it is on, the model is also shown a screen styled like a game's interface: a starship bridge in the `hud` theme, with a red-alert banner and a style of its own. It makes the prompt about 1,100 characters longer, and the model tends to copy what it is shown, so turn it on for chats that want that look.

Behind the built-in looks are pieces a style can use directly:

- `animation` with `eye-pulse`, `eye-blink` or `eye-flicker`, as `animation:eye-pulse 1.6s infinite`.
- `--element-ticks`, a colour for tick marks round every ring inside, as `style="--element-ticks:#7fe8ff77"`.
- `--element-glow`, a filter for rings and columns, as `--element-glow:drop-shadow(0 0 4px #00e5ffaa)`.

`<system_window>`, as older chats have it, is drawn as a screen.

A terminal or a feed is written as plain lines and keeps its spacing. Tag-like text that is never closed and carries no attributes, such as `cp <from> <to>`, is read as plain lines too.

About emails:

- The sender may be a name, an address, or both, as `from="Frank Stone <frank@example.com>"`; the address is drawn on its own line. `to`, `time` and `attachments` are optional. `attachments` is a list of file names with commas between.
- A leading `RE:` or `FWD:` in the subject is drawn as a pill. A short last line that starts with a long dash or `--`, such as `— Frank`, is drawn as the sign-off.
- Emails that follow each other in a `<thread>` are drawn as one card, and so are emails outside one that follow each other on the same subject. A subject is shown once, until it changes; `RE:` and `FWD:` do not count as a change. A text, a screen or a plain line between two emails ends the card.
- Its colours come from the SillyTavern theme. The badge and the edge are in the sender's colour. `color` on the tag changes the edge, and `style` (inline CSS) changes anything else: `style="background:#fff;color:#222"` is a white page.

About conversations:

- Each `<thread>` is drawn on its own panel, so two conversations never read as one.
- A group that has a name carries it on the thread, as `<thread title="Book Club">` or `<thread app="Chatter" title="Book Club">`, and the name is drawn at the top of the panel. `name` and `display_name` are read the same way.
- `<thread app="sms">` is a thread of phone texts, the same as a thread with no app: it holds `<sms>` messages and shows no app name. A `<dm>` marked `app="sms"` is tolerated and drawn as a text.
- Messages outside a `<thread>` are grouped by who is in them.
- `time` is optional on any message.
- A plain line between the messages of a thread is drawn as a note.
- An email, letter, sign, screen or live chat inside a thread is drawn as itself, outside the panel. With no messages before it, it carries the thread's title.
- Each sender gets a stable colour from a hash of the name.

## Telling the model

The instructions for writing messages as tags are injected into the system prompt. To stop that for a chat, open the **EyeMessage** drawer in the Extensions panel and untick **Instruct the model**. It is on by default, and the choice belongs to the open chat (see [Where things are kept](#where-things-are-kept)).

Under it is one box per kind of object. The instructions cover only the kinds that are ticked, and each kind brings its own example. All are ticked to begin with. Every kind is drawn whether or not it is ticked.

## Your own messages

Type a line in your message and it becomes a tag when you send:

```
text Bob: running late
text bob 10:29PM: hey
dm Dave on Chatter: on my way
dm Dave on Chatter as @alice: on my way
email Frank: Invoice | see attached
```

- `text` and `sms` mean the same thing.
- The recipient must start with a capital letter or `@`, or be a name already used in the chat's messages. Anything else is left alone as prose.
- A time may follow the recipient. `10:29PM` and `22:29` are the same; with no am or pm it is read as a 24-hour clock.
- `as @handle`, or `from @handle`, is remembered as one of your accounts and becomes the default for that app. Messages from any of your accounts are drawn as sent.
- Lines to the same person, one after another, are put in one `<thread>` when you send, so a double text is one conversation.

Leave the recipient out to reply to the most recent conversation of that kind:

```
email: thanks, got it
text: on my way
text 10:29PM: nearly there
dm: the cafe
```

- A text or app message goes to everyone else in that thread, on the same app and from your account there. A thread that has a `title` is answered by that name: `to="Book Club"`.
- An email goes to the sender of the last one, with its subject as `Re: …`. `email: New subject | message` sets your own.
- A recipient named earlier in the same message is the one a bare line after it answers.
- The word must be in lowercase, and there must be a conversation of that kind to answer. Otherwise the line is left alone as prose.

To post in a live chat yourself:

```
chat: anyone on tonight?
chat as Ace: anyone on tonight?
chat Guild Hall as Ace: selling ore
```

With no channel named, the line goes into the live chat most recently seen. The name you post under is remembered. A channel you name must already be in the chat, or start with a capital letter or `#`.

A game's channels can be named by kind, with or without "in":

```
chat party as Ace: ready when you are
chat in guild: anyone up for the cellar?
chat whisper to Bob: hey
```

The kind can also stand first: `party: …`, `guild as Ace: …`, `yell: …`, `whisper Bob: …`, `reply: …`.

`chat` and these kind words must be typed in lowercase. A sentence that happens to start with one ("Party: four of us.") is left alone.

These write the kind of channel and no title, as `<chat channel="party">`, since the line cannot know what the scene calls it; the model works out which chat that is.

Or use a slash command, which writes the tag into the message box without sending it. Every command starts with `eye-`, so typing `/eye` lists them all. Short names work too where SillyTavern has no command of that name.

| Command | Short | Writes |
| --- | --- | --- |
| `/eye-sms` | `/sms`, `/text` | a phone text |
| `/eye-dm` | `/dm` | a direct message inside an app |
| `/eye-email` | `/email` | an email |
| `/eye-chat` | | a line in a live chat |
| `/eye-party`, `/eye-guild`, `/eye-yell` | `/p`, `/g`, `/y` | a line in a game's party, guild or yell chat |
| `/eye-whisper`, `/eye-reply` | `/w`, `/r` | a whisper to one player, or a reply to the last one |

```
/sms Bob I'm gonna be late
/sms time=22:29 Bob hey
/dm chatter @Dave_88,@Erin anyone free tonight
/dm as=@alice chatter @Dave_88 on my way
/email subject="Invoice" Frank see attached
/eye-chat as=Ace anyone on tonight?
/p ready when you are
/w Bob hey
```

Leave the recipient out to reply to the most recent conversation of that kind, as with a typed line:

```
/sms on my way
/dm the cafe
/email thanks, got it
```

A command has no colon to mark where the recipient ends, so the first word is read as the recipient when it is in quotes or follows the rule for a typed line: a name already in the chat's messages, or one that starts with a capital letter or `@`. Anything else makes the whole text a reply. The tag lands in the message box, so a wrong guess is there to see before you send. `to=` settles it either way: `/sms to=bob hey` for someone new typed in lowercase, `/sms to=Bob Running late` for a reply that starts with a capital. With no conversation to answer, the first word is the recipient.

Several commands, one per line, are converted together. Several recipients make a group thread. Quote a name that has spaces: `/sms "Carol Jones" see you at 9?`. The game-chat commands write the kind of channel and no title, as `<chat channel="party">`, since they cannot know what the scene calls it; the model works out which chat that is.

## Colours

The EyeMessage drawer lists everyone in the current chat's texts, app messages, emails and live chats, with a colour picker for each. Names with a picked colour come first, then the most frequent; a long list is folded. **Auto** returns a contact to the hashed colour.

Someone known by several names, such as a phone contact and a handle, can be one row. Press the link button on one of them and choose who they are the same person as. All of a person's names are drawn in the main name's colour, and the aliases are listed under it; **✕** separates one again. Only colours are shared: every message keeps the name it was written with.

## App icons

Under the contacts, the drawer lists the apps in the chat, each with a box for an icon. It takes the place of the dot before the app's name:

- an emoji, such as 📸
- a [Font Awesome](https://fontawesome.com/search?ic=free) name, such as `fa-camera` or `fa-instagram`: any of the free solid and brand icons that come with SillyTavern

The button beside the box opens SillyTavern's icon picker, which has the solid icons only; type a brand's name. Leave the box empty for the dot. A Font Awesome icon takes the app's `--element-app-accent` where one is set (see [Styling](#styling)).

## Where things are kept

Picked colours, aliases and app icons, your accounts, the injection choice and which kinds of object are ticked belong to a chat. They are saved in the chat file, so a branch inherits them and a new chat starts blank.

Tick **Share with character** to keep one set for every chat of that character instead. While it is on, names used in any of those chats are also remembered, so a contact you have texted in one chat can be typed in lowercase in the next. Turning it on merges the open chat's set into the character's; turning it off gives the chat its own copy. The shared set is saved in SillyTavern's settings, not in the character card.

Your accounts are kept under the persona you are playing. Nothing is kept for all chats at once.

## Styling

Everything is in `style.css`. SillyTavern prefixes message classes with `custom-`, so the bubble class `eye-sms` is `.custom-eye-sms`.

Override one contact by hand, using the name in lowercase with only letters and digits:

```css
.mes_text [data-from="bob"] { --element-bg: #7a2e4d; --element-fg: #ffffff; --element-name: #ffffff; --element-nick: #e08fb0; }
```

Theme one app's conversation panel the same way:

```css
.custom-eye-app-chatter { --element-app-accent: #c13584; background: #1a1016; color: #f5e9ef; }
```

Screens take their colours from your SillyTavern theme: the main text colour, shades of it for cells and lines, and the quote colour as the accent. To change them:

```css
.custom-eye-screen { --element-ink: #dcdcd2; --element-accent: #58a6ff; }
```

A screen also reads `--element-layer` (the shade behind sections), `--element-line` (rules and borders), `--element-muted` (labels), `--element-font` (the font inside it) and `--element-radius` (the corners of its sections and cells). Set in a named style, these make a house style for one place, as `<styles><club>--element-accent:#f2c335;--element-font:Georgia,serif;--element-radius:0;background:#080808;color:#f4f4f2</club></styles>`.

Every other object sets both its background and its text colour, so it reads the same on a light or a dark theme. Keep that pairing when you change one.

## Adding a tag

Add a row to `TAG_GUIDE` in `render.js` and a `.custom-eye-<tag>` rule in `style.css`. The renderer and the model's instructions both read that table.

## Development

`render.js` has no SillyTavern imports. Its checks run with plain Node:

```bash
node test.mjs
```

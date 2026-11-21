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
| `<thread>` | one conversation: the texts or app messages inside it share a panel |
| `<chat title="Channel or stream">` | a live text chat with many participants, one `Name: message` per line |
| `<email from="Sender" subject="Subject line">` | an email |
| `<letter from="Sender">` | anything on paper |
| `<sign>` | anything posted or painted |
| `<screen title="What it is">` | anything else on a display |
| `<system_window title="What it shows">` | a status screen or notification from a game-like System |

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

A system window can be plain lines, or nested tags of the model's own naming. Nothing in it is predefined; each tag is drawn by its shape:

```
<system_window title="Status">
<vitals><hp value="42" max="60"/><mp value="18" max="18"/></vitals>
<attributes><str>7</str><agi>11</agi><int>14</int></attributes>
<skills><skill level="2">Appraisal</skill><skill level="1" new="true">Night Sight</skill></skills>
<quest_log><quest status="active">Clear the cellar<reward>40 silver</reward></quest></quest_log>
</system_window>
```

- A tag with tags inside is a section, headed by its name (`quest_log` becomes "Quest log") or by its own words.
- A tag with `value` and `max` is a bar.
- Short plain values next to each other sit side by side.
- Repeated tags are a list, and any other attribute is shown beside the item.

- Each `<thread>` is drawn on its own panel, so two conversations never read as one.
- Messages outside a `<thread>` are grouped by who is in them.
- `time` is optional on any message.
- A plain line between the messages of a thread is drawn as a note.
- Each sender gets a stable colour from a hash of the name.

## Telling the model

The instructions for writing messages as tags are injected into the system prompt. To stop that for a chat, open the **EyeMessage** drawer in the Extensions panel and untick **Inject message template instructions into system prompt**. It is on by default, and the choice belongs to the open chat (see [Where things are kept](#where-things-are-kept)).

Under it is one box per kind of object. The instructions cover only the kinds that are ticked, and each kind brings its own example. System windows are unticked to begin with, since they suit only some worlds. Every kind is drawn whether or not it is ticked.

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
- `as @handle` is remembered as one of your accounts and becomes the default for that app. Messages from any of your accounts are drawn as sent.
- Two lines to the same person draw as one conversation.

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

Several commands, one per line, are converted together. Several recipients make a group thread. Quote a name that has spaces: `/sms "Carol Jones" see you at 9?`. The game-chat commands write the kind of channel and no title, as `<chat channel="party">`, since they cannot know what the scene calls it; the model works out which chat that is.

## Colours

The EyeMessage drawer lists everyone who appears in the current chat's messages, with a colour picker for each. **Auto** returns a contact to the hashed colour.

## Where things are kept

Picked colours, your accounts, the injection choice and which kinds of object are ticked belong to a chat. They are saved in the chat file, so a branch inherits them and a new chat starts blank.

Tick **Share with all of this character's chats** to keep one set for every chat of that character instead. While it is on, names used in any of those chats are also remembered, so a contact you have texted in one chat can be typed in lowercase in the next. Turning it on merges the open chat's set into the character's; turning it off gives the chat its own copy. The shared set is saved in SillyTavern's settings, not in the character card.

Your accounts are kept under the persona you are playing. Nothing is kept for all chats at once.

## Styling

Everything is in `style.css`. SillyTavern prefixes message classes with `custom-`, so the bubble class `eye-sms` is `.custom-eye-sms`.

Override one contact by hand, using the name in lowercase with only letters and digits:

```css
.mes_text [data-from="bob"] { --eye-bg: #7a2e4d; --eye-fg: #ffffff; --eye-name: #ffffff; --eye-nick: #e08fb0; }
```

Theme one app's conversation panel the same way:

```css
.custom-eye-app-chatter { --eye-app-accent: #c13584; background: #1a1016; color: #f5e9ef; }
```

Every object sets both its background and its text colour, so it reads the same on a light or a dark theme. Keep that pairing when you change one.

## Adding a tag

Add a row to `TAG_GUIDE` in `render.js` and a `.custom-eye-<tag>` rule in `style.css`. The renderer and the model's instructions both read that table.

## Development

`render.js` has no SillyTavern imports. Its checks run with plain Node:

```bash
node test.mjs
```

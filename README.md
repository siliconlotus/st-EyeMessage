# EyeMessage

A SillyTavern extension that draws texts, app messages, emails, letters, signs, screens and live chats as styled objects in the chat.

The model writes short plain tags. EyeMessage draws them at display time. The chat file and the prompt keep the plain tags, so the model spends no tokens on HTML or CSS, and the look is yours to change in one stylesheet.

## Install

In SillyTavern, open **Extensions → Install extension** and paste this repository's address.

It needs a SillyTavern build that has the message formatter hook (`getContext().messageFormatter`, added in SillyTavern PR #5652).

## The tags

| Tag | Draws |
| --- | --- |
| `<sms from="Sender">` | a phone text |
| `<dm app="App name" from="Sender">` | a direct message inside an app |
| `<thread>` | one conversation: the texts or app messages inside it share a panel |
| `<chat title="Channel or stream">` | a live chat, one `Name: message` per line |
| `<email from="Sender" subject="Subject line">` | an email |
| `<letter from="Sender">` | anything on paper |
| `<sign>` | anything posted or painted |
| `<screen title="What it is">` | anything else on a display |

```
<thread><sms from="Bob" time="9:41 PM">Running late.</sms>
<sms from="Bob">Ten minutes, I swear.</sms>
Seen 9:52 PM
</thread>
<thread app="Chatter"><dm from="@Dave_88">where are we meeting</dm>
<dm from="@Erin">the cafe</dm></thread>
```

- Each `<thread>` is drawn on its own panel, so two conversations never read as one.
- Messages outside a `<thread>` are grouped by who is in them.
- `time` is optional on any message.
- A plain line between the messages of a thread is drawn as a note.
- Each sender gets a stable colour from a hash of the name.

## Telling the model

Open the **EyeMessage** drawer in the Extensions panel and tick **Tell the model about these tags**. It is off by default. When on, the tag instructions are added to the system prompt in every chat.

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
- `as @screenname` is remembered for that app, and messages from your screenname are drawn as sent.
- Two lines to the same person draw as one conversation.

Or use a slash command, which writes the tag into the message box without sending it:

```
/sms Bob I'm gonna be late
/sms time=22:29 Bob hey
/dm chatter @Dave_88,@Erin anyone free tonight
/dm as=@alice chatter @Dave_88 on my way
/email subject="Invoice" Frank see attached
```

`/text` is the same command as `/sms`. Several recipients make a group thread. Quote a name that has spaces: `/sms "Carol Jones" see you at 9?`.

## Colours

The EyeMessage drawer lists everyone who appears in the current chat's messages, with a colour picker for each. A picked colour applies in every chat where that name appears. **Auto** returns a contact to the hashed colour.

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

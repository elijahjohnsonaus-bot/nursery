# Nursery screen

An always-on screen for the nursery, built for an Amazon Echo Show 8 running LineageOS and Fully Kiosk Browser. It is one web page (`index.html`), a photo upload page (`photos.html`) and a few small Netlify functions that let your devices share settings, the family calendar and the photos.

## What it shows

- The temperature and what the baby should wear: TOG bag and layers, from the live outside temperature (Open-Meteo) plus an optional room adjustment. Later it can use a real room sensor.
- Sun, rain, air quality and tonight's temperatures.
- A night look (dim amber) that switches on and off by itself.
- Night light and sounds (white, pink and brown noise, shushing, waves, heartbeat) with timers.
- Pip: the last feed, the next side, nappies and sleep from the Pip baby tracker, and a night feed screen for 3 am.
- Logging to Pip from the screen (see below).
- The same settings on the Echo, a laptop and a phone (see Shared settings).
- Family: the next two weeks of everyone's Apple Calendar, one colour per person, and a photo frame slideshow (see below).

## Putting it online

The repo is deployed by Netlify. There is no build command. `netlify.toml` sets the publish directory (the repo root) and the functions folder, and Netlify installs the function's one dependency (`@netlify/blobs`) by itself. Every push to `main` goes live, and the Echo picks up the new version by itself (it checks every 5 minutes, and only reloads in the day look with nothing playing or open).

In Fully Kiosk, set the start URL to the Netlify address.

## Shared settings

Every device that opens the address uses the same settings, so there is nothing to set up on each one. Type the Pip address on a laptop and the Echo already has it. The same goes for the location, night times, room adjustment and TOG bags.

What is shared: the Pip address and birthday, the location, night start and end times, the room adjustment and which TOG bags are listed. What stays on each device: sounds, night light, "Logged as", the automatic night feed screen and the Pip passcode (see below).

How it behaves:

- A device joins by itself the first time it opens the page. It takes on whatever is already shared, and anything only that device had is then added.
- A change on one device reaches the others within a minute, or straight away when a screen is opened.
- Each setting is saved on its own, so changing the night times on one device and the location on another keeps both. If two devices change the same setting, the later save wins.
- If the server is unreachable, each device keeps working with its own settings and catches up later.
- Disconnecting Pip on one device disconnects it on every device.
- Settings are kept in a private Netlify Blobs store, never in this repo.

The site is open, like Pip: anyone who has the address can use it. Keep the address to yourselves. That also applies to the family calendar and photos below. While the site is open the Pip passcode is not stored on the server, so if Pip has a passcode, type it once on each device.

### Locking it (optional)

To require a passcode, add `NURSERY_PASSCODE` in Netlify (Site configuration, Environment variables) and redeploy the site. Every device then needs that passcode once, which also shares the Pip passcode. Either open this link once on each device (the part after `#` is never sent to a server, and is removed from the address once saved):

`https://YOUR-NURSERY-SITE/#key=YOUR-NURSERY-PASSCODE`

or type it into Settings, Shared settings, and tap Connect. Use a different passcode from Pip's. Remove the variable and redeploy to go back to open.

## Family calendar and photos

The Family button (next to Settings) opens the next two weeks of the family's calendars and a photo frame. It works on any device that has shared settings (above), which is every device that opens the site. If the site is locked, the screen needs the passcode first.

### Calendar

Each person shares their Apple Calendar as a public link, and the links go into Netlify, not into this repo:

1. On an iPhone, open Calendar, tap Calendars, then the (i) next to the calendar, turn on Public Calendar and copy the link. (On a Mac, right click the calendar and choose Share Calendar, then Public Calendar.) Any calendar that gives an `.ics` or `webcal://` link works too. For Google Calendar, open Settings on a laptop, click the calendar under Settings for my calendars, then Integrate calendar, and copy the **Secret address in iCal format** (it ends in `basic.ics`). The other Google links, such as the shareable link with `?cid=` in it, open a web page and the screen will say so. A calendar's link shows every event in that calendar, so make a separate Family calendar rather than sharing your main one.
2. In Netlify, Site configuration, Environment variables, add `CALENDAR_FEEDS` with one person per line (or separated by `;`), as `Name|#colour|link`. The colour is optional.

   ```
   Elijah|#2E72B2|webcal://p12-caldav.icloud.com/published/2/AAAA
   Molly|#C2548A|webcal://p12-caldav.icloud.com/published/2/BBBB
   ```

3. Optional: `CALENDAR_TZ` sets the time zone (default `Australia/Sydney`).
4. Redeploy the site. Environment variable changes only apply to a new deploy.

The screen lists the next 14 days under Today, Tomorrow and then dates. Each entry has its person's colour, the time (or All day), where it is and who it is for. Events that have finished today are dimmed. Repeating events, all-day and multi-day events and cancelled events are handled. If one calendar cannot be read, the others still show and the screen says which one failed. The last calendar is kept on the device, so it still shows if the Wi-Fi drops.

Anyone with that link can read that calendar, so share only calendars you are happy to have public, and keep the links private. They are only ever kept in the Netlify environment variable. While the site is open, anyone who has the nursery site's address can see the family calendar, so lock it (above) if you want it private.

### Photos

Open `https://YOUR-NURSERY-SITE/photos.html` on a phone or laptop. (If the site is locked, use `photos.html#key=YOUR-NURSERY-PASSCODE` or sign in with the passcode.) Choose photos and they are shrunk, saved as plain JPEGs without the camera and location details, and added. Tap Delete twice to remove one. Up to 300 photos are kept.

On the Echo, Family, then Photo frame starts a full screen slideshow (20 seconds each, with a blurred backdrop so nothing is cropped). Tap anywhere to close it. It closes by itself when the night look starts. Photos are stored in a private Netlify Blobs store, never in this repo. While the site is open, anyone who has the site's address can see, add and delete photos, so lock it if you want them private.

## Connecting Pip

This repo is public, so Pip's address and passcode are **not** kept in it. Enter them on the Echo:

- Settings, Pip: type the address and passcode, optionally the birthday (for the age), then Connect.
- Or open this link once on the Echo (the part after `#` is never sent to a server, and is removed from the address once saved):

  `https://YOUR-NURSERY-SITE/#pip=YOUR-PIP-ADDRESS&pass=YOUR-PASSCODE&dob=YYYY-MM-DD`

  The `#key=` and `#pip=` parts can be combined with `&`.

You only do this on one device, and the others pick it up. Pip's own passcode (`APP_PASSCODE` on Pip's Netlify site) is optional. Pip's code is public too, so without one anyone with Pip's address can read, and now write, the entries. If Pip has a passcode, type it once on each device (it is only shared if the nursery site is locked).

## Logging to Pip

Tap the Pip strip on the main screen, or the Log button, to open the Log screen:

- **Left / Right**: start a feed (the suggested side is marked Next). While a feed runs, the other side switches, and Stop feed saves it.
- **Bottle**: amount, expressed or formula, and when (now or up to an hour ago).
- **Nappy**: wet, dirty or both, and when.
- **Sleep** and **Pump**: start and stop. Stopping a pump asks for the amounts.
- **Recent**: the last few entries, with delete (tap twice).
- Every log shows a message with **Undo** for 8 seconds.

On the night feed screen the same feed, nappy, bottle and sleep buttons are under the timer, in dim red.

Entries are written the same way the phones write them, so they appear in Pip with the name set in Settings (default "Nursery screen"). If the Wi-Fi drops, entries wait on the Echo and are sent when Pip is reachable again. Before changing a feed that is already running, the Echo checks Pip first, so a change made on a phone a moment ago is not overwritten. Logging can be switched off in Settings.

## Hardware test

`/test.html` (Settings, Hardware test) checks the Echo's speaker, microphone, camera, touch and screen, and what Fully Kiosk exposes. It is the first step before adding voice features.

## Sensor pod

Planned: a small sensor board in the room posts the real temperature, and the screen uses it in place of the outside figure. The page can already read `data.json` from a pod at an IP address.

## Files

- `index.html`: the whole app.
- `photos.html`: the photo upload page.
- `test.html`: the hardware test page.
- `netlify/functions/settings.js`: the shared settings function (`/api/settings`).
- `netlify/functions/calendar.js`: reads the calendar links and returns the next two weeks (`/api/calendar`).
- `netlify/functions/photos.js`: stores and serves the photos (`/api/photos`).
- `netlify/lib/auth.js`, `netlify/lib/ical.js`: the passcode check, and the calendar file reader.
- `netlify.toml`, `package.json`: Netlify settings and the functions' one dependency.

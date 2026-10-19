# Nursery screen

An always-on screen for the nursery, built for an Amazon Echo Show 8 running LineageOS and Fully Kiosk Browser. It is one web page (`index.html`) plus one small Netlify function that lets your devices share settings.

## What it shows

- The temperature and what the baby should wear: TOG bag and layers, from the live outside temperature (Open-Meteo) plus an optional room adjustment. Later it can use a real room sensor.
- Sun, rain, air quality and tonight's temperatures.
- A night look (dim amber) that switches on and off by itself.
- Night light and sounds (white, pink and brown noise, shushing, waves, heartbeat) with timers.
- Pip: the last feed, the next side, nappies and sleep from the Pip baby tracker, and a night feed screen for 3 am.
- Logging to Pip from the screen (see below).
- The same settings on the Echo, a laptop and a phone (see Shared settings).

## Putting it online

The repo is deployed by Netlify. There is no build command. `netlify.toml` sets the publish directory (the repo root) and the functions folder, and Netlify installs the function's one dependency (`@netlify/blobs`) by itself. Every push to `main` goes live, and the Echo picks up the new version by itself (it checks every 5 minutes, and only reloads in the day look with nothing playing or open).

In Fully Kiosk, set the start URL to the Netlify address.

## Shared settings

Settings are kept on each device by default. To make the Echo, a laptop and a phone agree, turn on shared settings once:

1. In Netlify, open this site, then Site configuration, Environment variables, and add `NURSERY_PASSCODE` with a passcode of your choice.
2. Redeploy the site (Deploys, Trigger deploy). Changes to environment variables only apply to a new deploy.
3. On each device, either open this link once (the part after `#` is never sent to a server, and is removed from the address once saved):

   `https://YOUR-NURSERY-SITE/#key=YOUR-NURSERY-PASSCODE`

   or type the passcode into Settings, Shared settings, and tap Connect.

What is shared: the Pip address, passcode and birthday, the location, night start and end times, the room adjustment and which TOG bags are listed. What stays on each device: sounds, night light, "Logged as" and the automatic night feed screen.

How it behaves:

- A change on one device reaches the others within a minute, or straight away when a screen is opened.
- Each setting is saved on its own, so changing the night times on one device and the location on another keeps both. If two devices change the same setting, the later save wins.
- The first time a device connects it takes on whatever is already shared. Settings only that device had are then added.
- If the server is unreachable, each device keeps working with its own settings and catches up later.
- With no `NURSERY_PASSCODE` set, the function refuses everyone. The settings are stored in a private Netlify Blobs store, and never in this repo.
- Anyone with the nursery passcode can read the shared settings, which include the Pip passcode. Use a different passcode from Pip's.
- Disconnecting Pip on one device disconnects it on every device that shares settings.

## Connecting Pip

This repo is public, so Pip's address and passcode are **not** kept in it. Enter them on the Echo:

- Settings, Pip: type the address and passcode, optionally the birthday (for the age), then Connect.
- Or open this link once on the Echo (the part after `#` is never sent to a server, and is removed from the address once saved):

  `https://YOUR-NURSERY-SITE/#pip=YOUR-PIP-ADDRESS&pass=YOUR-PASSCODE&dob=YYYY-MM-DD`

  The `#key=` and `#pip=` parts can be combined with `&`.

With shared settings on, you only do this on one device. Make sure `APP_PASSCODE` is set on Pip's own Netlify site. Pip's code is public too, so without a passcode anyone with its address can read, and now write, the entries.

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
- `test.html`: the hardware test page.
- `netlify/functions/settings.js`: the shared settings function (`/api/settings`).
- `netlify.toml`, `package.json`: Netlify settings and the function's dependency.

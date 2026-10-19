# Nursery screen

An always-on screen for the nursery, built for an Amazon Echo Show 8 running LineageOS and Fully Kiosk Browser. It is one web page (`index.html`) with no build step.

## What it shows

- The temperature and what the baby should wear: TOG bag and layers, from the live outside temperature (Open-Meteo) plus an optional room adjustment. Later it can use a real room sensor.
- Sun, rain, air quality and tonight's temperatures.
- A night look (dim amber) that switches on and off by itself.
- Night light and sounds (white, pink and brown noise, shushing, waves, heartbeat) with timers.
- Pip: the last feed, the next side, nappies and sleep from the Pip baby tracker, and a night feed screen for 3 am.
- Logging to Pip from the screen (see below).

## Putting it online

The repo is deployed by Netlify. Netlify settings: no build command, publish directory `/` (the repo root). Every push to `main` goes live, and the Echo picks up the new version by itself (it checks every 5 minutes, and only reloads in the day look with nothing playing or open).

In Fully Kiosk, set the start URL to the Netlify address.

## Connecting Pip

This repo is public, so Pip's address and passcode are **not** kept in it. Enter them on the Echo:

- Settings, Pip: type the address and passcode, optionally the birthday (for the age), then Connect.
- Or open this link once on the Echo (the part after `#` is never sent to a server, and is removed from the address once saved):

  `https://YOUR-NURSERY-SITE/#pip=YOUR-PIP-ADDRESS&pass=YOUR-PASSCODE&dob=YYYY-MM-DD`

Make sure `APP_PASSCODE` is set on Pip's own Netlify site. Pip's code is public too, so without a passcode anyone with its address can read the entries.

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

# Nursery screen

An always-on screen for the nursery, built for an Amazon Echo Show 8 running LineageOS and Fully Kiosk Browser. It is one web page (`index.html`), a photo upload page (`photos.html`) and a few small Netlify functions that let your devices share settings, the baby's entries, the family calendar and the photos. The same page works on a phone, where it is the baby tracker.

## What it shows

- The temperature and what the baby should wear: TOG bag and layers, from the live outside temperature (Open-Meteo) plus an optional room adjustment. Later it can use a real room sensor.
- Sun, rain, air quality and tonight's temperatures.
- A night look (dim amber) that switches on and off by itself.
- Night light and sounds (white, pink and brown noise, shushing, waves, heartbeat) with timers.
- The baby tracker (the Pip app, now built in): feeds with a timer per side, bottles, nappies, sleep, pumping, medicine, growth and notes, with a day-by-day list, trends and a summary to read out at appointments (see The Baby page).
- The last feed, the next side, nappies and sleep on the nursery screen, and a night feed screen for 3 am.
- Logging from the screen (see Logging).
- The same settings on the Echo, a laptop and a phone (see Shared settings).
- Home: the family calendar, the photos, the weather and the baby at a glance, with the nursery screen one swipe away (see Pages).
- Family: the next two weeks of everyone's calendars, one colour per person, and a full screen photo frame you start by tapping the Home photo (see below).

## Pages

The screen has three pages. It opens on **Home**: the clock and date, the weather now and for the day, what is coming up on the family calendar, a shuffled slideshow of the family photos, and the baby at a glance. **Swipe left once** for the nursery screen (the temperature, TOG bag and layers, the baby band and tonight's temperatures). **Swipe left again** for the **Baby** page, the full tracker. Swipe right to go back. The dots at the bottom show which page you are on and can be tapped, and on a laptop the arrow keys work too.

- The night look opens on the nursery screen, and the day look moves back to Home when it starts. If someone is in the middle of using the screen when the look changes, the page is left where it is.
- In the day look, the nursery and Baby pages go back to Home after 2 minutes without a touch (not while a Baby sheet is open, and not on a phone held upright).
- The photo slideshow runs in its corner of Home all day in the day look, and full screen only starts when you tap it.
- Tap the photo on Home to see it full screen, the baby strip to log, or anywhere else for the buttons.
- `/#home`, `/#nursery` and `/#baby` open a particular page. On a phone `/#baby` is the one to add to the home screen.
- Home only shows the calendar and photos when the site's sharing is working (see Shared settings), and says what is missing when it is not.

## Putting it online

The repo is deployed by Netlify. There is no build command. `netlify.toml` sets the publish directory (the repo root) and the functions folder, and Netlify installs the function's one dependency (`@netlify/blobs`) by itself. Every push to `main` goes live, and the Echo picks up the new version by itself (it checks every 5 minutes, and only reloads in the day look with nothing playing or open).

In Fully Kiosk, set the start URL to the Netlify address.

## Shared settings

Every device that opens the address uses the same settings, so there is nothing to set up on each one. Type the Pip address on a laptop and the Echo already has it. The same goes for the location, night times, room adjustment and TOG bags.

What is shared: the baby's name and birthday, the nappy targets and whether the 24 hour guide shows, which app the entries live in (see Moving over from Pip), the old Pip's address, the location, night start and end times, the room adjustment, which TOG bags are listed and how often the slideshow changes photo. What stays on each device: sounds, night light, "Logged as" (so each phone shows its own name), the automatic night feed screen and the old Pip's passcode (see below).

How it behaves:

- A device joins by itself the first time it opens the page. It takes on whatever is already shared, and anything only that device had is then added.
- A change on one device reaches the others within a minute, or straight away when a screen is opened.
- Each setting is saved on its own, so changing the night times on one device and the location on another keeps both. If two devices change the same setting, the later save wins.
- If the server is unreachable, each device keeps working with its own settings and catches up later.
- Disconnecting the old Pip on one device disconnects it on every device.
- Settings are kept in a private Netlify Blobs store, never in this repo.

The site is open, like Pip was: anyone who has the address can use it, and that includes reading and adding the baby's entries. Keep the address to yourselves. That also applies to the family calendar and photos below. While the site is open the old Pip's passcode is not stored on the server, so if the old Pip has a passcode, type it once on each device.

### Locking it (optional)

To require a passcode, add `NURSERY_PASSCODE` in Netlify (Site configuration, Environment variables) and redeploy the site. Every device then needs that passcode once, which also shares the old Pip's passcode. The baby's entries are locked as well. Either open this link once on each device (the part after `#` is never sent to a server, and is removed from the address once saved):

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

Add and remove photos in the app itself: Settings, then **Photos** (on the Echo tap the screen, then Settings; on a phone use Menu on the Baby page, then Settings). Tap **Add photos**, choose as many as you like, and each is shrunk, saved as a plain JPEG without the camera and location details, and added. Tap the little x on a photo twice to delete it. Up to 300 photos are kept. The old upload page at `/photos.html` still works and uses the same photos (if the site is locked, use `photos.html#key=YOUR-NURSERY-PASSCODE`).

The photos show as a shuffled slideshow in the corner of the Home page, all day in the day look, so the time, weather and calendar stay on screen. Under Photos, **Changes every** sets how long each photo stays up: 5, 10, 20 or 30 seconds, or 1 minute. It applies to the Home slideshow and to full screen, and every screen shares it. Each lap through the photos is shuffled again, and a lap never starts with the photo that has just been shown. With no photos, Home says so and points here.

Full screen is only ever started by you: tap the photo on Home, or use Family, then Photo frame (a blurred backdrop so nothing is cropped). Tap anywhere to close it. It also closes by itself when the night look starts. Nothing starts it automatically.

Photos are stored in a private Netlify Blobs store, never in this repo. While the site is open, anyone who has the site's address can see, add and delete photos, so lock it if you want them private.

## The Baby page

This is Pip, built into the nursery app. Swipe to it on the Echo, or open `/#baby` on a phone. It has four tabs:

- **Today**: the time since the last feed, which side was last used and which to offer next, big buttons for Breast, Bottle, Pump, Nappy, Sleep and More (medicine, growth, a note, or an entry for a time that has passed), the last 24 hours at a glance with the nappy guide, and today's list. Tap any entry to change or delete it.
- **Days**: any day, one at a time, with its totals.
- **Trends**: the average gap between feeds, the longest sleep, feeds and sleep a day for the last week, the weight line, and a summary to read out at an appointment.
- **Settings**: who is logging on this device, the baby's name and birthday, the nappy targets, moving over from Pip, and your data (sync now, download a backup, download a spreadsheet, reload this device's copy).

Notes:

- Breast feeds run a timer for each side and switching banks the time. Only one feed runs at a time. Starting a feed picks the side to offer next.
- A time field left alone means "now" at the moment you save. Change it to log something that has already happened.
- The nappy guide is general (about one wet nappy per day of age for the first six days, then six wet and two dirty a day). It is a guide, not advice about your baby: check it with your midwife or child and family health nurse.
- Every entry shows who logged it. Each phone sets its own name once (a banner asks the first time).
- Entries are saved on the device first and sent to the server straight away. With no signal they wait on the device and are sent, once each, when it is back, so a flat spot in the Wi-Fi or a lift loses nothing.
- Everything shown on the Echo and on every phone is the same list, and a change on one appears on the others within about 15 seconds (straight away when a screen is opened).

### On a phone

Open `https://YOUR-NURSERY-SITE/#baby` and add it to the home screen (Share, Add to Home Screen on an iPhone; the menu, Install app or Add to Home screen on Android). It then opens full screen and, because of a small service worker (`sw.js`), still opens with no signal and shows what was last synced. The service worker fetches the page from the network first, so a new version on GitHub still lands straight away, and it never stores anything from `/api/`.

## Moving over from Pip

The old Pip app keeps running and is never changed by any of this. The new app keeps the entries in its own store (`baby-entries` in Netlify Blobs), using the same entry format, so they come across as they are, with the same ids, times, sides and who logged them.

1. Deploy this version (push to `main`). It adds one function, `netlify/functions/sync.js`, which Netlify picks up by itself.
2. On any device open the Baby page, then Settings, and type the old Pip's address (the one your phones use). If the old Pip has a passcode, type it in Menu, Settings, Pip (the old app) first.
3. Press **Bring Pip's data over**. It reads every entry from the old Pip, copies them here in batches, then reads them back and checks that each one arrived, and says how many. It only reads the old Pip. It is safe to press as many times as you like: an entry that is already here is not duplicated, and if an entry was changed in the old Pip since, the newer version wins.
4. Look through Today, Days and Trends and check it matches what you expect.
5. Press **Use this app from now on** (it asks you to tap twice). From then on every screen and phone reads and writes the entries here instead of the old Pip. It is shared, so you only do it once.
6. Open `/#baby` on each phone, add it to the home screen, and set the name on each.
7. If anyone logged something in the old Pip after step 3, press **Bring Pip's data over** again to catch up. **Go back to the old Pip** reverses step 5 the same way.

Keep the old Pip running until you are sure everything is here, and download a backup first (Settings, Download a backup).

The old address and passcode are kept out of this repo, like everything else private: they are saved in the app's settings, never in the code.

## Logging

Tap the baby strip on Home or the nursery screen, or the Log button, to open the Log screen (or use the Baby page above):

- **Left / Right**: start a feed (the suggested side is marked Next). While a feed runs, the other side switches, and Stop feed saves it.
- **Pause**: stops the timers while the baby comes off (a burp, a nappy change) and **Resume** carries on. Tapping a side while paused resumes on that side. Stopping a paused feed ends it at the moment you paused, so "since last feed" is right even if Stop is tapped later. Pause is on the Log screen, the night feed screen and the Baby page.
- **Bottle**: amount, expressed or formula, and when (now or up to an hour ago).
- **Nappy**: wet, dirty or both, and when.
- **Sleep** and **Pump**: start and stop. Stopping a pump asks for the amounts.
- **Recent**: the last few entries, with delete (tap twice).
- Every log shows a message with **Undo** for 8 seconds.

On the night feed screen the same feed, nappy, bottle and sleep buttons are under the timer, in dim red.

**Since last feed** counts from when the baby last stopped feeding, not from when Stop was tapped. A feed saved before Pause existed whose side timers add up to far less than its start to finish (for example 16 minutes on the breast but closed an hour later) is counted from the end of the timers. Open the feed on the Baby page and save it to set the finish time yourself.

**Next feed** is timed from when a feed *starts*, not when it ends: a feed that starts at 3:00 pm and runs until 3:30 pm still means the next one at 6:00 pm with the default 3 hour day gap. The last feed before the night time (12:00 am to begin with) is followed by the longer night gap (4 hours to begin with), so a 9:00 pm feed means the next one at 1:00 am; feeds after that go back to the day gap. It counts from breast feeds only (a bottle never moves it), and a breast feed that starts within an hour of the one before it is treated as part of it, so the schedule stays with the first (a feed at 4:41 pm and another at 5:20 pm still means 7:41 pm). It shows on the nursery and Home bands, the night feed screen and the Baby page, turning red when it is due. Day gap, night gap and the night time are in Settings (Next feed) and on the Baby page under Settings, and are shared with every screen like the other settings.

The Echo logs under the name set in Settings (default "Nursery screen"). Before changing a feed that is already running, the screen checks the server first, so a change made on a phone a moment ago is not overwritten. Logging can be switched off in Settings.

## The old Pip app

Until you switch (above), the screen reads from and logs to the old Pip app exactly as before. This repo is public, so the old Pip's address and passcode are **not** kept in it. Enter them on one device and the others pick up the address:

- Settings, Pip (the old app): type the address and passcode, then Connect.
- Or open this link once (the part after `#` is never sent to a server, and is removed from the address once saved):

  `https://YOUR-NURSERY-SITE/#pip=YOUR-PIP-ADDRESS&pass=YOUR-PASSCODE&dob=YYYY-MM-DD`

  The `#key=` and `#pip=` parts can be combined with `&`.

## Hardware test

`/test.html` (Settings, Hardware test) checks the Echo's speaker, microphone, camera, touch and screen, and what Fully Kiosk exposes. It is the first step before adding voice features.

## Sensor pod

Planned: a small sensor board in the room posts the real temperature, and the screen uses it in place of the outside figure. The page can already read `data.json` from a pod at an IP address.

## Files

- `index.html`: the whole app.
- `photos.html`: the older photo upload page (the same thing is now in Settings, Photos).
- `test.html`: the hardware test page.
- `netlify/functions/settings.js`: the shared settings function (`/api/settings`).
- `netlify/functions/calendar.js`: reads the calendar links and returns the next two weeks (`/api/calendar`).
- `netlify/functions/photos.js`: stores and serves the photos (`/api/photos`).
- `netlify/functions/sync.js`: stores the baby's entries and shares them between devices (`/api/sync`). The same protocol the Pip app used.
- `manifest.json`, `sw.js`, `icon-*.png`: let a phone add the app to its home screen and open it with no signal.
- `netlify/lib/auth.js`, `netlify/lib/ical.js`: the passcode check, and the calendar file reader.
- `netlify.toml`, `package.json`: Netlify settings and the functions' one dependency.

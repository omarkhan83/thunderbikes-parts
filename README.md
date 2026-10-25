# UBC Thunderbikes Part Numbering System

A small website for creating and tracking Mechanical and Aerodynamics part numbers.
It runs on GitHub Pages, saves every part to a shared Google Sheet, exports to Excel, and can be embedded in Notion.

## Files

| File | What it is |
|---|---|
| `index.html` | The page |
| `app.js` | The numbering logic, explorer, parts table, BOM import and export |
| `config.js` | The one line you edit: the Google Sheet web-app URL |
| `apps-script.gs` | The code that runs inside the Google Sheet to store parts |
| `assets/` | Team logo and crest from ubcthunderbikes.com |

## Numbering rules built in

**Mechanical** (`01 MF`, `02 BM/DT`, `03 FF/TC/RS/SW/HB`, `04 FW/RW`, `05 FB/RB`)
`SS AA-SSS-PPP`: system, assembly, subassembly, part. Same shape as MotoStudent's `00-AA-000-000`.
- **Subassembly (SSS)**: choose "+ New subassembly" and give it a name (e.g. "fork bracket assembly"). It gets the next number in that assembly: `001`, `002`…
- **Part (PPP)**: every part added to that subassembly gets the next number in order: `001`, `002`, `003`…

Example: `03 FF-001-001` fork bracket, `03 FF-001-002` fork bracket bolt, `03 FF-001-003` fork bracket washer, `03 FF-002-001` axle spacer (subassembly 002, "axle assembly").

**Aero / composite** (`06 MG/FF/SF/TF/GT`, `01 SF/SP/BC`)
`SS AA-TXP-NNN`: T = type (1 part, 2 mould, 3 mounting/fixture, 4 other), P = position (0 single, 1 right, 2 left, 3 top/front, 4 bottom/rear), then a count in order for that type and position.
Example: left side fairing mould splits → `06 SF-202-001`, `06 SF-202-002`, `06 SF-202-003`.
Prototypes: `06 SF-202-P26-1`, `-P26-2`, … (the year comes from today's date, and the iteration counts up automatically).

New assembly codes can be added from the page ("Add a new assembly code"). System 07 Others starts empty.

## Setup (about 10 minutes)

### 1. Create the Google Sheet (the database)
1. Create a new Google Sheet, for example "Thunderbikes Parts", in the team's Google Drive.
2. Open **Extensions → Apps Script**, delete what's there, and paste in all of `apps-script.gs`. Save.
3. Click **Deploy → New deployment**, choose type **Web app**, and set:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**, approve the permissions, and copy the **Web app URL** (it ends in `/exec`).

The `Parts` and `Assemblies` tabs are created automatically the first time the site loads.
The sheet itself is your Excel copy: **File → Download → Microsoft Excel** at any time.

### 2. Connect the site to the sheet
Open `config.js` and paste the URL:
```js
window.TB_SHEETS_URL = 'https://script.google.com/macros/s/XXXX/exec';
```
Without a URL the site still works, but saves parts only in your own browser.

### 3. Put it on GitHub Pages
1. Create a GitHub repository (e.g. `thunderbikes-parts`) and upload these four files.
2. In the repo go to **Settings → Pages**, set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
3. After a minute the site is live at `https://<your-github-username>.github.io/thunderbikes-parts/`.

### 4. Add it to Notion
In a Notion page type `/embed`, paste the GitHub Pages URL, and resize the block. The full site works inside Notion.

## Using it
- **New part**: pick system and assembly (plus type and position for aero), type a description of up to 7 words, and optionally add qty and cost. The number is created and saved to the sheet.
- **Explorer**: SM 27 → systems → assemblies → subassemblies → parts, top down. Click to expand. "+ New part in …" fills the form for that assembly.
- **All parts**: search, filter by system, and edit description, qty or cost later. Delete asks for confirmation first. Deleting the last part in a subassembly also deletes the subassembly. A subassembly left empty any other way shows a "Delete empty subassembly" button in the Explorer.
- **BOM upload**: drop an .xlsx or .csv. It previews the result before anything is saved. Existing part numbers get updated, new valid numbers get added, and rows with `System` + `Assembly` + `Subassembly` (number or name) but no part number get the next number in that subassembly. A new subassembly name is created automatically.
- **Export Excel / CSV / Copy table**: copy table pastes straight into Excel or a Notion table.
- Your name is required on the New part form (and before a BOM import). It is saved as "Created by" on each part, edits record "Updated By", and the browser remembers it for next time.

## Editing the website

The site is plain HTML and JavaScript with no build step, so a change is just: edit a file, save, and it's live.

### How to make a change
- **On GitHub (easiest, no install):** open the repo, click the file, click the pencil icon, edit, then **Commit changes**. GitHub Pages republishes the site in about 1 minute. Refresh with Ctrl+F5 if you still see the old version.
- **On your computer:** edit the files in any text editor (VS Code is a good free one) and double-click `index.html` to check it in your browser. Then upload the changed files to GitHub (**Add file → Upload files**), or use `git commit` + `git push` if you use git.
- Anyone you add as a collaborator on the repo (**Settings → Collaborators**) can edit it. GitHub keeps every old version under **History**, so a bad change can always be undone.

Editing the website never touches the parts data. That lives in the Google Sheet.

### Where things are
| To change… | Edit | What to look for |
|---|---|---|
| Project name at the top of the tree (SM 27 → SM 28) | `config.js` | `window.TB_PROJECT = 'SM 27';` |
| Which Google Sheet it saves to | `config.js` | `window.TB_SHEETS_URL` |
| Systems (01 Structure … 07 Others) | `app.js` | `const SYSTEMS` near the top |
| Built-in assemblies and their codes | `app.js` | `const BASE_ASM` near the top. One line per assembly: `['03','FF','Front Fork','mech']`. The last value is `'mech'` or `'aero'` numbering. |
| Aero types (100 part, 200 mould…) and positions | `index.html` (the dropdown options) and `app.js` (`const TYPES`, `const POS`) | Keep both files in step |
| Max words in a description (7) | `app.js` | `const MAX_WORDS = 7;` near the top |
| Colours | `index.html` | the `:root{ … }` block at the top of `<style>`. `--accent` is the gold, `--deep` the dark strip, `--brand` the navy. |
| Logo and tab icon | `assets/logo.png`, `assets/icon-logo.png` | replace the files, keep the names |
| Page title and header text | `index.html` | `<title>` and "Part Numbering System" |

New assembly codes can also be added from the site itself ("Add a new assembly code") without editing any code. Those are stored in the sheet's Assemblies tab.

### Changing how parts are saved
`apps-script.gs` runs inside the Google Sheet, not on GitHub. To change it, edit the code under **Extensions → Apps Script** in the sheet. Then use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy** so the web-app URL stays the same. Also copy the change into `apps-script.gs` in the repo so the two stay matched.

### Things to be careful with
- Don't change an existing assembly's code or numbering style once parts use it. Their part numbers are already saved and won't update.
- Don't insert, delete or reorder columns in the Google Sheet's tabs. The script finds each value by its column position, so moved columns get the wrong data. Renaming a header is harmless, and you can add your own columns to the right of the last one.

## Notes
- Anyone with the web-app URL can add or change parts. Keep the URL within the team.

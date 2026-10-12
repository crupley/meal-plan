# meal-plan

Personal recipe repository and weekly dinner planner.

- Recipes are plain text files in [Cooklang](https://cooklang.org) format in `recipes/`.
- A small web page picks one dinner per day and produces a meal plan and a shopping list grouped
  by grocery store section. It is hosted on GitHub Pages: <https://crupley.github.io/meal-plan/>
- New recipes are added by giving Claude a URL or pasting the recipe text.
- Recipes are read while cooking in the Cooklang iPhone app.

## Layout

```
recipes/                      one .cook file per recipe
config/aisle.conf             grocery store sections and the ingredients in each
config/themes.json            the theme (recipe tag) for each day of the week
site/                         the planner pages (plain HTML, CSS and JS)
scripts/build.py              runs CookCLI over the recipes and builds _site/
scripts/serve.py              local server; shopping lists come straight from CookCLI
scripts/sync-icloud.sh        copies recipes to iCloud Drive for the iPhone app
.github/workflows/pages.yml   builds and deploys the site on every push to main
.claude/skills/add-recipe/    the Claude skill that adds recipes
```

## Planning a week

Open the planner (hosted link above, or locally, see below).

1. Pick the week. Any date snaps to that week's Monday.
2. Choose a dinner for each day. Each day has a theme, and its dropdown only lists recipes tagged
   with that theme. Tick **All recipes** on a day to choose from every recipe instead. Days
   can be left empty.
3. Adjust the amount per day (×0.5 to ×4) if you are cooking for more or fewer people.
4. **View meal plan** shows the week; **View shopping list** shows everything to buy, grouped by
   store section, with checkboxes to tick off as you shop. Both pages print cleanly.

The plan is stored in the page address, so bookmarking or sharing the link keeps the plan. It is
also remembered in the browser you made it in.

### Day themes

`config/themes.json` sets the theme for each day:

```json
{
  "mon": { "label": "Pasta", "tag": "pasta" },
  "thu": null
}
```

`tag` is the recipe tag the day is limited to and `label` is what the planner shows. A day set to
`null` offers every recipe. The current values are placeholders; edit the file and push.

### Store sections

`config/aisle.conf` decides which section each ingredient is listed under and in what order:

```
[produce]
onion
tomato | tomatoes
```

Names on one line separated by `|` are treated as the same item. Ingredients that are not listed
end up under "other". `cook doctor aisle -b recipes` lists any that are missing.

## Running locally

Requires Python 3 (ships with macOS) and [CookCLI](https://cooklang.org/cli/):

```sh
brew install cookcli
python3 scripts/serve.py        # then open http://localhost:8000/
```

Restart the server after adding or editing recipes.

The local and hosted planners look the same but make the shopping list differently; the note at the
bottom of the shopping list says which one you are looking at.

| | Shopping list made by |
|---|---|
| Local (`serve.py`) | `cook shopping-list`, run for the selected recipes |
| Hosted (GitHub Pages) | the browser, adding up ingredient data that CookCLI extracted when the site was built |

GitHub Pages can only serve files, so it cannot run CookCLI on demand. The hosted list adds
amounts that share a unit and lists different units side by side (`1 cup + 2 tbsp`); it does not
convert between units or subtract a CookCLI pantry.

To build the site without serving it: `python3 scripts/build.py` (output in `_site/`).

## Adding a recipe

### With Claude

The `add-recipe` skill in this repository works in Claude Code, both on the Mac (`claude` in this
folder) and on the phone (Claude app → Code → this repository). Either:

- give it a link: *"add this recipe: https://…"*, or
- paste the recipe text into the chat: *"add this recipe: …"*

Claude converts it to Cooklang, asks about anything that is missing (quantities, servings, tags,
source), adds new ingredients to `config/aisle.conf`, and commits and pushes. Tags matter: a recipe
only shows up under a day's theme if it carries that day's tag.

Sessions started from the phone may push to a branch and open a pull request instead of pushing to
`main`. Merge it (the GitHub mobile app works) and the site rebuilds in about a minute.

### By hand

Create `recipes/<Title>.cook`:

```cooklang
---
title: Black Bean Tacos
servings: 4
tags: [tacos, vegetarian]
---

Heat @olive oil{1%tbsp} in a #skillet{} and cook @onion{1}(diced) for ~{5%minutes}.
```

`@` marks an ingredient, `#` cookware and `~` a timer; see the
[Cooklang specification](https://cooklang.org/docs/spec/). Check it with
`cook recipe "recipes/<Title>.cook"`, then commit and push.

## Viewing recipes on iPhone

Recipes are displayed with the free [Cooklang app](https://cooklang.org/app/), which reads `.cook`
files from a folder in iCloud Drive.

1. On the Mac, with iCloud Drive turned on, run:

   ```sh
   scripts/sync-icloud.sh
   ```

   It pulls the latest recipes from GitHub and copies `recipes/` and `config/` to
   `iCloud Drive/Recipes`.
2. Install the Cooklang app on the iPhone and point it at the `Recipes` folder in iCloud Drive.
3. Run the script again whenever recipes change.

The copy is one way: edit recipes in this repository, not in the iCloud folder, because the script
overwrites that folder. The repository itself should stay out of iCloud Drive, which can damage git
repositories.

To sync automatically every hour, so recipes added from the phone appear without touching the Mac,
save this as `~/Library/LaunchAgents/com.crupley.meal-plan-sync.plist` and run
`launchctl load ~/Library/LaunchAgents/com.crupley.meal-plan-sync.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.crupley.meal-plan-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/crupley/projects/meal-plan/scripts/sync-icloud.sh</string>
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
```

## Hosting on GitHub Pages

`.github/workflows/pages.yml` installs CookCLI, runs `scripts/build.py` and deploys `_site/` on
every push to `main`. One-time setup: in the repository on GitHub, go to **Settings → Pages** and
set **Source** to **GitHub Actions** (or run
`gh api repos/crupley/meal-plan/pages -X POST -f build_type=workflow`).

The CookCLI version used by the workflow is pinned in `COOKCLI_VERSION` at the top of that file.

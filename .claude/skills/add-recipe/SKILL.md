---
name: add-recipe
description: Add a recipe to this repository as a Cooklang .cook file. Use when the user gives a recipe URL, pastes recipe text into the chat, or says "add recipe", "save this recipe", or "import this recipe".
---

# Add a recipe

Turn a recipe into a Cooklang file in `recipes/`, so it appears in the meal planner and the
Cooklang app. The source is either a **URL** or **recipe text pasted into the chat** (a copied web
page, notes, a transcribed card, a photo's text, anything).

## 1. Get the recipe

- **URL**: fetch the page. Prefer the schema.org `Recipe` JSON-LD block when there is one; otherwise
  read the ingredient list and method from the page text. If CookCLI is installed
  (`cook --version`), `cook import <url>` gives a usable first draft, but always review and rewrite
  it to the conventions below. If the page cannot be fetched (paywall, bot block), say so and ask
  the user to paste the recipe text instead.
- **Pasted text**: use it as given. Do not go looking for a "better" version online.

Ignore life stories, ads and comments. Keep the author's ingredient amounts and method; rewrite the
steps in your own concise words rather than copying long passages verbatim.

## 2. Ask about anything missing

Before writing the file, check the list below. Ask about everything that is missing or ambiguous
**in one batch** (use the question tool when available), then wait for the answers.

- **Title**: ask only if there is none or it is unclear.
- **Servings**: required. The planner scales recipes from it.
- **Ingredient quantities and units**: every ingredient that goes on a shopping list needs an
  amount. Ask about each one that lacks it ("some chicken", "cheese", "a can of beans": what size?).
  Never invent or estimate a quantity. Salt, pepper and "to taste" items may stay without one.
- **Tags**: required. Read `config/themes.json`; each weekday has a theme `tag`, and the planner's
  dropdown for that day only lists recipes carrying it. Propose the theme tag(s) that fit plus any
  useful descriptive tags (`vegetarian`, `quick`, `freezer`), and ask the user to confirm or
  change them. If no theme fits, say so: the recipe will only be reachable through "All recipes".
- **Source**: for pasted text, ask where it came from (a URL, a book, "family") unless stated.
- **Times**: include prep and cook time when the source gives them; do not ask if absent.

If nothing is missing, do not ask; just state the tags you chose.

## 3. Write the file

Save as `recipes/<file_name>.cook`, where the file name is the title in lowercase with words
separated by underscores and all other punctuation dropped: "Minestrone-Style Bean Soup" becomes
`recipes/minestrone_style_bean_soup.cook`. The readable name goes in the `title` metadata, which is
what the planner displays, so `title` is required. If a file with
that name exists, ask whether to replace it or save under a different name.

```cooklang
---
title: Black Bean Tacos
source: https://example.com/black-bean-tacos
servings: 4
tags: [tacos, vegetarian]
prep time: 10 minutes
cook time: 15 minutes
---

Heat @olive oil{1%tbsp} in a #skillet{} over medium heat. Cook @onion{1}(diced) until soft,
about ~{5%minutes}.

Add @black beans{30%oz}(drained and rinsed) and @salt{1/2%tsp}.
```

Cooklang rules:

- Metadata goes in the YAML front matter. `servings` is a plain number. `tags` is a list of
  lowercase tags.
- One paragraph per step, separated by a blank line.
- Ingredients: `@name{quantity%unit}`. Braces are required when the name has spaces
  (`@olive oil{1%tbsp}`); `@salt` alone is fine for a single word with no amount; use `@eggs{2}`
  for a count with no unit. Preparation notes go in parentheses after the braces:
  `@onion{1}(diced)`. Optional ingredients: `@?chives{1%tbsp}`.
- Mark each ingredient once, where it is first used, with the full amount. If it is used in two
  steps, either split the amount between them or mention it as plain text the second time.
- Cookware: `#pot` or `#large pot{}`. Timers: `~{25%minutes}`.
- Sections for multi-part recipes: `== Sauce ==`. Notes: lines starting with `>`.

Ingredient names (these become shopping list lines, so consistency matters):

- Lowercase, singular, generic: `onion`, `carrot`, `chicken breast`, not `Onions` or
  `2 large yellow onions`. Put size and preparation in the parenthesised note.
- Before naming an ingredient, check `config/aisle.conf` and reuse the existing name when the
  ingredient is already there (`cheddar cheese`, not `shredded cheddar`).
- Keep the source's units; do not convert between metric and US.

## 4. Update the aisle list

Every ingredient should be listed in `config/aisle.conf` so the shopping list can group it by store
section. Add any new ingredient, one per line, under the fitting `[section]`; add a new section
only when none fits. Alternative names for the same item go on one line separated by `|`.

## 5. Check and save

- If CookCLI is available: `cook recipe recipes/<file_name>.cook` must parse without errors, and
  `cook doctor aisle -b recipes` should report nothing missing. Without CookCLI (cloud sessions),
  re-read the file and check the syntax by eye.
- Commit the recipe and the `aisle.conf` change together with a message like
  `Add recipe: Black Bean Tacos`, and push. Push to `main` when the session allows it, since that
  is what rebuilds the site; otherwise push the session branch, open a pull request, and tell the
  user it needs merging before the recipe shows up.
- If there is no repository access at all (a plain chat with this skill uploaded), output the
  finished `.cook` file and the lines to add to `aisle.conf` so the user can save them.

Finish with a short summary: file name, servings, tags, and any ingredient added to `aisle.conf`.

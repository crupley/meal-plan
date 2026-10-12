// Shared logic for the planner, meal plan and shopping list pages.
// The plan lives in the URL query string (and localStorage), e.g.
//   ?week=2026-10-12&mon=Spaghetti%20Bolognese&monx=2&tue=Black%20Bean%20Tacos

const DAYS = [
  ["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"],
  ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"],
];
const SCALES = [0.5, 1, 1.5, 2, 3, 4];
const STORE_KEY = "meal-plan";

// ---------- helpers ----------

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (err) { /* private mode: the URL still carries the plan */ }
  return null;
}

async function getJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

function isoDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return match ? new Date(+match[1], +match[2] - 1, +match[3]) : null;
}

// The Monday of the week containing `date`.
function mondayOf(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

// Today's week on Monday, otherwise the week that starts next Monday.
function defaultWeek() {
  const today = new Date();
  const monday = mondayOf(today);
  if (today.getDay() !== 1) monday.setDate(monday.getDate() + 7);
  return isoDate(monday);
}

function dayDate(week, index) {
  const date = parseDate(week);
  date.setDate(date.getDate() + index);
  return date;
}

function shortDate(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatNumber(n) {
  return String(Math.round(n * 100) / 100);
}

// ---------- plan state ----------

function parsePlan(query) {
  const params = new URLSearchParams(query);
  const week = parseDate(params.get("week"));
  const plan = { week: week ? isoDate(mondayOf(week)) : defaultWeek(), days: {} };
  for (const [key] of DAYS) {
    const id = params.get(key);
    if (!id) continue;
    const scale = parseFloat(params.get(key + "x"));
    plan.days[key] = { id, scale: scale > 0 ? scale : 1 };
  }
  return plan;
}

function planQuery(plan) {
  const params = new URLSearchParams({ week: plan.week });
  for (const [key] of DAYS) {
    const pick = plan.days[key];
    if (!pick) continue;
    params.set(key, pick.id);
    if (pick.scale !== 1) params.set(key + "x", pick.scale);
  }
  return params.toString();
}

function loadPlan() {
  const query = location.search.length > 1 ? location.search : store(STORE_KEY) || "";
  return parsePlan(query);
}

function savePlan(plan) {
  const query = planQuery(plan);
  store(STORE_KEY, query);
  history.replaceState(null, "", "?" + query);
  for (const link of document.querySelectorAll("a[data-nav]")) {
    link.href = link.getAttribute("href").split("?")[0] + "?" + query;
  }
}

function servingsText(recipe, scale) {
  const base = Number(recipe.servings);
  if (base > 0) return `serves ${formatNumber(base * scale)}`;
  return scale === 1 ? "" : `×${formatNumber(scale)}`;
}

function weekHeading(plan) {
  return `Week of ${shortDate(dayDate(plan.week, 0))} – ${shortDate(dayDate(plan.week, 6))}`;
}

// ---------- planner page ----------

async function plannerPage() {
  const [recipes, themes] = await Promise.all([
    getJSON("data/recipes.json"), getJSON("data/themes.json"),
  ]);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const plan = loadPlan();
  // Picks for recipes that have since been removed are dropped.
  for (const [key] of DAYS) {
    if (plan.days[key] && !byId.has(plan.days[key].id)) delete plan.days[key];
  }
  const overridden = {};

  const weekInput = document.getElementById("week");
  weekInput.addEventListener("change", () => {
    const picked = parseDate(weekInput.value);
    if (picked) plan.week = isoDate(mondayOf(picked));
    render();
  });
  document.getElementById("clear").addEventListener("click", () => {
    plan.days = {};
    for (const key of Object.keys(overridden)) delete overridden[key];
    render();
  });

  function themed(key) {
    const tag = themes[key] && themes[key].tag && themes[key].tag.toLowerCase();
    return tag ? recipes.filter((r) => r.tags.includes(tag)) : null;
  }

  function dayRow([key, name], index) {
    const theme = themes[key];
    const matches = themed(key);
    const pick = plan.days[key];
    const offTheme = Boolean(pick && matches && !matches.some((r) => r.id === pick.id));
    const showAll = !matches || overridden[key] || offTheme || matches.length === 0;
    const options = showAll ? recipes : matches;

    const select = el("select", { className: "recipe" }, el("option", { value: "" }, "— no dinner —"));
    select.setAttribute("aria-label", `${name} dinner`);
    for (const recipe of options) {
      select.append(el("option", { value: recipe.id }, recipe.title));
    }
    select.value = pick ? pick.id : "";
    select.addEventListener("change", () => {
      if (select.value) plan.days[key] = { id: select.value, scale: pick ? pick.scale : 1 };
      else delete plan.days[key];
      render();
    });

    const controls = el("div", { className: "day-controls" }, select);

    if (pick) {
      const recipe = byId.get(pick.id);
      const scale = el("select");
      scale.setAttribute("aria-label", `${name} amount`);
      for (const value of SCALES) {
        const text = [`×${formatNumber(value)}`, servingsText(recipe, value)]
          .filter((part, i) => part && (i === 0 || part[0] !== "×")).join(" · ");
        scale.append(el("option", { value }, text));
      }
      scale.value = pick.scale;
      scale.addEventListener("change", () => {
        pick.scale = parseFloat(scale.value);
        render();
      });
      controls.append(scale);
    }

    if (matches && matches.length) {
      const box = el("input", { type: "checkbox", checked: showAll });
      box.addEventListener("change", () => {
        overridden[key] = box.checked;
        // Going back to the theme drops a pick that does not belong to it.
        if (!box.checked && offTheme) delete plan.days[key];
        render();
      });
      controls.append(el("label", { className: "override" }, box, " All recipes"));
    }

    const themeLabel = theme && (theme.label || theme.tag)
      ? el("span", { className: "theme" }, theme.label || theme.tag)
      : el("span", { className: "theme none" }, "Any recipe");
    const row = el("section", { className: "day" },
      el("div", { className: "day-head" },
        el("span", { className: "day-name" }, name,
          el("span", { className: "day-date" }, shortDate(dayDate(plan.week, index)))),
        themeLabel),
      controls);

    if (matches && matches.length === 0) {
      row.append(el("p", { className: "day-note" },
        `No recipes tagged "${theme.tag}" yet, showing all recipes.`));
    } else if (offTheme) {
      row.append(el("p", { className: "day-note" }, `Off theme (not tagged "${theme.tag}").`));
    }
    return row;
  }

  function render() {
    weekInput.value = plan.week;
    document.getElementById("days").replaceChildren(...DAYS.map(dayRow));
    savePlan(plan);
  }

  render();
  document.getElementById("status").textContent =
    `${recipes.length} recipes available. The link to this page keeps your plan.`;
}

// ---------- meal plan page ----------

async function planPage() {
  const [recipes, themes] = await Promise.all([
    getJSON("data/recipes.json"), getJSON("data/themes.json"),
  ]);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const plan = loadPlan();
  savePlan(plan);

  document.getElementById("heading").textContent = weekHeading(plan);
  const rows = DAYS.map(([key, name], index) => {
    const pick = plan.days[key];
    const recipe = pick && byId.get(pick.id);
    const cell = recipe
      ? el("td", {}, recipe.title, el("small", {}, servingsText(recipe, pick.scale)))
      : el("td", { className: "empty" }, pick ? `${pick.id} (recipe not found)` : "—");
    const head = el("th", { scope: "row" }, name,
      el("small", {}, shortDate(dayDate(plan.week, index))));
    const label = themes[key] && themes[key].label;
    if (label) head.append(el("small", { className: "theme" }, label));
    return el("tr", {}, head, cell);
  });
  document.getElementById("plan").replaceChildren(...rows);
}

// ---------- shopping list page ----------

// Hosted mode: add up ingredients in the browser, mirroring `cook shopping-list`.
function aggregate(picks, aisles) {
  const canonical = new Map(); // any listed name -> first name on its aisle.conf line
  const placement = new Map(); // canonical name -> [aisle index, position in aisle]
  aisles.forEach((aisle, a) => aisle.items.forEach((names, i) => {
    placement.set(names[0].toLowerCase(), [a, i]);
    for (const name of names) canonical.set(name.toLowerCase(), names[0]);
  }));

  const items = new Map();
  for (const { recipe, scale } of picks) {
    for (const ingredient of recipe.ingredients) {
      const name = canonical.get(ingredient.name.toLowerCase()) || ingredient.name;
      const key = name.toLowerCase();
      if (!items.has(key)) items.set(key, { name, amounts: [] });
      const amount = ingredient.amount;
      if (!amount) continue;
      const amounts = items.get(key).amounts;
      if (amount.qty === null) {
        if (!amounts.some((a) => a.text === amount.text && a.unit === amount.unit)) {
          amounts.push({ ...amount });
        }
        continue;
      }
      const same = amounts.find((a) => a.qty !== null && a.unit === amount.unit);
      if (same) same.qty += amount.qty * scale;
      else amounts.push({ qty: amount.qty * scale, unit: amount.unit, text: null });
    }
  }

  const sections = aisles.map((aisle) => ({ category: aisle.category, items: [] }));
  const other = { category: "other", items: [] };
  for (const [key, item] of items) {
    const place = placement.get(key);
    if (place) sections[place[0]].items[place[1]] = item;
    else other.items.push(item);
  }
  for (const section of sections) section.items = section.items.filter(Boolean);
  return [...sections, other].filter((section) => section.items.length);
}

function amountText(amounts) {
  return amounts
    .map((a) => [a.qty !== null ? formatNumber(a.qty) : a.text, a.unit].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" + ");
}

async function shoppingPage() {
  const plan = loadPlan();
  savePlan(plan);
  const status = document.getElementById("status");
  const list = document.getElementById("list");
  document.getElementById("heading").textContent = weekHeading(plan);

  const picks = DAYS.map(([key]) => plan.days[key]).filter(Boolean);
  if (!picks.length) {
    list.replaceChildren(el("p", { className: "empty" }, "No dinners planned for this week yet."));
    return;
  }

  // The local server (scripts/serve.py) exposes CookCLI; GitHub Pages does not.
  const local = await fetch("api/health").then((r) => r.ok, () => false);
  let sections;
  if (local) {
    const params = new URLSearchParams();
    for (const pick of picks) {
      params.append("r", pick.id);
      params.append("x", pick.scale);
    }
    const response = await fetch("api/shopping-list?" + params);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "CookCLI failed");
    sections = body;
    status.textContent = "Generated by CookCLI (cook shopping-list).";
  } else {
    const [recipes, aisles] = await Promise.all([
      getJSON("data/recipes.json"), getJSON("data/aisles.json"),
    ]);
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const found = picks
      .filter((pick) => byId.has(pick.id))
      .map((pick) => ({ recipe: byId.get(pick.id), scale: pick.scale }));
    sections = aggregate(found, aisles);
    status.textContent = "Added up in the browser from recipe data built by CookCLI.";
    const missing = picks.length - found.length;
    if (missing) status.textContent += ` ${missing} planned recipe(s) no longer exist and were skipped.`;
  }

  const checkedKey = "meal-plan-checked:" + planQuery(plan);
  let checked = new Set(JSON.parse(store(checkedKey) || "[]"));
  const saveChecked = () => store(checkedKey, JSON.stringify([...checked]));

  function render() {
    list.replaceChildren(...sections.map((section) => {
      const items = section.items.map((item) => {
        const box = el("input", { type: "checkbox", checked: checked.has(item.name) });
        box.addEventListener("change", () => {
          if (box.checked) checked.add(item.name);
          else checked.delete(item.name);
          saveChecked();
        });
        return el("li", {}, el("label", {}, box,
          el("span", {}, item.name),
          el("span", { className: "qty" }, amountText(item.amounts))));
      });
      return el("section", { className: "aisle" },
        el("h3", {}, section.category), el("ul", {}, ...items));
    }));
  }

  document.getElementById("uncheck").addEventListener("click", () => {
    checked = new Set();
    saveChecked();
    render();
  });
  render();
}

// ---------- start ----------

const pages = { planner: plannerPage, plan: planPage, shopping: shoppingPage };
pages[document.body.dataset.page]().catch((err) => {
  document.getElementById("status").textContent = `Something went wrong: ${err.message}`;
});

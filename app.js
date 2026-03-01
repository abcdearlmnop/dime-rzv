const STORE_KEY = "dimeish_offline_v1";

/** ---------- Helpers ---------- */
const pad2 = (n) => String(n).padStart(2, "0");
const toLocalISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const fromISODate = (s) => {
  const [y,m,dd] = s.split("-").map(Number);
  return new Date(y, m-1, dd);
};

function formatPHP(amount) {
  // amount is number (peso) can be negative
  const sign = amount >= 0 ? "+" : "-";
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}₱${formatted}`;
}

function formatPHPNoPlus(amount) {
  // for list items (negative shows -₱..., income shows ₱... or +₱...)
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}₱${formatted}`;
}

function formatGroupHeader(dateObj) {
  const wd = dateObj.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const day = dateObj.getDate();
  const mo = dateObj.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const yy = String(dateObj.getFullYear()).slice(-2);
  return `${wd}, ${day} ${mo} '${yy}`;
}

function formatTimeHM(dateObj) {
  return dateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function monthKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; // YYYY-MM
}

/** ---------- State ---------- */
const defaultCategories = [
  { id: "food", name: "Food", icon: "🍔" },
  { id: "gas", name: "Gas", icon: "⛽️" },
  { id: "groceries", name: "Groceries", icon: "🛒" },
  { id: "bills", name: "Bills", icon: "🧾" },
  { id: "coffee", name: "Coffee", icon: "☕️" },
  { id: "general", name: "General", icon: "🟦" },
];

const state = load() ?? {
  entries: [],     // {id,type,amountCents,note,categoryId,ts}
  categories: defaultCategories,
  selectedMonth: monthKey(new Date()),
};

let addMode = {
  editingId: null,
  type: "expense",
  amountStr: "0",      // keypad string
  note: "",
  dateISO: toLocalISODate(new Date()),
  timeHM: pad2(new Date().getHours()) + ":" + pad2(new Date().getMinutes()),
  categoryId: "general",
};

/** ---------- Storage ---------- */
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);

const homeView = $("homeView");
const addView = $("addView");

const listEl = $("list");
const emptyHome = $("emptyHome");

const bigSignEl = $("bigSign");
const bigAmountEl = $("bigAmount");
const bigTotalSub = $("bigTotalSub");

const openAddBtn = $("openAddBtn");
const closeAddBtn = $("closeAddBtn");

const segExpense = $("segExpense");
const segIncome = $("segIncome");
const swapTypeBtn = $("swapTypeBtn");

const amountValue = $("amountValue");
const clearAmountBtn = $("clearAmountBtn");

const addNoteBtn = $("addNoteBtn");
const noteInput = $("noteInput");

const dateBtn = $("dateBtn");
const timeBtn = $("timeBtn");
const categoryBtn = $("categoryBtn");

const dateLabel = $("dateLabel");
const timeLabel = $("timeLabel");
const categoryLabel = $("categoryLabel");

const datePicker = $("datePicker");
const timePicker = $("timePicker");

const keypad = document.querySelector(".keypad");
const saveBtn = $("saveBtn");

/** Category sheet */
const sheetBackdrop = $("sheetBackdrop");
const closeSheetBtn = $("closeSheetBtn");
const catList = $("catList");
const newCatName = $("newCatName");
const newCatIcon = $("newCatIcon");
const addCatConfirm = $("addCatConfirm");

/** Month picker */
const filterBtn = $("filterBtn");
const monthBackdrop = $("monthBackdrop");
const closeMonthBtn = $("closeMonthBtn");
const monthPicker = $("monthPicker");
const applyMonthBtn = $("applyMonthBtn");

/** Bottom nav buttons (minimal functional so they’re not “dead”) */
$("navHome").addEventListener("click", () => showHome());
$("navStats").addEventListener("click", () => alert("Stats screen is not included yet (kept simple)."));
$("navCats").addEventListener("click", () => openCategorySheet());
$("navSettings").addEventListener("click", () => {
  const ok = confirm("Export your data to clipboard?");
  if (!ok) return;
  navigator.clipboard?.writeText(JSON.stringify(state, null, 2));
  alert("Copied JSON to clipboard (if allowed by browser).");
});

/** ---------- View control ---------- */
function showHome() {
  addView.classList.remove("view--active");
  homeView.classList.add("view--active");
  renderHome();
}

function showAdd() {
  homeView.classList.remove("view--active");
  addView.classList.add("view--active");
  renderAdd();
}

/** ---------- Home rendering (Image 1) ---------- */
function entriesForSelectedMonth() {
  const [y,m] = state.selectedMonth.split("-").map(Number);
  return state.entries.filter(e => {
    const d = new Date(e.ts);
    return d.getFullYear() === y && (d.getMonth()+1) === m;
  });
}

function monthNetTotal() {
  const items = entriesForSelectedMonth();
  const totalCents = items.reduce((acc, e) => {
    const sign = e.type === "income" ? 1 : -1;
    return acc + sign * e.amountCents;
  }, 0);
  return totalCents / 100;
}

function groupByDay(items) {
  const map = new Map();
  for (const e of items) {
    const d = new Date(e.ts);
    const iso = toLocalISODate(d);
    if (!map.has(iso)) map.set(iso, []);
    map.get(iso).push(e);
  }
  // sort newest day first
  const keys = Array.from(map.keys()).sort((a,b) => (a < b ? 1 : -1));
  // sort entries within day by time desc
  for (const k of keys) map.get(k).sort((a,b) => b.ts - a.ts);
  return { keys, map };
}

function dayNet(list) {
  const cents = list.reduce((acc, e) => {
    const sign = e.type === "income" ? 1 : -1;
    return acc + sign * e.amountCents;
  }, 0);
  return cents / 100;
}

function renderHome() {
  // Big total
  const net = monthNetTotal();
  bigSignEl.textContent = net >= 0 ? "+" : "-";
  bigAmountEl.textContent = Math.abs(net).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // subtitle month label
  const [yy,mm] = state.selectedMonth.split("-");
  const temp = new Date(Number(yy), Number(mm)-1, 1);
  bigTotalSub.textContent = temp.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const items = entriesForSelectedMonth();
  const { keys, map } = groupByDay(items);

  listEl.innerHTML = "";
  emptyHome.style.display = items.length ? "none" : "block";

  for (const iso of keys) {
    const d = fromISODate(iso);
    const list = map.get(iso);

    // group header
    const gh = document.createElement("div");
    gh.className = "groupHeader";

    const left = document.createElement("div");
    left.textContent = formatGroupHeader(d);

    const right = document.createElement("div");
    right.className = "groupTotal";
    const dn = dayNet(list);
    // screenshot shows "-₱1,479.00" (no plus). We'll show minus when negative, else "+₱.."
    right.textContent = (dn < 0) ? `-${formatPHPNoPlus(dn).replace("₱", "₱")}` : `+${formatPHPNoPlus(dn)}`;

    gh.appendChild(left);
    gh.appendChild(right);
    listEl.appendChild(gh);

    // rows
    for (const e of list) {
      const row = document.createElement("div");
      row.className = "txRow";
      row.role = "button";
      row.tabIndex = 0;

      const cat = state.categories.find(c => c.id === e.categoryId) ?? { name:"General", icon:"🟦" };
      const icon = document.createElement("div");
      icon.className = "txIcon";
      icon.textContent = cat.icon || "🟦";

      const main = document.createElement("div");
      main.className = "txMain";

      const title = document.createElement("div");
      title.className = "txTitle";
      title.textContent = (e.note && e.note.trim()) ? e.note : cat.name;

      const time = document.createElement("div");
      time.className = "txTime";
      time.textContent = formatTimeHM(new Date(e.ts));

      main.appendChild(title);
      main.appendChild(time);

      const amt = document.createElement("div");
      const sign = e.type === "income" ? 1 : -1;
      const peso = (sign * e.amountCents) / 100;
      amt.className = "txAmt " + (e.type === "income" ? "txAmt--income" : "txAmt--expense");
      // Dime screenshot shows "-₱1,279.00" etc
      amt.textContent = (peso < 0 ? "-" : "") + "₱" + Math.abs(peso).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      row.appendChild(icon);
      row.appendChild(main);
      row.appendChild(amt);

      // tap to edit (so it’s not just “view-only”)
      row.addEventListener("click", () => openEdit(e.id));
      row.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openEdit(e.id); }
      });

      listEl.appendChild(row);
    }
  }
}

/** ---------- Add screen logic (Image 2) ---------- */
function setType(type) {
  addMode.type = type;
  segExpense.classList.toggle("segBtn--active", type === "expense");
  segIncome.classList.toggle("segBtn--active", type === "income");
  segExpense.setAttribute("aria-selected", String(type === "expense"));
  segIncome.setAttribute("aria-selected", String(type === "income"));
}

function amountDisplayFromStr(str) {
  // show without forcing decimals like Dime: "0" or "123" or "123.4"
  return str;
}

function renderAdd() {
  setType(addMode.type);
  amountValue.textContent = amountDisplayFromStr(addMode.amountStr);

  if (addMode.note && addMode.note.trim()) {
    noteInput.classList.remove("hidden");
    noteInput.value = addMode.note;
  } else {
    noteInput.classList.add("hidden");
    noteInput.value = "";
  }

  // date label like "Today, 1 Mar"
  const d = fromISODate(addMode.dateISO);
  const today = new Date();
  const isToday = toLocalISODate(today) === addMode.dateISO;
  const nice = d.toLocaleDateString("en-US", { day:"numeric", month:"short" });
  dateLabel.textContent = isToday ? `Today, ${nice}` : d.toLocaleDateString("en-US", { weekday:"short", day:"numeric", month:"short", year:"numeric" });

  timeLabel.textContent = addMode.timeHM;

  const cat = state.categories.find(c => c.id === addMode.categoryId);
  categoryLabel.textContent = cat ? cat.name : "Category";

  // sync hidden pickers
  datePicker.value = addMode.dateISO;
  timePicker.value = addMode.timeHM;
}

function resetAddMode() {
  const now = new Date();
  addMode = {
    editingId: null,
    type: "expense",
    amountStr: "0",
    note: "",
    dateISO: toLocalISODate(now),
    timeHM: pad2(now.getHours()) + ":" + pad2(now.getMinutes()),
    categoryId: "general",
  };
}

function openNew() {
  resetAddMode();
  showAdd();
}

function openEdit(id) {
  const e = state.entries.find(x => x.id === id);
  if (!e) return;

  const d = new Date(e.ts);
  addMode.editingId = id;
  addMode.type = e.type;
  addMode.amountStr = (e.amountCents / 100).toString().replace(/\.0$/, "");
  addMode.note = e.note || "";
  addMode.dateISO = toLocalISODate(d);
  addMode.timeHM = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  addMode.categoryId = e.categoryId || "general";

  showAdd();
}

/** Keypad input */
function pushDigit(k) {
  if (k === ".") {
    if (addMode.amountStr.includes(".")) return;
    addMode.amountStr = addMode.amountStr + ".";
    return;
  }

  // keep it like calculator:
  if (addMode.amountStr === "0") addMode.amountStr = k;
  else addMode.amountStr = addMode.amountStr + k;

  // guard: max 2 decimals
  if (addMode.amountStr.includes(".")) {
    const [a,b] = addMode.amountStr.split(".");
    if (b.length > 2) addMode.amountStr = a + "." + b.slice(0,2);
  }
}

function clearAmount() {
  addMode.amountStr = "0";
}

function toCents(str) {
  const n = Number(str);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function saveEntry() {
  const cents = toCents(addMode.amountStr);
  if (cents <= 0) { alert("Enter an amount."); return; }
  if (!addMode.categoryId) { alert("Choose a category."); return; }

  const d = fromISODate(addMode.dateISO);
  const [hh,mm] = addMode.timeHM.split(":").map(Number);
  d.setHours(hh, mm, 0, 0);

  const payload = {
    id: addMode.editingId ?? crypto.randomUUID(),
    type: addMode.type,
    amountCents: cents,
    note: (noteInput.classList.contains("hidden") ? "" : (noteInput.value || "")).trim(),
    categoryId: addMode.categoryId,
    ts: d.getTime(),
  };

  if (addMode.editingId) {
    const idx = state.entries.findIndex(x => x.id === addMode.editingId);
    if (idx >= 0) state.entries[idx] = payload;
  } else {
    state.entries.push(payload);
  }

  // set selectedMonth to entry month so it appears immediately like Dime list
  state.selectedMonth = monthKey(new Date(payload.ts));

  save();
  showHome();
}

/** ---------- Category Sheet ---------- */
function openCategorySheet() {
  sheetBackdrop.classList.remove("hidden");
  renderCategories();
}

function closeCategorySheet() {
  sheetBackdrop.classList.add("hidden");
  newCatName.value = "";
  newCatIcon.value = "";
}

function renderCategories() {
  catList.innerHTML = "";
  for (const c of state.categories) {
    const row = document.createElement("div");
    row.className = "catRow";

    const left = document.createElement("div");
    left.className = "catLeft";

    const ic = document.createElement("div");
    ic.className = "catIcon";
    ic.textContent = c.icon || "🟦";

    const nm = document.createElement("div");
    nm.className = "catName";
    nm.textContent = c.name;

    left.appendChild(ic);
    left.appendChild(nm);

    const right = document.createElement("div");
    right.style.color = "var(--muted)";
    right.style.fontWeight = "900";
    right.textContent = (c.id === addMode.categoryId) ? "✓" : "";

    row.appendChild(left);
    row.appendChild(right);

    row.addEventListener("click", () => {
      addMode.categoryId = c.id;
      renderAdd();
      closeCategorySheet();
    });

    catList.appendChild(row);
  }
}

function addNewCategory() {
  const name = (newCatName.value || "").trim();
  if (!name) { alert("Enter a category name."); return; }
  const icon = (newCatIcon.value || "🟦").trim().slice(0,2);
  const id = "cat_" + Math.random().toString(16).slice(2);

  state.categories.unshift({ id, name, icon });
  addMode.categoryId = id;
  save();
  renderAdd();
  renderCategories();
  closeCategorySheet();
}

/** ---------- Month picker ---------- */
function openMonthPicker() {
  monthBackdrop.classList.remove("hidden");
  monthPicker.value = state.selectedMonth;
}

function closeMonthPicker() {
  monthBackdrop.classList.add("hidden");
}

function applyMonth() {
  const v = monthPicker.value;
  if (!v) return;
  state.selectedMonth = v;
  save();
  renderHome();
  closeMonthPicker();
}

/** ---------- Events ---------- */
openAddBtn.addEventListener("click", openNew);
closeAddBtn.addEventListener("click", showHome);

segExpense.addEventListener("click", () => { setType("expense"); renderAdd(); });
segIncome.addEventListener("click", () => { setType("income"); renderAdd(); });

swapTypeBtn.addEventListener("click", () => {
  setType(addMode.type === "expense" ? "income" : "expense");
  renderAdd();
});

clearAmountBtn.addEventListener("click", () => { clearAmount(); renderAdd(); });

addNoteBtn.addEventListener("click", () => {
  noteInput.classList.toggle("hidden");
  if (!noteInput.classList.contains("hidden")) noteInput.focus();
  renderAdd();
});

noteInput.addEventListener("input", () => {
  addMode.note = noteInput.value;
});

dateBtn.addEventListener("click", () => {
  datePicker.click();
});
timeBtn.addEventListener("click", () => {
  timePicker.click();
});

datePicker.addEventListener("change", (e) => {
  addMode.dateISO = e.target.value;
  renderAdd();
});
timePicker.addEventListener("change", (e) => {
  addMode.timeHM = e.target.value;
  renderAdd();
});

categoryBtn.addEventListener("click", openCategorySheet);
closeSheetBtn.addEventListener("click", closeCategorySheet);
sheetBackdrop.addEventListener("click", (e) => {
  if (e.target === sheetBackdrop) closeCategorySheet();
});

addCatConfirm.addEventListener("click", addNewCategory);

filterBtn.addEventListener("click", openMonthPicker);
closeMonthBtn.addEventListener("click", closeMonthPicker);
monthBackdrop.addEventListener("click", (e) => {
  if (e.target === monthBackdrop) closeMonthPicker();
});
applyMonthBtn.addEventListener("click", applyMonth);

keypad.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  if (btn.id === "saveBtn") {
    saveEntry();
    return;
  }
  const k = btn.getAttribute("data-k");
  if (!k) return;
  pushDigit(k);
  renderAdd();
});

/** ---------- SW ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

/** ---------- Init ---------- */
renderHome();

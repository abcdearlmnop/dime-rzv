/* Dime-Lite v1: Offline expense + budgets (localStorage)
   If you want a more "serious" version next, we’ll migrate to IndexedDB. */

const LS_KEY = "dime_lite_v1";
const DEFAULT_CATS = ["Food", "Transport", "Bills", "Groceries", "Shopping", "Health", "Others"];

const $ = (id) => document.getElementById(id);

let state = loadState();

function loadState(){
  const raw = localStorage.getItem(LS_KEY);
  if(raw){
    try { return JSON.parse(raw); } catch {}
  }
  return {
    categories: DEFAULT_CATS.map(name => ({ id: crypto.randomUUID(), name })),
    budgets: {},   // { [catId]: number }
    expenses: []   // { id, amount, catId, note, dateISO, createdAt }
  };
}

function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function peso(n){
  return new Intl.NumberFormat("en-PH", { style:"currency", currency:"PHP" }).format(n || 0);
}

function monthKey(dateObj){
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth()+1).padStart(2,"0");
  return `${y}-${m}`;
}

function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function getCatName(catId){
  return state.categories.find(c => c.id === catId)?.name || "Unknown";
}

function expensesForCurrentMonth(){
  const now = new Date();
  const mk = monthKey(now);
  return state.expenses.filter(e => e.dateISO.startsWith(mk));
}

function groupByCategory(expenses){
  const map = new Map();
  for(const e of expenses){
    map.set(e.catId, (map.get(e.catId) || 0) + e.amount);
  }
  return map;
}

function renderCategorySelect(){
  const sel = $("category");
  sel.innerHTML = "";
  for(const c of state.categories){
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  }
}

function renderExpenses(){
  const list = $("expensesList");
  const expenses = [...state.expenses]
    .sort((a,b) => (b.dateISO.localeCompare(a.dateISO) || b.createdAt - a.createdAt))
    .slice(0, 25);

  list.innerHTML = "";
  if(expenses.length === 0){
    list.innerHTML = `<div class="item"><div class="left"><div class="meta">No expenses yet.</div></div></div>`;
    return;
  }

  for(const e of expenses){
    const el = document.createElement("div");
    el.className = "item";

    el.innerHTML = `
      <div class="left">
        <div><span class="pill">${escapeHtml(getCatName(e.catId))}</span></div>
        <div class="meta">${escapeHtml(e.dateISO)} • ${escapeHtml(e.note || "—")}</div>
      </div>
      <div class="right">
        <div class="amount">${peso(e.amount)}</div>
        <button class="ghost" data-del="${e.id}" title="Delete">Delete</button>
      </div>
    `;
    list.appendChild(el);
  }

  list.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      state.expenses = state.expenses.filter(x => x.id !== id);
      saveState();
      refreshAll();
    });
  });
}

function renderMonthSummary(){
  const expenses = expensesForCurrentMonth();
  const total = expenses.reduce((sum,e) => sum + e.amount, 0);
  $("monthTotal").textContent = peso(total);

  const grouped = groupByCategory(expenses);
  let top = { name:"—", amount:0 };
  for(const [catId, amt] of grouped){
    if(amt > top.amount){
      top = { name: getCatName(catId), amount: amt };
    }
  }
  $("topCategory").textContent = top.name === "—" ? "—" : `${top.name} (${peso(top.amount)})`;

  const breakdown = $("categoryBreakdown");
  breakdown.innerHTML = "";
  if(expenses.length === 0){
    breakdown.innerHTML = `<div class="item"><div class="left"><div class="meta">No data for this month.</div></div></div>`;
    return;
  }

  // show all categories with >0 spend, sorted desc
  const rows = [...grouped.entries()]
    .map(([catId, amt]) => ({ catId, amt }))
    .sort((a,b) => b.amt - a.amt);

  for(const r of rows){
    const budget = Number(state.budgets[r.catId] || 0);
    const pct = budget > 0 ? Math.min(100, Math.round((r.amt / budget) * 100)) : 0;

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="left">
        <div><strong>${escapeHtml(getCatName(r.catId))}</strong></div>
        <div class="meta">${budget > 0 ? `Budget: ${peso(budget)} • ${pct}% used` : `No budget set`}</div>
        ${budget > 0 ? `<div class="progress"><div class="bar" style="width:${pct}%"></div></div>` : ""}
      </div>
      <div class="right">
        <div class="amount">${peso(r.amt)}</div>
      </div>
    `;
    breakdown.appendChild(el);
  }
}

function renderBudgets(){
  const list = $("budgetsList");
  list.innerHTML = "";

  // show all categories, even if budget 0
  for(const c of state.categories){
    const budget = Number(state.budgets[c.id] || 0);
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="left">
        <div><strong>${escapeHtml(c.name)}</strong></div>
        <div class="meta">${budget > 0 ? "Monthly budget set" : "No budget"}</div>
      </div>
      <div class="right">
        <div class="amount">${budget > 0 ? peso(budget) : "—"}</div>
      </div>
    `;
    list.appendChild(el);
  }
}

function openBudgetsDialog(){
  const dlg = $("budgetDialog");
  const fields = $("budgetFields");
  fields.innerHTML = "";

  for(const c of state.categories){
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="left">
        <div><strong>${escapeHtml(c.name)}</strong></div>
        <div class="meta">Monthly limit</div>
      </div>
      <div class="right">
        <input
          type="number"
          step="0.01"
          min="0"
          data-budget="${c.id}"
          placeholder="0.00"
          value="${state.budgets[c.id] ?? ""}"
          style="width:140px"
        />
      </div>
    `;
    fields.appendChild(row);
  }

  dlg.showModal();

  $("saveBudgetsBtn").onclick = (e) => {
    e.preventDefault();

    dlg.querySelectorAll("input[data-budget]").forEach(inp => {
      const id = inp.getAttribute("data-budget");
      const val = Number(inp.value || 0);
      if(val > 0) state.budgets[id] = val;
      else delete state.budgets[id];
    });

    saveState();
    dlg.close();
    refreshAll();
  };
}

function openCategoriesDialog(){
  const dlg = $("catsDialog");
  const list = $("catsList");
  list.innerHTML = "";

  for(const c of state.categories){
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="left">
        <div><strong>${escapeHtml(c.name)}</strong></div>
        <div class="meta">${c.id}</div>
      </div>
      <div class="right">
        <button class="ghost" data-delcat="${c.id}">Remove</button>
      </div>
    `;
    list.appendChild(el);
  }

  list.querySelectorAll("button[data-delcat]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delcat");
      // prevent removing if used by expenses
      const used = state.expenses.some(e => e.catId === id);
      if(used){
        alert("Cannot remove: category is used by existing expenses.");
        return;
      }
      state.categories = state.categories.filter(x => x.id !== id);
      delete state.budgets[id];
      saveState();
      openCategoriesDialog(); // re-render
      renderCategorySelect();
      refreshAll();
    });
  });

  dlg.showModal();
}

function addCategory(name){
  const clean = (name || "").trim();
  if(!clean) return;
  const exists = state.categories.some(c => c.name.toLowerCase() === clean.toLowerCase());
  if(exists){
    alert("Category already exists.");
    return;
  }
  state.categories.push({ id: crypto.randomUUID(), name: clean });
  saveState();
  renderCategorySelect();
  refreshAll();
}

function exportCSV(){
  const rows = [["date","category","amount","note"]];
  const sorted = [...state.expenses].sort((a,b) => a.dateISO.localeCompare(b.dateISO));
  for(const e of sorted){
    rows.push([e.dateISO, getCatName(e.catId), String(e.amount), (e.note || "").replaceAll("\n"," ")]);
  }
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dime-lite-export-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(v){
  const s = String(v ?? "");
  if(/[",\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
  return s;
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function refreshAll(){
  renderMonthSummary();
  renderBudgets();
  renderExpenses();
}

// --- Events ---
$("date").value = todayISO();

$("expenseForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = Number($("amount").value);
  const catId = $("category").value;
  const dateISO = $("date").value;
  const note = $("note").value.trim();

  if(!(amount > 0)) return alert("Enter a valid amount.");

  state.expenses.push({
    id: crypto.randomUUID(),
    amount,
    catId,
    note,
    dateISO,
    createdAt: Date.now()
  });

  saveState();
  $("amount").value = "";
  $("note").value = "";
  refreshAll();
});

$("addBudgetBtn").addEventListener("click", openBudgetsDialog);
$("manageCatsBtn").addEventListener("click", openCategoriesDialog);

$("addCatBtn").addEventListener("click", (e) => {
  e.preventDefault();
  addCategory($("newCatName").value);
  $("newCatName").value = "";
});

$("exportBtn").addEventListener("click", exportCSV);

$("wipeBtn").addEventListener("click", () => {
  if(confirm("Reset all data? This cannot be undone.")){
    localStorage.removeItem(LS_KEY);
    state = loadState();
    renderCategorySelect();
    refreshAll();
  }
});

// --- Install prompt (PWA) ---
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("installBtn").hidden = false;
});
$("installBtn").addEventListener("click", async () => {
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("installBtn").hidden = true;
});

// --- Service worker ---
if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js");
}

// Initial render
renderCategorySelect();
refreshAll();
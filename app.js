/* ============================
   Dime Offline (Lite) - Revised
   - Default view: ALL-TIME totals (not per month)
   - Still supports Month view toggle
   - Stores Starting Amount + Remaining Balance
   - Full transaction list (date + type/category + notes)
   Offline storage: localStorage
   ============================ */

const STORAGE_KEY = "dime_offline_v2_transactions";
const STARTING_BALANCE_KEY = "dime_offline_v2_starting_balance";

const CATEGORIES = [
  { key: "Groceries", color: "#7ad5cb" },
  { key: "Food", color: "#ff7a78" },
  { key: "Utilities", color: "#66b9d8" },
  { key: "Shopping", color: "#f4c24d" },
  { key: "Travel", color: "#ff8a3d" },
  { key: "Healthcare", color: "#6bd14a" },
  { key: "Subscriptions", color: "#8a56ff" },
];

const $ = (id) => document.getElementById(id);

let state = {
  currentMonth: startOfMonth(new Date()),
  scope: "all",        // "all" | "month"
  chartMode: "expense",// "expense" | "income"
  typeToAdd: "expense",
  listFilter: "all",   // "all" | "expense" | "income"
  startingBalance: 0,
  transactions: [],
};

function pad2(n){ return String(n).padStart(2,"0"); }
function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
function formatMoney(n){
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2)}`;
}

function loadStartingBalance(){
  const raw = localStorage.getItem(STARTING_BALANCE_KEY);
  const n = raw === null ? 0 : Number(raw);
  return Number.isFinite(n) ? n : 0;
}
function saveStartingBalance(val){
  localStorage.setItem(STARTING_BALANCE_KEY, String(val));
}

function loadTx(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch{
    return [];
  }
}
function saveTx(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
}

function uid(){
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function setActiveTab(tab){
  // buttons
  $("tabSummary").classList.toggle("active", tab === "summary");
  $("tabList").classList.toggle("active", tab === "list");
  $("tabSettings").classList.toggle("active", tab === "settings");

  // cards
  $("summaryCard").classList.toggle("hidden", tab !== "summary");
  $("listCard").classList.toggle("hidden", tab !== "list");
  $("settingsCard").classList.toggle("hidden", tab !== "settings");

  // bottom totals stay visible (matches Dime feel)
  render();
}

function setMonthTitle(){
  if (state.scope === "all"){
    $("monthTitle").textContent = "All Time";
    $("prevMonth").disabled = true;
    $("nextMonth").disabled = true;
    $("prevMonth").style.opacity = "0.45";
    $("nextMonth").style.opacity = "0.45";
    return;
  }

  $("prevMonth").disabled = false;
  $("nextMonth").disabled = false;
  $("prevMonth").style.opacity = "1";
  $("nextMonth").style.opacity = "1";

  const d = state.currentMonth;
  const monthName = d.toLocaleString(undefined, { month:"long" });
  $("monthTitle").textContent = `${monthName} ${d.getFullYear()}`;
}

function setScopeButtons(){
  $("scopeAll").classList.toggle("active", state.scope === "all");
  $("scopeMonth").classList.toggle("active", state.scope === "month");
}

function setModeButtons(){
  $("modeExpenses").classList.toggle("active", state.chartMode === "expense");
  $("modeIncome").classList.toggle("active", state.chartMode === "income");
}

function setTypeButtons(){
  $("typeExpense").classList.toggle("active", state.typeToAdd === "expense");
  $("typeIncome").classList.toggle("active", state.typeToAdd === "income");
}

function setListFilterButtons(){
  $("listAll").classList.toggle("active", state.listFilter === "all");
  $("listExpenses").classList.toggle("active", state.listFilter === "expense");
  $("listIncome").classList.toggle("active", state.listFilter === "income");
}

function openModal(){
  $("modalBackdrop").classList.remove("hidden");
  $("modal").classList.remove("hidden");

  // default date today (editable to any date)
  const today = new Date();
  $("date").value = `${today.getFullYear()}-${pad2(today.getMonth()+1)}-${pad2(today.getDate())}`;

  // categories
  const sel = $("category");
  sel.innerHTML = "";
  for (const c of CATEGORIES){
    const opt = document.createElement("option");
    opt.value = c.key;
    opt.textContent = c.key;
    sel.appendChild(opt);
  }

  $("amount").value = "";
  $("notes").value = "";
  setTypeButtons();
}

function closeModal(){
  $("modalBackdrop").classList.add("hidden");
  $("modal").classList.add("hidden");
}

/* ===== Scope helpers ===== */

function txDateObj(t){ return new Date(t.date + "T00:00:00"); }

function getScopedTx(){
  if (state.scope === "all") return state.transactions;

  const key = monthKey(state.currentMonth);
  return state.transactions.filter(t => t.monthKey === key);
}

/* Carry-in: used ONLY for Month scope (remaining should include previous months) */
function carryInForMonth(){
  const start = startOfMonth(state.currentMonth);
  let netBefore = 0;

  for (const t of state.transactions){
    const td = txDateObj(t);
    if (td < start){
      netBefore += (t.type === "income" ? t.amount : -t.amount);
    }
  }

  return state.startingBalance + netBefore;
}

/* ===== Totals (all-time or month) ===== */

function totalsForScope(){
  const scoped = getScopedTx();

  const income = scoped.filter(t => t.type === "income").reduce((a,b)=>a+b.amount,0);
  const expense = scoped.filter(t => t.type === "expense").reduce((a,b)=>a+b.amount,0);

  if (state.scope === "all"){
    const balance = state.startingBalance + income - expense;
    return { income, expense, balance, carryIn: null };
  } else {
    const carryIn = carryInForMonth();
    const balance = carryIn + income - expense;
    return { income, expense, balance, carryIn };
  }
}

function categoryTotals(mode){
  const scoped = getScopedTx().filter(t => t.type === mode);

  const map = new Map(CATEGORIES.map(c => [c.key, 0]));
  for (const t of scoped){
    map.set(t.category, (map.get(t.category) || 0) + t.amount);
  }

  const total = Array.from(map.values()).reduce((a,b)=>a+b,0);

  const rows = CATEGORIES
    .map(c => ({
      category: c.key,
      color: c.color,
      amount: map.get(c.key) || 0,
      pct: total > 0 ? ((map.get(c.key) || 0) / total) : 0
    }))
    .filter(r => r.amount > 0);

  return { total, rows };
}

/* ===== Donut chart (no libraries) ===== */

function drawDonut(rows, total){
  const canvas = $("donut");
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const cx = w/2, cy = h/2;
  const radius = Math.min(w,h) * 0.42;
  const thickness = Math.min(w,h) * 0.18;

  // background ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI*2);
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = thickness;
  ctx.lineCap = "butt";
  ctx.stroke();

  if (!rows.length || total <= 0){
    ctx.fillStyle = "rgba(233,238,252,.9)";
    ctx.font = "900 30px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("No data", cx, cy + 10);
    return;
  }

  let angle = -Math.PI/2;
  for (const r of rows){
    const seg = r.pct * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, angle, angle + seg);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = thickness;
    ctx.lineCap = "butt";
    ctx.stroke();
    angle += seg;
  }

  // inner cut-out
  ctx.beginPath();
  ctx.arc(cx, cy, radius - thickness/2 - 2, 0, Math.PI*2);
  ctx.fillStyle = "#0b142a";
  ctx.fill();

  // center total
  ctx.fillStyle = "rgba(233,238,252,.95)";
  ctx.font = "900 34px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.fillText(formatMoney(total), cx, cy + 10);
}

/* ===== Breakdown list ===== */

function renderBreakdown(rows){
  const el = $("breakdown");
  el.innerHTML = "";

  if (!rows.length){
    const empty = document.createElement("div");
    empty.style.color = "rgba(174,184,214,.9)";
    empty.style.padding = "12px 6px 6px";
    empty.style.fontWeight = "700";
    empty.textContent = "No transactions in this view yet.";
    el.appendChild(empty);
    return;
  }

  for (const r of rows){
    const row = document.createElement("div");
    row.className = "row";

    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = r.color;

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = `${r.category} (${(r.pct*100).toFixed(1)}%)`;

    const amt = document.createElement("div");
    amt.className = "amt";
    amt.textContent = formatMoney(r.amount);

    row.appendChild(sw);
    row.appendChild(name);
    row.appendChild(amt);
    el.appendChild(row);
  }
}

/* ===== Transaction List ===== */

function renderList(){
  const list = $("txList");
  list.innerHTML = "";

  let items = getScopedTx().slice();

  if (state.listFilter !== "all"){
    items = items.filter(t => t.type === state.listFilter);
  }

  // newest first (by date, then createdAt)
  items.sort((a,b) => {
    const ad = txDateObj(a).getTime();
    const bd = txDateObj(b).getTime();
    if (bd !== ad) return bd - ad;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const scopeLabel = state.scope === "all" ? "All time" : $("monthTitle").textContent;
  $("listMeta").textContent = `${scopeLabel} • ${items.length} item(s)`;

  if (!items.length){
    const empty = document.createElement("div");
    empty.style.color = "rgba(174,184,214,.9)";
    empty.style.fontWeight = "800";
    empty.style.padding = "10px 2px";
    empty.textContent = "No transactions to show.";
    list.appendChild(empty);
    return;
  }

  for (const t of items){
    const item = document.createElement("div");
    item.className = "tx-item";

    const left = document.createElement("div");
    const main = document.createElement("div");
    main.className = "tx-main";
    main.textContent = `${t.category}`;

    const sub = document.createElement("div");
    sub.className = "tx-sub";
    const note = t.notes ? ` • ${t.notes}` : "";
    sub.textContent = `${t.date}${note}`;

    left.appendChild(main);
    left.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "tx-actions";

    const amt = document.createElement("div");
    amt.className = `tx-amt ${t.type}`;
    amt.textContent = t.type === "expense" ? `-${formatMoney(t.amount).replace("-", "")}` : `+${formatMoney(t.amount).replace("-", "")}`;

    const del = document.createElement("button");
    del.className = "tx-del";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      const ok = confirm("Delete this transaction?");
      if (!ok) return;
      state.transactions = state.transactions.filter(x => x.id !== t.id);
      saveTx();
      render();
    });

    actions.appendChild(amt);
    actions.appendChild(del);

    item.appendChild(left);
    item.appendChild(actions);
    list.appendChild(item);
  }
}

/* ===== Render totals + views ===== */

function renderTotals(){
  const { income, expense, balance, carryIn } = totalsForScope();

  // Starting + Remaining viewer (top)
  $("startingValue").textContent = formatMoney(state.startingBalance);
  $("remainingValue").textContent = formatMoney(balance);

  // show carry-in only when Month view is active
  if (state.scope === "month"){
    $("carryInfo").textContent = `Carry-in for month: ${formatMoney(carryIn)}`;
  } else {
    $("carryInfo").textContent = "";
  }

  // Bottom totals reflect the CURRENT VIEW (All or Month)
  $("incomeTotal").textContent = formatMoney(income);
  $("expenseTotal").textContent = formatMoney(expense);
  $("balanceTotal").textContent = formatMoney(balance);
  $("balanceTotal").classList.toggle("negative", balance < 0);
}

function render(){
  setMonthTitle();
  setScopeButtons();
  setModeButtons();
  setListFilterButtons();

  // Summary chart/breakdown
  const { total, rows } = categoryTotals(state.chartMode);
  drawDonut(rows, total);
  renderBreakdown(rows);
  $("totalValue").textContent = formatMoney(total);

  // Totals + list + settings
  renderTotals();
  renderList();

  // Settings input
  $("startingInput").value = String(state.startingBalance.toFixed(2));
}

/* ===== Add Transaction ===== */

function addTransactionFromModal(){
  const amount = Number($("amount").value);
  const date = $("date").value; // YYYY-MM-DD
  const category = $("category").value;
  const notes = $("notes").value.trim();

  if (!amount || amount <= 0){
    alert("Please enter a valid amount.");
    return;
  }
  if (!date){
    alert("Please select a date.");
    return;
  }

  const d = new Date(date + "T00:00:00");
  const tx = {
    id: uid(),
    type: state.typeToAdd, // expense|income
    amount: Number(amount),
    date,
    monthKey: monthKey(d),
    category,
    notes,
    createdAt: Date.now(),
  };

  state.transactions.unshift(tx);
  saveTx();

  // If user is in Month view, jump to that month for convenience
  if (state.scope === "month"){
    state.currentMonth = startOfMonth(d);
  }

  closeModal();
  render();
}

/* ===== Export / Import / Clear ===== */

function exportBackup(){
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    startingBalance: state.startingBalance,
    transactions: state.transactions
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "dime-offline-backup.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function importBackup(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.transactions)) throw new Error("Invalid file");

      state.transactions = data.transactions;
      // restore starting balance if present
      if (Number.isFinite(Number(data.startingBalance))){
        state.startingBalance = Number(data.startingBalance);
        saveStartingBalance(state.startingBalance);
      }

      // ensure monthKey exists (migration safety)
      for (const t of state.transactions){
        if (!t.monthKey && t.date){
          const d = new Date(t.date + "T00:00:00");
          t.monthKey = monthKey(d);
        }
      }

      saveTx();
      alert("Import successful.");
      render();
    }catch{
      alert("Import failed. Please choose a valid backup JSON file.");
    }
  };
  reader.readAsText(file);
}

function clearAllData(){
  const ok = confirm("This will delete ALL transactions and starting amount on this device. Continue?");
  if (!ok) return;

  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STARTING_BALANCE_KEY);

  state.transactions = [];
  state.startingBalance = 0;

  alert("All data cleared.");
  render();
}

/* ===== Init ===== */

function init(){
  state.startingBalance = loadStartingBalance();
  state.transactions = loadTx();

  // migration safety: ensure monthKey exists
  for (const t of state.transactions){
    if (!t.monthKey && t.date){
      const d = new Date(t.date + "T00:00:00");
      t.monthKey = monthKey(d);
    }
  }
  saveTx();

  // Tabs
  $("tabSummary").addEventListener("click", () => setActiveTab("summary"));
  $("tabList").addEventListener("click", () => setActiveTab("list"));
  $("tabSettings").addEventListener("click", () => setActiveTab("settings"));

  // Month nav (only meaningful in Month scope)
  $("prevMonth").addEventListener("click", () => {
    if (state.scope !== "month") return;
    const d = state.currentMonth;
    state.currentMonth = startOfMonth(new Date(d.getFullYear(), d.getMonth()-1, 1));
    render();
  });
  $("nextMonth").addEventListener("click", () => {
    if (state.scope !== "month") return;
    const d = state.currentMonth;
    state.currentMonth = startOfMonth(new Date(d.getFullYear(), d.getMonth()+1, 1));
    render();
  });

  // Scope toggle (DEFAULT = ALL)
  $("scopeAll").addEventListener("click", () => { state.scope = "all"; render(); });
  $("scopeMonth").addEventListener("click", () => { state.scope = "month"; render(); });

  // Chart mode
  $("modeExpenses").addEventListener("click", () => { state.chartMode = "expense"; render(); });
  $("modeIncome").addEventListener("click", () => { state.chartMode = "income"; render(); });

  // List filter
  $("listAll").addEventListener("click", () => { state.listFilter = "all"; render(); });
  $("listExpenses").addEventListener("click", () => { state.listFilter = "expense"; render(); });
  $("listIncome").addEventListener("click", () => { state.listFilter = "income"; render(); });

  // Add modal
  $("openAdd").addEventListener("click", openModal);
  $("closeAdd").addEventListener("click", closeModal);
  $("modalBackdrop").addEventListener("click", closeModal);

  $("typeExpense").addEventListener("click", () => { state.typeToAdd = "expense"; setTypeButtons(); });
  $("typeIncome").addEventListener("click", () => { state.typeToAdd = "income"; setTypeButtons(); });

  $("saveTx").addEventListener("click", addTransactionFromModal);

  // Settings actions
  $("saveStarting").addEventListener("click", () => {
    const val = Number($("startingInput").value);
    if (!Number.isFinite(val)){
      alert("Please enter a valid number for Starting Amount.");
      return;
    }
    state.startingBalance = val;
    saveStartingBalance(val);
    render();
    alert("Starting Amount saved.");
  });

  $("exportData").addEventListener("click", exportBackup);
  $("importFile").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importBackup(file);
    e.target.value = "";
  });

  $("clearAll").addEventListener("click", clearAllData);

  // Offline
  if ("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  }

  // Start on Summary tab
  setActiveTab("summary");
}

init();

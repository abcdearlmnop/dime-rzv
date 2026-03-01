/* ============================
   Dime Offline (Lite) - Vanilla JS
   Offline storage: localStorage
   ============================ */

const STORAGE_KEY = "dime_offline_v1_transactions";

const STARTING_BALANCE_KEY = "dime_offline_v1_starting_balance";

function loadStartingBalance(){
  const raw = localStorage.getItem(STARTING_BALANCE_KEY);
  const n = raw === null ? 0 : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function saveStartingBalance(val){
  localStorage.setItem(STARTING_BALANCE_KEY, String(val));
}

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
  currentMonth: new Date(),
  chartMode: "expense",
  typeToAdd: "expense",
  transactions: [],
  startingBalance: 0,
};

function pad2(n){ return String(n).padStart(2,"0"); }

function monthKey(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; // YYYY-MM
}

function startOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function formatMoney(n){
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2)}`;
}

function loadTx(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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

function setMonthTitle(){
  const d = state.currentMonth;
  const monthName = d.toLocaleString(undefined, { month:"long" });
  $("monthTitle").textContent = `${monthName} ${d.getFullYear()}`;
}

function setModeButtons(){
  $("modeExpenses").classList.toggle("active", state.chartMode === "expense");
  $("modeIncome").classList.toggle("active", state.chartMode === "income");
}

function setTypeButtons(){
  $("typeExpense").classList.toggle("active", state.typeToAdd === "expense");
  $("typeIncome").classList.toggle("active", state.typeToAdd === "income");
}

function openModal(){
  $("modalBackdrop").classList.remove("hidden");
  $("modal").classList.remove("hidden");

  // default date: today (but editable to any date)
  const today = new Date();
  $("date").value = `${today.getFullYear()}-${pad2(today.getMonth()+1)}-${pad2(today.getDate())}`;

  // fill categories
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

function getMonthTx(){
  const key = monthKey(state.currentMonth);
  return state.transactions.filter(t => t.monthKey === key);
}

function totalsForMonth(){
  const tx = getMonthTx();
  const income = tx.filter(t => t.type === "income").reduce((a,b)=>a+b.amount,0);
  const expense = tx.filter(t => t.type === "expense").reduce((a,b)=>a+b.amount,0);

  const carryIn = carryInForMonth();
  const balance = carryIn + income - expense;

  return { income, expense, balance, carryIn };
}

function categoryTotals(mode){
  const tx = getMonthTx().filter(t => t.type === mode);
  const map = new Map(CATEGORIES.map(c => [c.key, 0]));
  for (const t of tx){
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

  // If no data, show empty ring
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
    // center text
    ctx.fillStyle = "rgba(233,238,252,.9)";
    ctx.font = "900 30px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("No data", cx, cy + 10);
    return;
  }

  // segments
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

function renderBreakdown(rows, total){
  const el = $("breakdown");
  el.innerHTML = "";

  if (!rows.length){
    const empty = document.createElement("div");
    empty.style.color = "rgba(174,184,214,.9)";
    empty.style.padding = "12px 6px 6px";
    empty.style.fontWeight = "700";
    empty.textContent = "No transactions for this month yet.";
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

function renderTotals(){
  const { income, expense, balance, carryIn } = totalsForMonth();

  $("incomeTotal").textContent = formatMoney(income);
  $("expenseTotal").textContent = formatMoney(expense);

  // this is now the "end balance" for the selected month (carryover + this month net)
  $("balanceTotal").textContent = formatMoney(balance);
  $("balanceTotal").classList.toggle("negative", balance < 0);

  // NEW: carryover viewer (start-of-month money available)
  $("carryIn").textContent = formatMoney(carryIn);
}

function carryInForMonth(){
  const start = startOfMonth(state.currentMonth);
  let netBefore = 0;

  for (const t of state.transactions){
    const td = new Date(t.date + "T00:00:00");
    if (td < start){
      netBefore += (t.type === "income" ? t.amount : -t.amount);
    }
  }

  return state.startingBalance + netBefore;
}

function render(){
  setMonthTitle();
  setModeButtons();

  const mode = state.chartMode; // expense or income
  const { total, rows } = categoryTotals(mode);

  drawDonut(rows, total);
  renderBreakdown(rows, total);
  $("totalValue").textContent = formatMoney(total);

  renderTotals();
}

/* ===== Add / Export / Import ===== */

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
    type: state.typeToAdd,                 // expense|income
    amount: Number(amount),
    date,
    monthKey: monthKey(d),
    category,
    notes,
    createdAt: Date.now(),
  };

  state.transactions.unshift(tx);
  saveTx();

  // If user added a different month, jump to it (optional, but nice)
  state.currentMonth = startOfMonth(d);

  closeModal();
  render();
}

function exportBackup(){
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
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
      saveTx();
      alert("Import successful.");
      render();
    }catch{
      alert("Import failed. Please choose a valid backup JSON file.");
    }
  };
  reader.readAsText(file);
}

/* ===== Events ===== */

function init(){
  state.currentMonth = startOfMonth(new Date());
  state.transactions = loadTx();

  // month nav
  $("prevMonth").addEventListener("click", () => {
    const d = state.currentMonth;
    state.currentMonth = startOfMonth(new Date(d.getFullYear(), d.getMonth()-1, 1));
    render();
  });
  $("nextMonth").addEventListener("click", () => {
    const d = state.currentMonth;
    state.currentMonth = startOfMonth(new Date(d.getFullYear(), d.getMonth()+1, 1));
    render();
  });

  // chart mode
  $("modeExpenses").addEventListener("click", () => { state.chartMode = "expense"; render(); });
  $("modeIncome").addEventListener("click", () => { state.chartMode = "income"; render(); });

  // open/close modal
  $("openAdd").addEventListener("click", openModal);
  $("closeAdd").addEventListener("click", closeModal);
  $("modalBackdrop").addEventListener("click", closeModal);

  // type in modal
  $("typeExpense").addEventListener("click", () => { state.typeToAdd = "expense"; setTypeButtons(); });
  $("typeIncome").addEventListener("click", () => { state.typeToAdd = "income"; setTypeButtons(); });

  // save
  $("saveTx").addEventListener("click", addTransactionFromModal);

  // export/import
  $("exportData").addEventListener("click", exportBackup);
  $("importFile").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importBackup(file);
    e.target.value = "";
  });

  // register service worker (offline)
  if ("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  }

  render();
}

init();
// Load starting balance once
state.startingBalance = loadStartingBalance();

// Settings button = set starting balance
$("tabSettings").addEventListener("click", () => {
  const current = state.startingBalance.toFixed(2);
  const input = prompt("Set starting money (carryover base):", current);
  if (input === null) return;

  const val = Number(input);
  if (!Number.isFinite(val)) {
    alert("Please enter a valid number.");
    return;
  }

  state.startingBalance = val;
  saveStartingBalance(val);
  render();
});

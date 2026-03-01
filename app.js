const LS_KEY = "dime_lite_v2";

/**
 * Dime-like categories (simple)
 * You can expand / customize later.
 */
const DEFAULT_CATS = [
  { name: "Groceries", emoji:"🛒", color:"#d9c7ff" },
  { name: "Food", emoji:"🍔", color:"#bfe0ff" },
  { name: "Transport", emoji:"🚆", color:"#ffd2b8" },
  { name: "Bills", emoji:"🧾", color:"#d4f7d4" },
  { name: "Shopping", emoji:"🛍️", color:"#ffd4e8" },
  { name: "Health", emoji:"💊", color:"#ffe7b3" },
  { name: "Salary", emoji:"💼", color:"#c9f1d8" },
  { name: "Others", emoji:"✨", color:"#e9e9ee" },
];

const $ = (id) => document.getElementById(id);

let state = loadState();

// Add screen inputs
let entry = {
  type: "expense",      // "expense" | "income"
  amountStr: "0",       // string used by keypad
  note: "",
  catId: null,
  dateISO: todayISO(),
};

// ---------- Storage ----------
function loadState(){
  const raw = localStorage.getItem(LS_KEY);
  if(raw){
    try { return JSON.parse(raw); } catch {}
  }
  return {
    categories: DEFAULT_CATS.map(c => ({
      id: crypto.randomUUID(),
      name: c.name,
      emoji: c.emoji,
      color: c.color
    })),
    transactions: [] // { id, type, amount, note, catId, dateISO, timeHHMM, createdAt }
  };
}
function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

// ---------- Helpers ----------
function peso(n){
  return new Intl.NumberFormat("en-PH", { style:"currency", currency:"PHP" }).format(n || 0);
}
function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function nowHHMM(){
  const d = new Date();
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  return `${hh}:${mm}`;
}
function parseAmount(amountStr){
  const n = Number(amountStr);
  return Number.isFinite(n) ? n : 0;
}
function formatDayHeader(dateISO){
  // e.g. "FRI, 8 AUG '25"
  const d = new Date(dateISO + "T00:00:00");
  const weekday = d.toLocaleDateString("en-US", { weekday:"short" }).toUpperCase();
  const day = d.getDate();
  const month = d.toLocaleDateString("en-US", { month:"short" }).toUpperCase();
  const yy = String(d.getFullYear()).slice(-2);
  return `${weekday}, ${day} ${month} '${yy}`;
}
function getCat(catId){
  return state.categories.find(c => c.id === catId) || null;
}
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ---------- UI: screen switching ----------
function showScreen(which){
  $("screenList").classList.toggle("hidden", which !== "list");
  $("screenAdd").classList.toggle("hidden", which !== "add");
}
function resetEntry(){
  entry = {
    type: "expense",
    amountStr: "0",
    note: "",
    catId: null,
    dateISO: todayISO(),
  };
  $("amountDisplay").textContent = entry.amountStr;
  $("categoryLabel").textContent = "Category";
  $("dateLabel").textContent = "Today";
  $("timeLabel").textContent = nowHHMM();
  setTypeUI("expense");
}

// ---------- UI: type toggle ----------
function setTypeUI(type){
  entry.type = type;
  $("tabExpense").classList.toggle("active", type === "expense");
  $("tabIncome").classList.toggle("active", type === "income");
}
$("tabExpense").addEventListener("click", () => setTypeUI("expense"));
$("tabIncome").addEventListener("click", () => setTypeUI("income"));
$("btnSwapType").addEventListener("click", () => setTypeUI(entry.type === "expense" ? "income" : "expense"));

// ---------- Keypad ----------
function buildKeypad(){
  const keys = [
    "1","2","3",
    "4","5","6",
    "7","8","9",
    ".", "0", "ok"
  ];
  const wrap = $("keypad");
  wrap.innerHTML = "";

  for(const k of keys){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "key" + (k === "ok" ? " keyOk" : "");
    btn.textContent = (k === "ok") ? "✓" : k;

    btn.addEventListener("click", () => {
      if(k === "ok") return saveTransactionFromEntry();
      handleKey(k);
    });

    wrap.appendChild(btn);
  }
}

function handleKey(k){
  // mimic calculator input
  if(k === "."){
    if(entry.amountStr.includes(".")) return;
    entry.amountStr = entry.amountStr + ".";
    $("amountDisplay").textContent = entry.amountStr;
    return;
  }

  if(entry.amountStr === "0"){
    entry.amountStr = k;
  } else {
    // limit length so it stays pretty
    if(entry.amountStr.length >= 10) return;
    entry.amountStr += k;
  }
  $("amountDisplay").textContent = entry.amountStr;
}

$("btnBackspace").addEventListener("click", () => {
  if(entry.amountStr.length <= 1){
    entry.amountStr = "0";
  } else {
    entry.amountStr = entry.amountStr.slice(0, -1);
    if(entry.amountStr === "-" || entry.amountStr === "") entry.amountStr = "0";
  }
  $("amountDisplay").textContent = entry.amountStr;
});

// ---------- Note modal ----------
$("btnAddNote").addEventListener("click", () => {
  $("noteInput").value = entry.note || "";
  $("noteDialog").showModal();
});
$("noteSave").addEventListener("click", (e) => {
  e.preventDefault();
  entry.note = $("noteInput").value.trim();
  $("noteDialog").close();
});

// ---------- Category modal ----------
function openCategoryDialog(){
  const grid = $("categoryGrid");
  grid.innerHTML = "";

  for(const c of state.categories){
    const b = document.createElement("button");
    b.type = "button";
    b.className = "catBtn";
    b.innerHTML = `
      <span class="catEmoji" style="background:${escapeHtml(c.color)}">${escapeHtml(c.emoji)}</span>
      <span>${escapeHtml(c.name)}</span>
    `;
    b.addEventListener("click", () => {
      entry.catId = c.id;
      $("categoryLabel").textContent = c.name;
      $("categoryDialog").close();
    });
    grid.appendChild(b);
  }
  $("categoryDialog").showModal();
}
$("btnCategory").addEventListener("click", openCategoryDialog);

// Date button (simple: uses today; you can expand later)
$("btnDate").addEventListener("click", () => {
  // For now: toggle today / yesterday quickly (keeps it simple)
  const d = new Date(entry.dateISO + "T00:00:00");
  const isToday = entry.dateISO === todayISO();
  if(isToday){
    d.setDate(d.getDate()-1);
    entry.dateISO = d.toISOString().slice(0,10);
    $("dateLabel").textContent = "Yesterday";
  } else {
    entry.dateISO = todayISO();
    $("dateLabel").textContent = "Today";
  }
  $("timeLabel").textContent = nowHHMM();
});

// ---------- Save transaction ----------
function saveTransactionFromEntry(){
  const amount = parseAmount(entry.amountStr);

  if(!(amount > 0)){
    alert("Enter an amount.");
    return;
  }
  if(!entry.catId){
    alert("Select a category.");
    return;
  }

  const tx = {
    id: crypto.randomUUID(),
    type: entry.type, // expense|income
    amount,
    note: entry.note || "",
    catId: entry.catId,
    dateISO: entry.dateISO,
    timeHHMM: nowHHMM(),
    createdAt: Date.now()
  };

  state.transactions.push(tx);
  saveState();

  // go back to list
  showScreen("list");
  renderAll();
  resetEntry();
}

// ---------- Feed rendering ----------
function renderAll(){
  renderBalance();
  renderFeed();
}

function renderBalance(){
  const income = state.transactions
    .filter(t => t.type === "income")
    .reduce((s,t) => s + t.amount, 0);

  const expense = state.transactions
    .filter(t => t.type === "expense")
    .reduce((s,t) => s + t.amount, 0);

  const bal = income - expense;
  $("balanceValue").textContent = peso(bal);
}

function renderFeed(){
  const feed = $("feed");
  feed.innerHTML = "";

  if(state.transactions.length === 0){
    feed.innerHTML = `<div class="dayGroup"><div class="dayHeader">No transactions yet</div></div>`;
    return;
  }

  // group by dateISO desc
  const sorted = [...state.transactions].sort((a,b) => {
    if(a.dateISO !== b.dateISO) return b.dateISO.localeCompare(a.dateISO);
    return b.createdAt - a.createdAt;
  });

  const byDate = new Map();
  for(const t of sorted){
    if(!byDate.has(t.dateISO)) byDate.set(t.dateISO, []);
    byDate.get(t.dateISO).push(t);
  }

  for(const [dateISO, list] of byDate.entries()){
    const dayIncome = list.filter(x=>x.type==="income").reduce((s,x)=>s+x.amount,0);
    const dayExpense = list.filter(x=>x.type==="expense").reduce((s,x)=>s+x.amount,0);
    const dayNet = dayIncome - dayExpense;

    const grp = document.createElement("div");
    grp.className = "dayGroup";

    grp.innerHTML = `
      <div class="dayHeader">
        <div>${escapeHtml(formatDayHeader(dateISO))}</div>
        <div class="dayTotal">${escapeHtml(peso(dayNet))}</div>
      </div>
    `;

    for(const t of list){
      const cat = getCat(t.catId);
      const icon = cat?.emoji ?? "✨";
      const color = cat?.color ?? "#e9e9ee";
      const title = t.note?.trim() ? t.note.trim() : (cat?.name ?? "Transaction");

      const amtSign = (t.type === "income") ? "+" : "-";
      const amtClass = (t.type === "income") ? "income" : "expense";

      const row = document.createElement("div");
      row.className = "txRow";
      row.innerHTML = `
        <div class="txIcon" style="background:${escapeHtml(color)}">${escapeHtml(icon)}</div>
        <div class="txMain">
          <div class="txTitle">${escapeHtml(title)}</div>
          <div class="txTime">${escapeHtml(t.timeHHMM)}</div>
        </div>
        <div class="txAmount ${amtClass}">${amtSign}${escapeHtml(peso(t.amount))}</div>
      `;
      grp.appendChild(row);
    }

    feed.appendChild(grp);
  }
}

// ---------- Events ----------
$("btnAdd").addEventListener("click", () => {
  showScreen("add");
  $("timeLabel").textContent = nowHHMM();
});

$("btnCloseAdd").addEventListener("click", () => {
  showScreen("list");
  resetEntry();
});

buildKeypad();
resetEntry();
renderAll();
showScreen("list");

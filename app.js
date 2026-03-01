const LS_KEY = "dime_lite_v3";

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

let entry = {
  type: "expense",
  amountStr: "0",
  note: "",
  catId: null,
  dateISO: todayISO(),
  timeHHMM: nowHHMM(),
};

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
    transactions: []
  };
}
function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

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
function parseAmount(s){
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function formatDayHeader(dateISO){
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

function showScreen(which){
  $("screenList").classList.toggle("hidden", which !== "list");
  $("screenAdd").classList.toggle("hidden", which !== "add");
}

function setTypeUI(type){
  entry.type = type;
  $("tabExpense").classList.toggle("active", type === "expense");
  $("tabIncome").classList.toggle("active", type === "income");
}

function resetEntry(){
  entry = {
    type: "expense",
    amountStr: "0",
    note: "",
    catId: null,
    dateISO: todayISO(),
    timeHHMM: nowHHMM(),
  };
  setTypeUI("expense");
  renderEntryUI();
}

function renderEntryUI(){
  $("amountDisplay").textContent = entry.amountStr;
  $("categoryLabel").textContent = entry.catId ? getCat(entry.catId)?.name : "Category";

  const today = todayISO();
  if(entry.dateISO === today){
    $("dateLabel").textContent = "Today";
  } else {
    // Format like: "Fri, 8 Aug"
    const d = new Date(entry.dateISO + "T00:00:00");
    const wk = d.toLocaleDateString("en-US", { weekday:"short" });
    const day = d.getDate();
    const mon = d.toLocaleDateString("en-US", { month:"short" });
    $("dateLabel").textContent = `${wk}, ${day} ${mon}`;
  }

  $("timeLabel").textContent = entry.timeHHMM;
}

/* ---------- Keypad (Dime-style) ---------- */
function buildKeypad(){
  // EXACT order like Dime:
  // 1 2 3
  // 4 5 6
  // 7 8 9
  // . 0 ✓
  const keys = ["1","2","3","4","5","6","7","8","9",".","0","ok"];

  const wrap = $("keypad");
  wrap.innerHTML = "";

  for(const k of keys){
    const btn = document.createElement("button");
    btn.type = "button";

    if(k === "ok"){
      btn.className = "key keyOk";
      btn.textContent = "✓";
    } else if(k === "."){
      btn.className = "key keyDot";
      btn.textContent = ".";
    } else {
      btn.className = "key";
      btn.textContent = k;
    }

    btn.addEventListener("click", () => {
      if(k === "ok") return saveTransactionFromEntry();
      handleKey(k);
    });

    wrap.appendChild(btn);
  }
}

function handleKey(k){
  // Dime-like rules:
  // - only one dot
  // - leading 0 replaced
  // - max 2 decimals (optional but closer to money UX)
  // - prevent huge length
  let s = entry.amountStr;

  if(k === "."){
    if(s.includes(".")) return;
    entry.amountStr = s + ".";
    return renderEntryUI();
  }

  // If currently "0", replace with digit
  if(s === "0"){
    entry.amountStr = k;
    return renderEntryUI();
  }

  // If has decimals, limit to 2 dp
  if(s.includes(".")){
    const [a,b] = s.split(".");
    if((b || "").length >= 2) return;
  }

  if(s.length >= 12) return;
  entry.amountStr = s + k;
  renderEntryUI();
}

$("btnBackspace").addEventListener("click", () => {
  let s = entry.amountStr;
  if(s.length <= 1){
    entry.amountStr = "0";
  } else {
    s = s.slice(0, -1);
    if(s === "" || s === "-") s = "0";
    entry.amountStr = s;
  }
  renderEntryUI();
});

/* ---------- Note ---------- */
$("btnAddNote").addEventListener("click", () => {
  $("noteInput").value = entry.note || "";
  $("noteDialog").showModal();
});
$("noteSave").addEventListener("click", (e) => {
  e.preventDefault();
  entry.note = $("noteInput").value.trim();
  $("noteDialog").close();
});

/* ---------- Category ---------- */
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
      $("categoryDialog").close();
      renderEntryUI();
    });
    grid.appendChild(b);
  }

  $("categoryDialog").showModal();
}
$("btnCategory").addEventListener("click", openCategoryDialog);

/* ---------- Date + Time pickers (real, not toggle) ---------- */
function ensureHiddenPickers(){
  if($("hiddenDate")) return;

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.id = "hiddenDate";
  dateInput.style.position = "fixed";
  dateInput.style.left = "-9999px";
  dateInput.style.top = "0";

  const timeInput = document.createElement("input");
  timeInput.type = "time";
  timeInput.id = "hiddenTime";
  timeInput.style.position = "fixed";
  timeInput.style.left = "-9999px";
  timeInput.style.top = "0";

  document.body.appendChild(dateInput);
  document.body.appendChild(timeInput);

  dateInput.addEventListener("change", () => {
    if(dateInput.value) entry.dateISO = dateInput.value;
    renderEntryUI();
  });

  timeInput.addEventListener("change", () => {
    if(timeInput.value) entry.timeHHMM = timeInput.value;
    renderEntryUI();
  });
}

// Tap date pill => open full calendar picker
$("btnDate").addEventListener("click", () => {
  ensureHiddenPickers();
  const dateInput = $("hiddenDate");
  dateInput.value = entry.dateISO;

  // Modern Chrome Android supports showPicker()
  if (dateInput.showPicker) dateInput.showPicker();
  else dateInput.click();
});

// Tap time (new button) => open time picker
$("timeBtn").addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

  ensureHiddenPickers();
  const timeInput = $("hiddenTime");
  timeInput.value = entry.timeHHMM;

  if (timeInput.showPicker) timeInput.showPicker();
  else timeInput.click();
});

/* ---------- Save ---------- */
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
    type: entry.type,
    amount,
    note: entry.note || "",
    catId: entry.catId,
    dateISO: entry.dateISO,
    timeHHMM: entry.timeHHMM,
    createdAt: Date.now()
  };

  state.transactions.push(tx);
  saveState();

  showScreen("list");
  renderAll();
  resetEntry();
}

/* ---------- List rendering ---------- */
function renderAll(){
  renderBalance();
  renderFeed();
}

function renderBalance(){
  const income = state.transactions.filter(t => t.type === "income").reduce((s,t)=>s+t.amount,0);
  const expense = state.transactions.filter(t => t.type === "expense").reduce((s,t)=>s+t.amount,0);
  $("balanceValue").textContent = peso(income - expense);
}

function renderFeed(){
  const feed = $("feed");
  feed.innerHTML = "";

  if(state.transactions.length === 0){
    feed.innerHTML = `<div class="dayGroup"><div class="dayHeader">No transactions yet</div></div>`;
    return;
  }

  const sorted = [...state.transactions].sort((a,b)=>{
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

/* ---------- Buttons ---------- */
$("btnAdd").addEventListener("click", () => {
  showScreen("add");
  entry.timeHHMM = nowHHMM();
  renderEntryUI();
});
$("btnCloseAdd").addEventListener("click", () => {
  showScreen("list");
  resetEntry();
});
$("tabExpense").addEventListener("click", () => setTypeUI("expense"));
$("tabIncome").addEventListener("click", () => setTypeUI("income"));
$("btnSwapType").addEventListener("click", () => setTypeUI(entry.type === "expense" ? "income" : "expense"));

/* ---------- Init ---------- */
buildKeypad();
resetEntry();
renderAll();
showScreen("list");

// Service worker
if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js");
}

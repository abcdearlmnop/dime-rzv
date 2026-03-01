/* Dime-ish Simple Tracker (no frameworks) */

const LS_KEY = "dimeish_v1";
const fmt = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

const el = (id) => document.getElementById(id);

const state = {
  focus: new Date(),         // month shown
  selected: new Date(),      // day selected
  data: loadData(),          // { "YYYY-MM-DD": [tx...] }
};

function loadData() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveData() {
  localStorage.setItem(LS_KEY, JSON.stringify(state.data));
}

function pad2(n){ return String(n).padStart(2, "0"); }
function toISODate(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function fromISODate(s){
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m-1, d);
}
function startOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth()+1, 0);
}
function sameDay(a,b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function clampToMonth(selected, focus){
  // if selected is outside focus month, move selected to first day of focus month
  if (selected.getFullYear() !== focus.getFullYear() || selected.getMonth() !== focus.getMonth()) {
    return startOfMonth(focus);
  }
  return selected;
}

function getDayName(d){
  return d.toLocaleDateString("en-US", { weekday: "short" }); // Mon, Tue...
}
function getMonthTitle(d){
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }); // March 2026
}
function getNiceDate(d){
  return d.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });
}

function daySum(iso){
  const list = state.data[iso] || [];
  // Dime style usually shows net; here we show net (income - expense) but you can swap logic.
  return list.reduce((acc, tx) => acc + (tx.type === "income" ? tx.amount : -tx.amount), 0);
}

function monthTotal(focus){
  const y = focus.getFullYear();
  const m = focus.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m+1, 0);

  let total = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    total += daySum(toISODate(d));
  }
  return total;
}

function render() {
  // keep selected inside visible month for a clean flow
  state.selected = clampToMonth(state.selected, state.focus);

  el("monthTitle").textContent = getMonthTitle(state.focus);

  const selectedISO = toISODate(state.selected);
  el("datePicker").value = selectedISO;

  el("selectedDateTitle").textContent = state.selected.toLocaleDateString("en-US", { month:"short", day:"numeric" });
  el("selectedDateSub").textContent = getNiceDate(state.selected);

  el("monthTotal").textContent = fmt.format(monthTotal(state.focus));
  el("dayTotal").textContent = fmt.format(daySum(selectedISO));

  renderDaysList();
  renderTxList(selectedISO);
}

function renderDaysList(){
  const container = el("daysList");
  container.innerHTML = "";

  const start = startOfMonth(state.focus);
  const end = endOfMonth(state.focus);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    const iso = toISODate(d);
    const sum = daySum(iso);

    const row = document.createElement("div");
    row.className = "dayRow" + (sameDay(d, state.selected) ? " active" : "");
    row.tabIndex = 0;

    // Left: day number
    const dayNum = document.createElement("div");
    dayNum.className = "dayNum";
    dayNum.textContent = d.getDate();

    // Middle: day meta
    const meta = document.createElement("div");
    meta.className = "dayMeta";
    const dow = document.createElement("div");
    dow.className = "dayDow";
    dow.textContent = getDayName(d);
    const hint = document.createElement("div");
    hint.className = "dayHint";
    hint.textContent = (state.data[iso]?.length ? `${state.data[iso].length} item(s)` : "No entries");
    meta.appendChild(dow);
    meta.appendChild(hint);

    // Right: total (RIGHT ALIGNED like Dime)
    const total = document.createElement("div");
    total.className = "dayTotal";
    total.textContent = fmt.format(sum);

    row.appendChild(dayNum);
    row.appendChild(meta);
    row.appendChild(total);

    row.addEventListener("click", () => {
      state.selected = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      render();
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        state.selected = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        render();
      }
    });

    container.appendChild(row);
  }
}

function renderTxList(iso){
  const list = state.data[iso] || [];
  const txList = el("txList");
  const empty = el("emptyState");

  txList.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  // newest first
  const sorted = [...list].sort((a,b) => b.createdAt - a.createdAt);

  for (const tx of sorted) {
    const item = document.createElement("div");
    item.className = "txItem";

    const left = document.createElement("div");
    left.className = "txLeft";

    const cat = document.createElement("div");
    cat.className = "txCat";
    cat.textContent = tx.category;

    const note = document.createElement("div");
    note.className = "txNote";
    note.textContent = tx.note ? tx.note : (tx.type === "income" ? "Income" : "Expense");

    left.appendChild(cat);
    left.appendChild(note);

    const amt = document.createElement("div");
    amt.className = `txAmount ${tx.type}`;
    const signed = tx.type === "income" ? tx.amount : -tx.amount;
    amt.textContent = fmt.format(signed);

    item.appendChild(left);
    item.appendChild(amt);

    // simple delete on long press / context menu (desktop right click)
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (confirm("Delete this transaction?")) {
        state.data[iso] = (state.data[iso] || []).filter(x => x.id !== tx.id);
        saveData();
        render();
      }
    });

    txList.appendChild(item);
  }
}

/* Modal */
function openModal(){
  el("modalBackdrop").classList.remove("hidden");
  el("txDate").value = toISODate(state.selected);
  el("txType").value = "expense";
  el("txAmount").value = "";
  el("txCategory").value = "";
  el("txNote").value = "";
  setTimeout(() => el("txAmount").focus(), 0);
}
function closeModal(){
  el("modalBackdrop").classList.add("hidden");
}

function attachEvents(){
  el("prevMonthBtn").addEventListener("click", () => {
    state.focus = new Date(state.focus.getFullYear(), state.focus.getMonth()-1, 1);
    render();
  });

  el("nextMonthBtn").addEventListener("click", () => {
    state.focus = new Date(state.focus.getFullYear(), state.focus.getMonth()+1, 1);
    render();
  });

  el("todayBtn").addEventListener("click", () => {
    const now = new Date();
    state.focus = new Date(now.getFullYear(), now.getMonth(), 1);
    state.selected = now;
    render();
  });

  el("datePicker").addEventListener("change", (e) => {
    const d = fromISODate(e.target.value);
    state.selected = d;
    state.focus = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
  });

  el("addBtn").addEventListener("click", openModal);
  el("closeModalBtn").addEventListener("click", closeModal);
  el("cancelBtn").addEventListener("click", closeModal);

  el("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === el("modalBackdrop")) closeModal();
  });

  el("txForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const type = el("txType").value;
    const amount = Number(el("txAmount").value);
    const category = el("txCategory").value.trim();
    const note = el("txNote").value.trim();
    const iso = el("txDate").value;

    if (!iso || !category || !Number.isFinite(amount) || amount <= 0) {
      alert("Please enter a valid amount, category, and date.");
      return;
    }

    const tx = {
      id: crypto?.randomUUID?.() || String(Date.now() + Math.random()),
      type,
      amount: Math.round(amount * 100) / 100,
      category,
      note,
      createdAt: Date.now(),
    };

    state.data[iso] = state.data[iso] || [];
    state.data[iso].push(tx);

    saveData();

    // after saving, jump to the date you saved on (so year-wide editing feels correct)
    const d = fromISODate(iso);
    state.selected = d;
    state.focus = new Date(d.getFullYear(), d.getMonth(), 1);

    closeModal();
    render();
  });
}

/* Optional: service worker registration (only if you add sw.js) */
function registerSW(){
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

attachEvents();
render();
registerSW();

const PRICE_LIST = {
  "Coco Pandan": { cat: "Imported", retail: null, wholesale: null, oos: true },
  "Sweet Hasmin": { cat: "Imported", retail: null, wholesale: null, oos: true },
  "SP1 Dinurado": { cat: "Imported", retail: 1380, wholesale: 1350 },
  "Ube Pandan": { cat: "Imported", retail: 1330, wholesale: 1330 },
  "Coco Japonica": { cat: "Japanese", retail: 1350, wholesale: 1320 },
  "Saporro Japanese Rice": { cat: "Japanese", retail: 1350, wholesale: 1320 },
  "Sakura Japanese Rice": { cat: "Japanese", retail: 1350, wholesale: 1320 },
  "Coco Thai (Alsa)": {
    cat: "Thailand",
    retail: null,
    wholesale: null,
    oos: true,
  },
  "Royal Sheep (Alsa)": { cat: "Thailand", retail: 1185, wholesale: 1155 },
  "Magic Castle (Alsa)": { cat: "Thailand", retail: 1220, wholesale: 1190 },
  "Planters (Alsa)": { cat: "Thailand", retail: 1185, wholesale: 1155 },
  "MCL Denorado": { cat: "Local", retail: 1380, wholesale: 1330 },
  "Boy Kanin": { cat: "Local", retail: 1180, wholesale: 1180 },
  "Buko Pandan": { cat: "Local", retail: null, wholesale: null, oos: true },
  "SP1 Angelica": { cat: "Local", retail: null, wholesale: null, oos: true },
};

const state = {
  orderCounter: 0,
  orders: [],
  customers: [],
  inventory: [],
  damageLogs: [],
  stockHistory: [],
  loginAttempts: 0,
  lockUntil: null,
  recoveryCode: null,
  currentAdminTab: "dashboard",
  selectedDelivery: "Pickup",
  selectedCustomer: null,
  selectedOrder: null,
  selectedInventoryItem: null,
  reportsPriceMode: "retail",
};

function seedData() {
  Object.keys(PRICE_LIST).forEach((name, idx) => {
    const p = PRICE_LIST[name];
    state.inventory.push({
      id: "INV-" + String(idx + 1).padStart(3, "0"),
      name,
      category: p.cat,
      unitPrice: p.retail || 0,
      wholesalePrice: p.wholesale || 0,
      stock: 0,
      lowStockThreshold: 10,
      lastUpdated: "—",
    });
  });

  // No customers yet, the customer database populates as real orders come in.
  state.customers = [];

  // No orders yet.
  state.orders = [];

  // No damage logs yet.
  state.damageLogs = [];

  // No stock movements yet.
  state.stockHistory = [];

  state.orderCounter = 0;
}
seedData();

// ---------- NAVIGATION ----------
function go(viewId) {
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");
  document.getElementById("screenArea").scrollTop = 0;
}

function showToast(msg, type) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show" + (type ? " toast-" + type : "");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    t.classList.remove("show");
  }, 2400);
}

function clearFieldError(fieldId) {
  const el = document.getElementById(fieldId);
  if (el) el.classList.remove("error");
}
function setFieldError(fieldId) {
  const el = document.getElementById(fieldId);
  if (el) el.classList.add("error");
}

// ---------- MODAL HELPERS ----------
function openModal(html) {
  document.getElementById("modalSheet").innerHTML = html;
  document.getElementById("modalOverlay").classList.add("show");
}
function closeModal() {
  document.getElementById("modalOverlay").classList.remove("show");
}
document.getElementById("modalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") closeModal();
});

// CUSTOMER: ORDER SLIP
function populateVarietyDropdown() {
  const sel = document.getElementById("in-variety");
  sel.innerHTML = '<option value="">Select</option>';
  state.inventory.forEach((item) => {
    const outOfStock = item.stock <= 0;
    const label = outOfStock
      ? item.name + " (Out of Stock)"
      : `${item.name} — ${item.stock} sack(s) available`;
    const opt = document.createElement("option");
    opt.value = item.name;
    opt.textContent = label;
    if (outOfStock) opt.disabled = true;
    sel.appendChild(opt);
  });
}
populateVarietyDropdown();

function stepSacks(delta) {
  const input = document.getElementById("in-sacks");
  let val = parseInt(input.value, 10) || 1;
  val = Math.max(1, val + delta);
  input.value = val;
  updateOrderSummary();
}

function selectDelivery(btn) {
  document
    .querySelectorAll("#deliveryPills button")
    .forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  state.selectedDelivery = btn.dataset.val;
  updateOrderSummary();
}

function updateOrderSummary() {
  const variety = document.getElementById("in-variety").value;
  const sacks = document.getElementById("in-sacks").value;
  const box = document.getElementById("orderSummary");
  if (!variety) {
    box.textContent = "Fill in the form to see a summary of your order.";
    return;
  }
  box.innerHTML = `<strong>${sacks}</strong> sack(s) of <strong>${variety}</strong>, for <strong>${state.selectedDelivery}</strong>.<br><span style="color:var(--muted); font-size:11px;">Final price will be confirmed by our staff and shown when you track your order.</span>`;
}

function resetOrderForm() {
  document.getElementById("in-name").value = "";
  document.getElementById("in-phone").value = "";
  document.getElementById("in-address").value = "";
  document.getElementById("in-variety").value = "";
  document.getElementById("in-sacks").value = "1";
  document
    .querySelectorAll("#deliveryPills button")
    .forEach((b) => b.classList.remove("selected"));
  document.querySelector("#deliveryPills button").classList.add("selected");
  state.selectedDelivery = "Pickup";
  ["f-name", "f-phone", "f-address", "f-variety"].forEach(clearFieldError);
  updateOrderSummary();
}

function submitOrder() {
  const name = document.getElementById("in-name").value.trim();
  const phone = document.getElementById("in-phone").value.trim();
  const address = document.getElementById("in-address").value.trim();
  const variety = document.getElementById("in-variety").value;
  const sacks = parseInt(document.getElementById("in-sacks").value, 10) || 1;

  let valid = true;
  ["f-name", "f-phone", "f-address", "f-variety"].forEach(clearFieldError);

  if (!name) {
    setFieldError("f-name");
    valid = false;
  }
  if (!phone || !/^0\d{10}$/.test(phone)) {
    setFieldError("f-phone");
    valid = false;
  }
  if (!address) {
    setFieldError("f-address");
    valid = false;
  }
  if (!variety) {
    setFieldError("f-variety");
    valid = false;
  }

  if (!valid) {
    showToast("Please complete all required fields.", "error");
    return;
  }

  state.orderCounter += 1;
  const orderId = "MVB-" + String(state.orderCounter).padStart(4, "0");

  const newOrder = {
    id: orderId,
    customerName: name,
    phone,
    address,
    variety,
    sacks,
    method: state.selectedDelivery,
    priceMode: "retail",
    price: null, // admin sets this later
    status: "Pending",
    paymentStatus: "Unpaid",
    dateCreated: new Date().toISOString().slice(0, 10),
  };
  state.orders.unshift(newOrder);

  // Link/create customer record
  let existing = state.customers.find((c) => c.phone === phone);
  if (!existing) {
    state.customers.push({
      id: "C-" + String(state.customers.length + 1).padStart(3, "0"),
      name,
      phone,
      address,
      addedDate: newOrder.dateCreated,
      classification: "New",
      creditBalance: 0,
      notes: "",
      blacklisted: false,
    });
  }

  document.getElementById("newOrderIdDisplay").textContent = orderId;
  go("view-order-submitted");
  refreshAdminDashboard();
  refreshOrdersList();
}

// CUSTOMER: TRACK ORDER
function searchOrder() {
  const id = document.getElementById("in-track-id").value.trim().toUpperCase();
  const phone = document.getElementById("in-track-phone").value.trim();
  clearFieldError("f-track-id");
  clearFieldError("f-track-phone");

  if (!id || !phone) {
    if (!id) setFieldError("f-track-id");
    if (!phone) setFieldError("f-track-phone");
    showToast("Enter both Order ID and phone number.", "error");
    return;
  }

  const order = state.orders.find((o) => o.id.toUpperCase() === id);
  if (!order) {
    setFieldError("f-track-id");
    document.querySelector("#f-track-id .err-msg").textContent =
      "We couldn't find that order.";
    resetTrackResult();
    return;
  }
  if (order.phone !== phone) {
    setFieldError("f-track-phone");
    document.querySelector("#f-track-phone .err-msg").textContent =
      "Phone number doesn't match our records.";
    resetTrackResult();
    return;
  }

  document.getElementById("tr-id").textContent = order.id;
  document.getElementById("tr-variety").textContent = order.variety;
  document.getElementById("tr-qty").textContent = order.sacks + " sack(s)";
  document.getElementById("tr-price").textContent = order.price
    ? "₱" + order.price.toLocaleString()
    : "Pending confirmation";
  document.getElementById("tr-status").textContent = order.status;
  document.getElementById("printReceiptBtn").disabled = false;
  state.selectedOrder = order;
  showToast("Order found!", "success");
}

function resetTrackResult() {
  ["tr-id", "tr-variety", "tr-qty", "tr-price", "tr-status"].forEach(
    (id) => (document.getElementById(id).textContent = "—"),
  );
  document.getElementById("printReceiptBtn").disabled = true;
  state.selectedOrder = null;
}

function printReceipt() {
  if (!state.selectedOrder) {
    showToast("Search for an order first.", "error");
    return;
  }
  showToast("Receipt sent to printer (simulated).", "success");
}

// ADMIN: LOGIN / LOCKOUT / FORGOT PASSWORD
const ADMIN_EMAIL = "admin.juan@ricetrading.ph";
const ADMIN_PASSWORD = "ricetrading123";
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_SEC = 5 * 60;

function attemptLogin() {
  const email = document.getElementById("in-admin-email").value.trim();
  const pass = document.getElementById("in-admin-pass").value;
  clearFieldError("f-admin-email");
  clearFieldError("f-admin-pass");

  if (email !== ADMIN_EMAIL) {
    setFieldError("f-admin-email");
    showToast("This email is not registered.", "error");
    return;
  }

  if (pass !== ADMIN_PASSWORD) {
    state.loginAttempts += 1;
    setFieldError("f-admin-pass");
    const remaining = MAX_ATTEMPTS - state.loginAttempts;
    if (remaining <= 0) {
      lockAdmin();
      return;
    }
    document.querySelector("#f-admin-pass .err-msg").textContent =
      `Incorrect Password. Try Again. (${remaining} attempt${remaining === 1 ? "" : "s"} left)`;
    showToast("Incorrect password.", "error");
    return;
  }

  // success
  state.loginAttempts = 0;
  document.getElementById("in-admin-pass").value = "";
  enterAdminApp();
}

function lockAdmin() {
  state.lockUntil = Date.now() + LOCK_DURATION_SEC * 1000;
  go("view-locked");
  runLockTimer();
}

function runLockTimer() {
  clearInterval(window._lockInterval);
  window._lockInterval = setInterval(() => {
    const remainingMs = state.lockUntil - Date.now();
    if (remainingMs <= 0) {
      clearInterval(window._lockInterval);
      state.loginAttempts = 0;
      state.lockUntil = null;
      showToast("You may now log in again.", "success");
      go("view-admin-login");
      return;
    }
    const totalSec = Math.ceil(remainingMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    document.getElementById("lockTimer").textContent =
      String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }, 250);
}

function openForgotPassword() {
  state.recoveryCode = String(Math.floor(10000 + Math.random() * 90000));
  document.getElementById("demoCodeHint").textContent = state.recoveryCode;
  document.getElementById("in-recovery-code").value = "";
  clearFieldError("f-recovery-code");
  go("view-forgot-code");
  showToast("Recovery code sent to your email (simulated).", "success");
}

function resendCode() {
  state.recoveryCode = String(Math.floor(10000 + Math.random() * 90000));
  document.getElementById("demoCodeHint").textContent = state.recoveryCode;
  document.getElementById("in-recovery-code").value = "";
  clearFieldError("f-recovery-code");
  showToast("New code sent.", "success");
}

function verifyRecoveryCode() {
  const code = document.getElementById("in-recovery-code").value.trim();
  clearFieldError("f-recovery-code");
  if (code !== state.recoveryCode) {
    setFieldError("f-recovery-code");
    showToast("Incorrect recovery code.", "error");
    return;
  }
  document.getElementById("in-new-pass").value = "";
  document.getElementById("in-confirm-pass").value = "";
  clearFieldError("f-new-pass");
  clearFieldError("f-confirm-pass");
  go("view-new-password");
}

function setNewPassword() {
  const p1 = document.getElementById("in-new-pass").value;
  const p2 = document.getElementById("in-confirm-pass").value;
  clearFieldError("f-new-pass");
  clearFieldError("f-confirm-pass");
  let valid = true;
  if (p1.length < 6) {
    setFieldError("f-new-pass");
    valid = false;
  }
  if (p1 !== p2) {
    setFieldError("f-confirm-pass");
    valid = false;
  }
  if (!valid) {
    showToast("Please check your password fields.", "error");
    return;
  }
  showToast("Password updated. You may now log in.", "success");
  state.loginAttempts = 0;
  go("view-admin-login");
}

function enterAdminApp() {
  go("view-admin-app");
  switchAdminTab("dashboard");
  showToast("Welcome back, Admin!", "success");
}

// ADMIN APP: TAB ROUTER
function switchAdminTab(tab) {
  state.currentAdminTab = tab;
  // 'inventory' is reached only via the Dashboard button, not a bottom-nav icon
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const container = document.getElementById("adminSubviews");
  if (tab === "dashboard") renderDashboard(container);
  else if (tab === "customers") renderCustomers(container);
  else if (tab === "credit") renderCredit(container);
  else if (tab === "reports") renderReports(container);
  else if (tab === "settings") renderSettings(container);
  else if (tab === "inventory") renderInventoryHome();
  const subviews = document.getElementById("adminSubviews");
  if (subviews) subviews.scrollTop = 0;
}

function refreshAdminDashboard() {
  if (state.currentAdminTab === "dashboard") {
    renderDashboard(document.getElementById("adminSubviews"));
  }
}
function refreshOrdersList() {
  if (document.getElementById("ordersListContainer")) {
    renderOrdersListInto(document.getElementById("ordersListContainer"));
  }
}

// DASHBOARD
function renderDashboard(container) {
  const totalSales = state.orders
    .filter((o) => o.status === "Delivered" && o.price)
    .reduce((sum, o) => sum + o.price, 0);
  const totalOrders = state.orders.length;
  const lowStockCount = state.inventory.filter(
    (i) => i.stock > 0 && i.stock <= i.lowStockThreshold,
  ).length;
  const oosCount = state.inventory.filter((i) => i.stock === 0).length;
  const pendingCount = state.orders.filter(
    (o) => o.status === "Pending",
  ).length;

  container.innerHTML = `
    <div class="topbar"><h1>Dashboard</h1></div>
    <div class="content no-pad-bottom" style="flex:1;">
      <div style="font-size:12px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.4px; margin-bottom:10px;">Overview</div>
      <div class="stat-grid">
        <div class="stat-card stat-blue">
          <div class="num">₱${totalSales.toLocaleString()}</div>
          <div class="label">Total Sales (Delivered)</div>
        </div>
        <div class="stat-card stat-pink">
          <div class="num">${totalOrders}</div>
          <div class="label">Total Orders</div>
        </div>
        <div class="stat-card stat-yellow">
          <div class="num">${pendingCount}</div>
          <div class="label">Pending Orders</div>
        </div>
        <div class="stat-card stat-green">
          <div class="num">₱${state.customers.reduce((s, c) => s + c.creditBalance, 0).toLocaleString()}</div>
          <div class="label">Outstanding Credit</div>
        </div>
      </div>
      ${
        lowStockCount || oosCount
          ? `
      <div class="card" style="border-color:var(--warn); background:var(--warn-bg);">
        <div style="font-size:12.5px; font-weight:700; color:var(--warn); margin-bottom:4px;">⚠ Inventory Alerts</div>
        <div style="font-size:12px; color:var(--ink-soft);">${lowStockCount} variet${lowStockCount === 1 ? "y is" : "ies are"} running low, ${oosCount} out of stock.</div>
      </div>`
          : ""
      }
      <button class="btn btn-sage" style="margin-bottom:10px;" onclick="openOrdersManager()">Manage Orders</button>
      <button class="btn btn-sage" onclick="switchAdminTab('inventory')">Manage Inventory</button>
    </div>
  `;
}

// ORDERS MANAGER
function openOrdersManager() {
  const container = document.getElementById("adminSubviews");
  container.innerHTML = `
    <div class="topbar">
      <div class="back-row" onclick="switchAdminTab('dashboard')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg> Dashboard
      </div>
      <h1>Manage Orders</h1>
    </div>
    <div class="content no-pad-bottom" style="flex:1;">
      <div class="filter-row">
        <select id="orderStatusFilter" onchange="renderOrdersListInto(document.getElementById('ordersListContainer'))">
          <option value="All">Status: All</option>
          <option value="Pending">Pending</option>
          <option value="Out for Delivery">Out for Delivery</option>
          <option value="Ready for Pickup">Ready for Pickup</option>
          <option value="Delivered">Delivered</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>
      <div id="ordersListContainer"></div>
    </div>
  `;
  renderOrdersListInto(document.getElementById("ordersListContainer"));
}

function renderOrdersListInto(container) {
  if (!container) return;
  const filter = document.getElementById("orderStatusFilter")
    ? document.getElementById("orderStatusFilter").value
    : "All";
  let list = state.orders;
  if (filter !== "All") list = list.filter((o) => o.status === filter);

  if (list.length === 0) {
    container.innerHTML = emptyState("No orders match this filter yet.");
    return;
  }

  container.innerHTML = list
    .map(
      (o) => `
    <div class="list-item">
      <div class="list-item-top">
        <div>
          <div class="list-item-title">${o.id}</div>
          <div class="list-item-sub">${o.customerName} · ${o.phone}<br>${o.sacks} sack(s) — ${o.variety}<br>${o.method} · ${o.dateCreated}</div>
        </div>
        <span class="badge ${statusBadgeClass(o.status)}">${o.status}</span>
      </div>
      <div class="list-item-sub" style="margin-bottom:8px;">
        Price: <strong>${o.price ? "₱" + o.price.toLocaleString() : "Not set"}</strong> ·
        Payment: <strong>${o.paymentStatus}</strong>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-sage" onclick="openOrderDetail('${o.id}')">Manage</button>
      </div>
    </div>
  `,
    )
    .join("");
}

function statusBadgeClass(status) {
  if (status === "Pending") return "badge-pending";
  if (status === "Out for Delivery" || status === "Ready for Pickup")
    return "badge-transit";
  if (status === "Delivered") return "badge-completed";
  if (status === "Cancelled") return "badge-cancelled";
  return "badge-ok";
}

function openOrderDetail(orderId) {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) return;
  const invItem = state.inventory.find((i) => i.name === o.variety);
  const suggestedRetail = invItem ? invItem.unitPrice * o.sacks : 0;
  const suggestedWholesale = invItem ? invItem.wholesalePrice * o.sacks : 0;

  openModal(`
    <h3>Order ${o.id}</h3>
    <div class="kv-row"><span class="k">Customer</span><span class="v">${o.customerName}</span></div>
    <div class="kv-row"><span class="k">Phone</span><span class="v">${o.phone}</span></div>
    <div class="kv-row"><span class="k">Address</span><span class="v" style="text-align:right; max-width:60%;">${o.address}</span></div>
    <div class="kv-row"><span class="k">Variety</span><span class="v">${o.variety}</span></div>
    <div class="kv-row"><span class="k">Sacks</span><span class="v">${o.sacks}</span></div>
    <div class="kv-row"><span class="k">Method</span><span class="v">${o.method}</span></div>

    <div class="field" style="margin-top:14px;">
      <label>Price Mode</label>
      <div class="price-tag-select">
        <button type="button" id="pm-retail" class="${o.priceMode === "retail" ? "selected" : ""}" onclick="setOrderPriceMode('retail', ${suggestedRetail})">Retail (₱${suggestedRetail.toLocaleString()})</button>
        <button type="button" id="pm-wholesale" class="${o.priceMode === "wholesale" ? "selected" : ""}" onclick="setOrderPriceMode('wholesale', ${suggestedWholesale})">Wholesale (₱${suggestedWholesale.toLocaleString()})</button>
      </div>
    </div>
    <div class="field">
      <label>Final Price (₱)</label>
      <input type="number" id="orderPriceInput" value="${o.price || suggestedRetail}">
    </div>
    <div class="field">
      <label>Order Status</label>
      <select id="orderStatusInput">
        <option value="Pending" ${o.status === "Pending" ? "selected" : ""}>Pending</option>
        <option value="Out for Delivery" ${o.status === "Out for Delivery" ? "selected" : ""}>Out for Delivery</option>
        <option value="Ready for Pickup" ${o.status === "Ready for Pickup" ? "selected" : ""}>Ready for Pickup</option>
        <option value="Delivered" ${o.status === "Delivered" ? "selected" : ""}>Delivered (Completed)</option>
        <option value="Cancelled" ${o.status === "Cancelled" ? "selected" : ""}>Cancelled</option>
      </select>
    </div>
    <div class="field">
      <label>Payment Status</label>
      <select id="orderPaymentInput">
        <option value="Paid" ${o.paymentStatus === "Paid" ? "selected" : ""}>Paid</option>
        <option value="Partial" ${o.paymentStatus === "Partial" ? "selected" : ""}>Partial</option>
        <option value="Unpaid" ${o.paymentStatus === "Unpaid" ? "selected" : ""}>Unpaid</option>
      </select>
    </div>
    <p style="font-size:11px; color:var(--muted); margin-bottom:14px;">Marking an order <strong>Delivered</strong> will deduct ${o.sacks} sack(s) of ${o.variety} from inventory. Marking payment as Partial/Unpaid adds it to Credit &amp; Receivables.</p>
    <div class="btn-row">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-sage" onclick="saveOrderDetail('${o.id}')">Save Changes</button>
    </div>
  `);
}

function setOrderPriceMode(mode, price) {
  document
    .getElementById("pm-retail")
    .classList.toggle("selected", mode === "retail");
  document
    .getElementById("pm-wholesale")
    .classList.toggle("selected", mode === "wholesale");
  document.getElementById("orderPriceInput").value = price;
  document.getElementById("orderPriceInput").dataset.mode = mode;
}

function saveOrderDetail(orderId) {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) return;
  const newPrice =
    parseFloat(document.getElementById("orderPriceInput").value) || 0;
  const newStatus = document.getElementById("orderStatusInput").value;
  const newPayment = document.getElementById("orderPaymentInput").value;
  const priceModeInput =
    document.getElementById("orderPriceInput").dataset.mode;
  const wasDelivered = o.status === "Delivered";

  // warn if marking Delivered would deduct more stock than is on hand.
  if (newStatus === "Delivered" && !wasDelivered) {
    const invItem = state.inventory.find((i) => i.name === o.variety);
    const available = invItem ? invItem.stock : 0;
    if (available < o.sacks) {
      const proceed = confirm(
        `Only ${available} sack(s) of ${o.variety} are in stock, but this order needs ${o.sacks}. ` +
          `Mark as Delivered anyway? Stock will be set to 0.`,
      );
      if (!proceed) return;
    }
  }

  o.price = newPrice;
  o.status = newStatus;
  o.paymentStatus = newPayment;
  if (priceModeInput) o.priceMode = priceModeInput;

  // Auto-deduct stock only when transitioning TO Delivered (Completed)
  if (newStatus === "Delivered" && !wasDelivered) {
    const invItem = state.inventory.find((i) => i.name === o.variety);
    if (invItem) {
      invItem.stock = Math.max(0, invItem.stock - o.sacks);
      invItem.lastUpdated = new Date().toISOString().slice(0, 10);
      state.stockHistory.unshift({
        date: invItem.lastUpdated,
        variety: o.variety,
        type: "Out",
        qty: o.sacks,
        reason: `Order ${o.id} completed`,
      });
    }
  }

  // Update customer credit balance if unpaid/partial
  const cust = state.customers.find((c) => c.phone === o.phone);
  if (cust) {
    recalcCustomerCredit(cust);
  }

  closeModal();
  showToast(`Order ${o.id} updated.`, "success");
  renderOrdersListInto(document.getElementById("ordersListContainer"));
  refreshAdminDashboard();
  populateVarietyDropdown();
}

function recalcCustomerCredit(cust) {
  cust.creditBalance = state.orders
    .filter(
      (o) =>
        o.phone === cust.phone &&
        (o.paymentStatus === "Unpaid" || o.paymentStatus === "Partial") &&
        o.price,
    )
    .reduce(
      (sum, o) =>
        sum + (o.paymentStatus === "Partial" ? o.price * 0.5 : o.price),
      0,
    );
}

function emptyState(msg) {
  return `<div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
    <p>${msg}</p>
  </div>`;
}

// ADMIN: INVENTORY reached via Dashboard "Manage Inventory"
function renderInventoryHome() {
  const container = document.getElementById("adminSubviews");
  container.innerHTML = `
    <div class="topbar">
      <div class="back-row" onclick="switchAdminTab('dashboard')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg> Dashboard
      </div>
      <h1>Inventory</h1>
    </div>
    <div class="content no-pad-bottom" style="flex:1;">
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="invSearch" placeholder="Search Rice Variety" oninput="renderInventoryList()">
        <select id="invFilter" onchange="renderInventoryList()" style="border:none; background:transparent; font-size:11px; color:var(--muted);">
          <option value="All">All Items</option>
          <option value="Low">Low Stock</option>
          <option value="OOS">Out of Stock</option>
        </select>
      </div>
      <div class="btn-row" style="margin-bottom:12px;">
        <button class="btn btn-sage" onclick="openAddEditVariety(null)">+ Add New Variety</button>
      </div>
      <div class="btn-row" style="margin-bottom:14px;">
        <button class="btn btn-outline" onclick="openFlagDamage()">Flag Damaged Stock</button>
        <button class="btn btn-outline" onclick="openStockHistory()">Stock History</button>
      </div>
      <div id="inventoryListContainer"></div>
    </div>
  `;
  renderInventoryList();
}

function renderInventoryList() {
  const container = document.getElementById("inventoryListContainer");
  if (!container) return;
  const search = (
    document.getElementById("invSearch")?.value || ""
  ).toLowerCase();
  const filter = document.getElementById("invFilter")?.value || "All";

  let list = state.inventory.filter((i) =>
    i.name.toLowerCase().includes(search),
  );
  if (filter === "Low")
    list = list.filter((i) => i.stock > 0 && i.stock <= i.lowStockThreshold);
  if (filter === "OOS") list = list.filter((i) => i.stock === 0);

  if (list.length === 0) {
    container.innerHTML = emptyState("No matching varieties found.");
    return;
  }

  container.innerHTML = list
    .map((item) => {
      let badge = `<span class="badge badge-ok">In Stock</span>`;
      if (item.stock === 0)
        badge = `<span class="badge badge-oos">Out of Stock</span>`;
      else if (item.stock <= item.lowStockThreshold)
        badge = `<span class="badge badge-low">Low Stock</span>`;
      const catClass =
        {
          Imported: "badge-imported",
          Japanese: "badge-japanese",
          Local: "badge-local",
          Thailand: "badge-thai",
        }[item.category] || "badge-ok";
      return `
    <div class="list-item">
      <div class="list-item-top">
        <div>
          <div class="list-item-title">${item.name}</div>
          <div class="list-item-sub">
            <span class="badge ${catClass}" style="margin-right:4px;">${item.category}</span><br>
            Current Stock: <strong>${item.stock} sack(s)</strong><br>
            Unit Price: ₱${item.unitPrice.toLocaleString()} · Last Updated: ${item.lastUpdated}
          </div>
        </div>
        ${badge}
      </div>
      <div class="list-item-actions">
        <button class="btn btn-gray" onclick="openAddEditVariety('${item.id}')">Edit</button>
        <button class="btn btn-outline" onclick="openStockHistory('${item.name}')">History</button>
        <button class="btn btn-danger" onclick="deleteVariety('${item.id}')">Del</button>
      </div>
    </div>`;
    })
    .join("");
}

function openAddEditVariety(itemId) {
  const item = itemId ? state.inventory.find((i) => i.id === itemId) : null;
  openModal(`
    <h3>${item ? "Edit Variety" : "Add New Variety"}</h3>
    <div class="field">
      <label>Rice Variety Name</label>
      <input type="text" id="var-name" value="${item ? item.name : ""}" placeholder="Jasmine Rice">
    </div>
    <div class="field">
      <label>Variety Type</label>
      <select id="var-type">
        ${["Local", "Imported", "Japanese", "Thailand"].map((c) => `<option value="${c}" ${item && item.category === c ? "selected" : ""}>${c}</option>`).join("")}
      </select>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Initial / Current Amount in Sacks</label>
        <input type="number" id="var-stock" value="${item ? item.stock : 0}">
      </div>
      <div class="field">
        <label>Unit Price (₱)</label>
        <input type="number" id="var-price" value="${item ? item.unitPrice : ""}">
      </div>
    </div>
    <div class="field">
      <label>Wholesale Price (₱) <span class="hint">optional</span></label>
      <input type="number" id="var-wholesale" value="${item ? item.wholesalePrice : ""}">
    </div>
    <div class="btn-row">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-sage" onclick="saveVariety(${item ? `'${item.id}'` : "null"})">Confirm</button>
    </div>
  `);
}

function saveVariety(itemId) {
  const name = document.getElementById("var-name").value.trim();
  const category = document.getElementById("var-type").value;
  const stock = parseInt(document.getElementById("var-stock").value, 10) || 0;
  const price = parseFloat(document.getElementById("var-price").value) || 0;
  const wholesale =
    parseFloat(document.getElementById("var-wholesale").value) || price;

  if (!name) {
    showToast("Please enter a variety name.", "error");
    return;
  }

  if (itemId) {
    const item = state.inventory.find((i) => i.id === itemId);
    const diff = stock - item.stock;
    item.name = name;
    item.category = category;
    item.stock = stock;
    item.unitPrice = price;
    item.wholesalePrice = wholesale;
    item.lastUpdated = new Date().toISOString().slice(0, 10);
    if (diff !== 0) {
      state.stockHistory.unshift({
        date: item.lastUpdated,
        variety: name,
        type: diff > 0 ? "In" : "Out",
        qty: Math.abs(diff),
        reason: "Manual inventory adjustment",
      });
    }
  } else {
    const newItem = {
      id: "INV-" + String(state.inventory.length + 1).padStart(3, "0"),
      name,
      category,
      unitPrice: price,
      wholesalePrice: wholesale,
      stock,
      lowStockThreshold: 10,
      lastUpdated: new Date().toISOString().slice(0, 10),
    };
    state.inventory.push(newItem);
    state.stockHistory.unshift({
      date: newItem.lastUpdated,
      variety: name,
      type: "In",
      qty: stock,
      reason: "New variety added",
    });
  }
  closeModal();
  showToast("Variety saved.", "success");
  renderInventoryList();
  refreshAdminDashboard();
  populateVarietyDropdown();
}

function deleteVariety(itemId) {
  const item = state.inventory.find((i) => i.id === itemId);
  if (!item) return;
  if (confirm(`Remove "${item.name}" from inventory? This cannot be undone.`)) {
    state.inventory = state.inventory.filter((i) => i.id !== itemId);
    showToast("Variety removed.", "success");
    renderInventoryList();
    populateVarietyDropdown();
  }
}

function openFlagDamage() {
  const inStockItems = state.inventory.filter((i) => i.stock > 0);
  if (inStockItems.length === 0) {
    openModal(`
      <h3 style="color:var(--danger);">Flag Damaged Stock</h3>
      ${emptyState("No stock on hand yet. Add inventory first before flagging damage.")}
      <button class="btn btn-outline" style="margin-top:10px;" onclick="closeModal()">Close</button>
    `);
    return;
  }
  openModal(`
    <h3 style="color:var(--danger);">Flag Damaged Stock</h3>
    <div class="field">
      <label>Rice Variety</label>
      <select id="dmg-variety" onchange="syncDamageMaxQty()">
        ${inStockItems.map((i) => `<option value="${i.name}" data-max="${i.stock}">${i.name} (${i.stock} sack(s) on hand)</option>`).join("")}
      </select>
    </div>
    <div class="field">
      <label>Damage Type</label>
      <select id="dmg-type">
        <option>Pest Infestation</option>
        <option>Water Damage</option>
        <option>Torn Sack / Spillage</option>
        <option>Expired / Spoiled</option>
        <option>Other</option>
      </select>
    </div>
    <div class="field">
      <label>Amount of Sacks Damaged</label>
      <input type="number" id="dmg-qty" value="1" min="1" max="${inStockItems[0].stock}">
    </div>
    <div class="field">
      <label>Date Discovered</label>
      <input type="date" id="dmg-date" value="${new Date().toISOString().slice(0, 10)}">
    </div>
    <div class="field">
      <label>Notes (Optional)</label>
      <textarea id="dmg-notes" rows="2" placeholder="Describe condition"></textarea>
    </div>
    <div class="btn-row">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="logDamage()">Log Damage</button>
    </div>
  `);
}

function syncDamageMaxQty() {
  const sel = document.getElementById("dmg-variety");
  const max = sel.options[sel.selectedIndex].dataset.max;
  const qtyInput = document.getElementById("dmg-qty");
  qtyInput.max = max;
  if (parseInt(qtyInput.value, 10) > parseInt(max, 10)) qtyInput.value = max;
}

function logDamage() {
  const variety = document.getElementById("dmg-variety").value;
  const type = document.getElementById("dmg-type").value;
  const item = state.inventory.find((i) => i.name === variety);
  const maxQty = item ? item.stock : 0;
  let qty = parseInt(document.getElementById("dmg-qty").value, 10) || 1;
  qty = Math.min(Math.max(qty, 1), maxQty);
  const date = document.getElementById("dmg-date").value;
  const notes = document.getElementById("dmg-notes").value.trim();

  if (item) {
    item.stock = Math.max(0, item.stock - qty);
    item.lastUpdated = date;
  }
  state.damageLogs.unshift({
    id: "DMG-" + String(state.damageLogs.length + 1).padStart(3, "0"),
    variety,
    type,
    sacks: qty,
    date,
    notes,
  });
  state.stockHistory.unshift({
    date,
    variety,
    type: "Out",
    qty,
    reason: `Damaged stock: ${type}`,
  });

  closeModal();
  showToast(`${qty} sack(s) of ${variety} flagged as damaged.`, "success");
  renderInventoryList();
  refreshAdminDashboard();
  populateVarietyDropdown();
}

function openStockHistory(varietyFilter) {
  let list = state.stockHistory;
  if (varietyFilter) list = list.filter((h) => h.variety === varietyFilter);
  const timelineHtml =
    list.length === 0
      ? emptyState("No stock movements recorded yet.")
      : `
    <div class="timeline">
      ${list
        .map(
          (h) => `
        <div class="timeline-item">
          <div class="t-date">${h.date}</div>
          <div class="t-body"><strong>${h.type === "In" ? "+" : "−"}${h.qty}</strong> sack(s) — ${h.variety}<br>${h.reason}</div>
        </div>
      `,
        )
        .join("")}
    </div>`;
  openModal(`
    <h3>Stock History ${varietyFilter ? "— " + varietyFilter : ""}</h3>
    ${timelineHtml}
    <button class="btn btn-outline" style="margin-top:14px;" onclick="closeModal()">Close</button>
  `);
}

// ADMIN: CUSTOMERS to manage customers
function renderCustomers(container) {
  container.innerHTML = `
    <div class="topbar"><h1>Customers</h1></div>
    <div class="content no-pad-bottom" style="flex:1;">
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="custSearch" placeholder="Search by Name or Phone" oninput="renderCustomerList()">
      </div>
      <div class="filter-row">
        <select id="custTypeFilter" onchange="renderCustomerList()">
          <option value="All">Type: All</option>
          <option value="New">New</option>
          <option value="Returning">Returning</option>
          <option value="Blacklisted">Blacklisted</option>
        </select>
        <select id="custSortFilter" onchange="renderCustomerList()">
          <option value="recent">Sort by: Recent</option>
          <option value="name">Sort by: Name</option>
          <option value="credit">Sort by: Credit Owed</option>
        </select>
      </div>
      <button class="btn btn-sage" style="margin-bottom:12px;" onclick="openAddEditCustomer(null)">+ Add New Customer</button>
      <div id="customerListContainer"></div>
    </div>
  `;
  renderCustomerList();
}

function renderCustomerList() {
  const container = document.getElementById("customerListContainer");
  if (!container) return;
  const search = (
    document.getElementById("custSearch")?.value || ""
  ).toLowerCase();
  const typeFilter = document.getElementById("custTypeFilter")?.value || "All";
  const sort = document.getElementById("custSortFilter")?.value || "recent";

  let list = state.customers.filter(
    (c) => c.name.toLowerCase().includes(search) || c.phone.includes(search),
  );
  if (typeFilter === "Blacklisted") list = list.filter((c) => c.blacklisted);
  else if (typeFilter !== "All")
    list = list.filter(
      (c) => c.classification === typeFilter && !c.blacklisted,
    );

  if (sort === "name")
    list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "credit")
    list = [...list].sort((a, b) => b.creditBalance - a.creditBalance);
  else
    list = [...list].sort(
      (a, b) => new Date(b.addedDate) - new Date(a.addedDate),
    );

  if (list.length === 0) {
    container.innerHTML = emptyState("No customers match your search.");
    return;
  }

  container.innerHTML = list
    .map((c) => {
      const orderCount = state.orders.filter((o) => o.phone === c.phone).length;
      let badge = c.blacklisted
        ? `<span class="badge badge-blacklist">Blacklisted</span>`
        : c.classification === "New"
          ? `<span class="badge badge-new">New</span>`
          : `<span class="badge badge-returning">Returning</span>`;
      return `
    <div class="list-item" style="${c.blacklisted ? "background:#fff8f7; border-color:#f0c9c3;" : ""}">
      <div class="list-item-top">
        <div>
          <div class="list-item-title">${c.name} <span style="font-weight:400; color:var(--muted); font-size:11px;">${c.phone}</span></div>
          <div class="list-item-sub">${c.address}<br>Added: ${c.addedDate} · ${orderCount} Order(s)</div>
        </div>
        ${badge}
      </div>
      <div class="list-item-actions">
        <button class="btn btn-gray" onclick="viewCustomer('${c.id}')">View</button>
        <button class="btn btn-gray" onclick="openAddEditCustomer('${c.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteCustomer('${c.id}')">Del</button>
      </div>
    </div>`;
    })
    .join("");
}

function viewCustomer(custId) {
  const c = state.customers.find((x) => x.id === custId);
  if (!c) return;
  const orders = state.orders.filter((o) => o.phone === c.phone);
  const badge = c.blacklisted
    ? `<span class="badge badge-blacklist">Blacklisted</span>`
    : c.classification === "New"
      ? `<span class="badge badge-new">New</span>`
      : `<span class="badge badge-returning">Returning</span>`;

  const container = document.getElementById("adminSubviews");
  container.innerHTML = `
    <div class="topbar">
      <div class="back-row" onclick="switchAdminTab('customers')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg> Customers
      </div>
      <h1>Customer Profile</h1>
    </div>
    <div class="content" style="flex:1;">
      <div class="card">
        <div class="list-item-top" style="margin-bottom:0;">
          <div>
            <div class="list-item-title" style="font-size:16px;">${c.name}</div>
            <div class="list-item-sub">${c.phone}<br>${c.address}<br>Added: ${c.addedDate}</div>
          </div>
          ${badge}
        </div>
        ${c.notes ? `<p style="font-size:11.5px; color:var(--ink-soft); margin-top:8px; font-style:italic;">"${c.notes}"</p>` : ""}
        <div class="divider"></div>
        <div class="kv-row"><span class="k">Credit Balance</span><span class="v" style="color:${c.creditBalance > 0 ? "var(--danger)" : "inherit"}">₱${c.creditBalance.toLocaleString()}</span></div>
      </div>

      <div class="card-title">${c.name}'s Order History</div>
      ${
        orders.length === 0
          ? emptyState("No orders yet.")
          : orders
              .map(
                (o) => `
        <div class="list-item">
          <div class="list-item-top">
            <div>
              <div class="list-item-title">${o.id}</div>
              <div class="list-item-sub">${o.variety} · ${o.sacks} sack(s)<br>${o.price ? "₱" + o.price.toLocaleString() : "Price pending"} · ${o.dateCreated}</div>
            </div>
            <span class="badge ${statusBadgeClass(o.status)}">${o.status}</span>
          </div>
        </div>
      `,
              )
              .join("")
      }

      <div class="btn-row" style="margin-top:10px;">
        <button class="btn btn-sage" onclick="openAddEditCustomer('${c.id}')">Edit Profile</button>
        <button class="btn ${c.blacklisted ? "btn-outline" : "btn-danger"}" onclick="toggleBlacklist('${c.id}')">${c.blacklisted ? "Unblacklist" : "Blacklist"}</button>
      </div>
      <button class="btn btn-outline" style="margin-top:10px;" onclick="switchAdminTab('customers')">Back to Customer Database</button>
    </div>
  `;
}

function toggleBlacklist(custId) {
  const c = state.customers.find((x) => x.id === custId);
  if (!c) return;
  c.blacklisted = !c.blacklisted;
  showToast(
    c.blacklisted
      ? `${c.name} was blacklisted.`
      : `${c.name} was removed from blacklist.`,
    c.blacklisted ? "error" : "success",
  );
  viewCustomer(custId);
}

function openAddEditCustomer(custId) {
  const c = custId ? state.customers.find((x) => x.id === custId) : null;
  openModal(`
    <h3>${c ? "Edit Customer" : "Add / Edit Customer"}</h3>
    <div class="field">
      <label>Customer Name</label>
      <input type="text" id="cust-name" value="${c ? c.name : ""}" placeholder="Juan Dela Cruz">
    </div>
    <div class="field">
      <label>Phone Number</label>
      <input type="text" id="cust-phone" value="${c ? c.phone : ""}" placeholder="09123456789">
    </div>
    <div class="field">
      <label>Address (Delivery Location)</label>
      <textarea id="cust-address" rows="2" placeholder="ABC Building, 123 Street, Barangay Mabuhay, Quezon City">${c ? c.address : ""}</textarea>
    </div>
    <div class="field">
      <label>Classification</label>
      <select id="cust-class">
        <option value="New" ${c && c.classification === "New" ? "selected" : ""}>New</option>
        <option value="Returning" ${c && c.classification === "Returning" ? "selected" : ""}>Returning</option>
      </select>
    </div>
    <div class="field">
      <label>Notes (Optional)</label>
      <textarea id="cust-notes" rows="2" placeholder="Prefers weekday deliveries">${c ? c.notes : ""}</textarea>
    </div>
    <div class="btn-row">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-sage" onclick="saveCustomer(${c ? `'${c.id}'` : "null"})">Confirm</button>
    </div>
  `);
}

function saveCustomer(custId) {
  const name = document.getElementById("cust-name").value.trim();
  const phone = document.getElementById("cust-phone").value.trim();
  const address = document.getElementById("cust-address").value.trim();
  const classification = document.getElementById("cust-class").value;
  const notes = document.getElementById("cust-notes").value.trim();

  if (!name || !phone) {
    showToast("Name and phone number are required.", "error");
    return;
  }

  if (custId) {
    const c = state.customers.find((x) => x.id === custId);
    Object.assign(c, { name, phone, address, classification, notes });
  } else {
    state.customers.push({
      id: "C-" + String(state.customers.length + 1).padStart(3, "0"),
      name,
      phone,
      address,
      classification,
      notes,
      addedDate: new Date().toISOString().slice(0, 10),
      creditBalance: 0,
      blacklisted: false,
    });
  }
  closeModal();
  showToast("Customer saved.", "success");
  renderCustomerList();
}

function deleteCustomer(custId) {
  const c = state.customers.find((x) => x.id === custId);
  if (!c) return;
  if (confirm(`Remove ${c.name} from the customer database?`)) {
    state.customers = state.customers.filter((x) => x.id !== custId);
    showToast("Customer removed.", "success");
    renderCustomerList();
  }
}

// ADMIN: CREDIT & RECEIVABLES
function renderCredit(container) {
  const debtors = state.customers
    .filter((c) => c.creditBalance > 0)
    .sort((a, b) => b.creditBalance - a.creditBalance);
  const totalOutstanding = debtors.reduce((s, c) => s + c.creditBalance, 0);
  const totalPaidHistorically = state.orders
    .filter((o) => o.paymentStatus === "Paid" && o.price)
    .reduce((s, o) => s + o.price, 0);
  const collectionRate =
    totalOutstanding + totalPaidHistorically > 0
      ? Math.round(
          (totalPaidHistorically / (totalOutstanding + totalPaidHistorically)) *
            100,
        )
      : 100;

  container.innerHTML = `
    <div class="topbar"><h1>Credit &amp; Receivables</h1></div>
    <div class="content no-pad-bottom" style="flex:1;">
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="creditSearch" placeholder="Search by Name or Phone" oninput="renderDebtorList()">
      </div>
      <div class="filter-row">
        <select id="creditStatusFilter" onchange="renderDebtorList()">
          <option value="All">Status: All</option>
          <option value="High">High balance (₱2,000+)</option>
          <option value="Low">Under ₱2,000</option>
        </select>
      </div>
      <button class="btn btn-outline" style="margin-bottom:14px;" onclick="showAgingReport()">Aging Analysis Report</button>

      <div class="stat-grid" style="grid-template-columns:1fr 1fr;">
        <div class="stat-card stat-pink"><div class="num">₱${totalOutstanding.toLocaleString()}</div><div class="label">Total Outstanding</div></div>
        <div class="stat-card stat-green"><div class="num">${collectionRate}%</div><div class="label">Collection Rate</div></div>
      </div>

      <div class="card-title">Top Debtors</div>
      <div id="debtorListContainer"></div>
    </div>
  `;
  renderDebtorList();
}

function renderDebtorList() {
  const container = document.getElementById("debtorListContainer");
  if (!container) return;
  const search = (
    document.getElementById("creditSearch")?.value || ""
  ).toLowerCase();
  const filter = document.getElementById("creditStatusFilter")?.value || "All";
  let list = state.customers.filter(
    (c) =>
      c.creditBalance > 0 &&
      (c.name.toLowerCase().includes(search) || c.phone.includes(search)),
  );
  if (filter === "High") list = list.filter((c) => c.creditBalance >= 2000);
  if (filter === "Low") list = list.filter((c) => c.creditBalance < 2000);
  list.sort((a, b) => b.creditBalance - a.creditBalance);

  if (list.length === 0) {
    container.innerHTML = emptyState("No outstanding balances. Nice!");
    return;
  }

  container.innerHTML = list
    .map(
      (c) => `
    <div class="list-item">
      <div class="list-item-top">
        <div>
          <div class="list-item-title">${c.name}</div>
          <div class="list-item-sub">${c.phone}<br>Balance: <strong style="color:var(--danger);">₱${c.creditBalance.toLocaleString()}</strong></div>
        </div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-sage" onclick="goViewCustomerFromCredit('${c.id}')">View Orders</button>
      </div>
    </div>
  `,
    )
    .join("");
}

function goViewCustomerFromCredit(custId) {
  state.currentAdminTab = "customers";
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === "customers"),
    );
  viewCustomer(custId);
}

function showAgingReport() {
  const debtors = state.customers.filter((c) => c.creditBalance > 0);
  openModal(`
    <h3>Aging Analysis Report</h3>
    ${
      debtors.length === 0
        ? emptyState("No receivables to age.")
        : debtors
            .map((c) => {
              const oldestUnpaid = state.orders
                .filter(
                  (o) => o.phone === c.phone && o.paymentStatus !== "Paid",
                )
                .sort(
                  (a, b) => new Date(a.dateCreated) - new Date(b.dateCreated),
                )[0];
              const days = oldestUnpaid
                ? Math.floor(
                    (Date.now() - new Date(oldestUnpaid.dateCreated)) /
                      86400000,
                  )
                : 0;
              const bucket =
                days <= 30
                  ? "0–30 days"
                  : days <= 60
                    ? "31–60 days"
                    : "60+ days";
              return `<div class="kv-row"><span class="k">${c.name} <span style="color:var(--muted);">(${bucket})</span></span><span class="v">₱${c.creditBalance.toLocaleString()}</span></div>`;
            })
            .join("")
    }
    <button class="btn btn-sage" style="margin-top:16px;" onclick="showToast('Report exported (simulated).','success'); closeModal();">Print as CSV/PDF</button>
    <button class="btn btn-outline" style="margin-top:10px;" onclick="closeModal()">Close</button>
  `);
}

// ADMIN: REPORTS & TrANSACTION LOGS
function renderReports(container) {
  container.innerHTML = `
    <div class="topbar"><h1>Reports and Logs</h1></div>
    <div class="content no-pad-bottom" style="flex:1;">
      <div class="tabbar" id="reportsTabbar">
        <button class="active" data-r="sales" onclick="switchReportTab('sales')">Sales</button>
        <button data-r="inventory" onclick="switchReportTab('inventory')">Inventory</button>
        <button data-r="orders" onclick="switchReportTab('orders')">Orders</button>
        <button data-r="credit" onclick="switchReportTab('credit')">Credit</button>
      </div>
      <div id="reportsBody"></div>
    </div>
  `;
  switchReportTab("sales");
}

function switchReportTab(tab) {
  document
    .querySelectorAll("#reportsTabbar button")
    .forEach((b) => b.classList.toggle("active", b.dataset.r === tab));
  const body = document.getElementById("reportsBody");
  const deliveredOrders = state.orders.filter(
    (o) => o.status === "Delivered" && o.price,
  );

  if (tab === "sales") {
    const totalSales = deliveredOrders.reduce((s, o) => s + o.price, 0);
    const totalOrders = deliveredOrders.length;
    const byVariety = {};
    deliveredOrders.forEach((o) => {
      byVariety[o.variety] = byVariety[o.variety] || { sacks: 0, amount: 0 };
      byVariety[o.variety].sacks += o.sacks;
      byVariety[o.variety].amount += o.price;
    });
    body.innerHTML = `
      <div class="filter-row">
        <select><option>Daily</option><option>Weekly</option><option>Monthly</option></select>
        <select><option>All Varieties</option>${state.inventory.map((i) => `<option>${i.name}</option>`).join("")}</select>
      </div>
      <div class="stat-grid" style="grid-template-columns:1fr 1fr;">
        <div class="stat-card stat-blue"><div class="num">₱${totalSales.toLocaleString()}</div><div class="label">Total Sales</div></div>
        <div class="stat-card stat-green"><div class="num">${totalOrders}</div><div class="label">Total Orders Completed</div></div>
      </div>
      <div class="card-title">Sales Breakdown by Variety</div>
      ${
        Object.keys(byVariety).length === 0
          ? emptyState("No completed sales yet.")
          : Object.entries(byVariety)
              .map(
                ([v, d]) => `
        <div class="kv-row"><span class="k">${v} <span style="color:var(--muted);">(${d.sacks} sacks)</span></span><span class="v">₱${d.amount.toLocaleString()}</span></div>
      `,
              )
              .join("")
      }
      <button class="btn btn-sage" style="margin-top:16px;" onclick="showToast('Report exported (simulated).','success')">Print as CSV/PDF</button>
    `;
  }

  if (tab === "inventory") {
    const totalSacks = state.inventory.reduce((s, i) => s + i.stock, 0);
    const lowStockItems = state.inventory.filter(
      (i) => i.stock > 0 && i.stock <= i.lowStockThreshold,
    );
    const oosItems = state.inventory.filter((i) => i.stock === 0);
    body.innerHTML = `
      <div class="stat-grid" style="grid-template-columns:1fr 1fr;">
        <div class="stat-card stat-blue"><div class="num">${totalSacks}</div><div class="label">Total Stock (sacks)</div></div>
        <div class="stat-card stat-pink"><div class="num">${lowStockItems.length}</div><div class="label">Low Stock Items</div></div>
      </div>
      <div class="stat-grid" style="grid-template-columns:1fr 1fr;">
        <div class="stat-card stat-yellow"><div class="num">${oosItems.length}</div><div class="label">Out of Stock</div></div>
        <div class="stat-card stat-green"><div class="num">${state.damageLogs.reduce((s, d) => s + d.sacks, 0)}</div><div class="label">Sacks Damaged (Total)</div></div>
      </div>
      <div class="card-title">Stock Variant Breakdown</div>
      ${state.inventory
        .map(
          (i) => `
        <div class="kv-row"><span class="k">${i.name}</span><span class="v">${i.stock} sacks — ${i.stock === 0 ? "Out of Stock" : i.stock <= i.lowStockThreshold ? "Low" : "OK"}</span></div>
      `,
        )
        .join("")}
      ${
        lowStockItems.length || oosItems.length
          ? `
      <div class="card-title" style="margin-top:14px;">Restock Recommendations</div>
      ${[...oosItems, ...lowStockItems].map((i) => `<div class="kv-row"><span class="k">${i.name}</span><span class="v">Restock ${Math.max(20 - i.stock, 10)}+ sacks</span></div>`).join("")}
      `
          : ""
      }
      <button class="btn btn-sage" style="margin-top:16px;" onclick="showToast('Report exported (simulated).','success')">Print as CSV/PDF</button>
    `;
  }

  if (tab === "orders") {
    const completed = state.orders.filter(
      (o) => o.status === "Delivered",
    ).length;
    const pending = state.orders.filter((o) => o.status === "Pending").length;
    const cancelled = state.orders.filter(
      (o) => o.status === "Cancelled",
    ).length;
    body.innerHTML = `
      <div class="stat-grid" style="grid-template-columns:1fr 1fr;">
        <div class="stat-card stat-blue"><div class="num">${state.orders.length}</div><div class="label">Total Orders</div></div>
        <div class="stat-card stat-green"><div class="num">${completed}</div><div class="label">Completed</div></div>
      </div>
      <div class="card-title">Status Breakdown</div>
      <div class="kv-row"><span class="k">Completed</span><span class="v">${completed}</span></div>
      <div class="kv-row"><span class="k">Pending / In Transit</span><span class="v">${pending + state.orders.filter((o) => o.status === "Out for Delivery" || o.status === "Ready for Pickup").length}</span></div>
      <div class="kv-row"><span class="k">Cancelled</span><span class="v">${cancelled}</span></div>
      <button class="btn btn-sage" style="margin-top:16px;" onclick="showToast('Report exported (simulated).','success')">Print as CSV/PDF</button>
    `;
  }

  if (tab === "credit") {
    const debtors = state.customers
      .filter((c) => c.creditBalance > 0)
      .sort((a, b) => b.creditBalance - a.creditBalance);
    const totalOutstanding = debtors.reduce((s, c) => s + c.creditBalance, 0);
    const totalPaid = deliveredOrders.reduce((s, o) => s + o.price, 0);
    const rate =
      totalOutstanding + totalPaid > 0
        ? Math.round((totalPaid / (totalOutstanding + totalPaid)) * 100)
        : 100;
    body.innerHTML = `
      <div class="stat-grid" style="grid-template-columns:1fr 1fr;">
        <div class="stat-card stat-pink"><div class="num">₱${totalOutstanding.toLocaleString()}</div><div class="label">Outstanding Credit</div></div>
        <div class="stat-card stat-green"><div class="num">${rate}%</div><div class="label">Collection Rate</div></div>
      </div>
      <div class="card-title">Top Debtors</div>
      ${
        debtors.length === 0
          ? emptyState("No outstanding balances.")
          : debtors
              .slice(0, 5)
              .map(
                (c) => `
        <div class="kv-row"><span class="k">${c.name}</span><span class="v">₱${c.creditBalance.toLocaleString()}</span></div>
      `,
              )
              .join("")
      }
      <button class="btn btn-sage" style="margin-top:16px;" onclick="showToast('Report exported (simulated).','success')">Print as CSV/PDF</button>
    `;
  }
}

// ADMIN: SETTINGS
function renderSettings(container) {
  container.innerHTML = `
    <div class="topbar"><h1>Settings</h1></div>
    <div class="content no-pad-bottom" style="flex:1;">
      <div class="tabbar" id="settingsTabbar">
        <button class="active" data-s="profile" onclick="switchSettingsTab('profile')">Profile</button>
        <button data-s="system" onclick="switchSettingsTab('system')">System</button>
        <button data-s="alerts" onclick="switchSettingsTab('alerts')">Alerts</button>
      </div>
      <div id="settingsBody"></div>
    </div>
  `;
  switchSettingsTab("profile");
}

function switchSettingsTab(tab) {
  document
    .querySelectorAll("#settingsTabbar button")
    .forEach((b) => b.classList.toggle("active", b.dataset.s === tab));
  const body = document.getElementById("settingsBody");

  if (tab === "profile") {
    body.innerHTML = `
      <div class="card">
        <div class="card-title">Admin Profile Info</div>
        <div class="field"><label>Admin Name</label><input type="text" value="Juan Dela Cruz (Lead Admin)"></div>
        <div class="field"><label>Email Address</label><input type="text" value="admin.juan@ricetrading.ph"></div>
        <div class="divider"></div>
        <div class="card-title" style="font-size:13px;">Change Password</div>
        <div class="field"><label>Current Password</label><input type="password" placeholder="••••••••"></div>
        <div class="field"><label>New Password</label><input type="password" placeholder="••••••••"></div>
        <div class="field"><label>Confirm New Password</label><input type="password" placeholder="••••••••"></div>
        <p style="font-size:10.5px; color:var(--muted); margin-bottom:14px;">Last Login: Sep 2, 2026 · 08:15 AM</p>
        <button class="btn btn-dark" onclick="showToast('Profile changes saved.','success')">Save Profile Changes</button>
      </div>
    `;
  }

  if (tab === "system") {
    body.innerHTML = `
      <div class="card">
        <div class="card-title">Business &amp; System Configuration</div>
        <div class="field"><label>Business Name</label><input type="text" value="Mavies Bugasan – Rice Trading"></div>
        <div class="field"><label>Business Address</label><input type="text" value="Public Market St, Brgy. Poblacion, Marikina City"></div>
        <div class="field"><label>Business Contact Number</label><input type="text" value="+63 917 123 4567"></div>
        <div class="field"><label>Currency Setting</label>
          <select><option>Philippine Peso (₱)</option><option>US Dollar ($)</option></select>
        </div>
        <div class="field"><label>Date Format</label>
          <select><option>MM/DD/YYYY (09/02/2026)</option><option>DD/MM/YYYY (02/09/2026)</option></select>
        </div>
        <div class="field"><label>Time Zone</label>
          <select><option>(GMT+08:00) Manila, Singapore, Beijing</option></select>
        </div>
        <button class="btn btn-dark" onclick="showToast('System settings saved.','success')">Save System Settings</button>
      </div>
    `;
  }

  if (tab === "alerts") {
    body.innerHTML = `
      <div class="card">
        <div class="card-title">Notification &amp; Alert Preferences</div>
        <div class="toggle-row">Email Notifications <div class="toggle on" onclick="this.classList.toggle('on')"></div></div>
        <div class="toggle-row">Low Stock Alerts <div class="toggle on" onclick="this.classList.toggle('on')"></div></div>
        <div class="toggle-row">Credit &amp; Payment Reminders <div class="toggle on" onclick="this.classList.toggle('on')"></div></div>
        <div class="field" style="margin-top:12px;">
          <label>Alert Frequency Settings</label>
          <select><option>Real-time (Instant)</option><option>Daily Digest</option><option>Weekly Digest</option></select>
        </div>
        <button class="btn btn-dark" onclick="showToast('Preferences saved.','success')">Save Preferences</button>
      </div>
    `;
  }
}

updateOrderSummary();

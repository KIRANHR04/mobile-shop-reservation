const apiBase = window.location.protocol === "file:"
  ? "http://127.0.0.1:8000"
  : window.location.origin;

const ADMIN_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
let adminIdleTimer;
localStorage.removeItem("adminToken");

const state = {
  products: [],
  reservations: [],
  adminToken: sessionStorage.getItem("adminToken") || "",
  editImages: [],
  isAdminPage: window.location.pathname.replace(/\/$/, "") === "/admin",
  imageIndexes: {},
};

const els = {
  views: document.querySelectorAll(".view"),
  productGrid: document.querySelector("#productGrid"),
  searchInput: document.querySelector("#searchInput"),
  categoryFilter: document.querySelector("#categoryFilter"),
  toast: document.querySelector("#toast"),
  reservationDialog: document.querySelector("#reservationDialog"),
  reservationForm: document.querySelector("#reservationForm"),
  closeReservationBtn: document.querySelector("#closeReservationBtn"),
  reserveProductId: document.querySelector("#reserveProductId"),
  reservationTitle: document.querySelector("#reservationTitle"),
  adminLoginPage: document.querySelector("#adminLoginPage"),
  adminDashboardPage: document.querySelector("#adminDashboardPage"),
  loginForm: document.querySelector("#loginForm"),
  logoutBtn: document.querySelector("#logoutBtn"),
  adminToken: document.querySelector("#adminToken"),
  dashboard: document.querySelector("#dashboard"),
  reservationPanel: document.querySelector("#reservationPanel"),
  newProductBtn: document.querySelector("#newProductBtn"),
  productForm: document.querySelector("#productForm"),
  adminProducts: document.querySelector("#adminProducts"),
  imageUrl: document.querySelector("#imageUrl"),
  addImageUrlBtn: document.querySelector("#addImageUrlBtn"),
  imageUpload: document.querySelector("#imageUpload"),
  imageList: document.querySelector("#imageList"),
  cancelProductBtn: document.querySelector("#cancelProductBtn"),
  reservationsList: document.querySelector("#reservationsList"),
  statusFilter: document.querySelector("#statusFilter"),
  shopLocation: document.querySelector("#shopLocation"),
};

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.style.background = isError ? "#b42318" : "#1d2527";
  els.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.add("hidden"), 3400);
}

async function request(path, options = {}) {
  const sentAdminAuth = Boolean(options.headers?.Authorization);
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((item) => item.msg).join(", ")
      : data.detail || "Request failed";
    if (sentAdminAuth && [401, 403].includes(response.status)) {
      endAdminSession(detail || "Admin session expired.");
    }
    throw new Error(detail);
  }
  return data;
}

function adminHeaders() {
  return { Authorization: `Bearer ${state.adminToken}` };
}

function saveAdminSession(token) {
  state.adminToken = token;
  sessionStorage.setItem("adminToken", token);
  touchAdminSession();
}

function clearAdminSession() {
  state.adminToken = "";
  sessionStorage.removeItem("adminToken");
  sessionStorage.removeItem("adminLastActivity");
  window.clearTimeout(adminIdleTimer);
}

function getAdminLastActivity() {
  return Number(sessionStorage.getItem("adminLastActivity") || 0);
}

function isAdminSessionFresh() {
  if (!state.adminToken) return false;
  const lastActivity = getAdminLastActivity();
  if (!lastActivity || Date.now() - lastActivity >= ADMIN_IDLE_TIMEOUT_MS) {
    endAdminSession("Logged out after 5 minutes of inactivity.");
    return false;
  }
  return true;
}

function scheduleAdminTimeout() {
  window.clearTimeout(adminIdleTimer);
  if (!state.adminToken) return;
  const remaining = Math.max(0, ADMIN_IDLE_TIMEOUT_MS - (Date.now() - getAdminLastActivity()));
  adminIdleTimer = window.setTimeout(() => {
    endAdminSession("Logged out after 5 minutes of inactivity.");
  }, remaining);
}

function touchAdminSession() {
  if (!state.adminToken) return;
  sessionStorage.setItem("adminLastActivity", String(Date.now()));
  scheduleAdminTimeout();
}

function endAdminSession(message = "Logged out.") {
  const wasLoggedIn = Boolean(state.adminToken);
  if (wasLoggedIn) {
    fetch(`${apiBase}/auth/logout`, {
      method: "POST",
      headers: adminHeaders(),
    }).catch(() => {});
  }
  clearAdminSession();
  els.loginForm?.reset();
  resetProductForm();
  setAdminVisible(false);
  if (wasLoggedIn && message) {
    showToast(message, message.toLowerCase().includes("expired"));
  }
}

function productImages(product) {
  return product.images?.length ? product.images : ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 480'%3E%3Crect width='640' height='480' fill='%23dde6e1'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2362706d' font-family='Arial' font-size='34'%3ENo image%3C/text%3E%3C/svg%3E"];
}

function productImage(product) {
  const images = productImages(product);
  const index = state.imageIndexes[product.id] || 0;
  return images[index] || images[0];
}

function productRating(product) {
  const base = 4.1 + ((product.id || 1) % 7) / 10;
  return Math.min(base, 4.8).toFixed(1);
}

function discountPercent(product) {
  return Math.max(0, Math.min(Number(product.discount_percent || 0), 90));
}

function discountedPrice(product) {
  const discount = discountPercent(product);
  return Math.round(Number(product.price || 0) * (100 - discount) / 100);
}

function renderPrice(product) {
  const discount = discountPercent(product);
  if (!discount) {
    return `<span class="current-price">${money(product.price)}</span>`;
  }

  return `
    <span class="price-stack">
      <span class="old-price">${money(product.price)}</span>
      <span class="current-price">${money(discountedPrice(product))}</span>
    </span>
    <span class="discount-badge">${discount}% OFF</span>
  `;
}

function productSpecs(product) {
  return [
    product.model && `Model: ${product.model}`,
    product.storage && `Storage: ${product.storage}`,
    product.ram && `RAM: ${product.ram}`,
    product.camera && `Camera: ${product.camera}`,
    product.processor && product.processor,
    product.battery && `Battery: ${product.battery}`,
  ].filter(Boolean);
}

function renderCategories() {
  const current = els.categoryFilter.value;
  const categories = [...new Set(state.products.map((product) => product.category).filter(Boolean))].sort();
  els.categoryFilter.innerHTML = `<option value="">All categories</option>${categories.map((category) => `<option value="${category}">${category}</option>`).join("")}`;
  els.categoryFilter.value = categories.includes(current) ? current : "";
}

function filteredProducts() {
  const search = els.searchInput.value.trim().toLowerCase();
  const category = els.categoryFilter.value;
  return state.products.filter((product) => {
    const haystack = `${product.name} ${product.brand} ${product.category}`.toLowerCase();
    return (!search || haystack.includes(search)) && (!category || product.category === category);
  });
}

function renderProducts() {
  const products = filteredProducts();
  els.productGrid.innerHTML = products.length
    ? products.map((product) => {
      const images = productImages(product);
      const imageIndex = state.imageIndexes[product.id] || 0;
      return `
      <article class="product-card">
        <div class="product-media">
          <span class="product-chip">${product.category || "Mobile"}</span>
          <img src="${productImage(product)}" alt="${product.name}" />
          ${images.length > 1 ? `
            <button class="image-arrow image-prev" type="button" data-image-step="-1" data-product-id="${product.id}" aria-label="Previous image">&lt;</button>
            <button class="image-arrow image-next" type="button" data-image-step="1" data-product-id="${product.id}" aria-label="Next image">&gt;</button>
            <div class="image-dots" aria-label="Product images">
              ${images.map((_, index) => `<span class="${index === imageIndex ? "active" : ""}"></span>`).join("")}
            </div>
          ` : ""}
        </div>
        <div class="product-body">
          <div>
            <h2>${product.name}</h2>
            <p class="meta">${product.brand || "Brand"} &middot; ${product.category || "Phone"}</p>
          </div>
          <div class="rating-line">
            <span class="stars">Top rated</span>
            <span>${productRating(product)} rating</span>
          </div>
          <div class="price-line">
            ${renderPrice(product)}
            <span class="badge ${product.stock > 0 ? "" : "waiting"}">${product.stock > 0 ? `${product.stock} in stock` : "Waiting list"}</span>
          </div>
          <div class="product-perks">
            ${productSpecs(product).slice(0, 4).map((spec) => `<span>${spec}</span>`).join("")}
            ${product.other_details ? `<span>${product.other_details}</span>` : ""}
            <span>Store pickup</span>
          </div>
          <button data-reserve="${product.id}">${product.stock > 0 ? "Reserve Now" : "Join Waiting List"}</button>
        </div>
      </article>
    `;
    }).join("")
    : `<div class="empty">No products found.</div>`;
}

function renderAdminProducts() {
  els.adminProducts.innerHTML = state.products.length
    ? state.products.map((product) => `
      <article class="admin-product">
        <img src="${productImage(product)}" alt="${product.name}" />
        <div>
          <strong>${product.name}</strong>
          <p class="meta">${product.brand} &middot; ${product.category} &middot; ${money(discountedPrice(product))} ${discountPercent(product) ? `(${discountPercent(product)}% off)` : ""} &middot; Stock ${product.stock}</p>
          <p class="meta">${productSpecs(product).join(" &middot; ") || product.other_details || "No specs added"}</p>
        </div>
        <div class="row-actions">
          <button class="secondary" data-edit="${product.id}">Edit</button>
          <button class="danger" data-delete="${product.id}">Delete</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty">No products yet.</div>`;
}

function renderImageList() {
  els.imageList.innerHTML = state.editImages.map((image, index) => `
    <span class="image-chip">
      <span>${image}</span>
      <button type="button" aria-label="Remove image" data-remove-image="${index}">x</button>
    </span>
  `).join("");
}

function renderReservations() {
  const status = els.statusFilter.value;
  const rows = state.reservations.filter((reservation) => !status || reservation.status === status);
  els.reservationsList.innerHTML = rows.length
    ? rows.map((reservation) => {
      const product = state.products.find((item) => item.id === reservation.product_id);
      const canReserved = reservation.status === "Reserved";
      const canCancel = ["Reserved", "Waiting"].includes(reservation.status);
      return `
        <article class="reservation-row">
          <div class="reservation-person">
            <strong>#${reservation.id} &middot; ${reservation.customer_name}</strong>
            <p class="meta">${product?.name || `Product ${reservation.product_id}`}</p>
            <span class="status-pill status-${reservation.status.toLowerCase()}">${reservation.status}</span>
          </div>
          <div class="reservation-contact">
            <span>${reservation.phone}</span>
            <span>${reservation.email}</span>
            <span>Pickup: ${reservation.pickup_date}</span>
          </div>
          <div class="row-actions">
            <button class="secondary" data-collect="${reservation.id}" ${canReserved ? "" : "disabled"}>Collect</button>
            <button class="danger" data-cancel-reservation="${reservation.id}" ${canCancel ? "" : "disabled"}>Cancel Request</button>
          </div>
        </article>
      `;
    }).join("")
    : `<div class="empty">No reservations in this view.</div>`;
}

async function loadProducts() {
  state.products = await request("/products/");
  renderCategories();
  renderProducts();
  renderAdminProducts();
}

async function loadReservations() {
  if (!isAdminSessionFresh()) return;
  state.reservations = await request("/reservations/", {
    headers: adminHeaders(),
  });
  renderReservations();
}

function setAdminVisible(visible) {
  els.adminLoginPage.classList.toggle("hidden", visible);
  els.adminDashboardPage.classList.toggle("hidden", !visible);
}

function openReservation(productId) {
  const product = state.products.find((item) => item.id === productId);
  els.reserveProductId.value = productId;
  els.reservationTitle.textContent = `Reserve ${product?.name || "phone"}`;
  els.reservationForm.reset();
  els.reserveProductId.value = productId;
  els.reservationDialog.showModal();
}

function resetProductForm() {
  document.querySelector("#productId").value = "";
  els.productForm.reset();
  state.editImages = [];
  renderImageList();
  els.productForm.classList.add("hidden");
}

function editProduct(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  document.querySelector("#productId").value = product.id;
  document.querySelector("#productName").value = product.name;
  document.querySelector("#brand").value = product.brand;
  document.querySelector("#category").value = product.category;
  document.querySelector("#price").value = product.price;
  document.querySelector("#discountPercent").value = product.discount_percent || 0;
  document.querySelector("#stock").value = product.stock;
  document.querySelector("#model").value = product.model || "";
  document.querySelector("#storage").value = product.storage || "";
  document.querySelector("#ram").value = product.ram || "";
  document.querySelector("#camera").value = product.camera || "";
  document.querySelector("#processor").value = product.processor || "";
  document.querySelector("#battery").value = product.battery || "";
  document.querySelector("#otherDetails").value = product.other_details || "";
  state.editImages = [...(product.images || [])];
  renderImageList();
  els.productForm.classList.remove("hidden");
}

async function saveProduct(event) {
  event.preventDefault();
  if (!isAdminSessionFresh()) return;
  if (state.editImages.length < 3) {
    showToast("Add at least 3 product images.", true);
    return;
  }
  const id = document.querySelector("#productId").value;
  const payload = {
    name: document.querySelector("#productName").value.trim(),
    brand: document.querySelector("#brand").value.trim(),
    category: document.querySelector("#category").value.trim(),
    price: Number(document.querySelector("#price").value),
    discount_percent: Number(document.querySelector("#discountPercent").value || 0),
    stock: Number(document.querySelector("#stock").value),
    model: document.querySelector("#model").value.trim(),
    storage: document.querySelector("#storage").value.trim(),
    ram: document.querySelector("#ram").value.trim(),
    camera: document.querySelector("#camera").value.trim(),
    processor: document.querySelector("#processor").value.trim(),
    battery: document.querySelector("#battery").value.trim(),
    other_details: document.querySelector("#otherDetails").value.trim(),
    images: state.editImages,
  };
  await request(id ? `/products/${id}` : "/products/", {
    method: id ? "PUT" : "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  showToast(id ? "Product updated." : "Product added.");
  resetProductForm();
  await loadProducts();
}

async function uploadImage(file) {
  if (!isAdminSessionFresh()) return;
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${apiBase}/upload/images`, {
    method: "POST",
    headers: adminHeaders(),
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) {
    if ([401, 403].includes(response.status)) {
      endAdminSession(data.detail || "Admin session expired.");
    }
    throw new Error(data.detail || "Upload failed");
  }
  state.editImages.push(data.image);
  renderImageList();
}

function applyPageMode() {
  document.body.classList.toggle("admin-page", state.isAdminPage);
  document.body.classList.toggle("shop-page", !state.isAdminPage);
  document.querySelector("#shopView").classList.toggle("active", !state.isAdminPage);
  document.querySelector("#adminView").classList.toggle("active", state.isAdminPage);
}

els.searchInput.addEventListener("input", renderProducts);
els.categoryFilter.addEventListener("change", renderProducts);

els.productGrid.addEventListener("click", (event) => {
  const arrow = event.target.closest("[data-image-step]");
  if (arrow) {
    const productId = Number(arrow.dataset.productId);
    const product = state.products.find((item) => item.id === productId);
    const images = productImages(product);
    const current = state.imageIndexes[productId] || 0;
    const next = (current + Number(arrow.dataset.imageStep) + images.length) % images.length;
    state.imageIndexes[productId] = next;
    renderProducts();
    return;
  }

  const button = event.target.closest("[data-reserve]");
  if (button) openReservation(Number(button.dataset.reserve));
});

els.closeReservationBtn.addEventListener("click", () => els.reservationDialog.close());

els.reservationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    product_id: Number(els.reserveProductId.value),
    customer_name: document.querySelector("#customerName").value.trim(),
    phone: document.querySelector("#phone").value.trim(),
    email: document.querySelector("#email").value.trim(),
    address: document.querySelector("#address").value.trim(),
    pickup_date: document.querySelector("#pickupDate").value,
  };
  try {
    const reservation = await request("/reservations/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    els.reservationDialog.close();
    showToast(reservation.status === "Reserved" ? "Your reservation is confirmed." : "You have been added to the waiting list.");
    await loadProducts();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const login = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.querySelector("#adminEmail").value.trim(),
        password: document.querySelector("#adminPassword").value,
        admin_token: els.adminToken.value.trim(),
      }),
    });
    saveAdminSession(login.access_token);
    els.adminToken.value = "";
    setAdminVisible(true);
    await Promise.all([loadProducts(), loadReservations()]);
    showToast("Dashboard unlocked.");
  } catch (error) {
    showToast(error.message, true);
  }
});

els.logoutBtn.addEventListener("click", () => {
  endAdminSession("Logged out.");
});

els.newProductBtn.addEventListener("click", () => {
  resetProductForm();
  els.productForm.classList.remove("hidden");
});

els.cancelProductBtn.addEventListener("click", resetProductForm);
els.productForm.addEventListener("submit", (event) => saveProduct(event).catch((error) => showToast(error.message, true)));

els.addImageUrlBtn.addEventListener("click", () => {
  const url = els.imageUrl.value.trim();
  if (!url) return;
  state.editImages.push(url);
  els.imageUrl.value = "";
  renderImageList();
});

els.imageUpload.addEventListener("change", async () => {
  const file = els.imageUpload.files?.[0];
  if (!file) return;
  try {
    await uploadImage(file);
    els.imageUpload.value = "";
    showToast("Image uploaded.");
  } catch (error) {
    showToast(error.message, true);
  }
});

els.imageList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-image]");
  if (!button) return;
  state.editImages.splice(Number(button.dataset.removeImage), 1);
  renderImageList();
});

els.adminProducts.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit]");
  const del = event.target.closest("[data-delete]");
  if (edit) editProduct(Number(edit.dataset.edit));
  if (del && confirm("Delete this product?")) {
    if (!isAdminSessionFresh()) return;
    try {
      await request(`/products/${del.dataset.delete}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      showToast("Product deleted.");
      await loadProducts();
    } catch (error) {
      showToast(error.message, true);
    }
  }
});

els.statusFilter.addEventListener("change", renderReservations);

els.reservationsList.addEventListener("click", async (event) => {
  const collect = event.target.closest("[data-collect]");
  const cancel = event.target.closest("[data-cancel-reservation]");
  const action = collect ? "collect" : cancel ? "cancel" : "";
  const id = collect?.dataset.collect || cancel?.dataset.cancelReservation;
  if (!action || !id) return;
  if (!isAdminSessionFresh()) return;
  try {
    await request(`/reservations/${id}/${action}`, {
      method: "PUT",
      headers: adminHeaders(),
    });
    showToast(action === "collect" ? "Marked as collected." : "Reservation cancelled.");
    await Promise.all([loadProducts(), loadReservations()]);
  } catch (error) {
    showToast(error.message, true);
  }
});

["click", "keydown", "input", "scroll", "touchstart", "mousemove"].forEach((eventName) => {
  window.addEventListener(eventName, () => {
    if (state.isAdminPage && state.adminToken && !els.adminDashboardPage.classList.contains("hidden")) {
      touchAdminSession();
    }
  }, { passive: true });
});

window.addEventListener("focus", () => {
  if (state.isAdminPage && state.adminToken) {
    isAdminSessionFresh();
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.isAdminPage && state.adminToken) {
    isAdminSessionFresh();
  }
});

applyPageMode();
const hasFreshAdminSession = state.isAdminPage && isAdminSessionFresh();
setAdminVisible(hasFreshAdminSession);
loadProducts().catch((error) => showToast(error.message, true));
if (hasFreshAdminSession) {
  scheduleAdminTimeout();
  loadReservations().catch((error) => showToast(error.message, true));
}

window.setInterval(() => {
  loadProducts().catch(() => {});
}, 8000);

window.setInterval(() => {
  if (state.isAdminPage && state.adminToken && isAdminSessionFresh()) {
    loadReservations().catch(() => {});
  }
}, 8000);

if (els.shopLocation) {
  const locationObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        els.shopLocation.classList.add("is-moving");
      }
    });
  }, { threshold: 0.35 });

  locationObserver.observe(els.shopLocation);
}

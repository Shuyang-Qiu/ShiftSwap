
let availableShifts = [];
let requests = [];
let adminShifts = [];
let myShifts = [];
let openRequests = [];

let notifications = [
  { id: 1, text: "Jordan requested a shift swap for Feb 26 6:00–8:00 PM.", read: false, time: "2 hrs ago" },
  { id: 2, text: "Your shift on Feb 27 has been confirmed.", read: false, time: "1 day ago" },
  { id: 3, text: "Linh's swap request was approved.", read: true, time: "2 days ago" },
];

let currentPage = "dashboard";
let searchQuery = "";
let editingShiftId = null;
let currentWeekStart = getStartOfWeek(new Date());

let demoTodos = [];
let currentTodoFilter = "all";

// ===== Auth State =====
let currentUser = null;
let authToken = null;
let isAdmin = false;
const API_BASE = 'http://localhost:3000';

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}`;
}

function fmtDateFull(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // Sun=0 ... Sat=6
  const diff = day === 0 ? -6 : 1 - day; // make Monday the first day
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatWeekdayLabel(date) {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function formatMonthDay(date) {
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
}

function formatRangeLabel(startDate) {
  const endDate = addDays(startDate, 6);
  const startText = startDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
  const endText = endDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  return `${startText} – ${endText}`;
}

function isSameDate(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function pillForStatus(status) {
  const s = status.toLowerCase();
  if (s.includes("open")) return "pill ok";
  if (s.includes("pending")) return "pill wait";
  return "pill";
}

function requestStatusLabel(status) {
  switch ((status || "").toLowerCase()) {
    case "open":
      return "Waiting for volunteer";
    case "waiting_response":
      return "Waiting for recipient";
    case "pending_admin":
      return "Pending admin approval";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    default:
      return status || "Unknown";
  }
}

function highlight(text, query) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), "<mark>$1</mark>");
}

function matchesQuery(fields, q) {
  if (!q) return true;
  const lower = q.toLowerCase();
  return fields.some((f) => f && f.toLowerCase().includes(lower));
}

function showToast(msg, type = "ok") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show " + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3000);
}

// ===== Render Functions =====
function renderDashboard() {
  const host = $("#dashList");
  const empty = $("#dashEmpty");
  const header = $("#page-dashboard .tableHeader");

  if (!host || !empty || !header) return;

  host.innerHTML = "";
  const q = searchQuery;

  if (isAdmin) {
    header.className = "tableHeader fourCol";
    header.innerHTML = `
      <div>Employee</div>
      <div>Date</div>
      <div>Time</div>
      <div>Status</div>
    `;

    const filtered = adminShifts.filter((item) =>
      matchesQuery(
        [item.employee_name || "", fmtDate(item.date), item.date, item.time, item.status],
        q
      )
    );

    if (filtered.length === 0) {
      empty.style.display = "";
      empty.textContent = "No assigned shifts found.";
      return;
    }

    empty.style.display = "none";

    filtered.forEach((item) => {
      const row = document.createElement("div");
      row.className = "row fourCol";
      row.innerHTML = `
        <div>${highlight(item.employee_name || "Unassigned", q)}</div>
        <div>${highlight(fmtDate(item.date), q)}</div>
        <div>${highlight(item.time, q)}</div>
        <div><span class="pill ok">Assigned</span></div>
      `;
      host.appendChild(row);
    });

} else {
  header.className = "tableHeader fourCol";
  header.innerHTML = `
    <div>Type</div>
    <div>Date</div>
    <div>Time</div>
    <div>Action</div>
  `;

  const combined = [
    ...availableShifts.map((item) => ({
      source: "available_shift",
      id: item.id,
      date: item.date,
      time: item.time,
      status: item.status,
      label: "Open Shift"
    })),
    ...openRequests.map((item) => ({
      source: "open_request",
      id: item.id,
      date: item.date,
      time: item.time,
      status: item.status,
      sender_name: item.sender_name,
      label: `Request from ${item.sender_name || "Employee"}`
    }))
  ];

  const filtered = combined.filter((item) =>
    matchesQuery(
      [
        item.label || "",
        item.sender_name || "",
        fmtDate(item.date),
        item.date,
        item.time,
        item.status || ""
      ],
      q
    )
  );

  if (filtered.length === 0) {
    empty.style.display = "";
    empty.textContent = "No available shifts or requests found.";
    return;
  }

  empty.style.display = "none";

  filtered.forEach((item) => {
    const row = document.createElement("div");
    row.className = "row fourCol";
    row.innerHTML = `
      <div>${highlight(item.label, q)}</div>
      <div>${highlight(fmtDate(item.date), q)}</div>
      <div>${highlight(item.time, q)}</div>
      <div class="actionGroup">
        <button class="actionBtn accept" data-source="${item.source}" data-id="${item.id}">
          Accept
        </button>
      </div>
    `;
    host.appendChild(row);
  });

  host.querySelectorAll(".actionBtn.accept").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const source = btn.dataset.source;

      if (source === "open_request") {
        claimOpenRequest(id);
      } else if (source === "available_shift") {
        applyAvailableShift(id);
      }
    });
  });
}
}

function renderRequests() {
  const host = $("#reqList");
  const empty = $("#reqEmpty");
  if (!host || !empty) return;

  host.innerHTML = "";
  const q = searchQuery;

  const filtered =requests.filter((item) =>
    matchesQuery(
      [
        item.sender_name || "",
        item.receiver_name || "",
        item.candidate_name || "",
        fmtDate(item.date || ""),
        item.date || "",
        item.time || "",
        item.status || "",
        item.request_type || ""
      ],
      q
    )
  );

  if (filtered.length === 0) {
    empty.style.display = "";
    empty.textContent = "No requests found.";
    return;
  }

  empty.style.display = "none";

  filtered.forEach((item) => {
    const row = document.createElement("div");
    row.className = "row fourCol";

    const roleText =
      item.request_type === "anyone"
        ? "Anyone"
        : (item.receiver_name || "Specific Person");

    const statusText = requestStatusLabel(item.status);

    const canCancel =
    (item.is_sender &&
      (item.status === "open" || item.status === "waiting_response")) ||
    (item.is_candidate && item.status === "pending_admin");
    const canAdminReview =
      isAdmin && item.status === "pending_admin";

    let statusHtml = "";

    if (item.status === "approved") {
      statusHtml = `<span class="pill ok">${statusText}</span>`;
    } else if (item.status === "rejected" || item.status === "cancelled") {
      statusHtml = `<span class="pill bad">${statusText}</span>`;
    } else {
      statusHtml = `<span class="pill wait">${statusText}</span>`;
    }

    row.innerHTML = `
      <div>${highlight(fmtDate(item.date || ""), q)}</div>
      <div>${highlight(item.time || "", q)}</div>
      <div>
        <div>${highlight(roleText, q)}</div>
        ${
          item.candidate_name
            ? `<div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Candidate: ${highlight(item.candidate_name, q)}</div>`
            : ""
        }
      </div>
      <div class="actionGroup">
        ${statusHtml}
        ${
          canCancel
            ? `<button class="actionBtn danger" data-cancel-id="${item.id}">Cancel</button>`
            : ""
        }
        ${
          canAdminReview
            ? `
              <button class="actionBtn accept" data-approve-id="${item.id}">Approve</button>
              <button class="actionBtn decline" data-reject-id="${item.id}">Reject</button>
            `
            : ""
        }
      </div>
    `;

    host.appendChild(row);
  });

  host.querySelectorAll("[data-cancel-id]").forEach((btn) => {
    btn.addEventListener("click", () => cancelRequestNew(Number(btn.dataset.cancelId)));
  });

  host.querySelectorAll("[data-approve-id]").forEach((btn) => {
  btn.addEventListener("click", () => adminDecision(Number(btn.dataset.approveId), "approve"));
});

host.querySelectorAll("[data-reject-id]").forEach((btn) => {
  btn.addEventListener("click", () => adminDecision(Number(btn.dataset.rejectId), "reject"));
});
}

window.cancelRequestNew = async function (id) {
  try {
    const res = await fetch(`${API_BASE}/requests/${id}/cancel`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${authToken}`
      }
    });

    const data = await res.json();

    if (res.ok) {
      showToast("Request cancelled.");
      await fetchRequests();
      await fetchOpenRequests();
    } else {
      showToast(data.error || "Failed to cancel request", "warn");
    }
  } catch (e) {
    console.error(e);
    showToast("Network error", "warn");
  }
};

window.claimOpenRequest = async function (id) {
  try {
    const res = await fetch(`${API_BASE}/requests/${id}/claim`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const data = await res.json();

    if (res.ok) {
      showToast("Claimed. Waiting for admin approval.");
      await fetchOpenRequests();
      await fetchRequests();
    } else {
      showToast(data.error || "Failed to claim request", "warn");
    }
  } catch (e) {
    console.error(e);
    showToast("Network error", "warn");
  }
};

window.applyAvailableShift = async function (id) {
  try {
    const res = await fetch(`${API_BASE}/shifts/${id}/apply`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${authToken}`
      }
    });

    const data = await res.json();

    if (res.ok) {
      showToast("Applied. Waiting for admin approval.");
      await fetchAvailableShifts();
      await fetchRequests();
      await fetchOpenRequests();
    } else {
      showToast(data.error || "Failed to apply for shift", "warn");
    }
  } catch (e) {
    console.error(e);
    showToast("Network error", "warn");
  }
};

window.adminDecision = async function (id, action) {
  try {
    const res = await fetch(`${API_BASE}/requests/${id}/admin-decision`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`
      },
      body: JSON.stringify({ action })
    });

    const data = await res.json();

  if (res.ok) {
    showToast(action === "approve" ? "Request approved." : "Request rejected.");

    await fetchRequests();
    await fetchAdminShifts();
    await fetchMyShifts();
    await fetchOpenRequests();
  } else {
        showToast(data.error || "Action failed", "warn");
      }
    } catch (e) {
      console.error(e);
      showToast("Network error", "warn");
    }
  };

function renderMyShifts() {
  const host = $("#myList");
  const empty = $("#myEmpty");
  if (!host || !empty) return;

  host.innerHTML = "";
  const q = searchQuery;

  const filtered = myShifts.filter((item) =>
    matchesQuery([fmtDate(item.date), item.date, item.time, item.status || ""], q)
  );

  if (filtered.length === 0) {
    empty.style.display = "";
    return;
  }

  empty.style.display = "none";

  filtered.forEach((item) => {
    const locked = item.status === "locked";

    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div>${highlight(fmtDate(item.date), q)}</div>
      <div>${highlight(item.time, q)}</div>
      <div style="justify-self:end;">
        ${
          locked
            ? `<span class="pill bad">Locked</span>`
            : `<button class="actionBtn edit" data-id="${item.id}">✏ Edit</button>`
        }
      </div>
    `;
    host.appendChild(row);
  });

  host.querySelectorAll(".actionBtn.edit").forEach((btn) => {
    btn.addEventListener("click", () => openEditShift(Number(btn.dataset.id)));
  });
}

function renderTodos() {
  const host = $("#todoList");
  const empty = $("#todoEmpty");
  if (!host || !empty) return;

  host.innerHTML = "";
  const q = searchQuery;

  const filtered = demoTodos.filter((item) => {
    const matchesTxt = matchesQuery([item.text], q);
    let matchesStatus = true;
    if (currentTodoFilter === "active") {
      matchesStatus =
        !item.completed ||
        (item.request_status && item.request_status === "waiting_response");
    }

    if (currentTodoFilter === "completed") {
      matchesStatus =
        item.completed &&
        (!item.request_status || item.request_status !== "waiting_response");
    }
    return matchesTxt && matchesStatus;
  });

  if (filtered.length === 0) {
    empty.style.display = "flex";
    return;
  }

  empty.style.display = "none";

  filtered.forEach((item) => {
    const isRequestTodo = !!item.request_id;
    const requestStatus = item.request_status || "";

    let statusHtml = `
      <span class="${item.completed ? 'pill ok' : 'pill wait'}">
        ${item.completed ? 'Completed' : 'Active'}
      </span>
    `;

    let actionHtml = `
      <button class="actionBtn ${item.completed ? 'edit' : 'accept'}" onclick="toggleTodo(${item.id})">
        ${item.completed ? '↺ Undo' : '✓ Done'}
      </button>
      <button class="actionBtn danger" onclick="deleteTodo(${item.id})">✕ Delete</button>
    `;

    if (isRequestTodo) {
      if (requestStatus === "waiting_response") {
        statusHtml = `<span class="pill wait">Waiting for response</span>`;
        actionHtml = `
          <button class="actionBtn accept" data-accept="${item.request_id}">Accept</button>
          <button class="actionBtn decline" data-reject="${item.request_id}">Reject</button>
        `;
      } else if (requestStatus === "pending_admin") {
        statusHtml = `<span class="pill wait">Pending admin approval</span>`;
        actionHtml = ``;
      } else if (requestStatus === "rejected") {
        statusHtml = `<span class="pill bad">Rejected</span>`;
        actionHtml = ``;
      } else if (requestStatus === "approved") {
        statusHtml = `<span class="pill ok">Approved</span>`;
        actionHtml = ``;
      } else if (requestStatus === "cancelled") {
        statusHtml = `<span class="pill bad">Cancelled</span>`;
        actionHtml = ``;
      }
    }

    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        ${highlight(item.text, q)}
      </div>
      <div>${statusHtml}</div>
      <div class="actionGroup">
        ${actionHtml}
      </div>
    `;

    host.appendChild(row);
  });

  host.querySelectorAll("[data-accept]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const requestId = btn.dataset.accept;

      try {
        const res = await fetch(`${API_BASE}/requests/${requestId}/respond`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`
          },
          body: JSON.stringify({ action: "accept" })
        });

        const data = await res.json();

        if (res.ok) {
          showToast("Accepted. Waiting for admin approval.");
          await fetchTodos();
          await fetchRequests();
        } else {
          showToast(data.error || "Failed to accept", "warn");
        }
      } catch (e) {
        showToast("Network error", "warn");
      }
    });
  });

  host.querySelectorAll("[data-reject]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const requestId = btn.dataset.reject;

      try {
        const res = await fetch(`${API_BASE}/requests/${requestId}/respond`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`
          },
          body: JSON.stringify({ action: "reject" })
        });

        const data = await res.json();

        if (res.ok) {
          showToast("Request rejected.");
          await fetchTodos();
          await fetchRequests();
        } else {
          showToast(data.error || "Failed to reject", "warn");
        }
      } catch (e) {
        showToast("Network error", "warn");
      }
    });
  });
}

function renderAvailableShifts() {
  const host = $("#availableShiftList");
  const empty = $("#availableShiftEmpty");
  if (!host || !empty) return;

  host.innerHTML = "";
  const q = searchQuery;

  const filtered = availableShifts.filter((item) =>
    matchesQuery([fmtDate(item.date), item.date, item.time, item.status], q)
  );

  if (filtered.length === 0) {
    empty.style.display = "";
    return;
  }

  empty.style.display = "none";

  filtered.forEach((item) => {
    const row = document.createElement("div");
    row.className = "row fourCol";
    row.innerHTML = `
      <div>${highlight(fmtDate(item.date), q)}</div>
      <div>${highlight(item.time, q)}</div>
      <div><span class="pill wait">Available</span></div>
      <div class="actionGroup">
        ${isAdmin ? "" : `<button class="actionBtn accept" data-id="${item.id}">Apply</button>`}
      </div>
    `;
    host.appendChild(row);
  });

  if (!isAdmin) {
    host.querySelectorAll(".actionBtn.accept").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyAvailableShift(Number(btn.dataset.id));
      });
    });
  }
}

function renderWeekCalendar() {
  const host = $("#weekCalendarGrid");
  const rangeLabel = $("#calendarRangeLabel");
  if (!host) return;

  const weekStart = getStartOfWeek(currentWeekStart);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  host.innerHTML = "";

  if (rangeLabel) {
    rangeLabel.textContent = formatRangeLabel(weekStart);
  }

  weekDates.forEach((dateObj) => {
    const dayName = formatWeekdayLabel(dateObj);
    const dayDate = formatMonthDay(dateObj);

    const card = document.createElement("div");
    card.className = "weekDayCard emptyDay";
    card.innerHTML = `
      <div class="weekDayTitle">
        ${dayName}
        <div class="weekDayDate">${dayDate}</div>
      </div>
      <div class="weekDayList"></div>
    `;
    host.appendChild(card);
  });

  const dayLists = host.querySelectorAll(".weekDayList");
  const cards = host.querySelectorAll(".weekDayCard");

  adminShifts.forEach((shift) => {
    const shiftDate = new Date(shift.date + "T00:00:00");

    const dayIndex = weekDates.findIndex((d) => isSameDate(d, shiftDate));
    if (dayIndex === -1) return;

    const item = document.createElement("div");
    item.className = "weekShiftItem";
    item.innerHTML = `
      <strong>${shift.employee_name || "Unassigned"}</strong>
      <span>${fmtDateFull(shift.date)}</span>
      <span>${shift.time}</span>
    `;

    if (dayLists[dayIndex]) {
      dayLists[dayIndex].appendChild(item);
      cards[dayIndex].classList.remove("emptyDay");
    }
  });
}

window.toggleTodo = async function (id) {
  const item = demoTodos.find(t => t.id === id);
  if (!item) return;

  try {
    const res = await fetch(`${API_BASE}/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ completed: !item.completed })
    });
    if (res.ok) {
      fetchTodos();
      showToast(!item.completed ? "Task completed!" : "Task marked active.");
    }
  } catch (e) {
    showToast('Failed to update task', 'warn');
  }
};

window.deleteTodo = async function (id) {
  try {
    await fetch(`${API_BASE}/todos/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}` } });
  } catch (e) { }
  demoTodos = demoTodos.filter((t) => t.id !== id);
  renderTodos();
  showToast("Task deleted.", "warn");
};

function openEditShift(id) {
  const item = myShifts.find((s) => s.id === id);
  if (!item) return;

  editingShiftId = id;
  $("#modalEditTitle").textContent = "Edit Shift — " + fmtDateFull(item.date);

  $("#editShiftDate").value = item.date;

  const timeParts = item.time.split("–");
  $("#editShiftStart").value = parseTimeTo24(timeParts[0]?.trim() || "");
  $("#editShiftEnd").value = parseTimeTo24(timeParts[1]?.trim() || "");

  openOverlay("overlayEditShift");
}

function parseTimeTo24(str) {
  // e.g. "6:00 PM" -> "18:00", "10:00 AM" -> "10:00"
  const m = str.match(/^(\d+):(\d+)\s*(AM|PM)?$/i);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const min = m[2];
  const period = (m[3] || "").toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

function fmt24ToDisplay(t) {
  // "18:00" -> "6:00 PM"
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${period}`;
}

// ===== Notifications =====
function updateBellDot() {
  const unread = notifications.filter((n) => !n.read).length;
  const dot = $("#bellDot");
  dot.style.display = unread > 0 ? "" : "none";
}

function renderNotifications() {
  const host = $("#notifList");
  host.innerHTML = "";
  if (notifications.length === 0) {
    host.innerHTML = '<div class="emptyState">No notifications.</div>';
    return;
  }
  notifications.forEach((n) => {
    const div = document.createElement("div");
    div.className = "notifItem" + (n.read ? " read" : "");
    div.innerHTML = `
      <div class="notifText">${n.text}</div>
      <div class="notifTime">${n.time}</div>
    `;
    div.addEventListener("click", () => {
      n.read = true;
      updateBellDot();
      renderNotifications();
    });
    host.appendChild(div);
  });
}

// ===== Search =====
function doSearch() {
  const q = $("#searchInput").value.trim();
  searchQuery = q;
  const banner = $("#searchBanner");
  if (q) {
    banner.style.display = "flex";
    $("#searchBannerText").textContent = `Search results for: "${q}"`;
  } else {
    banner.style.display = "none";
  }
  renderCurrent();
}

function renderCurrent() {
  if (currentPage === "dashboard") renderDashboard();
  else if (currentPage === "request") renderRequests();
  else if (currentPage === "myshift") renderMyShifts();
  else if (currentPage === "todo") renderTodos();
  else if (currentPage === "available") renderAvailableShifts();
}

// ===== Page Nav =====
function setPage(page) {
  currentPage = page;
  $$(".navItem").forEach((n) =>
    n.classList.toggle("active", n.dataset.page === page)
  );
  $("#page-dashboard").style.display = page === "dashboard" ? "" : "none";
  $("#page-request").style.display = page === "request" ? "" : "none";
  $("#page-myshift").style.display = page === "myshift" ? "" : "none";
  $("#page-todo").style.display = page === "todo" ? "flex" : "none";
  $("#page-available").style.display = page === "available" ? "" : "none";
  $("#page-setting").style.display = page === "setting" ? "" : "none";

const titleMap = {
  dashboard: ["Dashboard", "Available Shifts"],
  request: ["Request", "Coverage Requests"],
  myshift: ["My Shift", "Your Schedule"],
  todo: ["To Do List", "Manage Your Tasks"],
  available: ["Available Shifts", "Unassigned Shifts"],
  setting: ["Setting", "Preferences"],
};
  $("#pageTitle").textContent = titleMap[page][0];
  $("#pageBadge").textContent = titleMap[page][1];

const pageBadge = $("#pageBadge");
const adminAddBtn = $("#adminAddBtn");
const adminViewBtn = $("#adminViewBtn");

if (isAdmin && page === "dashboard") {
  if (pageBadge) pageBadge.style.display = "none";
  if (adminAddBtn) {
    adminAddBtn.style.display = "";
    adminAddBtn.textContent = "Add Assigned Shift";
  }
  if (adminViewBtn) adminViewBtn.style.display = "";
} else if (isAdmin && page === "available") {
  if (pageBadge) pageBadge.style.display = "none";

  if (adminAddBtn) {
    adminAddBtn.style.display = "";
    adminAddBtn.textContent = "Add Available Shift";
  }

  if (adminViewBtn) adminViewBtn.style.display = "none";
} else {
  if (pageBadge) pageBadge.style.display = "";
  if (adminAddBtn) adminAddBtn.style.display = "none";
  if (adminViewBtn) adminViewBtn.style.display = "none";
}

  // Re-render with current search
  renderCurrent();
}

// ===== Modal Helpers =====
function openOverlay(id) {
  const el = document.getElementById(id);
  el.classList.add("show");
  el.setAttribute("aria-hidden", "false");
}
function closeOverlay(id) {
  const el = document.getElementById(id);
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
}

// ===== Init =====
renderDashboard();
renderRequests();
renderMyShifts();
renderTodos();
renderAvailableShifts();
updateBellDot();

// To Do
$("#addTodoBtn").addEventListener("click", () => {
  $("#addTodoText").value = "";
  $("#addTodoAssignee").value = "";
  openOverlay("overlayAddTodo");
  setTimeout(() => $("#addTodoText").focus(), 100);
});

$("#confirmAddTodo").addEventListener("click", async () => {
  const text = $("#addTodoText").value.trim();
  const assignee_id = $("#addTodoAssignee").value;

  if (!text) {
    showToast("Please enter a task description.", "warn");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ text, assignee_id: assignee_id || null })
    });
    if (res.ok) {
      closeOverlay("overlayAddTodo");
      showToast("✓ Task added successfully.");
      fetchTodos();
    } else {
      showToast('Failed to add task', 'warn');
    }
  } catch (e) {
    showToast('Network error', 'warn');
  }
});

$$("#todoFilters .pill").forEach(btn => {
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    $$("#todoFilters .pill").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
    currentTodoFilter = e.target.dataset.filter;
    renderTodos();
  });
});

// Nav
$$(".navItem").forEach((item) => {
  item.addEventListener("click", () => setPage(item.dataset.page));
});

$("#adminAddBtn")?.addEventListener("click", () => {
  const today = new Date().toISOString().split("T")[0];

  if (currentPage === "dashboard") {
    $("#adminShiftUser").value = "";
    $("#adminShiftDate").value = today;
    $("#adminShiftStart").value = "09:00";
    $("#adminShiftEnd").value = "11:00";
    openOverlay("overlayAdminAddShift");
  } else if (currentPage === "available") {
    $("#availableShiftDate").value = today;
    $("#availableShiftStart").value = "09:00";
    $("#availableShiftEnd").value = "11:00";
    openOverlay("overlayAdminAddAvailableShift");
  }
});

$("#adminViewBtn")?.addEventListener("click", () => {
  renderWeekCalendar();
  openOverlay("overlayWeekView");
});

$("#prevWeekBtn")?.addEventListener("click", () => {
  currentWeekStart = addDays(currentWeekStart, -7);
  renderWeekCalendar();
});

$("#todayWeekBtn")?.addEventListener("click", () => {
  currentWeekStart = getStartOfWeek(new Date());
  renderWeekCalendar();
});

$("#nextWeekBtn")?.addEventListener("click", () => {
  currentWeekStart = addDays(currentWeekStart, 7);
  renderWeekCalendar();
});

$("#confirmAdminAddShift")?.addEventListener("click", async () => {
  const user_id = $("#adminShiftUser").value;
  const date = $("#adminShiftDate").value;
  const start = $("#adminShiftStart").value;
  const end = $("#adminShiftEnd").value;

  if (!user_id || !date || !start || !end) {
    showToast("Please complete all fields.", "warn");
    return;
  }

  if (start >= end) {
    showToast("End time must be after start time.", "warn");
    return;
  }

  const time = `${fmt24ToDisplay(start)}–${fmt24ToDisplay(end)}`;

  try {
    const res = await fetch(`${API_BASE}/admin/shifts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ user_id, date, time })
    });

    const data = await res.json();

  if (res.ok) {
    closeOverlay("overlayAdminAddShift");
    showToast("Shift created successfully.");

    if (isAdmin) {
      await fetchAdminShifts();
    }
  } else {
        showToast(data.error || 'Failed to create shift', 'warn');
      }
    } catch (e) {
      console.error('Failed to create shift', e);
      showToast('Network error', 'warn');
    }
  });

$("#confirmAdminAddAvailableShift")?.addEventListener("click", async () => {
  const date = $("#availableShiftDate").value;
  const start = $("#availableShiftStart").value;
  const end = $("#availableShiftEnd").value;

  if (!date || !start || !end) {
    showToast("Please complete all fields.", "warn");
    return;
  }

  if (start >= end) {
    showToast("End time must be after start time.", "warn");
    return;
  }

  const time = `${fmt24ToDisplay(start)}–${fmt24ToDisplay(end)}`;

  try {
    const res = await fetch(`${API_BASE}/admin/available-shifts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`
      },
      body: JSON.stringify({ date, time })
    });

    const data = await res.json();

    if (res.ok) {
      closeOverlay("overlayAdminAddAvailableShift");
      showToast("Available shift created successfully.");

      await fetchAvailableShifts();
    } else {
      showToast(data.error || "Failed to create available shift", "warn");
    }
  } catch (e) {
    console.error(e);
    showToast("Network error", "warn");
  }
});

// Top user
$("#userBtn").addEventListener("click", () => openOverlay("overlayPersonal"));

// Bell
$("#bellBtn").addEventListener("click", () => {
  renderNotifications();
  openOverlay("overlayNotif");
});

// Mark all read
$("#markAllRead").addEventListener("click", () => {
  notifications.forEach((n) => (n.read = true));
  updateBellDot();
  renderNotifications();
});

// Search
$("#searchBtn").addEventListener("click", doSearch);
$("#searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});
$("#searchInput").addEventListener("input", () => {
  if ($("#searchInput").value.trim() === "") {
    searchQuery = "";
    $("#searchBanner").style.display = "none";
    renderCurrent();
  }
});
$("#clearSearch").addEventListener("click", () => {
  $("#searchInput").value = "";
  searchQuery = "";
  $("#searchBanner").style.display = "none";
  renderCurrent();
});

// Settings: open theme modal
$("#openTheme").addEventListener("click", () => openOverlay("overlayTheme"));

// Theme live preview
let selectedThemePreset = "blue";
let selectedFontPreset = "dark";

const themePresets = {
  blue: {
    theme: "#4f46e5",
    themeStrong: "#4338ca",
    themeMid: "#818cf8",
    themeSoft: "#eef2ff",
    bgGradient: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
    pageTint: "#f8faff",
    panelTint: "#ffffff"
  },
  pink: {
    theme: "#db2777",
    themeStrong: "#be185d",
    themeMid: "#f472b6",
    themeSoft: "#fdf2f8",
    bgGradient: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)",
    pageTint: "#fff7fb",
    panelTint: "#ffffff"
  },
  green: {
    theme: "#059669",
    themeStrong: "#047857",
    themeMid: "#34d399",
    themeSoft: "#ecfdf5",
    bgGradient: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
    pageTint: "#f4fffa",
    panelTint: "#ffffff"
  },
  purple: {
    theme: "#7c3aed",
    themeStrong: "#6d28d9",
    themeMid: "#a78bfa",
    themeSoft: "#f5f3ff",
    bgGradient: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
    pageTint: "#faf8ff",
    panelTint: "#ffffff"
  }
};

const fontPresets = {
  dark: {
    text: "#1e293b",
    textMuted: "#64748b"
  },
  soft: {
    text: "#334155",
    textMuted: "#7b8794"
  },
  navy: {
    text: "#1e3a5f",
    textMuted: "#5b6f8a"
  },
  brown: {
    text: "#6b4f3a",
    textMuted: "#8b735f"
  }
};

function updateThemePreviewBox() {
  const box = $("#themePreviewBox");
  const theme = themePresets[selectedThemePreset];
  const font = fontPresets[selectedFontPreset];

  if (!box) return;

  box.style.background = `linear-gradient(135deg, ${theme.themeSoft} 0%, #ffffff 100%)`;
  box.style.borderColor = theme.theme;
  box.style.color = font.text;
  box.innerHTML = `<span>${selectedThemePreset} theme · ${selectedFontPreset} text</span>`;
}

function applyThemeSystem() {
  const theme = themePresets[selectedThemePreset];
  const font = fontPresets[selectedFontPreset];

  document.documentElement.style.setProperty("--theme", theme.theme);
  document.documentElement.style.setProperty("--theme-strong", theme.themeStrong);
  document.documentElement.style.setProperty("--theme-mid", theme.themeMid);
  document.documentElement.style.setProperty("--theme-soft", theme.themeSoft);
  document.documentElement.style.setProperty("--bg-gradient", theme.bgGradient);
  document.documentElement.style.setProperty("--page-tint", theme.pageTint);
  document.documentElement.style.setProperty("--panel-tint", theme.panelTint);

  document.documentElement.style.setProperty("--text", font.text);
  document.documentElement.style.setProperty("--text-muted", font.textMuted);

  updateThemePreviewBox();
}

$$(".themeColorCard").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".themeColorCard").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedThemePreset = btn.dataset.theme;
    updateThemePreviewBox();
  });
});

$$(".fontColorCard").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".fontColorCard").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedFontPreset = btn.dataset.font;
    updateThemePreviewBox();
  });
});

$("#applyTheme").addEventListener("click", () => {
  applyThemeSystem();

  if ($("#themePreview")) {
    $("#themePreview").style.borderColor = themePresets[selectedThemePreset].theme;
    $("#themePreview").style.background = themePresets[selectedThemePreset].themeSoft;
    $("#themePreview").style.color = themePresets[selectedThemePreset].theme;
  }

  closeOverlay("overlayTheme");
  showToast("✓ Theme updated.");
});

$("#resetTheme").addEventListener("click", () => {
  selectedThemePreset = "blue";
  selectedFontPreset = "dark";

  $$(".themeColorCard").forEach((b) => b.classList.remove("active"));
  $$(".fontColorCard").forEach((b) => b.classList.remove("active"));

  document.querySelector('.themeColorCard[data-theme="blue"]')?.classList.add("active");
  document.querySelector('.fontColorCard[data-font="dark"]')?.classList.add("active");

  applyThemeSystem();
  updateThemePreviewBox();
  showToast("Theme reset to default.");
});

updateThemePreviewBox();

// Toggle helpers
function bindToggle(toggleId, stateId) {
  const toggle = document.getElementById(toggleId);
  const state = document.getElementById(stateId);
  toggle.addEventListener("click", () => {
    const isOn = toggle.classList.toggle("on");
    toggle.setAttribute("aria-checked", String(isOn));
    state.textContent = isOn ? "On" : "Off";
    state.className = isOn ? "pill ok" : "pill bad";
  });
}
bindToggle("toggleInfo", "infoState");

$("#toggleReminder").addEventListener("click", () => {
  const isOn = $("#toggleReminder").classList.toggle("on");
  $("#toggleReminder").setAttribute("aria-checked", String(isOn));
  $("#reminderSelect").disabled = !isOn;
});

// Feedback
$("#feedbackBtn").addEventListener("click", () => openOverlay("overlayFeedback"));
$("#submitFeedback").addEventListener("click", () => {
  const msg = $("#feedbackText").value.trim();
  if (!msg) { showToast("Please enter your feedback.", "warn"); return; }
  closeOverlay("overlayFeedback");
  $("#feedbackText").value = "";
  showToast("✓ Feedback submitted. Thank you!");
});

// Close modal buttons
$$("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeOverlay(btn.dataset.close));
});

// Click outside modal to close
$$(".overlay").forEach((ov) => {
  ov.addEventListener("click", (e) => {
    if (e.target === ov) closeOverlay(ov.id);
  });
});

// Save Personal Info
$("#savePersonal").addEventListener("click", () => {
  const name = $("#inputName").value.trim() || "User";
  const email = $("#inputEmail").value.trim() || "user@uwec.edu";
  $("#topUserName").textContent = name;
  $("#settingsUserName").textContent = name;
  $("#settingsUserEmail").textContent = email;
  closeOverlay("overlayPersonal");
  showToast("✓ Personal information updated.");
});

// Save Edited Shift
$("#saveShiftBtn").addEventListener("click", async () => {
  if (editingShiftId == null) return;

  const date = $("#editShiftDate").value;
  const start = $("#editShiftStart").value;
  const end = $("#editShiftEnd").value;

  if (!date || !start || !end) {
    showToast("Please complete all fields.", "warn");
    return;
  }

  if (start >= end) {
    showToast("End time must be after start time.", "warn");
    return;
  }

  const time = `${fmt24ToDisplay(start)}–${fmt24ToDisplay(end)}`;

  try {
    const res = await fetch(`${API_BASE}/shifts/${editingShiftId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ date, time })
    });

    if (res.ok) {
      showToast("Shift updated.");
      closeOverlay("overlayEditShift");
      await fetchMyShifts();
      if (isAdmin) {
      await fetchAdminShifts();
    }
    } else {
      const data = await res.json();
      showToast(data.error || "Update failed", "warn");
    }
  } catch (e) {
    console.error(e);
    showToast("Network error", "warn");
  }
});

// Delete Shift
$("#deleteShiftBtn").addEventListener("click", async () => {
  if (editingShiftId == null) return;

  if (!confirm("Delete this shift?")) return;

  try {
    const res = await fetch(`${API_BASE}/shifts/${editingShiftId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

  if (res.ok) {
    showToast("Shift deleted.");
    closeOverlay("overlayEditShift");

    await fetchMyShifts();

    if (isAdmin) {
      await fetchAdminShifts();
    }
  } else {
    const data = await res.json();
    showToast(data.error || "Delete failed", "warn");
  }
    } catch (e) {
      console.error(e);
      showToast("Network error", "warn");
    }
  });

// Create Request
$("#createReqBtn")?.addEventListener("click", () => {
  const shiftSelect = $("#createReqShift");

  if (shiftSelect) {
    shiftSelect.innerHTML =
      '<option value="">Select your shift...</option>' +
      myShifts.map(s => `
        <option value="${s.id}">
          ${fmtDate(s.date)} · ${s.time}
        </option>
      `).join('');
  }

  $("#createReqType").value = "anyone";
  $("#createReqName").value = "";
  $("#createReqRecipientRow").style.display = "none";

  openOverlay("overlayCreateRequest");
});

$("#createReqType")?.addEventListener("change", (e) => {
  const row = $("#createReqRecipientRow");
  row.style.display = e.target.value === "specific" ? "" : "none";
});

$("#confirmCreateReq")?.addEventListener("click", async () => {
  const shift_id = $("#createReqShift").value;
  const request_type = $("#createReqType").value;
  const receiver_id = $("#createReqName").value || null;

  if (!shift_id) {
    showToast("Please select a shift.", "warn");
    return;
  }

  if (request_type === "specific" && !receiver_id) {
    showToast("Please select a recipient.", "warn");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`
      },
      body: JSON.stringify({
        shift_id,
        request_type,
        receiver_id
      })
    });

    const data = await res.json();

  if (res.ok) {
    closeOverlay("overlayCreateRequest");
    showToast("Request sent.");
    await fetchRequests();
    await fetchOpenRequests();
  } else {
        showToast(data.error || "Failed to send request", "warn");
      }
    } catch (e) {
      console.error(e);
      showToast("Network error", "warn");
    }
  });

// ===== Auth Logic =====
const authScreen = $("#authScreen");
const mainApp = $("#mainApp");
const tabLogin = $("#tabLogin");
const tabRegister = $("#tabRegister");
const loginForm = $("#loginForm");
const registerForm = $("#registerForm");
const loginError = $("#loginError");
const registerError = $("#registerError");

tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.style.display = 'block';
  registerForm.style.display = 'none';
  loginError.style.display = 'none';
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.style.display = 'block';
  loginForm.style.display = 'none';
  registerError.style.display = 'none';
});

async function fetchUsers() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API_BASE}/users`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (res.ok) {
      const users = await res.json();
      const reqSelect = $("#createReqName");
      const todoSelect = $("#addTodoAssignee");
      const adminSelect = $("#adminShiftUser");

      if (reqSelect) {
        reqSelect.innerHTML =
          '<option value="">Select a user...</option>' +
          users.map(u => `<option value="${u.id}">${u.username}</option>`).join('');
      }

      if (todoSelect) {
        todoSelect.innerHTML =
          '<option value="">Self</option>' +
          users.map(u => `<option value="${u.id}">${u.username}</option>`).join('');
      }

      if (adminSelect) {
        adminSelect.innerHTML =
          '<option value="">Select employee...</option>' +
          users.map(u => `<option value="${u.id}">${u.username}</option>`).join('');
      }
    }
  } catch (e) {
    console.error('Failed to fetch users', e);
  }
}

async function fetchRequests() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API_BASE}/requests`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    if (res.ok) { requests = await res.json(); renderRequests(); }
  } catch (e) { console.error('Failed to fetch requests', e); }
}

async function fetchTodos() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API_BASE}/todos`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    if (res.ok) { demoTodos = await res.json(); renderTodos(); }
  } catch (e) { console.error('Failed to fetch todos', e); }
}

async function fetchAvailableShifts() {
  if (!authToken) return;

  try {
    const res = await fetch(`${API_BASE}/shifts/available`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (res.ok) {
      availableShifts = await res.json();
      renderAvailableShifts();
      renderDashboard();
    } else {
      showToast('Failed to load available shifts', 'warn');
    }

  } catch (e) {
    console.error('Failed to fetch available shifts', e);
    showToast('Network error', 'warn');
  }
}

async function fetchAdminShifts() {
  if (!authToken || !isAdmin) return;

  try {
    const res = await fetch(`${API_BASE}/admin/shifts`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (res.ok) {
      adminShifts = await res.json();
      renderDashboard();
    } else {
      showToast('Failed to load admin shifts', 'warn');
    }
  } catch (e) {
    console.error('Failed to fetch admin shifts', e);
    showToast('Network error', 'warn');
  }
}

async function fetchMyShifts() {
  if (!authToken) return;

  try {
    const res = await fetch(`${API_BASE}/shifts/mine`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (res.ok) {
      myShifts = await res.json();
      renderMyShifts();
    } else {
      showToast('Failed to load my shifts', 'warn');
    }
  } catch (e) {
    console.error('Failed to fetch my shifts', e);
    showToast('Network error', 'warn');
  }
}

async function fetchOpenRequests() {
  if (!authToken || isAdmin) return;

  try {
    const res = await fetch(`${API_BASE}/requests/open`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (res.ok) {
      openRequests = await res.json();
      renderDashboard();
    } else {
      showToast("Failed to load open requests", "warn");
    }
  } catch (e) {
    console.error("Failed to fetch open requests", e);
    showToast("Network error", "warn");
  }
}

async function loginSuccess(username, email, token) {
  currentUser = username;
  authToken = token;

  // Temporary admin check by username
  isAdmin = username.toLowerCase() === "admin";

  // Update UI with user info
  $("#topUserName").textContent = username;
  $("#settingsUserName").textContent = username;
  $("#inputName").value = username;

  if (email) {
    $("#settingsUserEmail").textContent = email;
    $("#inputEmail").value = email;
  }

  // Switch navigation items based on role
  const navMyShift = $("#navMyShift");
  const navTodo = $("#navTodo");
  const navAvailable = $("#navAvailable");

  if (isAdmin) {
    if (navMyShift) navMyShift.style.display = "none";
    if (navTodo) navTodo.style.display = "none";
    if (navAvailable) navAvailable.style.display = "";
  } else {
    if (navMyShift) navMyShift.style.display = "";
    if (navTodo) navTodo.style.display = "";
    if (navAvailable) navAvailable.style.display = "none";
  }

  authScreen.style.display = 'none';
  mainApp.style.display = 'grid';
  showToast(`Welcome back, ${username}!`);

  await fetchUsers();
  await fetchRequests();
  await fetchTodos();
  await fetchMyShifts();

  if (isAdmin) {
    await fetchAdminShifts();
    await fetchAvailableShifts();
  } else {
    await fetchAvailableShifts();
    await fetchOpenRequests();
  }

    setPage(currentPage);
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    const username = $("#loginUsername").value.trim();
    const password = $("#loginPassword").value;

    if (!username || !password) return;

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (res.ok) {
        loginSuccess(username, data.email, data.token);
      } else {
        loginError.textContent = data.error || 'Login failed';
        loginError.style.display = 'block';
      }
    } catch (err) {
      loginError.textContent = 'Server connection error';
      loginError.style.display = 'block';
    }
  });

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.style.display = 'none';
  const email = $("#registerEmail").value.trim();
  const username = $("#registerUsername").value.trim();
  const password = $("#registerPassword").value;

  if (!username || !email || !password) return;

  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();

    if (res.ok) {
      showToast('Account created! Please log in.');
      tabLogin.click();
      $("#loginUsername").value = username;
      $("#loginPassword").value = '';
    } else {
      registerError.textContent = data.error || 'Registration failed';
      registerError.style.display = 'block';
    }
  } catch (err) {
    registerError.textContent = 'Server connection error';
    registerError.style.display = 'block';
  }
});

// Logout handler
$("#logoutBtn").addEventListener('click', () => {
  currentUser = null;
  authToken = null;

  // Clear forms
  $("#loginPassword").value = '';

  // Hide main app, show auth screen
  mainApp.style.display = 'none';
  authScreen.style.display = ''; // Reset to flex defined in CSS

  // Ensure we are back on the login tab
  tabLogin.click();
  showToast('Logged out successfully');
});

// Check if already logged in (optional implementation here if using localstorage)
// Default page
setPage("dashboard");

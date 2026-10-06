/* ============================================================
   ПРОШУ СЛОВА ИКИТ 2026 — PUBLIC APP
   ============================================================ */

let currentState = null;
let refreshTimer = null;
let ticketTimer = null;
let currentClientId = "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

/* ------------------------------------------------------------
   ИНИЦИАЛИЗАЦИЯ
   ------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadState();

  refreshTimer = setInterval(() => {
    loadState();
  }, 5000);
});

/* ------------------------------------------------------------
   СОБЫТИЯ
   ------------------------------------------------------------ */

function bindEvents() {
  $("#heroBetButton").addEventListener("click", () => openBetModal());

  $$("[data-close-modal]").forEach((element) => {
    element.addEventListener("click", closeBetModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeBetModal();
  });

  $("#betForm").addEventListener("submit", submitBet);
  $("#teamInput").addEventListener("change", updateSelectedTeam);
  $("#amountInput").addEventListener("input", updateSelectedTeam);
}

/* ------------------------------------------------------------
   ЗАГРУЗКА СОСТОЯНИЯ
   ------------------------------------------------------------ */

function loadState() {
  getPublicState((data) => {
    if (!data || data.ok !== true) return;

    const previousState = currentState;
    currentState = data;

    renderState(data, previousState);

    if (currentClientId && data.ticket) {
      renderTicket(data.ticket);
    }
  }, currentClientId);
}

/* ------------------------------------------------------------
   ОТРИСОВКА СОСТОЯНИЯ
   ------------------------------------------------------------ */

function renderState(data, previousState) {
  $("#poolValue").textContent = money(data.totalPaid);

  renderStatus(data.status);

  $("#alphaValue").textContent =
    Number(data.totalPaid || 0) > 0
      ? "рынок учитывается на " + Math.round(Number(data.alpha || 0) * 100) + "%"
      : "пока только модель";

  $("#updatedAt").textContent =
    "обновлено " +
    new Date().toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

  renderTeams(data.teams || [], previousState);
  renderTeamSelect(data.teams || []);

  const canBet = data.status === "OPEN";
  $("#heroBetButton").disabled = !canBet;

  if (data.status === "LOCKED") {
    $("#heroBetButton").textContent = "Ставки закрыты";
  } else if (data.status === "RESULT") {
    $("#heroBetButton").textContent = "Результат объявлен";
  } else {
    $("#heroBetButton").textContent = "Сделать ставку";
  }
}

function renderStatus(status) {
  const element = $("#systemStatus");
  element.className = "status-pill";

  if (status === "OPEN") element.classList.add("status-pill--open");
  if (status === "LOCKED") element.classList.add("status-pill--locked");
  if (status === "RESULT") element.classList.add("status-pill--result");

  element.textContent = status;
}

/* ------------------------------------------------------------
   КОМАНДЫ
   ------------------------------------------------------------ */

function renderTeams(teams, previousState) {
  const grid = $("#teamsGrid");

  if (!teams.length) {
    grid.innerHTML =
      '<div class="loading-state">Команды пока недоступны.</div>';
    return;
  }

  const previousTeams = previousState?.teams || [];

  grid.innerHTML = teams.map((team, index) => {
    const previousTeam = previousTeams.find((item) => item.id === team.id);
    const changed = previousTeam && previousTeam.currentK !== team.currentK;

    const coefficient =
      currentState.status === "OPEN"
        ? team.currentK
        : team.finalK ?? team.currentK;

    const closed = currentState.status !== "OPEN";

    return `
      <article class="team-card ${changed ? "is-updated" : ""}">
        <div>
          <div class="team-card__top">
            <span class="team-dept">${escapeHtml(team.dept)}</span>
            <span class="team-number">${String(index + 1).padStart(2, "0")}</span>
          </div>

          <h3 class="team-name">${escapeHtml(team.name)}</h3>
        </div>

        <div class="team-card__bottom">
          <div>
            <div class="team-k-label">
              ${closed ? "финальный коэффициент" : "коэффициент сейчас"}
            </div>
            <div class="team-k">${formatK(coefficient)}</div>
          </div>

          <button
            class="team-bet-button"
            type="button"
            data-team-id="${escapeAttr(team.id)}"
            ${closed ? "disabled" : ""}
          >
            ${closed ? "Закрыто" : "Поставить"}
          </button>
        </div>
      </article>
    `;
  }).join("");

  $$(".team-bet-button").forEach((button) => {
    button.addEventListener("click", () => {
      openBetModal(button.dataset.teamId);
    });
  });
}

/* ------------------------------------------------------------
   SELECT
   ------------------------------------------------------------ */

function renderTeamSelect(teams) {
  const select = $("#teamInput");
  const oldValue = select.value;

  select.innerHTML = teams.map((team) => `
    <option value="${escapeAttr(team.id)}">
      ${escapeHtml(team.name)}
    </option>
  `).join("");

  if (teams.some((team) => team.id === oldValue)) {
    select.value = oldValue;
  }

  updateSelectedTeam();
}

function updateSelectedTeam() {
  if (!currentState) return;

  const team = currentState.teams.find(
    (item) => item.id === $("#teamInput").value
  );

  if (!team) {
    $("#selectedTeamK").textContent = "—";
    $("#potentialPayout").textContent = "—";
    return;
  }

  const coefficient =
    currentState.status === "OPEN"
      ? team.currentK
      : team.finalK ?? team.currentK;

  $("#selectedTeamK").textContent = formatK(coefficient);

  const amount = Number($("#amountInput").value);

  $("#potentialPayout").textContent =
    Number.isInteger(amount) && amount >= 100 && coefficient
      ? money(Math.round(amount * coefficient))
      : "—";
}

/* ------------------------------------------------------------
   MODAL
   ------------------------------------------------------------ */

function openBetModal(teamId = "") {
  if (!currentState || currentState.status !== "OPEN") {
    showToast("Приём ставок закрыт.");
    return;
  }

  if (teamId) $("#teamInput").value = teamId;

  $("#betFormState").hidden = false;
  $("#ticketState").hidden = true;
  $("#formError").textContent = "";
  $("#betModal").classList.add("is-open");
  $("#betModal").setAttribute("aria-hidden", "false");

  updateSelectedTeam();

  setTimeout(() => $("#nameInput").focus(), 50);
}

function closeBetModal() {
  $("#betModal").classList.remove("is-open");
  $("#betModal").setAttribute("aria-hidden", "true");
}

/* ------------------------------------------------------------
   СОЗДАНИЕ СТАВКИ
   ------------------------------------------------------------ */

async function submitBet(event) {
  event.preventDefault();

  const error = $("#formError");
  error.textContent = "";

  const name = $("#nameInput").value.trim();
  const teamId = $("#teamInput").value;
  const amount = Number($("#amountInput").value);

  if (name.length < 2) {
    error.textContent = "Введите имя и фамилию.";
    return;
  }

  if (!Number.isInteger(amount) || amount < 100 || amount > 1000) {
    error.textContent = "Сумма должна быть от 100 до 1000 ₽.";
    return;
  }

  currentClientId = createClientId();

  const button = $("#submitBetButton");
  button.disabled = true;
  button.textContent = "Отправляем…";

  try {
    await createBetRequest({
      name,
      teamId,
      amount,
      clientId: currentClientId
    });

    showTicketWaiting(teamId, amount);
    startTicketPolling();
  } catch (requestError) {
    console.error(requestError);
    error.textContent = "Не удалось отправить заявку. Попробуйте ещё раз.";
  } finally {
    button.disabled = false;
    button.textContent = "Подтвердить заявку";
  }
}

function showTicketWaiting(teamId, amount) {
  const team = currentState?.teams?.find((item) => item.id === teamId);

  $("#betFormState").hidden = true;
  $("#ticketState").hidden = false;

  $("#ticketState").innerHTML = `
    <div class="ticket-state__icon">✓</div>
    <div class="ticket-state__eyebrow">ЗАЯВКА ОТПРАВЛЕНА</div>
    <h3 class="ticket-state__title">Ожидает подтверждения</h3>
    <p class="ticket-state__text">
      Ставка: ${money(amount)}<br>
      Команда: ${escapeHtml(team?.name || teamId)}<br><br>
      Передайте сумму организатору. Коэффициент начнёт учитывать эту ставку после подтверждения денег.
    </p>
  `;
}

/* ------------------------------------------------------------
   ОТСЛЕЖИВАНИЕ TICKET
   ------------------------------------------------------------ */

function startTicketPolling() {
  stopTicketPolling();
  loadState();
  ticketTimer = setInterval(loadState, 4000);
}

function stopTicketPolling() {
  if (ticketTimer) {
    clearInterval(ticketTimer);
    ticketTimer = null;
  }
}

function renderTicket(ticket) {
  if (!ticket || !ticket.found) return;

  if (ticket.status === "PENDING") return;

  stopTicketPolling();

  if (ticket.status === "PAID") {
    $("#ticketState").innerHTML = `
      <div class="ticket-state__icon">✓</div>
      <div class="ticket-state__eyebrow">${escapeHtml(ticket.betId)}</div>
      <h3 class="ticket-state__title">Ставка подтверждена</h3>
      <p class="ticket-state__text">
        ${escapeHtml(ticket.team)}<br>
        ${money(ticket.amount)}<br><br>
        Деньги получены организатором. Актуальные коэффициенты уже пересчитаны.
      </p>
    `;

    showToast("Ставка подтверждена.");
    return;
  }

  if (ticket.status === "REJECTED") {
    $("#ticketState").innerHTML = `
      <div class="ticket-state__icon ticket-state__icon--danger">×</div>
      <div class="ticket-state__eyebrow">${escapeHtml(ticket.betId)}</div>
      <h3 class="ticket-state__title">Заявка отклонена</h3>
      <p class="ticket-state__text">
        Обратитесь к организатору, если это произошло по ошибке.
      </p>
    `;
  }
}

/* ------------------------------------------------------------
   FORMATTERS
   ------------------------------------------------------------ */

function money(value) {
  return (
    new Intl.NumberFormat("ru-RU").format(Number(value || 0)) +
    " ₽"
  );
}

function formatK(value) {
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toFixed(2);
}

/* ------------------------------------------------------------
   ESCAPE
   ------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

/* ------------------------------------------------------------
   TOAST
   ------------------------------------------------------------ */

let toastTimer = null;

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2800);
}

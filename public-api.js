/*
 * Публичное API тотализатора.
 *
 * ВАЖНО:
 * - ADMIN TOKEN здесь НИКОГДА не хранится.
 * - GET используем через JSONP.
 * - POST отправляем в Apps Script как no-cors.
 */

const API_URL = "https://script.google.com/macros/s/AKfycbxu8wKoySbdFMHVqavQJ-rtXXlY-72PfscWGBaU9J7UlJgVla1BofWs5knp5Zny_Bvu/exec";

function getPublicState(onSuccess, ticketId = "") {
  const callbackName =
    "__ps_totalizator_cb_" +
    Date.now() + "_" +
    Math.floor(Math.random() * 100000);

  const script = document.createElement("script");

  window[callbackName] = function (data) {
    delete window[callbackName];
    script.remove();
    onSuccess(data);
  };

  const ticketPart = ticketId
    ? "&ticketId=" + encodeURIComponent(ticketId)
    : "";

  script.src =
    API_URL +
    "?callback=" + encodeURIComponent(callbackName) +
    ticketPart +
    "&_=" + Date.now();

  script.onerror = function () {
    delete window[callbackName];
    script.remove();
    console.error("Не удалось получить состояние API.");
  };

  document.body.appendChild(script);
}

async function createBetRequest({ name, teamId, amount, clientId }) {
  await fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8"
    },
    body: JSON.stringify({
      action: "createBet",
      name,
      teamId,
      amount,
      clientId
    })
  });

  return { ok: true };
}

function createClientId() {
  if (
    window.crypto &&
    typeof window.crypto.randomUUID === "function"
  ) {
    return window.crypto.randomUUID().replace(/-/g, "");
  }

  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).replace(/[^a-z0-9]/gi, "");
}

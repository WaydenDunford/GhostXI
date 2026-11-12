import { createGhostXIClient } from "./client/ghostxi.js";
import { mountVerifiedDashboard } from "./ui/verified-dashboard.js";

const root = document.querySelector("#app");
const apiUrl = new URLSearchParams(location.search).get("api") ?? `${location.origin}/api/v1`;
try { await mountVerifiedDashboard(root, createGhostXIClient({ baseUrl: apiUrl })); }
catch (error) {
  const message = document.createElement("p"); message.setAttribute("role", "alert");
  message.textContent = `Start npm run start:api and open http://127.0.0.1:8787 to load verified tracking. ${error.message}`;
  root.replaceChildren(message);
}

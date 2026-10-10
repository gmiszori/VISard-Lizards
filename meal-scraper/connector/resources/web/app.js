import { createClient, collectMeals, safeMessage } from "/client.mjs";

const $ = id => document.getElementById(id);
let active = null;
let results = [];
let modelAnswer = "";
const toolRows = new Map();

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function showError(message) {
  $("error").textContent = safeMessage(message, [$("api-key").value, $("relay-token").value]);
  $("error").hidden = false;
}
function setBusy(busy) {
  for (const id of ["ai-run", "direct-run", "check-health", "direct-tool", "model", "url", "location", "prompt", "relay-token"]) $(id).disabled = busy;
  $("stop").disabled = !busy;
}
function reset() {
  results = []; modelAnswer = ""; toolRows.clear();
  $("error").hidden = true; $("tool-results").replaceChildren(); $("tool-count").textContent = "0 calls";
  $("empty-tools").hidden = false; $("answer").textContent = "Waiting for the AI explanation…";
  renderMeals();
}
function renderMeals() {
  const meals = collectMeals(results);
  $("meal-count").textContent = `${meals.length} meal${meals.length === 1 ? "" : "s"}`;
  $("empty-meals").hidden = meals.length > 0;
  $("meals").replaceChildren();
  for (const meal of meals) {
    const card = element("article", undefined, "meal");
    card.append(element("h3", meal.name ?? "Unnamed entry"));
    const price = meal.price && Number.isFinite(meal.price.amount) ? `${meal.price.currency} ${meal.price.amount.toFixed(2)}` : "Price unknown";
    card.append(element("div", price + (meal.price?.customerGroup ? ` · ${meal.price.customerGroup}` : ""), "price"));
    if (meal.prices?.length > 1) card.append(element("p", meal.prices.map(p => `${p.customerGroup ?? "Price"}: ${p.currency} ${p.amount.toFixed(2)}`).join(" · ")));
    if (meal.description) card.append(element("p", meal.description));
    if (meal.dietaryLabels?.length) card.append(element("p", meal.dietaryLabels.join(" · "), "labels"));
    if (meal.allergens?.length) card.append(element("p", `Allergens: ${meal.allergens.join(", ")}`));
    card.append(element("p", [meal.section, meal.sourcePage ? `Page ${meal.sourcePage}` : null].filter(Boolean).join(" · ")));
    card.append(element("p", `Date: ${meal.date ?? "unknown"} · Serving time: ${meal.timeStart ?? "unknown"}${meal.timeEnd ? `–${meal.timeEnd}` : ""}`));
    try {
      const source = new URL(meal.sourceUrl);
      if (source.protocol === "https:") {
        const link = element("a", "View source ↗"); link.href = source.href; link.target = "_blank"; link.rel = "noopener noreferrer"; card.append(link);
      }
    } catch { /* Unsupported source URLs stay in raw JSON. */ }
    $("meals").append(card);
  }
  const warnings = [...new Set(results.flatMap(result => [
    ...(Array.isArray(result.data?.availability) ? result.data.availability.map(notice =>
      `Closed · ${notice.dateFrom ?? "start unknown"} – ${notice.dateTo ?? "until further notice"}: ${notice.evidence} (${notice.sourceUrl})`) : []),
    ...(Array.isArray(result.data?.warnings) ? result.data.warnings : []),
    ...(result.data?.error ? [result.data.error] : []),
  ]))];
  $("warnings").replaceChildren(...warnings.map(warning => element("li", typeof warning === "string" ? warning : JSON.stringify(warning))));
  $("download").disabled = results.length === 0;
}
function event(event) {
  if (event.type === "model-start") $("status").textContent = `OpenAI is choosing its next step (turn ${event.round}/6)…`;
  if (event.type === "tool-start") {
    $("status").textContent = `Running ${event.call.name} through the connector and MCP…`;
    const row = element("article", undefined, "tool");
    row.append(element("h3", event.call.name), element("p", `Call ${event.call.call_id} · running`));
    const args = element("details"); args.append(element("summary", "Arguments"), element("pre", JSON.stringify(event.arguments, null, 2)));
    row.append(args); toolRows.set(event.call.call_id, row); $("tool-results").append(row);
    $("empty-tools").hidden = true; $("tool-count").textContent = `${toolRows.size} call${toolRows.size === 1 ? "" : "s"}`;
  }
  if (event.type === "tool-result") {
    results.push({ name: event.call.name, callId: event.call.call_id, arguments: event.arguments, data: event.data });
    const row = toolRows.get(event.call.call_id);
    row.querySelector("p").textContent = `Call ${event.call.call_id} · ${event.data.error ? "tool error" : "complete"}`;
    const raw = element("details"); raw.open = true;
    raw.append(element("summary", "Raw scraper JSON"), element("pre", JSON.stringify(event.data, null, 2))); row.append(raw);
    renderMeals();
  }
  if (event.type === "tool-error") {
    const row = toolRows.get(event.call.call_id);
    row.querySelector("p").textContent = `Call ${event.call.call_id} · failed`;
    row.append(element("pre", event.message));
  }
}
async function checkHealth() {
  $("health").textContent = "Checking connector…";
  try {
    const health = await createClient({ relayToken: $("relay-token").value }).health();
    if (!health.mcpConnected) throw new Error("MCP is unavailable");
    $("health").textContent = "Connector + MCP ready"; $("health").dataset.state = "ready";
  } catch (error) {
    $("health").textContent = "Connector needs attention"; $("health").dataset.state = "error";
    $("status").textContent = safeMessage(`${error.message}. Check the connector token if one is configured.`, [$("relay-token").value]);
  }
}
async function run(useAi) {
  if (active || !$("test-form").reportValidity()) return;
  if (useAi && !$("api-key").value.trim()) { showError("Enter an OpenAI API key or use ‘Run tool without AI’."); return; }
  reset(); setBusy(true);
  active = new AbortController();
  const timer = setTimeout(() => active?.abort(), 15 * 60_000);
  const client = createClient({ relayToken: $("relay-token").value, signal: active.signal, onEvent: event });
  $("run-title").textContent = useAi ? "Testing OpenAI → MCP" : "Testing the scraper directly";
  try {
    if (useAi) {
      const result = await client.runAi({ apiKey: $("api-key").value, model: $("model").value,
        url: $("url").value, prompt: $("prompt").value });
      modelAnswer = result.answer; $("answer").textContent = result.answer || "The model returned no explanation.";
      $("run-title").textContent = result.complete ? "AI test complete" : "Partial results retrieved";
    } else {
      const result = await client.runTool($("direct-tool").value, $("url").value);
      $("run-title").textContent = result.error ? "Tool reported an error" : "Scraper test complete";
      $("answer").textContent = "No OpenAI request was made. These are direct MCP scraper results.";
    }
    $("status").textContent = `${results.length} tool call${results.length === 1 ? "" : "s"} completed. Inspect the full results below.`;
  } catch (error) {
    $("run-title").textContent = active.signal.aborted ? "Test stopped" : "Test needs attention";
    if (!active.signal.aborted) showError(error.message);
    $("status").textContent = "Any retrieved results are preserved below.";
  } finally { clearTimeout(timer); active = null; setBusy(false); }
}
$("test-form").addEventListener("submit", event => { event.preventDefault(); run(true); });
$("direct-run").addEventListener("click", () => run(false));
$("check-health").addEventListener("click", checkHealth);
$("stop").addEventListener("click", () => active?.abort());
$("clear-key").addEventListener("click", () => { $("api-key").value = ""; });
$("download").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ meals: collectMeals(results), toolResults: results, explanation: modelAnswer }, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = href; link.download = "meal-scraper-results.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
});
window.addEventListener("pagehide", () => { active?.abort(); $("api-key").value = ""; $("relay-token").value = ""; });
$("location").addEventListener("change", () => { if ($("location").value) $("url").value = $("location").value; });
$("url").addEventListener("input", () => {
  $("location").value = [...$("location").options].some(option => option.value === $("url").value) ? $("url").value : "";
});
async function loadLocations() {
  try {
    const response = await fetch("/api/mensas");
    if (!response.ok) throw new Error("Location list unavailable");
    const catalog = await response.json();
    for (const location of catalog.locations) {
      const option = element("option", location.name); option.value = location.url;
      $("location").insertBefore(option, $("location").lastElementChild);
    }
  } catch (error) { showError(error.message); }
}
loadLocations();
checkHealth();

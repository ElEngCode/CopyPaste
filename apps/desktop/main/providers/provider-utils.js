function toSelectorArray(selectors) {
  if (Array.isArray(selectors)) return selectors.filter(Boolean).map((s) => String(s).trim()).filter(Boolean);
  if (!selectors) return [];
  return String(selectors).split(",").map((s) => s.trim()).filter(Boolean);
}

async function findFirstVisibleLocator(page, selectors, timeout = 1500) {
  const list = toSelectorArray(selectors);
  for (const selector of list) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout });
      return locator;
    } catch {
      // try next
    }
  }
  return null;
}

async function waitForAnySelector(page, selectors, timeout = 5000) {
  const list = toSelectorArray(selectors);
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = await findFirstVisibleLocator(page, list, 400);
    if (found) return found;
    await page.waitForTimeout(200);
  }
  return null;
}

async function safeClick(locator) {
  try {
    await locator.click({ timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function safeInnerText(locator) {
  try {
    return (await locator.innerText({ timeout: 1500 })).trim();
  } catch {
    return "";
  }
}

async function detectTextPatterns(page, patterns) {
  let bodyText = "";
  try {
    bodyText = ((await page.textContent("body")) || "").toLowerCase();
  } catch {
    return false;
  }
  return patterns.some((p) => bodyText.includes(p));
}

async function detectProtectiveBlock(page) {
  const patterns = [
    "access denied",
    "error code 1020",
    "verify you are human",
    "checking your browser",
    "captcha",
    "unusual activity",
    "blocked",
    "cloudflare"
  ];
  return detectTextPatterns(page, patterns);
}

async function detectUsageLimit(page) {
  const patterns = [
    "you've reached",
    "usage limit",
    "usage cap",
    "message cap",
    "try again later",
    "try again at",
    "limit reset",
    "come back",
    "temporarily unavailable"
  ];
  return detectTextPatterns(page, patterns);
}

module.exports = {
  findFirstVisibleLocator,
  waitForAnySelector,
  safeClick,
  safeInnerText,
  detectProtectiveBlock,
  detectUsageLimit
};

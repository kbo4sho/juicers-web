import { expect, test, type Page } from "@playwright/test";

async function startPractice(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Play demo mode/ }).click();
  await page.getByRole("button", { name: /ENDLESS COUNTER/ }).click();
  await expect(page.getByText("Land one squeeze to start")).toBeVisible();
}

async function landPractice(page: Page) {
  const box = (await page.locator("canvas").boundingBox())!;
  await page.waitForTimeout(250);
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.61);
  await page.mouse.down();
  await expect(page.getByText("Land one squeeze to start")).toBeHidden();
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "END SESSION" })).toBeVisible({ timeout: 7000 });
}

async function startRoundWithOrders(page: Page) {
  await startPractice(page);
  await landPractice(page);
  await expect(page.getByRole("button", { name: /Show upcoming orders/ })).toBeVisible({ timeout: 10_000 });
}

async function showUpcoming(page: Page) {
  const toggle = page.getByRole("button", { name: /Show upcoming orders/ });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.getByRole("button", { name: /Hide upcoming orders/ })).toBeVisible();
}

test("compact stack shows the upcoming count and keeps the aimed ticket readable", async ({ page }) => {
  await startRoundWithOrders(page);
  const aimed = page.locator(".order-card--aimed");
  await expect(aimed).toBeVisible();
  await expect(aimed.getByText("NOW")).toBeVisible();
  await expect(aimed.locator(".order-card__select")).toHaveAttribute("aria-pressed", "true");
  const toggle = page.getByRole("button", { name: /Show upcoming orders, \d+ orders coming/ });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".order-stack__badge strong")).toHaveText(/\d+ ORDERS/);
  await expect(page.locator(".order-stack__queue")).toBeHidden();
  await expect(page.locator(".order-stack__queue .order-card__select")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Serve (Theo|Pip|Mina|Zara|Dax|Maya)/ })).toHaveCount(1);
  await expect(page.getByText(/orders coming/)).toBeAttached();
});

test("expanded upcoming tickets stay tappable and selection still aims a pour", async ({ page }) => {
  await startRoundWithOrders(page);
  const firstName = await page.locator(".order-card--aimed .order-card__customer strong").innerText();
  await showUpcoming(page);
  const upcoming = page.locator(".order-stack__queue .order-card__select");
  await expect(upcoming).toHaveCount(2);
  await expect(upcoming.nth(0)).toBeVisible();
  const nextName = await page.locator(".order-stack__queue .order-card__customer strong").nth(0).innerText();
  expect(nextName).not.toEqual(firstName);
  await upcoming.nth(0).click();
  await expect(page.locator(".order-card--aimed .order-card__customer strong")).toHaveText(nextName);
  await expect(page.locator(".order-card--aimed .order-card__select")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Show upcoming orders/ })).toBeVisible();
  await expect(page.locator(".order-stack__queue")).toBeHidden();
});

test("keyboard can expand the stack and select a ticket", async ({ page }) => {
  await startRoundWithOrders(page);
  const toggle = page.getByRole("button", { name: /Show upcoming orders/ });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".order-stack__toggle")).toHaveAttribute("aria-expanded", "true");
  const firstUpcoming = page.locator(".order-stack__queue .order-card__select").nth(0);
  await firstUpcoming.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".order-card--aimed .order-card__select")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".order-stack__queue")).toBeHidden();
});

test("collapsed upcoming tickets are not focusable", async ({ page }) => {
  await startRoundWithOrders(page);
  const hiddenButtons = page.locator(".order-stack__queue .order-card__select");
  await expect(hiddenButtons).toHaveCount(2);
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press("Tab");
    const focusedHidden = await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active?.closest(".order-stack__queue"));
    });
    expect(focusedHidden).toBe(false);
  }
});

test("phone rail stays in bounds and still swipes once the stack is open", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await startRoundWithOrders(page);
  const compact = await page.evaluate(() => {
    const rail = document.querySelector(".order-rail");
    const style = rail ? getComputedStyle(rail) : null;
    return {
      document: document.documentElement.scrollWidth,
      overflowX: style?.overflowX ?? "",
    };
  });
  expect(compact.document).toBeLessThanOrEqual(390);
  expect(compact.overflowX).toBe("hidden");
  await showUpcoming(page);
  const queue = page.locator(".order-stack__queue");
  await expect(queue.locator(".order-card__select").nth(0)).toBeVisible();
  const beforeSwipe = await page.locator(".order-rail").evaluate((rail) => rail.scrollLeft);
  await queue.locator(".order-card__select").nth(1).scrollIntoViewIfNeeded();
  const afterSwipe = await page.locator(".order-rail").evaluate((rail) => ({
    scrollLeft: rail.scrollLeft,
    overflowX: getComputedStyle(rail).overflowX,
    document: document.documentElement.scrollWidth,
  }));
  expect(afterSwipe.overflowX).toMatch(/auto|scroll/);
  expect(afterSwipe.scrollLeft).toBeGreaterThanOrEqual(beforeSwipe);
  expect(afterSwipe.document).toBeLessThanOrEqual(390);
  await queue.locator(".order-card__select").nth(1).tap();
  await expect(page.locator(".order-card--aimed .order-card__select")).toHaveAttribute("aria-pressed", "true");
  await context.close();
});

test("stack leaves do not animate when the user prefers reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startRoundWithOrders(page);
  const animation = await page.locator(".order-stack__leaf").first().evaluate((node) => getComputedStyle(node).animationName);
  expect(animation === "none" || animation === "").toBeTruthy();
});

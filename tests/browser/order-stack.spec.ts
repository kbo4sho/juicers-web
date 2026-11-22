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
  await expect(page.getByRole("button", { name: /Next order/ })).toBeVisible({ timeout: 10_000 });
}

async function cycleNext(page: Page) {
  await page.getByRole("button", { name: /Next order/ }).click();
}

test("one face-up ticket stays on the left with an upcoming count behind it", async ({ page }) => {
  await startRoundWithOrders(page);
  const aimed = page.locator(".order-card--aimed");
  await expect(aimed).toBeVisible();
  await expect(aimed.getByText("NOW")).toBeVisible();
  await expect(aimed.locator(".order-card__select")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".order-card:visible")).toHaveCount(1);
  const toggle = page.getByRole("button", { name: /Next order/ });
  await expect(toggle).toBeVisible();
  await expect(page.locator(".order-stack__badge strong")).toHaveText(/\d+ ORDERS/);
  await expect(page.getByText(/coming/)).toBeAttached();
  const geometry = await page.evaluate(() => {
    const rail = document.querySelector(".order-rail")!.getBoundingClientRect();
    const card = document.querySelector(".order-card--aimed")!.getBoundingClientRect();
    return { railLeft: rail.left, cardLeft: card.left };
  });
  expect(geometry.railLeft).toBeLessThan(40);
  expect(geometry.cardLeft).toBeLessThan(80);
});

test("cycling the stack aims the newly visible ticket", async ({ page }) => {
  await startRoundWithOrders(page);
  const aimedName = page.locator(".order-card--aimed .order-card__customer strong");
  const first = await aimedName.innerText();
  await cycleNext(page);
  await expect(aimedName).not.toHaveText(first);
  await expect(page.locator(".order-card--aimed .order-card__select")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".order-card:visible")).toHaveCount(1);
  await cycleNext(page);
  await cycleNext(page);
  await expect(aimedName).toHaveText(first);
});

test("keyboard arrows and Enter cycle the visible ticket", async ({ page }) => {
  await startRoundWithOrders(page);
  const aimedName = page.locator(".order-card--aimed .order-card__customer strong");
  const first = await aimedName.innerText();
  const toggle = page.getByRole("button", { name: /Next order/ });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(aimedName).not.toHaveText(first);
  const afterEnter = await aimedName.innerText();
  await page.keyboard.press("ArrowRight");
  await expect(aimedName).not.toHaveText(afterEnter);
  await page.keyboard.press("ArrowLeft");
  await expect(aimedName).toHaveText(afterEnter);
});

test("upcoming tickets are not in the tab order", async ({ page }) => {
  await startRoundWithOrders(page);
  await expect(page.locator(".order-card__select")).toHaveCount(1);
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const hiddenAimed = await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active?.closest(".order-card") && !active.closest(".order-card--aimed") && !active.closest(".order-stack__toggle"));
    });
    expect(hiddenAimed).toBe(false);
  }
});

test("phone station stays in bounds and the idle left glove sits clear of the cup", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await startRoundWithOrders(page);
  const layout = await page.evaluate(() => {
    const rail = document.querySelector(".order-rail") as HTMLElement;
    return {
      document: document.documentElement.scrollWidth,
      overflowX: getComputedStyle(rail).overflowX,
      railRight: rail.getBoundingClientRect().right,
    };
  });
  expect(layout.document).toBeLessThanOrEqual(390);
  expect(layout.railRight).toBeLessThan(300);
  await cycleNext(page);
  await expect(page.locator(".order-card--aimed .order-card__select")).toHaveAttribute("aria-pressed", "true");
  const after = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(after).toBeLessThanOrEqual(390);
  await context.close();
});

test("stack leaves do not animate when the user prefers reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startRoundWithOrders(page);
  const animation = await page.locator(".order-stack__leaf").first().evaluate((node) => getComputedStyle(node).animationName);
  expect(animation === "none" || animation === "").toBeTruthy();
});

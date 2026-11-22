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

type Box = { left: number; right: number; top: number; bottom: number };

function boxesIntersect(a: Box, b: Box) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function stationGeometry(page: Page) {
  await page.waitForFunction(() => Boolean(document.querySelector("canvas")?.dataset.drinkCup));
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const canvasBox = canvas.getBoundingClientRect();
    const shift = (box: Box): Box => ({
      left: canvasBox.left + box.left,
      right: canvasBox.left + box.right,
      top: canvasBox.top + box.top,
      bottom: canvasBox.top + box.bottom,
    });
    const cupLocal = JSON.parse(canvas.dataset.drinkCup || "null") as Box | null;
    const gloveLocal = JSON.parse(canvas.dataset.leftGloveBox || "null") as Box | null;
    const pileRect = document.querySelector(".order-stack__toggle")?.getBoundingClientRect();
    const rail = document.querySelector(".order-rail") as HTMLElement;
    const styles = getComputedStyle(document.documentElement);
    const railStyle = getComputedStyle(rail);
    return {
      cup: cupLocal ? shift(cupLocal) : null,
      glove: gloveLocal ? shift(gloveLocal) : null,
      pile: pileRect
        ? { left: pileRect.left, right: pileRect.right, top: pileRect.top, bottom: pileRect.bottom }
        : null,
      stationLeft: Number.parseFloat(styles.getPropertyValue("--order-station-left")),
      railLeft: rail.getBoundingClientRect().left,
      paddingLeft: Number.parseFloat(railStyle.paddingLeft),
      documentWidth: document.documentElement.scrollWidth,
    };
  });
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
  await expect(page.locator(".control-hint")).toContainText("PILE / ARROWS");
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

test("phone station keeps the cup clear of the pile and the idle left glove", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await startRoundWithOrders(page);
  await page.waitForFunction(() => Boolean(document.querySelector("canvas")?.dataset.drinkCup && document.querySelector("canvas")?.dataset.leftGloveBox));

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction((viewportWidth) => (
      window.innerWidth === viewportWidth
      && Boolean(document.querySelector("canvas")?.dataset.drinkCup)
    ), width);
    const geometry = await stationGeometry(page);
    expect(geometry.paddingLeft, `${width} padding-left`).toBe(0);
    expect(geometry.railLeft, `${width} rail left`).toBeCloseTo(geometry.stationLeft, 0);
    expect(geometry.cup, `${width} cup`).toBeTruthy();
    expect(geometry.pile, `${width} pile`).toBeTruthy();
    expect(boxesIntersect(geometry.cup!, geometry.pile!), `${width} cup overlaps pile`).toBe(false);
    expect(geometry.documentWidth, `${width} overflow`).toBeLessThanOrEqual(width);
    if (width === 390) {
      expect(geometry.glove).toBeTruthy();
      expect(boxesIntersect(geometry.glove!, geometry.cup!), "idle left glove overlaps cup").toBe(false);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await cycleNext(page);
  await expect(page.locator(".order-card--aimed .order-card__select")).toHaveAttribute("aria-pressed", "true");
  const after = await stationGeometry(page);
  expect(after.documentWidth).toBeLessThanOrEqual(390);
  expect(boxesIntersect(after.cup!, after.pile!)).toBe(false);
  await context.close();
});

test("stack leaves do not animate when the user prefers reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startRoundWithOrders(page);
  const animation = await page.locator(".order-stack__leaf").first().evaluate((node) => getComputedStyle(node).animationName);
  expect(animation === "none" || animation === "").toBeTruthy();
});

test("unmounting the pile moves focus to the remaining ticket", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { attachPileFocusRestore } = await import("/src/game/orderStationFocus.ts");
    const station = document.createElement("div");
    station.className = "order-station";
    const toggle = document.createElement("button");
    toggle.className = "order-stack__toggle";
    toggle.textContent = "Next order";
    const select = document.createElement("button");
    select.className = "order-card__select";
    select.textContent = "Serve Maya's Citrus Pop";
    station.append(toggle, select);
    document.body.append(station);

    const restore = attachPileFocusRestore(toggle);
    toggle.focus();
    restore();
    const restored = document.activeElement === select;

    const other = document.createElement("button");
    document.body.append(other);
    other.focus();
    const ignored = attachPileFocusRestore(toggle);
    ignored();
    const stayedOnOther = document.activeElement === other;

    station.remove();
    other.remove();
    return { restored, stayedOnOther };
  });
  expect(result.restored).toBe(true);
  expect(result.stayedOnOther).toBe(true);
});

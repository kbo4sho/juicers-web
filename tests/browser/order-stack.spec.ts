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

async function hookFruitDraws(page: Page) {
  await page.evaluate(() => {
    const proto = CanvasRenderingContext2D.prototype as CanvasRenderingContext2D & { __juicersFruitHook?: boolean };
    if (proto.__juicersFruitHook) return;
    proto.__juicersFruitHook = true;
    const drawImage = proto.drawImage;
    (window as unknown as { __fruits: { kind: string; x: number; y: number; t: number }[] }).__fruits = [];
    proto.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
      const image = args[0] as { __fruitKind?: string; src?: string; currentSrc?: string };
      const src = image?.src || image?.currentSrc || "";
      const kind = image?.__fruitKind || (src.includes("/fruits/") && !src.includes("/3d/")
        ? src.split("/").pop()?.replace(".webp", "")
        : "");
      if (kind) {
        const transform = this.getTransform();
        const dpr = window.devicePixelRatio || 1;
        (window as unknown as { __fruits: { kind: string; x: number; y: number; t: number }[] }).__fruits.push({
          kind,
          x: transform.e / dpr,
          y: transform.f / dpr,
          t: performance.now(),
        });
      }
      return drawImage.apply(this, args as never);
    };
  });
}

async function neededKinds(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector(".order-card--aimed");
    if (!card) return [] as string[];
    return [...card.querySelectorAll(".order-card__ingredients > span:not(.is-filled) img")]
      .map((img) => (img.getAttribute("src") || "").split("/").pop()?.replace(".webp", "") ?? "")
      .filter(Boolean);
  });
}

async function squeezeMatchingFruit(page: Page, kinds: string[], timeoutMs = 8000) {
  await hookFruitDraws(page);
  const canvas = page.locator("canvas");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const hit = await page.evaluate((want) => {
      const height = window.innerHeight;
      const recent = ((window as unknown as { __fruits?: { kind: string; x: number; y: number; t: number }[] }).__fruits ?? [])
        .filter((entry) => performance.now() - entry.t < 350);
      return recent.find((entry) => want.includes(entry.kind) && entry.y > 140 && entry.y < height - 200) ?? null;
    }, kinds);
    if (hit) {
      const box = (await canvas.boundingBox())!;
      await page.mouse.move(box.x + hit.x, box.y + hit.y);
      await page.mouse.down();
      await page.waitForTimeout(220);
      await page.mouse.up();
      return true;
    }
    await page.waitForTimeout(80);
  }
  return false;
}

async function completeAimedOrder(page: Page) {
  for (let attempt = 0; attempt < 8 && (await neededKinds(page)).length; attempt += 1) {
    const kinds = await neededKinds(page);
    if (!kinds.length) break;
    await squeezeMatchingFruit(page, kinds, 8000);
    await page.waitForTimeout(200);
  }
}

test("landscape and short windows keep the order station inside the viewport", async ({ browser }) => {
  const viewports = [
    { width: 844, height: 390 },
    { width: 667, height: 375 },
    { width: 1280, height: 500 },
  ];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await startRoundWithOrders(page);
    await page.setViewportSize(viewport);
    await page.waitForFunction((size) => {
      const canvas = document.querySelector("canvas");
      if (!canvas || !canvas.dataset.drinkCup) return false;
      if (window.innerWidth !== size.width || window.innerHeight !== size.height) return false;
      const box = canvas.getBoundingClientRect();
      const cup = JSON.parse(canvas.dataset.drinkCup);
      return box.height <= size.height + 2 && box.top + cup.bottom <= size.height + 2;
    }, viewport);
    const geometry = await stationGeometry(page);
    const label = `${viewport.width}x${viewport.height}`;
    const app = await page.evaluate(() => {
      const el = document.querySelector(".app") as HTMLElement;
      const styles = getComputedStyle(el);
      return { height: el.getBoundingClientRect().height, minHeight: styles.minHeight };
    });
    expect(app.height, `${label} app height`).toBeLessThanOrEqual(viewport.height + 1);
    expect(Number.parseFloat(app.minHeight) || 0, `${label} min-height`).toBeLessThanOrEqual(1);
    expect(geometry.cup, `${label} cup`).toBeTruthy();
    expect(geometry.pile || true, `${label} has rail`).toBeTruthy();
    const card = await page.locator(".order-card--aimed").boundingBox();
    expect(card, `${label} card`).toBeTruthy();
    expect(card!.y, `${label} card top`).toBeGreaterThanOrEqual(-1);
    expect(card!.y + card!.height, `${label} card bottom`).toBeLessThanOrEqual(viewport.height + 2);
    expect(geometry.cup!.top, `${label} cup top`).toBeGreaterThanOrEqual(-1);
    expect(geometry.cup!.bottom, `${label} cup bottom`).toBeLessThanOrEqual(viewport.height + 2);
    expect(geometry.cup!.left, `${label} cup left`).toBeGreaterThanOrEqual(0);
    if (geometry.pile) {
      expect(geometry.pile.bottom, `${label} pile bottom`).toBeLessThanOrEqual(viewport.height + 2);
      expect(boxesIntersect(geometry.cup!, geometry.pile), `${label} cup/pile`).toBe(false);
    }
    await context.close();
  }
});

test("the finished ticket stays face-up until ORDER UP ends, then the next ticket advances", async ({ page }) => {
  test.setTimeout(90_000);
  await startRoundWithOrders(page);
  await hookFruitDraws(page);

  const aimedName = page.locator(".order-card--aimed .order-card__customer strong");
  for (let attempt = 0; attempt < 6 && (await neededKinds(page)).length !== 1; attempt += 1) {
    const toggle = page.getByRole("button", { name: /Next order/ });
    if (await toggle.isVisible()) await cycleNext(page);
    else break;
  }
  await completeAimedOrder(page);
  await page.waitForFunction(() => Boolean(document.querySelector("canvas")?.dataset.celebrating), null, { timeout: 8000 });
  const customer = await aimedName.innerText();
  await expect(page.locator(".order-card--aimed")).toContainText("ORDER UP!");
  await expect(page.locator(".order-card:visible")).toHaveCount(1);
  const celebratingId = await page.evaluate(() => document.querySelector("canvas")?.dataset.celebrating ?? "");
  expect(celebratingId).toBeTruthy();
  await expect(aimedName).toHaveText(customer);
  await page.waitForFunction(() => !document.querySelector("canvas")?.dataset.celebrating, null, { timeout: 4000 });
  await expect(aimedName).not.toHaveText(customer);
  await expect(page.locator(".order-card--aimed")).not.toContainText("ORDER UP!");
});

test("reduced motion still holds the finished ticket and does not show a stale drink beside the next card", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startRoundWithOrders(page);
  await hookFruitDraws(page);
  const aimedName = page.locator(".order-card--aimed .order-card__customer strong");
  for (let attempt = 0; attempt < 6 && (await neededKinds(page)).length !== 1; attempt += 1) {
    const toggle = page.getByRole("button", { name: /Next order/ });
    if (await toggle.isVisible()) await cycleNext(page);
    else break;
  }
  await completeAimedOrder(page);
  await page.waitForFunction(() => Boolean(document.querySelector("canvas")?.dataset.celebrating), null, { timeout: 8000 });
  const customer = await aimedName.innerText();
  await expect(page.locator(".order-card:visible")).toHaveCount(1);
  const during = await page.evaluate(() => ({
    celebrating: document.querySelector("canvas")?.dataset.celebrating ?? "",
    name: document.querySelector(".order-card--aimed .order-card__customer strong")?.textContent,
    stamp: Boolean(document.querySelector(".order-card--aimed .order-card__stamp")),
  }));
  expect(during.stamp).toBe(true);
  expect(during.name).toBe(customer);
  expect(during.celebrating).toBeTruthy();
  await page.waitForFunction(() => !document.querySelector("canvas")?.dataset.celebrating, null, { timeout: 4000 });
  await expect(aimedName).not.toHaveText(customer);
});

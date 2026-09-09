import { expect, test, type Page } from "@playwright/test";

async function startPractice(page: Page, query = "?fruit3d=1") {
  await page.goto(`/${query}`);
  await page.getByRole("button", { name: /Play demo mode/ }).click();
  await page.getByRole("button", { name: /ENDLESS COUNTER/ }).click();
  await expect(page.getByText("Land one squeeze to start")).toBeVisible();
}

async function landPractice(page: Page) {
  // Practice always spawns at 52% x, 58% y, with a deliberately slow fall.
  const box = (await page.locator("canvas").boundingBox())!;
  await page.waitForTimeout(250);
  await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.61, { delay: 80 });
  await expect(page.getByText("Land one squeeze to start")).toBeHidden();
  await expect(page.getByRole("button", { name: "END SESSION" })).toBeVisible({ timeout: 7000 });
}

test("opt-in meshes support practice, aimed pours, results and replay", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await startPractice(page);
  await expect(page.locator("canvas")).toHaveAttribute("data-fruit-renderer", "ready");
  await page.screenshot({ path: "test-results/fruit-mesh-practice.png" });
  await landPractice(page);
  // Observe rendered item positions without changing game state, spawning or scoring.
  await page.evaluate(async () => {
    const moduleUrl = performance.getEntriesByType("resource").map(entry => entry.name)
      .find(url => url.includes("/src/game/FruitMeshRenderer.ts"))!;
    const { FruitMeshRenderer } = await import(moduleUrl);
    const prototype = FruitMeshRenderer.prototype;
    const render = prototype.render;
    prototype.render = function (items: unknown[], now: number) {
      (window as unknown as { fruitItems: unknown[] }).fruitItems = structuredClone(items);
      return render.call(this, items, now);
    };
  });
  // Select the receiving ticket explicitly, then catch its fruit anywhere.
  for (let attempt = 0; attempt < 120; attempt++) {
    const target = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".order-card")];
      const items = (window as unknown as { fruitItems?: {type:string; kind:string; x:number; y:number}[] }).fruitItems ?? [];
      for (const item of items) {
        if (item.type !== "fruit" || item.y < 320 || item.y > innerHeight - 240) continue;
        const cardIndex = cards.findIndex(card => [...card.querySelectorAll(".order-card__ingredients > span:not(.is-filled) img")]
          .some(img => img.getAttribute("src")?.endsWith(`/${item.kind}.webp`)));
        if (cardIndex >= 0) return { ...item, cardIndex };
      }
    });
    if (target) {
      await page.locator(".order-card__select").nth(target.cardIndex).click();
      await page.mouse.click(target.x * 1280, target.y + 25, { delay: 70 });
      break;
    }
    await page.waitForTimeout(100);
  }
  await expect(page.locator(".score-stack strong")).not.toHaveText("0");
  await page.screenshot({ path: "test-results/fruit-mesh-demo.png" });
  await page.getByRole("button", { name: "END SESSION" }).click();
  await expect(page.getByText("FREE PLAY COMPLETE")).toBeVisible();
  await page.getByRole("button", { name: /Keep free playing/ }).click();
  await expect(page.getByRole("button", { name: "END SESSION" })).toBeVisible({ timeout: 7000 });
  await expect(page.locator(".score-stack strong")).toHaveText("0");
  expect(errors).toEqual([]);
});

test("default demo loads no mesh assets or GPU renderer", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => requests.push(request.url()));
  await startPractice(page, "");
  await expect(page.locator("canvas")).toHaveAttribute("data-fruit-renderer", "illustrated");
  await landPractice(page);
  expect(requests.filter(url => /\.glb|FruitMeshRenderer|three.*\.js/.test(url))).toEqual([]);
});

test("missing mesh falls back per fruit and practice still lands", async ({ page }) => {
  await page.route("**/orange.glb", route => route.fulfill({ status: 404, body: "Missing" }));
  await startPractice(page);
  await expect(page.locator("canvas")).toHaveAttribute("data-fruit-renderer", "partial");
  await landPractice(page);
});

test("unavailable WebGL keeps demo and practice usable", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.includes("webgl")) return null;
      return getContext.call(this, type as "2d", ...args);
    } as typeof getContext;
  });
  await startPractice(page);
  await expect(page.locator("canvas")).toHaveAttribute("data-fruit-renderer", "fallback");
  await landPractice(page);
});

test("camera denial recovers into the same mesh demo", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); };
  });
  await page.goto("/?fruit3d=1");
  await page.getByRole("button", { name: /Play with camera/ }).click();
  await expect(page.getByText("No camera? No dead end.")).toBeVisible();
  await page.getByRole("button", { name: /Play demo mode/ }).click();
  await page.getByRole("button", { name: /ENDLESS COUNTER/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-fruit-renderer", "ready");
  await landPractice(page);
});

test("phone viewport: practice squeeze works with meshes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startPractice(page);
  await expect(page.locator("canvas")).toHaveAttribute("data-fruit-renderer", "ready");
  await page.screenshot({ path: "test-results/fruit-mesh-phone.png" });
  await landPractice(page);
});

test("GPU context loss and disposal leave no stale mesh draws", async ({ page }) => {
  await page.goto("/tests/fixtures/fruit-gallery.html");
  await page.waitForFunction(() => (window as unknown as { ready: boolean }).ready);
  const result = await page.evaluate(async () => {
    const state = window as unknown as {
      frame:number;
      renderer: { status:string; renderer:{getContext:()=>WebGLRenderingContext}; dispose:()=>void };
    };
    cancelAnimationFrame(state.frame);
    state.renderer.renderer.getContext().getExtension("WEBGL_lose_context")!.loseContext();
    await new Promise(resolve => setTimeout(resolve, 50));
    const lost = state.renderer.status;
    state.renderer.dispose();
    return { lost, disposed: state.renderer.status };
  });
  expect(result).toEqual({ lost: "fallback", disposed: "fallback" });
});

for (const hand of ["left", "right"]) {
  test(`tracked ${hand} fist still serves practice through the camera input path`, async ({ page }) => {
    await page.goto("/tests/fixtures/camera-frame.html?fruit3d=1");
    await expect(page.locator("canvas")).toHaveAttribute("data-fruit-renderer", "ready");
    await page.waitForTimeout(250);
    // Inject a tracked frame at the GameCanvas boundary; MediaPipe itself stays unchanged.
    await page.evaluate((id) => {
      const ref = (window as unknown as { trackingRef: {current: {hands: {id:string;x:number;y:number;closed:boolean}[]}} }).trackingRef;
      const tracked = ref.current.hands.find(hand => hand.id === id)!;
      Object.assign(tracked, { x: 0.52, y: 0.61, closed: true });
    }, hand);
    await expect(page.locator("body")).toHaveAttribute("data-practice", "complete");
    await expect(page.locator("body")).toHaveAttribute("data-filled", "1");
  });
}

test("camera setup loads local MediaPipe beside the mesh renderer", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/?fruit3d=1");
  await page.getByRole("button", { name: /Play with camera/ }).click();
  await expect(page.getByText("● CAMERA MODE")).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: /ENDLESS COUNTER/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-fruit-renderer", "ready");
  await expect(page.getByText("CAMERA ON · VIDEO HIDDEN")).toBeVisible();
  await expect(page.locator("video")).toHaveCSS("opacity", "0");
  await expect(page.locator("video")).toHaveAttribute("aria-hidden", "true");
});


test("only a card tap selects: holds, drags and either demo fist leave it locked", async ({ page }) => {
  await startPractice(page);
  await landPractice(page);
  const buttons = page.locator(".order-card__select");
  await buttons.nth(1).click();
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  const box = (await buttons.nth(2).boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.up();
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(x - 20, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y);
  await page.mouse.up();
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  // Both gloves can close in unrelated aim columns without retargeting.
  await page.mouse.move(100, 330);
  await expect(page.locator("canvas")).toBeFocused();
  for (const key of ["z", "m", "Space"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(100);
    await page.keyboard.up(key);
    await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  }
  await page.mouse.down();
  await page.mouse.move(x, y);
  await page.mouse.up();
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await buttons.nth(2).click();
  await expect(buttons.nth(2)).toHaveAttribute("aria-pressed", "true");
  await buttons.nth(0).focus();
  await page.keyboard.press("Space");
  await expect(buttons.nth(0)).toHaveAttribute("aria-pressed", "true");
  await buttons.nth(2).focus();
  await page.keyboard.press("Enter");
  await expect(buttons.nth(2)).toHaveAttribute("aria-pressed", "true");
});

test("phone taps select tickets, canceled touches do not", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await startPractice(page);
  await landPractice(page);
  const buttons = page.locator(".order-card__select");
  await buttons.nth(1).tap();
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await buttons.nth(0).dispatchEvent("pointerdown", { pointerId: 2, isPrimary: true, button: 0 });
  await buttons.nth(0).dispatchEvent("pointercancel", { pointerId: 2 });
  await buttons.nth(0).dispatchEvent("click", { detail: 1 });
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await buttons.nth(2).scrollIntoViewIfNeeded();
  await buttons.nth(2).tap();
  await expect(buttons.nth(2)).toHaveAttribute("aria-pressed", "true");
  await context.close();
});

test("juicy shader draws all five fruits without GPU errors and honors reduced motion", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/fixtures/fruit-gallery.html");
  await page.waitForFunction(() => (window as unknown as {ready:boolean}).ready);
  const stills = await page.evaluate(() => {
    const state = window as unknown as { frame: number; renderFrame: (now:number)=>void };
    cancelAnimationFrame(state.frame);
    state.renderFrame(1000);
    const canvas = document.querySelector("canvas")!;
    const first = canvas.toDataURL();
    state.renderFrame(4000);
    return { first, second: canvas.toDataURL() };
  });
  expect(stills.first).toEqual(stills.second);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/fruit-mesh-lineup.png" });
});


test("tracked grabs, movement and tracking loss never select a different card", async ({ page }) => {
  await page.goto("/tests/fixtures/camera-frame.html?fruit3d=1&playing=1");
  await expect(page.locator("body")).toHaveAttribute("data-selected", "1");
  await page.evaluate(() => {
    (window as unknown as {selectOrderRef:{current:number}}).selectOrderRef.current = 2;
  });
  await expect(page.locator("body")).toHaveAttribute("data-selected", "2");
  for (const closed of [[true, false], [false, true], [true, true], [false, false]]) {
    await page.evaluate((closed) => {
      const ref = (window as unknown as {trackingRef:{current:{hands: {x:number;closed:boolean}[]}}}).trackingRef;
      ref.current.hands.forEach((hand, i) => { hand.x = i ? 0.05 : 0.95; hand.closed = closed[i]; });
    }, closed);
    await page.waitForTimeout(120);
    await expect(page.locator("body")).toHaveAttribute("data-selected", "2");
  }
  await page.evaluate(() => {
    (window as unknown as {trackingRef:{current:{hands:unknown[]}}}).trackingRef.current.hands = [];
  });
  await page.waitForTimeout(120);
  await expect(page.locator("body")).toHaveAttribute("data-selected", "2");
});

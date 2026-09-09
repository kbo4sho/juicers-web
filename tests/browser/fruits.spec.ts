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
  // Follow the first needed fruit inside the matching ticket's horizontal aim zone.
  for (let attempt = 0; attempt < 120; attempt++) {
    const target = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".order-card")];
      const items = (window as unknown as { fruitItems?: {type:string; kind:string; x:number; y:number}[] }).fruitItems ?? [];
      return items.find(item => {
        if (item.type !== "fruit" || item.y < 320 || item.y > innerHeight - 100) return false;
        const card = cards[Math.max(0, Math.min(cards.length - 1, Math.floor((item.x - 0.16) / 0.68 * cards.length)))];
        return card && [...card.querySelectorAll(".order-card__ingredients > span:not(.is-filled) img")]
          .some(img => img.getAttribute("src")?.endsWith(`/${item.kind}.webp`));
      });
    });
    if (target) {
      await page.mouse.click(target.x * 1280, target.y, { delay: 70 });
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

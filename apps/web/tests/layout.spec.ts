import { expect, test, type Page } from "@playwright/test";

/** Wait for the chat shell + right rail to be in the DOM and the session
 *  request to settle (or fail), so the layout is fully painted. */
async function waitForReady(page: Page) {
  await expect(page.locator(".app")).toBeVisible();
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".chat-panel")).toBeVisible();
  // The `/sessions` POST will resolve or 404 — in either case, give it 2 s and move on.
  await page.waitForTimeout(800);
}

test.describe("layout — no horizontal overflow at any supported viewport", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForReady(page);
  });

  test("html element does not scroll horizontally", async ({ page }) => {
    const overflow = await page.evaluate(() => ({
      docScroll: document.documentElement.scrollWidth,
      docClient: document.documentElement.clientWidth,
      bodyScroll: document.body.scrollWidth,
      bodyClient: document.body.clientWidth,
    }));
    expect(
      overflow.docScroll,
      `documentElement.scrollWidth (${overflow.docScroll}) > clientWidth (${overflow.docClient}) — page scrolls horizontally`,
    ).toBeLessThanOrEqual(overflow.docClient);
    expect(overflow.bodyScroll).toBeLessThanOrEqual(overflow.bodyClient);
  });

  test("right rail content stays inside its column", async ({ page, viewport }) => {
    test.skip(!viewport, "no viewport");
    test.skip((viewport!.width) < 1080, "rail is hidden under 1080px by design");

    const rail = page.locator(".right-rail");
    await expect(rail).toBeVisible();
    const railBox = await rail.boundingBox();
    expect(railBox).toBeTruthy();

    // Every direct card child must fit within the rail's box.
    const cards = await page.locator(".right-rail > *").all();
    for (const card of cards) {
      const box = await card.boundingBox();
      if (!box) continue;
      expect(
        box.x + box.width,
        `card right edge ${box.x + box.width} > rail right edge ${railBox!.x + railBox!.width}`,
      ).toBeLessThanOrEqual(railBox!.x + railBox!.width + 1);
      expect(box.x).toBeGreaterThanOrEqual(railBox!.x - 1);
    }
  });

  test("chat panel scrolls vertically not horizontally", async ({ page }) => {
    const messages = page.locator(".messages");
    await expect(messages).toBeVisible();
    const overflow = await messages.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test("composer and topbar are visible", async ({ page }) => {
    await expect(page.locator(".composer")).toBeVisible();
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(page.locator(".composer-input")).toBeVisible();
  });

  test("right-rail cards do not vertically clip their own content", async ({ page, viewport }) => {
    test.skip(!viewport, "no viewport");
    test.skip(viewport!.width < 1080, "rail hidden by design");

    // Each card should have scrollHeight ≈ clientHeight: anything bigger means
    // the content overflows the box (and `overflow: hidden` clips it).
    const cards = await page.locator(".right-rail .card, .right-rail .patient-card").all();
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const clip = await card.evaluate((el) => ({
        scrollH: (el as HTMLElement).scrollHeight,
        clientH: (el as HTMLElement).clientHeight,
        text: ((el as HTMLElement).querySelector(".card-title, .patient-info > strong")?.textContent ?? "").trim(),
      }));
      expect(
        clip.scrollH,
        `card "${clip.text}": content (${clip.scrollH}px) is taller than the box (${clip.clientH}px) — content is being clipped`,
      ).toBeLessThanOrEqual(clip.clientH + 1);
    }
  });

  test("sidebar visible above 1080px", async ({ page, viewport }) => {
    test.skip(!viewport, "no viewport");
    if (viewport!.width >= 1080) {
      await expect(page.locator(".sidebar")).toBeVisible();
    } else {
      const sidebarVisible = await page.locator(".sidebar").isVisible().catch(() => false);
      expect(sidebarVisible).toBeFalsy();
    }
  });
});

test.describe("layout — full-page screenshots for visual review", () => {
  test("snapshot", async ({ page }, testInfo) => {
    await page.goto("/");
    await waitForReady(page);
    const path = testInfo.outputPath(`fullpage-${testInfo.project.name}.png`);
    await page.screenshot({ path, fullPage: true });
    testInfo.attach(`fullpage-${testInfo.project.name}.png`, { path, contentType: "image/png" });
  });
});

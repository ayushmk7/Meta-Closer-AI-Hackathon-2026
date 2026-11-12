import { test, expect } from '@playwright/test';

const pages = [
  ['/', 'home'],
  ['/profile', 'profile'],
  ['/friends', 'friends'],
  ['/marketplace', 'marketplace'],
  ['/settings', 'settings'],
] as const;

test('primary pages render without runtime errors, overflow or remote image/API requests', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    )
      external.push(request.url());
  });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [path, name] of pages) {
      await page.goto(path);
      await expect(page.locator('#main')).toBeVisible();
      await expect(page.locator('#main')).not.toBeEmpty();
      await page.evaluate(async () => {
        await Promise.all(
          Array.from(document.images, (img) => {
            img.loading = 'eager';
            return img.decode().catch(() => {});
          }),
        );
      });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await page.screenshot({
        path: `docs/verification/web/${name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
      });
    }
  }
  expect(failures).toEqual([]);
  expect(external).toEqual([]);
});

test('compose, react, comment and save persist across refresh', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: /What.s on your mind/ })
    .first()
    .click();
  const composer = page.getByRole('dialog', { name: 'Create post' });
  await composer.getByLabel('Post text').fill('A little progress from our local demo.');
  await composer.getByLabel('Post audience').selectOption('Only me');
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  const card = page
    .getByTestId('post-card')
    .filter({ hasText: 'A little progress from our local demo.' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Only me');
  await card.getByRole('button', { name: "React to Maya Chen's post" }).click();
  await card.getByRole('button', { name: 'Love', exact: true }).click();
  await card.getByRole('button', { name: 'Comment', exact: true }).click();
  await card.getByLabel("Comment on Maya Chen's post").fill('This stays on this device.');
  await card.getByRole('button', { name: 'Send comment' }).click();
  await card.getByRole('button', { name: "Options for Maya Chen's post" }).click();
  await card.getByRole('button', { name: 'Save post', exact: true }).click();
  await page.reload();
  await card.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(card).toContainText('This stays on this device.');
  await expect(card).toContainText('Love');
  await page.goto('/saved');
  await expect(
    page.getByText('A little progress from our local demo.', { exact: true }),
  ).toBeVisible();
  await page.goto('/profile');
  await expect(
    page.getByText('A little progress from our local demo.', { exact: true }),
  ).toBeVisible();
});

test('friend decisions update requests and the profile friend list', async ({ page }) => {
  await page.goto('/friends?section=requests');
  await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toHaveCount(4);
  await page
    .locator('.friend-request')
    .filter({ hasText: 'Nora Williams' })
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await page
    .locator('.friend-request')
    .filter({ hasText: 'Kai Park' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toHaveCount(2);
  await page.goto('/profile');
  await page
    .getByRole('navigation', { name: 'Profile sections' })
    .getByRole('button', { name: 'Friends', exact: true })
    .click();
  await expect(
    page.locator('.profile-friends-grid').getByText('Nora Williams', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.profile-friends-grid').getByText('Kai Park', { exact: true }),
  ).toHaveCount(0);
});

test('Marketplace search, saved listings and seller messages stay local and persist', async ({
  page,
}) => {
  await page.goto('/marketplace');
  await page.getByLabel('Search Marketplace', { exact: true }).fill('desk lamp');
  await expect(page.locator('.listing-card')).toHaveCount(1);
  await page.locator('.listing-card').click();
  await expect(page.getByRole('heading', { name: 'Warm white desk lamp' })).toBeVisible();
  await page.getByRole('button', { name: 'Save listing', exact: true }).click();
  await page.getByRole('link', { name: 'Message seller', exact: true }).click();
  await page.getByLabel('Message', { exact: true }).fill('Can I collect the lamp on Saturday?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.reload();
  await expect(
    page
      .locator('.chat-messages')
      .getByText('Can I collect the lamp on Saturday?', { exact: true }),
  ).toBeVisible();
  await page.goto('/marketplace');
  await page.getByRole('button', { name: 'Saved listings', exact: true }).click();
  await expect(page.locator('.listing-card')).toHaveCount(1);
  await expect(page.locator('.listing-card')).toContainText('Warm white desk lamp');
});

test('settings affect feed, notifications and composer; scoped reset restores the seed', async ({
  page,
}) => {
  await page.goto('/');
  const first = await page.getByTestId('post-card').first().getAttribute('data-post-id');
  await page.goto('/settings/display');
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/');
  await page.screenshot({ path: 'docs/verification/web/home-dark-1440x900.png' });
  await page.goto('/settings/feed');
  await page.getByRole('radio', { name: 'Most recent', exact: true }).check();
  await page.goto('/');
  await expect(page.getByTestId('post-card').first()).not.toHaveAttribute('data-post-id', first!);
  await page.goto('/settings/notifications');
  await page.getByRole('switch', { name: 'Post activity', exact: true }).uncheck();
  await page.goto('/notifications');
  await expect(page.locator('.notification-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await page.reload();
  await expect(page.locator('.notification-row.unread')).toHaveCount(0);
  await page.goto('/settings/audience');
  await page.getByRole('radio', { name: 'Only me', exact: true }).check();
  await page.goto('/');
  await page
    .getByRole('button', { name: /What.s on your mind/ })
    .first()
    .click();
  await expect(page.getByLabel('Post audience', { exact: true })).toHaveValue('Only me');
  await page.keyboard.press('Escape');
  await page.evaluate(() => localStorage.setItem('another-project', 'keep me'));
  await page.goto('/settings/reset');
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Reset demo?' })
    .getByRole('button', { name: 'Reset demo', exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByTestId('post-card')).toHaveCount(24);
  await expect(page.getByTestId('post-card').first()).toHaveAttribute('data-post-id', first!);
  expect(await page.evaluate(() => localStorage.getItem('another-project'))).toBe('keep me');
});

test('wheel scrolling reaches expanded content and stays locked behind the composer', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [route, name] of pages.filter(([, name]) => name !== 'friends')) {
    await page.goto(route);
    await expect(page.locator('#main')).toBeVisible();
    await page.mouse.move(720, 700);
    await page.mouse.wheel(0, 1100);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(40);
    expect((await page.locator('.topbar').boundingBox())?.y).toBe(0);
    await page.screenshot({ path: `docs/verification/web/${name}-scrolled-1440x900.png` });
  }

  await page.goto('/');
  await expect(page.getByTestId('post-card')).toHaveCount(24);
  await page.mouse.move(720, 700);
  await page.mouse.wheel(0, 30_000);
  const backToTop = page.getByRole('button', { name: 'Back to top', exact: true });
  await expect(backToTop).toBeInViewport();
  await expect(page.locator('[data-post-id="post-24"]')).toBeInViewport();
  expect((await page.locator('.topbar').boundingBox())?.y).toBe(0);
  expect((await page.locator('.left-rail').boundingBox())!.y).toBeCloseTo(56, 0);
  await page.screenshot({ path: 'docs/verification/web/home-end-1440x900.png' });
  await backToTop.click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page
    .getByRole('button', { name: /What.s on your mind/ })
    .first()
    .click();
  await expect(page.getByRole('dialog', { name: 'Create post' })).toBeVisible();
  await page.mouse.move(100, 700);
  await page.mouse.wheel(0, 800);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.keyboard.press('Escape');
  await page.mouse.move(720, 700);
  await page.mouse.wheel(0, 800);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
});

test('post menus and reactions stay usable at the viewport edges', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByTestId('post-card')).toHaveCount(24);
    const second = page.locator('[data-post-id="post-02"]');
    const options = second.getByRole('button', { name: "Options for Leo Ortiz's post" });
    await page.mouse.move(viewport.width / 2, 600);
    const menuY = viewport.height - (viewport.width < 768 ? 130 : 90);
    await page.mouse.wheel(0, (await options.boundingBox())!.y - menuY);
    await expect
      .poll(async () => Math.abs((await options.boundingBox())!.y - menuY))
      .toBeLessThan(2);
    await options.click();
    await expect(second.locator('.mini-menu')).toBeInViewport({ ratio: 1 });
    const menu = (await second.locator('.mini-menu').boundingBox())!;
    expect(menu.y + menu.height).toBeLessThan(viewport.height - (viewport.width < 768 ? 56 : 0));
    await page.screenshot({
      path: `docs/verification/web/post-menu-edge-${viewport.width}x${viewport.height}.png`,
    });
    await second.getByRole('button', { name: 'Save post', exact: true }).click();

    const first = page.locator('[data-post-id="post-01"]');
    const react = first.getByRole('button', { name: "React to Amina Rahman's post" });
    await page.mouse.wheel(0, (await react.boundingBox())!.y - 70);
    await expect.poll(async () => Math.abs((await react.boundingBox())!.y - 70)).toBeLessThan(2);
    await react.click();
    await expect(first.locator('.reaction-picker')).toBeInViewport({ ratio: 1 });
    expect((await first.locator('.reaction-picker').boundingBox())!.y).toBeGreaterThan(56);
    await page.screenshot({
      path: `docs/verification/web/reaction-edge-${viewport.width}x${viewport.height}.png`,
    });
    const reaction = viewport.width === 1440 ? 'Care' : 'Wow';
    await first.getByRole('button', { name: reaction, exact: true }).click();
    await expect(react).toContainText(reaction);
    await options.click();
    await second.getByRole('button', { name: 'Unsave post', exact: true }).click();
  }
});

test('phone touch gestures scroll every long page and the story strip', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  async function swipe(points: { x: number; y: number }[]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
    for (const point of points.slice(1)) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
      // Space actual input events so Chromium recognizes a drag instead of a tap.
      await page.waitForTimeout(40);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  try {
    for (const [route, name] of pages.filter(([, name]) => name !== 'friends')) {
      await page.goto(route);
      await expect(page.locator('#main')).toBeVisible();
      await swipe([680, 600, 520, 440, 360, 280].map((y) => ({ x: 195, y })));
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(40);
      await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeInViewport();
      if (name === 'settings') {
        const reset = await page.locator('.settings-main a[href="/settings/reset"]').boundingBox();
        const tabs = await page.locator('.mobile-tabs').boundingBox();
        expect(reset!.y + reset!.height).toBeLessThanOrEqual(tabs!.y);
      }
      expect((await page.locator('.topbar').boundingBox())?.y).toBe(0);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await page.screenshot({ path: `docs/verification/web/${name}-scrolled-390x844.png` });
    }
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Stories', exact: true })).toBeVisible();
    // Home sections (Common Ground card) sit above the strip, so swipe at its real position.
    const y = (await page.locator('.stories').boundingBox())!.y + 80;
    await swipe([330, 275, 220, 165, 110, 55].map((x) => ({ x, y })));
    await expect
      .poll(() => page.locator('.stories').evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(200);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({ path: 'docs/verification/web/stories-scrolled-390x844.png' });
  } finally {
    await context.close();
  }
});

test('local photo posts survive refresh and picker cancellation preserves the draft', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: /What.s on your mind/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Create post' });
  await dialog.getByLabel('Post text').fill('A photo from our community garden.');
  await dialog.getByLabel('Post audience').selectOption('Only me');
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Add photo', exact: true }).click();
  await (await chooser).setFiles('assets/images/garden-harvest.jpg');
  await expect(dialog.getByAltText('Selected photo')).toBeVisible();
  await dialog.getByRole('button', { name: 'Post', exact: true }).click();
  await page.reload();
  const card = page
    .getByTestId('post-card')
    .filter({ hasText: 'A photo from our community garden.' });
  await expect(card.locator('.post-photos img')).toHaveAttribute(
    'src',
    /^data:image\/jpeg;base64,/,
  );
  await page.goto('/profile');
  await page.getByRole('button', { name: 'View As', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Profile sections' })
    .getByRole('button', { name: 'Photos', exact: true })
    .click();
  await expect(page.locator('.profile-photo-grid img[src^="data:"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Exit View As', exact: true }).click();
  await expect(page.locator('.profile-photo-grid img[src^="data:"]')).toHaveCount(1);
  await page.goto('/');

  await page
    .getByRole('button', { name: /What.s on your mind/ })
    .first()
    .click();
  await dialog.getByLabel('Post text').fill('Keep this draft.');
  const cancelChooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Add photo', exact: true }).click();
  await cancelChooser;
  await page
    .locator('input[type=file]')
    .evaluate((input) => input.dispatchEvent(new Event('cancel')));
  await expect(dialog.getByLabel('Post text')).toHaveValue('Keep this draft.');
});

test('search, secondary routes and detail fallbacks are populated and refresh safely', async ({
  page,
}) => {
  await page.goto('/search?q=coast');
  await expect(page.locator('#main a[href="/posts/post-03"]')).toBeVisible();
  await page.locator('#main a[href="/posts/post-03"]').click();
  await page.reload();
  await expect(page.getByTestId('post-card')).toHaveCount(1);
  for (const route of [
    '/video',
    '/groups',
    '/memories',
    '/saved',
    '/feeds',
    '/events',
    '/privacy',
    '/menu',
    '/profile/missing',
    '/marketplace/missing',
    '/posts/missing',
    '/stories/missing',
    '/messages/missing',
  ]) {
    await page.goto(route);
    await expect(page.locator('#main')).toBeVisible();
    expect((await page.locator('#main').innerText()).trim().length).toBeGreaterThan(15);
  }
});

test('account nesting, notifications, Messenger and composer overlays fit and dismiss', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Account menu' })).toBeVisible();
  await page.screenshot({ path: 'docs/verification/web/account-1440x900.png' });
  await page
    .getByRole('region', { name: 'Account menu' })
    .screenshot({ path: 'docs/verification/web/settings-icon-detail.png' });
  await page.getByRole('button', { name: 'Settings & privacy', exact: true }).click();
  await page.screenshot({ path: 'docs/verification/web/account-settings-1440x900.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('.header-panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.screenshot({ path: 'docs/verification/web/notifications-1440x900.png' });
  await page.keyboard.press('Escape');
  await page
    .locator('.right-rail')
    .getByRole('button', { name: /Amina Rahman/ })
    .click();
  await expect(page.getByRole('complementary', { name: 'Messenger conversation' })).toBeVisible();
  await page.screenshot({ path: 'docs/verification/web/messenger-1440x900.png' });
  await page.getByRole('button', { name: 'Close conversation', exact: true }).click();
  await page
    .getByRole('button', { name: /What.s on your mind/ })
    .first()
    .click();
  await page.screenshot({ path: 'docs/verification/web/composer-1440x900.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, name] of [
    ['/menu', 'menu'],
    ['/notifications', 'notifications'],
    ['/messages/chat-amina', 'messenger'],
  ]) {
    await page.goto(route);
    await expect(page.locator('#main')).toBeVisible();
    await page.screenshot({ path: `docs/verification/web/${name}-390x844.png` });
  }
  await page.goto('/');
  await page
    .getByRole('button', { name: /What.s on your mind/ })
    .first()
    .click();
  await page.screenshot({ path: 'docs/verification/web/composer-390x844.png' });
  await page.keyboard.press('Escape');
  await page.goto('/settings/display');
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.screenshot({ path: 'docs/verification/web/settings-dark-390x844.png' });
});

const { expect, test } = require('@playwright/test');

const firebaseStub = `
  window.firebase = {
    apps: [],
    initializeApp(config) { this.apps.push({ config }); return this.apps[0]; },
    auth() { throw new Error('Auth disabled in smoke test'); },
    database() {
      return {
        ref() {
          return {
            child() { return this; },
            on() {},
            set() { return Promise.resolve(); },
            remove() { return Promise.resolve(); },
            push() { return Promise.resolve(); },
            get() { return Promise.resolve({ exists: () => false, val: () => null }); },
          };
        },
      };
    },
    storage() {
      return {
        ref() {
          return {
            put() { return Promise.reject(new Error('Storage disabled in smoke test')); },
            delete() { return Promise.resolve(); },
            getDownloadURL() { return Promise.resolve(''); },
          };
        },
      };
    },
  };
`;

test('boots the job tracker shell without console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.route('https://www.gstatic.com/firebasejs/**', (route) => {
    route.fulfill({ contentType: 'application/javascript', body: firebaseStub });
  });
  await page.route('https://unpkg.com/leaflet@1.9.4/**', (route) => {
    if (route.request().url().endsWith('.js')) {
      route.fulfill({ contentType: 'application/javascript', body: 'window.L={map(){return {setView(){return this},remove(){},addLayer(){}}},tileLayer(){return {addTo(){}}},marker(){return {addTo(){return this},bindPopup(){return this}}}};' });
    } else {
      route.fulfill({ contentType: 'text/css', body: '' });
    }
  });
  await page.route('https://unpkg.com/leaflet.markercluster@1.5.3/**', (route) => {
    if (route.request().url().endsWith('.js')) {
      route.fulfill({ contentType: 'application/javascript', body: 'window.L && (window.L.markerClusterGroup = function () { return { addLayer() { return this; }, addTo() { return this; } }; });' });
    } else {
      route.fulfill({ contentType: 'text/css', body: '' });
    }
  });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());

  await page.goto('/');

  await expect(page.getByRole('banner')).toContainText('Job Tracker');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Jobs/ })).toBeVisible();
  await expect(page.locator('#content')).toBeVisible();

  await page.getByRole('button', { name: /Jobs/ }).click();
  await expect(page.locator('#content')).toContainText(/job|lead|active|complete/i);

  expect(errors).toEqual([]);
});

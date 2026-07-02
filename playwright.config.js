const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'npx http-server . -a 127.0.0.1 -p 4173 -c-1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});

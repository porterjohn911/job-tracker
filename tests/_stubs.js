// Shared browser stubs for the Playwright specs. The app boots against real
// Firebase/Leaflet CDNs; tests route those to these no-op stand-ins so a page
// load neither hits the network nor needs credentials.

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

const leafletStub = 'window.L={map(){return {setView(){return this},remove(){},addLayer(){}}},tileLayer(){return {addTo(){}}},marker(){return {addTo(){return this},bindPopup(){return this}}}};';
const clusterStub = 'window.L && (window.L.markerClusterGroup = function () { return { addLayer() { return this; }, addTo() { return this; } }; });';

// Route every third-party asset the shell pulls in to a stub.
async function stubExternals(page) {
  await page.route('https://www.gstatic.com/firebasejs/**', (route) => {
    route.fulfill({ contentType: 'application/javascript', body: firebaseStub });
  });
  await page.route('https://unpkg.com/leaflet@1.9.4/**', (route) => {
    if (route.request().url().endsWith('.js')) route.fulfill({ contentType: 'application/javascript', body: leafletStub });
    else route.fulfill({ contentType: 'text/css', body: '' });
  });
  await page.route('https://unpkg.com/leaflet.markercluster@1.5.3/**', (route) => {
    if (route.request().url().endsWith('.js')) route.fulfill({ contentType: 'application/javascript', body: clusterStub });
    else route.fulfill({ contentType: 'text/css', body: '' });
  });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
}

module.exports = { firebaseStub, stubExternals };

// Shared network stubs so the app boots offline (no Firebase / Leaflet / fonts).
const firebaseStub = `
  window.firebase = {
    apps: [],
    initializeApp(config) { this.apps.push({ config }); return this.apps[0]; },
    auth() { return { onAuthStateChanged(cb){ cb(null); }, signInAnonymously(){ return Promise.resolve(); } }; },
    database() {
      return {
        ref() {
          return {
            child() { return this; },
            on() {}, off() {},
            once() { return Promise.resolve({ exists: () => false, val: () => null }); },
            set() { return Promise.resolve(); },
            update() { return Promise.resolve(); },
            remove() { return Promise.resolve(); },
            push() { return { key: 'stub', set(){ return Promise.resolve(); } }; },
            get() { return Promise.resolve({ exists: () => false, val: () => null }); },
          };
        },
      };
    },
    storage() {
      return { ref() { return {
        put() { return Promise.reject(new Error('Storage disabled in audit')); },
        child() { return this; },
        delete() { return Promise.resolve(); },
        getDownloadURL() { return Promise.resolve(''); },
      }; } };
    },
    messaging() { return { getToken(){ return Promise.resolve(''); }, onMessage(){} }; },
  };
`;

async function installStubs(page) {
  await page.route('https://www.gstatic.com/firebasejs/**', (route) => {
    route.fulfill({ contentType: 'application/javascript', body: firebaseStub });
  });
  await page.route('https://unpkg.com/leaflet@1.9.4/**', (route) => {
    if (route.request().url().endsWith('.js')) {
      route.fulfill({ contentType: 'application/javascript', body: 'window.L={map(){return {setView(){return this},remove(){},addLayer(){},on(){return this}}},tileLayer(){return {addTo(){}}},marker(){return {addTo(){return this},bindPopup(){return this}}},divIcon(){return {}},latLngBounds(){return {extend(){}}}};' });
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
}

const NAV_VIEWS = ['dashboard','jobs','customers','schedule','invoices','bank','referrals','map','reports','activity','team','time'];

module.exports = { installStubs, NAV_VIEWS };

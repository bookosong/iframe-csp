(function() {
  'use strict';
  
  // Avoid redeclaration if script is loaded multiple times
  if (window.metasoServiceWorkerLoaded) {
    console.log('ServiceWorker script already loaded, skipping...');
    return;
  }
  window.metasoServiceWorkerLoaded = true;
  
  let deferredPrompt = null;
  
  window.addEventListener("beforeinstallprompt",(e)=>{
    console.log('beforeinstallprompt-------')
    deferredPrompt = e;
    window.addToDesktop = function addToDesktop(){
      if (deferredPrompt) {
        deferredPrompt.prompt();
      }
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/serviceWorker.js').then(function (registration) {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      }, function (err) {
        console.error('ServiceWorker registration failed: ', err);
      });
    });
  }
})();



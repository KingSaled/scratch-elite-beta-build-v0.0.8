// src/core/browser/all.ts
export const browserAll = (() => {
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isMobile = isIOS || isAndroid;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isFirefox = /firefox/i.test(navigator.userAgent);

  return {
    isIOS,
    isAndroid,
    isMobile,
    isSafari,
    isFirefox,
  };
})();

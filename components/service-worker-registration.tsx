'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      // A previously installed production worker can otherwise serve an old
      // app shell over the local development build and cause hydration errors.
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations.map((registration) => registration.unregister()),
          ),
        );

      if ('caches' in window) {
        void caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith('movie-companion-shell-'))
                .map((key) => caches.delete(key)),
            ),
          );
      }
      return;
    }

    const register = () => {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
      const scope = `${basePath}/`;
      void navigator.serviceWorker.register(`${basePath}/sw.js`, { scope });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}

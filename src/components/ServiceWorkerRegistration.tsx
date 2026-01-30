import { useRegisterSW } from 'virtual:pwa-register/react';

export function ServiceWorkerRegistration() {
  useRegisterSW({
    onRegisteredSW(swUrl) {
      console.info('[SW] Registered:', swUrl);
    },
    onRegisterError(error) {
      console.info('[SW] Registration unavailable:', error.message);
    },
  });

  return null;
}

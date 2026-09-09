import { useEffect, useState } from 'react';

/**
 * Whether the browser believes it has a network.
 *
 * `navigator.onLine` is only trustworthy in one direction: false means there is
 * certainly no connection, true means there is an interface up and says nothing
 * about whether anything is reachable. So this is used to explain a failure and
 * to warn before one, never to claim a request will succeed.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // The state can have changed between the first render and this effect.
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

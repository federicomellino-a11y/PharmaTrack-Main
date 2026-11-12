import { useLayoutEffect } from 'react';
import { scalaTesto } from '@/lib/vociMenu';

export const useDimensioneTesto = (valore) => {
  useLayoutEffect(() => {
    const radice = document.documentElement;
    radice.style.fontSize = `${scalaTesto(valore)}%`;
    return () => { radice.style.fontSize = ''; };
  }, [valore]);
};

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { funzioneAttiva } from '@/lib/funzioniFarmacia';

/* FunzioneGate: la porta chiusa di una funzione spenta dalla farmacia.

   Il menu non basta: un segnalibro o un link vecchio devono trovare la stessa
   risposta del menu. Non e' un errore, quindi non c'e' nessun messaggio rosso:
   si torna in home, dove la funzione non serviva.
*/
export default function FunzioneGate({ funzione, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!funzione) return <>{children}</>;
  if (funzioneAttiva(user, funzione)) return <>{children}</>;
  return <Navigate to="/dashboard" replace state={{ da: location.pathname }} />;
}

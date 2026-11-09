/* Regole dei clienti che non hanno bisogno di React ne' della rete.

   Stavano in cima a Customers.jsx, dove convivevano con la pagina: cosi'
   eta', unione in lista e statistiche iniziali si possono provare da sole.
*/

import { ensureArray } from './collections';

// Le etichette stanno in un posto solo: lib/deliveryDisplay.js
export { STATUS_LABELS as statusLabels } from './deliveryDisplay';

export const paymentLabels = {
  cash: 'Contanti',
  pos: 'POS',
  other: 'Altro',
};

export const emptyForm = {
  name: '',
  phone: '',
  extra_phones: [],
  address: '',
  email: '',
  fiscal_code: '',
  notes: '',
  customer_lat: null,
  customer_lng: null,
  place_id: '',
};




export const calculateAge = (birthDate) => {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
};

export const mergeCustomerIntoList = (customers, updatedCustomer) => {
  const safeCustomers = ensureArray(customers);
  const exists = safeCustomers.some((customer) => customer.customer_id === updatedCustomer.customer_id);
  if (!exists) return [updatedCustomer, ...safeCustomers];
  return safeCustomers.map((customer) => (
    customer.customer_id === updatedCustomer.customer_id ? { ...customer, ...updatedCustomer } : customer
  ));
};

export const buildInitialCustomerStats = (customer) => ({
  customer,
  stats: {
    total_deliveries: 0,
    completed_deliveries: 0,
    cancelled_deliveries: 0,
    active_deliveries: 0,
    pending_deliveries: 0,
    total_spent: 0,
    average_order_value: 0,
    completion_rate: 0,
    cancellation_rate: 0,
    last_delivery: null,
    last_order_at: null,
    delivered_this_month: 0,
    preferred_payment_method: null,
    average_days_between_orders: null,
    payment_breakdown: {
      cash: { count: 0, total: 0 },
      pos: { count: 0, total: 0 },
      other: { count: 0, total: 0 },
    },
    verified_address: customer?.customer_lat != null && customer?.customer_lng != null,
  },
  recent_deliveries: [],
});

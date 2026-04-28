export const ensureArray = (value) => (Array.isArray(value) ? value : []);

export const ensureObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

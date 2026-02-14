const registry = new Map();

export function registerModel(name, model) {
  registry.set(name, model);
}

export function getModel(name) {
  return registry.get(name);
}

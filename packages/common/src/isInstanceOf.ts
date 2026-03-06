type ClassConstructor<T> = new (...args: any[]) => T;

export function isInstanceOf<T>(obj: unknown, cls: ClassConstructor<T>): obj is T {
  if (!obj) {
    return false;
  }

  let currentProto = Object.getPrototypeOf(obj);
  while (currentProto) {
    if (currentProto.constructor.name === cls.name) {
      return true;
    }

    currentProto = Object.getPrototypeOf(currentProto);
  }

  return false;
}

type ClassConstructor<T> = new (...args: any[]) => T

export function isInstanceOf<T>(obj: any, cls: ClassConstructor<T>): boolean {
  if (!obj)
    return false;

  // Traverse the prototype chain to support inheritance
  let currentProto = Object.getPrototypeOf(obj);
  while (currentProto) {
    if (currentProto.constructor.name === cls.name)
      return true;
    
    currentProto = Object.getPrototypeOf(currentProto);
  }

  return false;
}
/**
 * How a marked error reads on a log line, in place of its own text: its owner's code for the
 * failure and its owner's own sentence — never the text of whoever produced the error.
 */
export type ErrorLine = {
  /** The failure's code as its owner spells it (a status name, a vendor error code). */
  code?: string | number;
  /** The owner's own sentence for the failure. It is the printed error's whole message. */
  sentence: string;
  /** Further facts that are safe on any line; they ride the printed error as enumerable properties. */
  facts?: { [name: string]: unknown };
};

type Marks = WeakMap<object, () => ErrorLine | undefined>;
type Store = { marks: Marks; any: boolean };
/** What one container holds, read once: its own properties, and a Map's entries or a Set's values. */
type Reading = {
  /** The empty copy-to-be: an array, a Map or a Set of the container's prototype, or an object of it. */
  shell: object;
  properties: [PropertyKey, PropertyDescriptor][];
  entries?: [unknown, unknown][];
  values?: unknown[];
};

/**
 * The ONE owner of the rule that some errors never print their own text.
 *
 * An error produced by a system outside the process (a database, say) words its message itself,
 * and that wording can quote the data the failing call carried. Whoever catches such an error
 * knows that — the logger cannot, and must not import them to find out. So the catcher MARKS the
 * error (`mark`), handing over how it reads on a line: a code and a sentence of the catcher's own.
 * Every `Logger` passes what it is about to write through `forLine`, which swaps a marked error
 * for a printed stand-in: the original's name, the sentence as its message, the code and facts as
 * properties, and the original's stack FRAMES under a rebuilt header (a stack's first lines are
 * the message again). Every log writer therefore receives the stand-in, whatever it does with an
 * error: inspects it, serializes it, reads its message and stack.
 *
 * WHERE a marked error is found. As the line's `error` or `obj` itself, and inside them: in an
 * array, a plain object, a class instance, a Map (key or value), a Set, another error (its
 * `cause`, its `errors` — neither enumerates), under a string or a symbol key, enumerable or not.
 * Members are read by descriptor and through the built-in Map and Set iterators: the walk never
 * runs an accessor, a `toJSON` or any other code of the value's — so what only such code would
 * hand out (a getter's answer, a `toJSON`'s answer, a private field, a closure, a WeakMap's
 * entries) is NOT searched. The one accessor ever run is an error's own `stack`, where the
 * engine keeps it behind one.
 *
 * THE WALK IS BOUNDED, so a line costs the same however much it carries: containers are read
 * down to `WALK_DEPTH` levels below the line's value (every level the default writer prints) and
 * `WALK_VALUES` values are read in all, nearest the top first — a marked error beside a large
 * list is found before the list is. What lies beyond either bound is left AS IT IS, never
 * replaced: a marked error there prints as itself. Typed arrays and functions are not read into.
 *
 * A value that holds no marked error comes back as the SAME value. One that does comes back with
 * only the containers on the way to the marked error copied (a copy keeps its prototype and its
 * accessors; what a class keeps in private fields is not on a copy); everything else in it is
 * shared, and nothing passed in is ever changed. A container that refuses to be read (a proxy
 * that throws) is carried as one fixed phrase — that container alone.
 *
 * Marking never touches the error. The marks live in a WeakMap beside it, so the error a caller
 * catches — its properties, their enumerability, its prototype, its text — is exactly what it
 * was: nothing that decides on a thrown error (a retry loop reading a message) can be changed by
 * a mark. The map is anchored on the global object, so every copy of this package in a process
 * reads the same marks; an entry lives exactly as long as its error.
 *
 * The line is asked for at each write (`line()`), so its owner can answer by the process's
 * current state — and can answer `undefined`: print this error as it is (a development switch).
 * A line that cannot be built is not a reason to print the error: the stand-in then carries one
 * fixed sentence.
 *
 * ONLY AN ERROR OBJECT CAN BE RECOGNIZED. Text copied out of a marked error before the logger
 * sees it (`error.message` in a template, `String(error)`) is a string like any other: log the
 * error itself.
 */
export class LogLineErrors {
  /** How many levels below a line's value containers are read: the levels the default writer prints. */
  static readonly WALK_DEPTH = 10;
  /** How many values are read for one line's `obj` (or `error`), in all. */
  static readonly WALK_VALUES = 5000;

  private static readonly GLOBAL_KEY = '__proteinjs_logger_LogLineErrors';
  private static readonly UNBUILDABLE_LINE = 'An error whose log line could not be built';
  private static readonly UNREADABLE_VALUE = '(a value that could not be read for a log line)';
  /** A V8 stack frame: `    at fn (file:line:column)`, `    at file:line:column`, `    at fn (native)`, `    at <anonymous>`. */
  private static readonly STACK_FRAME = /^\s+at (?:.*:\d+:\d+\)?|.*\(native\)|.*<anonymous>\)?|.*\(index \d+\))$/;

  /** Each object the walk met, with the containers it was met in. */
  private readonly holders = new Map<object, object[]>();
  /** What is carried in place of a value: a marked error's stand-in, a refusing container's phrase. */
  private readonly swaps = new Map<object, unknown>();
  private remaining = LogLineErrors.WALK_VALUES;

  private constructor(private readonly marks: Marks) {}

  /**
   * Declares that `error` never prints its own text: a line carries what `line()` answers when
   * the line is written — or the error as it is, when `line()` answers `undefined`. Only an
   * object can be marked; marking again replaces the line. Never throws.
   */
  static mark(error: unknown, line: () => ErrorLine | undefined): void {
    if (!LogLineErrors.isObject(error)) {
      return;
    }
    const store = LogLineErrors.store();
    store.marks.set(error, line);
    store.any = true;
  }

  /** Whether `error` is marked. */
  static isMarked(error: unknown): boolean {
    return LogLineErrors.isObject(error) && LogLineErrors.store().marks.has(error);
  }

  /**
   * `value` as a log line carries it: every marked error found in it (see the class comment:
   * where, and within which bounds) swapped for its printed stand-in. A value in which none is
   * found comes back as the SAME value. Never throws; changes nothing passed in. Until something
   * in the process is marked, nothing is read at all.
   */
  static forLine<T>(value: T): T {
    const store = LogLineErrors.store();
    if (!store.any || !LogLineErrors.isObject(value)) {
      return value;
    }
    return new LogLineErrors(store.marks).carried(value) as T;
  }

  private static store(): Store {
    const globalObject = globalThis as { [key: string]: unknown };
    if (!globalObject[LogLineErrors.GLOBAL_KEY]) {
      globalObject[LogLineErrors.GLOBAL_KEY] = { marks: new WeakMap(), any: false } as Store;
    }
    return globalObject[LogLineErrors.GLOBAL_KEY] as Store;
  }

  private static isObject(value: unknown): value is object {
    return (typeof value === 'object' || typeof value === 'function') && value !== null;
  }

  /** The line's value with what the bounded walk found swapped — itself, when nothing was found. */
  private carried(root: object): unknown {
    let level: object[] = [];
    this.meet(root, undefined, level);
    for (let depth = 0; depth <= LogLineErrors.WALK_DEPTH && level.length > 0 && this.remaining > 0; depth++) {
      const next: object[] = [];
      for (const container of level) {
        if (this.remaining <= 0) {
          break;
        }
        this.readInto(container, next);
      }
      level = next;
    }
    return this.swaps.size === 0 ? root : this.copied(root);
  }

  /** Reads one container's members, nearest-first order kept by `next`: the containers one level down. */
  private readInto(container: object, next: object[]): void {
    try {
      this.eachMember(container, (member) => {
        this.remaining--;
        if (LogLineErrors.isObject(member)) {
          this.meet(member, container, next);
        }
        return this.remaining > 0;
      });
    } catch {
      this.swaps.set(container, LogLineErrors.UNREADABLE_VALUE);
    }
  }

  /** Records where `value` was met; the first time, swaps it if it is marked — or queues it to be read. */
  private meet(value: object, holder: object | undefined, next: object[]): void {
    const known = this.holders.get(value);
    if (known) {
      if (holder) {
        known.push(holder);
      }
      return;
    }
    this.holders.set(value, holder ? [holder] : []);
    const line = this.marks.get(value);
    if (line) {
      const printed = this.printedOrAsIs(value, line);
      if (printed !== value) {
        this.swaps.set(value, printed);
      }
      return;
    }
    if (this.isReadInto(value)) {
      next.push(value);
    }
  }

  /**
   * The line's value with every swap applied. Only the containers that lead to a swap are
   * copied. Everything is READ first (a container that refuses now becomes a swap itself) and
   * the copies are built after, from what was read — a cycle closes on the copy, never back on
   * the original.
   */
  private copied(root: object): unknown {
    const readings = new Map<object, Reading>();
    const pending = [...this.swaps.keys()];
    while (pending.length > 0) {
      for (const holder of this.holders.get(pending.pop() as object) ?? []) {
        if (readings.has(holder) || this.swaps.has(holder)) {
          continue;
        }
        try {
          readings.set(holder, this.reading(holder));
        } catch {
          this.swaps.set(holder, LogLineErrors.UNREADABLE_VALUE);
        }
        pending.push(holder);
      }
    }
    const carriedMember = (member: unknown): unknown => {
      if (!LogLineErrors.isObject(member)) {
        return member;
      }
      if (this.swaps.has(member)) {
        return this.swaps.get(member);
      }
      const reading = readings.get(member);
      if (reading) {
        return reading.shell;
      }
      // A member the bounded walk never reached is still looked at here, where it costs nothing.
      const line = this.marks.get(member);
      return line ? this.printedOrAsIs(member, line) : member;
    };
    for (const reading of readings.values()) {
      this.fill(reading, carriedMember);
    }
    return carriedMember(root);
  }

  /** Builds a copy from what was read of its container; touches nothing but the copy. */
  private fill({ shell, properties, entries, values }: Reading, carriedMember: (member: unknown) => unknown): void {
    for (const [key, descriptor] of properties) {
      Object.defineProperty(
        shell,
        key,
        'value' in descriptor ? { ...descriptor, value: carriedMember(descriptor.value) } : descriptor
      );
    }
    for (const [key, value] of entries ?? []) {
      Map.prototype.set.call(shell, carriedMember(key), carriedMember(value));
    }
    for (const value of values ?? []) {
      Set.prototype.add.call(shell, carriedMember(value));
    }
  }

  /**
   * Everything `container` holds, read by descriptor and built-in iterator, with the empty copy
   * it will fill — for a copy, so not bounded. Every touch of the container happens here.
   */
  private reading(container: object): Reading {
    const prototype = Object.getPrototypeOf(container);
    const properties = Reflect.ownKeys(container).map((key): [PropertyKey, PropertyDescriptor] => [
      key,
      this.ownProperty(container, key),
    ]);
    if (Array.isArray(container)) {
      return { shell: [], properties };
    }
    if (container instanceof Map) {
      const entries: [unknown, unknown][] = [];
      Map.prototype.forEach.call(container, (value: unknown, key: unknown) => entries.push([key, value]));
      return { shell: Object.setPrototypeOf(new Map(), prototype), properties, entries };
    }
    if (container instanceof Set) {
      const values: unknown[] = [];
      Set.prototype.forEach.call(container, (value: unknown) => values.push(value));
      return { shell: Object.setPrototypeOf(new Set(), prototype), properties, values };
    }
    return { shell: Object.create(prototype), properties };
  }

  /**
   * One own property as a copy carries it. Where the engine keeps an error's stack behind an
   * accessor of its own, the accessor answers nothing on a copy: the copy carries the text.
   */
  private ownProperty(container: object, key: PropertyKey): PropertyDescriptor {
    const descriptor = Reflect.getOwnPropertyDescriptor(container, key) as PropertyDescriptor;
    if (key !== 'stack' || 'value' in descriptor || !this.isError(container)) {
      return descriptor;
    }
    return { value: (container as Error).stack, writable: true, enumerable: false, configurable: true };
  }

  /**
   * Hands `visit` each value `container` holds until it answers `false`: an array's elements by
   * index (its own keys are never listed — a long array costs what is read of it), a Map's keys
   * and values, a Set's values, and the own data properties of anything, string- or symbol-keyed,
   * enumerable or not. Read by descriptor: an accessor is never run.
   */
  private eachMember(container: object, visit: (member: unknown) => boolean): void {
    if (Array.isArray(container)) {
      for (let index = 0; index < container.length; index++) {
        const descriptor = Reflect.getOwnPropertyDescriptor(container, index);
        if (descriptor && 'value' in descriptor && !visit(descriptor.value)) {
          return;
        }
      }
      return;
    }
    if (container instanceof Map) {
      const entries = Map.prototype.entries.call(container) as IterableIterator<[unknown, unknown]>;
      for (let entry = entries.next(); !entry.done; entry = entries.next()) {
        if (!visit(entry.value[0]) || !visit(entry.value[1])) {
          return;
        }
      }
    } else if (container instanceof Set) {
      const values = Set.prototype.values.call(container) as IterableIterator<unknown>;
      for (let value = values.next(); !value.done; value = values.next()) {
        if (!visit(value.value)) {
          return;
        }
      }
    }
    for (const key of Reflect.ownKeys(container)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(container, key);
      if (descriptor && 'value' in descriptor && !visit(descriptor.value)) {
        return;
      }
    }
  }

  /** Typed arrays (their keys are their bytes) and functions hold no errors worth a walk; everything else is read into. */
  private isReadInto(value: object): boolean {
    return typeof value !== 'function' && !ArrayBuffer.isView(value);
  }

  /** The stand-in for a marked error — or the error itself when its owner says to print it as it is. */
  private printedOrAsIs(error: object, line: () => ErrorLine | undefined): unknown {
    let answer: ErrorLine | undefined;
    try {
      answer = line();
      if (answer === undefined) {
        return error;
      }
      if (typeof answer.sentence !== 'string') {
        answer = { sentence: LogLineErrors.UNBUILDABLE_LINE };
      }
    } catch {
      answer = { sentence: LogLineErrors.UNBUILDABLE_LINE };
    }
    return this.printedError(error, answer);
  }

  private printedError(error: object, line: ErrorLine): Error {
    const printed = new Error(line.sentence);
    const name = this.read(() => (error as { name?: unknown }).name);
    printed.name = typeof name === 'string' && name ? name : 'Error';
    const frames = this.frames(this.read(() => (error as { stack?: unknown }).stack));
    printed.stack = [`${printed.name}: ${line.sentence}`, ...frames].join('\n');
    try {
      Object.assign(printed, line.facts ?? {}, line.code !== undefined ? { code: line.code } : {});
    } catch {
      // Facts that cannot be read are left off; the sentence stands.
    }
    return printed;
  }

  /** The frames of a stack, and nothing else of it: whatever is not a frame may be the message, on any number of lines. */
  private frames(stack: unknown): string[] {
    return typeof stack === 'string' ? stack.split('\n').filter((each) => LogLineErrors.STACK_FRAME.test(each)) : [];
  }

  /** An error of this realm or another's (a sandboxed test file meets errors made outside its sandbox). */
  private isError(value: object): boolean {
    return value instanceof Error || Object.prototype.toString.call(value) === '[object Error]';
  }

  private read(fact: () => unknown): unknown {
    try {
      return fact();
    } catch {
      return undefined;
    }
  }
}

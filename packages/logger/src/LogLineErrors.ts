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

/**
 * The ONE owner of the rule that some errors never print their own text.
 *
 * An error produced by a system outside the process (a database, say) words its message itself,
 * and that wording can quote the data the failing call carried. Whoever catches such an error
 * knows that — the logger cannot, and must not import them to find out. So the catcher MARKS the
 * error (`mark`), handing over how it reads on a line: a code and a sentence of the catcher's own.
 * Every `Logger` passes what it is about to write through `forLine`, which swaps a marked error —
 * as the `error` of a line, anywhere inside its `obj`, as the `cause` of another error or among
 * its `errors` — for a printed stand-in: the original's name, the sentence as its message, the
 * code and facts as properties, and the original's stack FRAMES under a rebuilt header (a stack's
 * first lines are the message again). Every log writer therefore receives the stand-in, whatever
 * it does with an error: inspects it, serializes it, reads its message and stack.
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
 */
export class LogLineErrors {
  private static readonly GLOBAL_KEY = '__proteinjs_logger_LogLineErrors';
  private static readonly UNBUILDABLE_LINE = 'An error whose log line could not be built';
  private static readonly UNWALKABLE_VALUE = '(a value that could not be prepared for a log line)';
  /** A V8 stack frame: `    at fn (file:line:column)`, `    at file:line:column`, `    at fn (native)`, `    at <anonymous>`. */
  private static readonly STACK_FRAME = /^\s+at (?:.*:\d+:\d+\)?|.*\(native\)|.*<anonymous>\)?|.*\(index \d+\))$/;

  private readonly copies = new Map<object, unknown>();

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
   * `value` as a log line carries it: every marked error in it swapped for its printed stand-in.
   * A value that holds no marked error comes back as the SAME value; one that does comes back as
   * a copy, and nothing passed in is ever changed. Never throws — and never answers a value it
   * could not walk (a proxy that refuses to be read): once anything in the process is marked,
   * such a value is carried as one fixed phrase, because what cannot be walked cannot be cleared.
   */
  static forLine<T>(value: T): T {
    const store = LogLineErrors.store();
    if (!store.any) {
      return value;
    }
    try {
      const walk = new LogLineErrors(store.marks);
      return walk.holdsMarked(value, new Set()) ? (walk.copyOf(value) as T) : value;
    } catch {
      return LogLineErrors.UNWALKABLE_VALUE as unknown as T;
    }
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

  /** Whether a marked error is `value` or is reachable from it through what is walked. */
  private holdsMarked(value: unknown, visited: Set<object>): boolean {
    if (!LogLineErrors.isObject(value)) {
      return false;
    }
    if (this.marks.has(value)) {
      return true;
    }
    if (visited.has(value) || !this.isWalked(value)) {
      return false;
    }
    visited.add(value);
    return this.members(value).some(([, member]) => this.holdsMarked(member, visited));
  }

  /**
   * `value` with every marked error swapped: a marked error becomes its stand-in, a walked
   * container becomes a copy of itself (registered BEFORE its members are copied, so a cycle
   * closes on the copy, never back on the original), anything else is itself.
   */
  private copyOf(value: unknown): unknown {
    if (!LogLineErrors.isObject(value)) {
      return value;
    }
    if (this.copies.has(value)) {
      return this.copies.get(value);
    }
    const line = this.marks.get(value);
    if (line) {
      const printed = this.printedOrAsIs(value, line);
      this.copies.set(value, printed);
      return printed;
    }
    if (!this.isWalked(value)) {
      return value;
    }
    const copy: object = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
    this.copies.set(value, copy);
    const descriptors = Object.getOwnPropertyDescriptors(value) as { [key: string]: PropertyDescriptor };
    if (this.isError(value) && descriptors.stack && !('value' in descriptors.stack)) {
      // Where the engine keeps an error's stack behind an accessor of its own, the accessor
      // answers nothing on a copy: the copy carries the text.
      descriptors.stack = { value: (value as Error).stack, writable: true, enumerable: false, configurable: true };
    }
    for (const key of Object.keys(descriptors)) {
      if ('value' in descriptors[key]) {
        descriptors[key] = { ...descriptors[key], value: this.copyOf(descriptors[key].value) };
      }
    }
    Object.defineProperties(copy, descriptors);
    return copy;
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

  /** Arrays, plain objects and errors are walked; anything else (a Date, a Buffer, a Map, a class instance) prints as it is. */
  private isWalked(value: object): boolean {
    if (Array.isArray(value) || this.isError(value)) {
      return true;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || prototype === Object.prototype;
  }

  /**
   * The own DATA properties of a walked value, enumerable or not — an error's `cause` and
   * `errors` do not enumerate. Read by descriptor: an accessor is never run.
   */
  private members(value: object): [string, unknown][] {
    const descriptors = Object.getOwnPropertyDescriptors(value) as { [key: string]: PropertyDescriptor };
    return Object.keys(descriptors)
      .filter((key) => 'value' in descriptors[key])
      .map((key) => [key, descriptors[key].value]);
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

import { addBreadcrumb } from '@sentry/node';
import EventEmitter from 'node:events';

import { castArray } from './castArray.js';

type WrappedValue<T> = {
  v: T;
  t: number;
};

type ValueSetItem<Key, Value> = {
  ttl: number;
  val: Value;
  key: Key;
};

type CacheOptions = {
  /**
   * If enabled, all values will be stringified during the set operation
   *
   * @type {boolean}
   * @memberof Options
   */
  forceString?: boolean;

  objectValueSize?: number;
  promiseValueSize?: number;
  arrayValueSize?: number;

  /**
   * standard time to live in seconds. 0 = infinity
   *
   * @type {number}
   * @memberof Options
   */
  stdTTL?: number;

  /**
   * time in seconds to check all data and delete expired keys
   *
   * @type {number}
   * @memberof Options
   */
  checkperiod?: number;

  /**
   * en/disable cloning of variables.
   * disabling this is strongly encouraged when aiming for performance!
   *
   * If `true`: set operations store a clone of the value and get operations will create a fresh clone of the cached value
   * If `false` you'll just store a reference to your value
   *
   * @type {boolean}
   * @memberof Options
   */
  useClones?: boolean;

  errorOnMissing?: boolean;
  deleteOnExpire?: boolean;

  /**
   * enable legacy callbacks.
   * legacy callback support will drop in v6.x!
   *
   * @type {boolean}
   * @memberof Options
   */
  enableLegacyCallbacks?: boolean;

  /**
   * max amount of keys that are being stored.
   * set operations will throw an error when the cache is full
   *
   * @type {number}
   * @memberof Options
   */
  maxKeys?: number;
};

const wrap = <T>(
  value: T,
  ttl: number,
  options: Pick<CacheOptions, 'stdTTL'> = {}
): WrappedValue<T> => {
  const now = Date.now();
  const ttlMulti = 1000;
  let liveTime = 0;

  if (ttl === 0) {
    liveTime = 0;
  } else if (ttl) {
    liveTime = now + ttl * ttlMulti;
  } else {
    const { stdTTL } = options;
    if (stdTTL === 0) {
      liveTime = stdTTL;
    } else {
      liveTime = now + stdTTL * ttlMulti;
    }
  }

  return {
    t: liveTime,
    v: value,
  };
};
const unwrap = <T>(value: WrappedValue<T>) => value.v;

const DEFAULT_OPTIONS: CacheOptions = {
  // convert all elements to string
  forceString: false,
  // used standard size for calculating value size
  objectValueSize: 80,
  promiseValueSize: 80,
  arrayValueSize: 40,
  // standard time to live in seconds. 0 = infinity;
  stdTTL: 0,
  // time in seconds to check all data and delete expired keys
  checkperiod: 600,
  // en/disable cloning of variables. If `true` you'll get a copy of the cached variable. If `false` you'll save and get just the reference
  useClones: true,
  // whether values should be deleted automatically at expiration
  deleteOnExpire: true,
  // enable legacy callbacks
  enableLegacyCallbacks: false,
  // max amount of keys that are being stored
  maxKeys: -1,
};

/**
 * A copy of node_cache but without stats and allowing for different keys
 *
 * @export
 * @class Cache
 * @extends {EventEmitter}
 * @template Value
 * @template Key
 */
export class Cache<Value = unknown, Key = unknown> extends EventEmitter {
  #data: Map<Key, WrappedValue<Value>>;

  public options: CacheOptions;

  public checkTimeout: NodeJS.Timeout;

  public constructor(options: CacheOptions) {
    super();
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.#data = new Map();

    this._checkData();
  }

  /**
   * get a cached key and change the stats
   *
   * @param key cache key
   * @returns The value stored in the key
   */
  public get<T extends Value = Value>(key: Key): T | undefined {
    const data = this.#data.get(key);

    addBreadcrumb({
      level: 'debug',
      message: `Cache [Get]: ${String(key)}`,
    });

    if (this.#data.has(key) && this._check(key, data)) {
      return unwrap(data) as T;
    }
    return void 0;
  }

  /**
   * get multiple cached keys at once and change the stats
   *
   * @param keys an array of keys
   * @returns an object containing the values stored in the matching keys
   */
  public mget<T extends Value = Value>(keys: Key[]): Map<Key, T> {
    const output: Map<Key, T> = new Map();

    addBreadcrumb({
      level: 'debug',
      message: `Cache [MGet]: keys: ${keys.slice(0, 10)} (${keys.length
        } items)`,
    });

    for (const key of keys) {
      const data = this.#data.get(key);

      if (this.#data.has(key) && this._check(key, data)) {
        output.set(key, unwrap(data) as T);
      }
    }

    return output;
  }

  /**
   * set a cached key and change the stats
   *
   * @param key cache key
   * @param value A element to cache. If the option `option.forceString` is `true` the module trys to translate
   * it to a serialized JSON
   * @param ttl The time to live in seconds.
   */
  public set<T extends Value = Value>(
    key: Key,
    value: T,
    ttl?: number
  ): boolean {
    const usedTtl = ttl ?? this.options.stdTTL;

    addBreadcrumb({
      level: 'debug',
      message: `Cache [Set]: ${String(key)}: ${String(
        value
      )} | TTL: ${ttl}/${usedTtl}`,
    });

    this.#data.set(key, wrap(value, usedTtl, this.options));

    this.emit('set', key, value);

    return true;
  }

  /**
   * set multiple cached keys at once and change the stats
   *
   * @param keyValueSet an array of object which includes key,value and ttl
   */
  public mset<T extends Value = Value>(
    keyValueSet: ValueSetItem<Key, T>[]
  ): boolean {
    const len = keyValueSet.length;
    addBreadcrumb({
      level: 'debug',
      message: `Cache [MSet]: ${keyValueSet.length} Items`,
    });
    for (let i = 0; i < len; i++) {
      const { key, val, ttl } = keyValueSet[i];
      this.set(key, val, ttl);
    }
    return true;
  }

  /**
   * remove keys
   * @param keys cache key to delete or a array of cache keys
   * @param cb Callback function
   * @returns Number of deleted keys
   */
  public del(keys: Key | Key[]): number {
    let deleted = 0;
    const keyArr = castArray(keys);
    const data = this.#data;

    addBreadcrumb({
      level: 'debug',
      message: `Cache [Del]: ${String(keyArr.slice(0, 10))} (${keyArr.length
        } items)`,
    });

    for (const key of keyArr) {
      if (this.#data.has(key)) {
        const oldVal = data.get(key);
        data.delete(key);
        deleted++;
        this.emit('delete', key, oldVal);
      }
    }

    return deleted;
  }

  /**
   * get a cached key and remove it from the cache.
   * Equivalent to calling `get(key)` + `del(key)`.
   * Useful for implementing `single use` mechanism such as OTP, where once a value is read it will become obsolete.
   *
   * @param key cache key
   * @returns The value stored in the key
   */
  public take<T extends Value = Value>(key: Key): T | undefined {
    const output = this.get(key);

    if (this.#data.has(key)) {
      this.del(key);
    }

    return output as T;
  }

  /**
   * reset or redefine the ttl of a key. If `ttl` is not passed or set to 0 it's similar to `.del()`
   */
  public ttl(key: Key, ttl: number = this.options.stdTTL): boolean {
    if (!key) {
      return false;
    }

    const value = this.#data.get(key);
    if (this.#data.has(key) && this._check(key, value)) {
      if (ttl >= 0) {
        this.#data.set(key, wrap(value.v, ttl, this.options));
      } else {
        this.del(key);
      }
      return true;
    }
    return false;
  }

  public getTtl(key: Key): number | undefined {
    if (!key) {
      return void 0;
    }

    const value = this.#data.get(key);
    if (this.#data.has(key) && this._check(key, value)) {
      return value.t;
    }
    return void 0;
  }

  /**
   * list all keys within this cache
   * @returns An array of all keys
   */
  public keys(): IterableIterator<Key> {
    return this.#data.keys();
  }

  /**
   * get the stats
   *
   * @returns Stats data
   */
  // getStats(): Stats {

  // }

  /**
   * Check if a key is cached
   * @param key cache key to check
   * @returns Boolean indicating if the key is cached or not
   */
  public has(key: Key): boolean {
    return this.has(key) && this._check(key, this.#data.get(key));
  }

  /**
   * flush the whole data and reset the stats
   */
  public flushAll(_startPeriod = true): void {
    this.#data.clear();
    this._killCheckPeriod();
    this._checkData(_startPeriod);
    this.emit('flush');
  }

  /**
   * This will clear the interval timeout which is set on checkperiod option.
   */
  public close(): void {
    this._killCheckPeriod();
  }

  /**
   * flush the stats and reset all counters to 0
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public flushStats(): void { }

  private _check(key: Key, data) {
    let ret = true;
    if (data.t !== 0 && data.t < Date.now()) {
      if (this.options.deleteOnExpire) {
        ret = false;
        this.del(key);
      }
      this.emit('expired', key, unwrap(data));
    }
    return ret;
  }

  private _killCheckPeriod() {
    if (this.checkTimeout != null) {
      const { checkTimeout } = this;
      this.checkTimeout = null;
      clearTimeout(checkTimeout);
    }
  }

  private _checkData(startPeriod = false): void {
    const ref = this.#data;

    for (const [key, value] of ref) {
      this._check(key, value);
    }

    if (startPeriod && this.options.checkperiod > 0) {
      this.checkTimeout = setTimeout(
        this._checkData,
        this.options.checkperiod * 1000,
        startPeriod
      );
      if (this.checkTimeout?.unref != null) {
        this.checkTimeout.unref();
      }
    }
  }
}

const objectToString = Object.prototype.toString
const toTypeString = (value) => objectToString.call(value)
const toRawType = (value) => {
  // 从类似“[object RawType]”的字符串中提取“RawType”
  return toTypeString(value).slice(8, -1)
}

// 代理普通对象
let activeEffect = null
let effectStack = []
const bucket = new WeakMap()

const SYMBOL_ITERATOR_KEY = Symbol('iterator')
const TRIGGER_TYPE = {
  ADD: 'ADD',
  SET: 'SET',
  DELELTE: 'DELETE',
}

let cleanup = (effectFn) => {
  // 清除副作用
  effectFn.deps.forEach((dep) => {
    dep.delete(effectFn)
  })
  effectFn.deps.length = 0
}

let effect = (fn, options) => {
  let effectFn = () => {
    cleanup(effectFn)
    activeEffect = effectFn
    effectStack.push(effectFn)
    let res = fn()
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }
  effectFn.options = options
  effectFn.deps = []

  //   如果有lazy延迟执行
  if (!effectFn.options?.lazy) {
    effectFn()
  }
  return effectFn
}

let track = (target, key) => {
  if (!activeEffect) return
  let depMap = bucket.get(target)
  if (!depMap) bucket.set(target, (depMap = new Map()))
  let deps = depMap.get(key)
  if (!deps) depMap.set(key, (deps = new Set()))
  deps.add(activeEffect)
  activeEffect.deps.push(deps)
}

let trigger = (target, key, type, newVal) => {
  let depMap = bucket.get(target)
  if (!depMap) {
    return
  }
  let deps = depMap.get(key)
  let effectToRun = new Set()
  deps &&
    deps.forEach((effectFn) => {
      if (effectFn !== activeEffect) {
        effectToRun.add(effectFn)
      }
    })

  if (
    Array.isArray(target) &&
    (type === TRIGGER_TYPE.ADD || type === TRIGGER_TYPE.DELELTE)
  ) {
    let lengthEffect = depMap.get('length')
    lengthEffect.forEach((effectFn) => {
      if (activeEffect !== effectFn) {
        effectToRun.add(effectFn)
      }
    })
  }

  //当 target是Array 时 把大于 newVal的依赖取出执行
  if (Array.isArray(target) && key === 'length') {
    depMap.forEach((effects, index) => {
      if (index >= newVal) {
        effects &&
          effects.forEach((effectFn) => {
            if (activeEffect !== effectFn) {
              effectToRun.add(effectFn)
            }
          })
      }
    })
  }

  // forin 或者  foreach 遍历数据类型为 Map 并且是Set操作时触发对应副作用
  if (
    type === TRIGGER_TYPE.ADD ||
    type === TRIGGER_TYPE.DELELTE ||
    (type == TRIGGER_TYPE.SET && toRawType(target) === 'Map')
  ) {
    let iteratorDeps = depMap.get(SYMBOL_ITERATOR_KEY)
    iteratorDeps &&
      iteratorDeps.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectToRun.add(effectFn)
        }
      })
  }

  effectToRun &&
    effectToRun.forEach((effectFn) => {
      if (effectFn?.options?.scheduler) {
        effectFn.options.scheduler(effectFn)
      } else {
        effectFn()
      }
    })
}

let computed = (fn) => {
  let self
  let dirty = true
  let objSyb = Symbol('value')
  let effectFn = effect(fn, {
    scheduler() {
      dirty = true
      trigger(obj, objSyb)
    },
    lazy: true,
  })

  let obj = {
    get value() {
      if (dirty) {
        self = effectFn()
        dirty = false
      }
      track(obj, objSyb)
      return self
    },
  }

  return obj
}

let traverse = (value, seen) => {
  if (typeof value !== 'object' || value === null) {
    return value
  }
  seen = seen || new Set()

  if (seen.has(value)) {
    return
  }
  seen.add(value)
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], seen)
    }
  } else if (Object.prototype.toString.call(value) === '[object object]') {
    for (const key in value) {
      traverse(value[key], seen)
    }
  }
  return value
}

let watch = (source, cb, options) => {
  let getter, newVal, oldVal, cleanup
  if (Array.isArray(source)) {
    getter = () =>
      source.map((fn) => {
        let res = fn()
        return res
      })
  } else if (typeof source !== 'function') {
    getter = () => traverse(source)
  } else {
    getter = source
  }

  let job = () => {
    newVal = effectFn()
    if (cleanup) {
      cleanup()
    }
    cb(newVal, oldVal, onInvaildate)
    oldVal = newVal
  }
  let onInvaildate = (fn) => {
    if (fn) {
      cleanup = fn
    }
  }

  let effectFn = effect(getter, {
    scheduler: () => {
      if (options?.flush) {
        let p = Promise.resolve()
        p.then(job)
      } else {
        job()
      }
    },
    lazy: true,
    immediate: true,
  })
  if (options?.immediate) {
    job()
  }
  oldVal = effectFn()
}

const arrayInstrumentations = {}
let shouldTrack = true
;['includes', 'indexOf', 'lastIndexOf'].forEach((methodStr) => {
  let originMethod = Array.prototype[methodStr]
  arrayInstrumentations[methodStr] = function (...args) {
    let res = originMethod.apply(this, args)
    if (res === false || res === -1) {
      res = originMethod.apply(this.raw, args)
    }
    return res
  }
})
;['pop', 'push', 'shift', 'unshift', 'splice'].forEach((methodStr) => {
  let originMethod = Array.prototype[methodStr]
  arrayInstrumentations[methodStr] = function (...args) {
    shouldTrack = false
    let res = originMethod.apply(this, args)
    if (res === false || res === -1) {
      res = originMethod.apply(this.raw, args)
    }
    shouldTrack = true
    return res
  }
})
const mutableInstrumentations = {
  add(key) {
    const target = this.raw
    const hadkey = target.has(key)
    let res = target.add(key)
    //add 时 Set中存在key不触发依赖
    if (!hadkey) {
      trigger(target, key, TRIGGER_TYPE.ADD)
    }
    return res
  },
  delete(key) {
    const target = this.raw
    const hadkey = target.has(key)
    let res = target.delete(key)
    // delete 时 Set中存在key触发依赖
    if (hadkey) {
      trigger(target, key, TRIGGER_TYPE.DELELTE)
    }
    return res
  },
  get(key) {
    const target = this.raw
    const had = target.has(key)
    track(target, key)
    // 如果存在并且是obj 深度代理
    if (had) {
      let res = target.get(key)
      return typeof res === 'object' ? reactive(res) : res
    }
  },
  set(key, val) {
    const target = this.raw
    const had = target.has(key)
    const oldVal = target.get(key)

    // set 一个响应式数据 找到原始数据存入
    const rawVal = val.raw || val
    let res = target.set(key, rawVal)

    // 不存在 修改触发trigger
    if (!had) {
      trigger(target, key, TRIGGER_TYPE.ADD)
    } else if (oldVal !== val || (oldVal === oldVal && val === val)) {
      trigger(target, key, TRIGGER_TYPE.SET)
    }
    return res
  },
  forEach(callback, thisArg) {
    const target = this.raw
    const wrap = (val) => (typeof val === 'object' ? reactive(val) : val)
    track(target, SYMBOL_ITERATOR_KEY)
    target.forEach((val, key) => {
      callback.call(thisArg, wrap(val), wrap(key), this)
    })
  },
}

function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      if (key === 'raw' || !shouldTrack) return target

      //   代理new Set 代理 new  Map
      if (toRawType(target) === 'Set' || toRawType(target) === 'Map') {
        if (key === 'size') {
          track(target, SYMBOL_ITERATOR_KEY)
          return Reflect.get(target, key, target)
        }
        return mutableInstrumentations[key]
      }

      //  代理 array
      if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver)
      }
      if (!isReadonly && typeof key !== 'symbol') {
        track(target, key)
      }
      const res = Reflect.get(target, key, receiver)
      if (isShallow) return res

      if (typeof res === 'object' && res !== null) {
        return isReadonly ? readonly(res) : reactive(res)
      }
      return res
    },
    set(target, key, newVal, receiver) {
      if (isReadonly) {
        console.warn(`修改失败 ${key} 是只读的`)
        return true
      }
      let oldVal = target[key]
      let type
      if (Array.isArray(target)) {
        type =
          Number(key) >= target.length ? TRIGGER_TYPE.ADD : TRIGGER_TYPE.SET
      } else {
        type = Object.prototype.hasOwnProperty.call(target, key)
          ? TRIGGER_TYPE.SET
          : TRIGGER_TYPE.ADD
      }

      let res = Reflect.set(target, key, newVal, receiver)
      if (target === receiver.raw) {
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          trigger(target, key, type, newVal)
        }
      }
      return res
    },
    ownKeys(target) {
      track(target, Array.isArray(target) ? 'length' : SYMBOL_ITERATOR_KEY)
      return Reflect.ownKeys(target)
    },
    deleteProperty(target, key) {
      // 只读
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`, isReadonly)
        return true
      }
      const hadKeys = Object.prototype.hasOwnProperty.call(target, key)
      let res = Reflect.deleteProperty(target, key)
      if (hadKeys && res) {
        trigger(target, key, TRIGGER_TYPE.DELELTE)
      }
      return res
    },
  })
}

const reactiveMap = new Map()
function reactive(obj) {
  // 数组中传入对象会被二次代理，
  let existionProxy = reactiveMap.get(obj)
  if (existionProxy) {
    return existionProxy
  }
  let proxy = createReactive(obj)
  reactiveMap.set(obj, proxy)
  return proxy
}

function shallowReactive(obj) {
  return createReactive(obj, true)
}

function readonly(obj) {
  return createReactive(obj, false, true)
}

function shallowReadonly(obj) {
  return createReactive(obj, true, true)
}

// 避免污染原始数据
const mp = new Map()
const st = new Set([6, 7, 8, 9])
const p = reactive(mp)
p.set('s', st)
effect(() => {
  console.log(p.get('s').size)
})

p.get('s').delete()

const m = new Map()
const setKey = { a: 100 }
const set = new Set([1, 2, 3])
const p1 = reactive(m)
const p2 = reactive(
  new Map([
    ['hh', 'nihao'],
    ['h2', '不太好'],
    [setKey, set],
  ])
)
effect(() => {
  p2.forEach((val, key) => {
    console.log('value', val)
  })
})

p2.set('hh', 100)

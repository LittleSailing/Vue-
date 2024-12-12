let data = { a: 100, b: 200 }
let activeEffect
let effectStack = []
let effect = (fn, options) => {
  const effectFn = () => {
    cleanup(effectFn)
    activeEffect = effectFn
    effectStack.push(effectFn)
    let res = fn()
    effectStack.pop(effectFn)
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }
  effectFn.options = options
  effectFn.deps = []

  if (options?.lazy) {
    return effectFn
  } else {
    effectFn()
  }
}

let cleanup = (effectFn) => {
  effectFn.deps.forEach((depsSet) => {
    depsSet.delete(effectFn)
  })
  effectFn.deps.length = 0
}

let bucket = new WeakMap()
const ITERATOR_KEY = Symbol()
const TRIGGER_TYPE = {
  DELETE: 'DELETE',
  ADD: 'ADD',
  SET: 'SET',
}

function track(target, key) {
  if (!activeEffect) return
  let depsMap = bucket.get(target)
  if (!depsMap) bucket.set(target, (depsMap = new Map()))
  let depsSet = depsMap.get(key)
  if (!depsSet) depsMap.set(key, (depsSet = new Set()))
  depsSet.add(activeEffect)
  activeEffect.deps.push(depsSet)
}
function trigger(target, key, type, newVal) {
  const depsMap = bucket.get(target)
  if (!depsMap) {
    return
  }
  const depsSet = depsMap.get(key)
  const effectsToRun = new Set()
  depsSet &&
    depsSet.forEach((effectFn) => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })

  // 如果数组长度发生了改变，需要将length相关的依赖也触发
  if (Array.isArray(target) && type === TRIGGER_TYPE.ADD) {
    const lengthEffect = depsMap.get('length')
    lengthEffect &&
      lengthEffect.forEach((effectFn, index) => {
        if (effectFn !== activeEffect) {
          effectsToRun.add(effectFn)
        }
      })
  }
  // 反过来 length 发生了改变，也同时需要将key大于新的length相关的依赖触发
  if (Array.isArray(target) && key === 'length') {
    depsMap.forEach((effects, index) => {
      if (index >= newVal) {
        effects &&
          effects.forEach((effectFn) => {
            if (activeEffect !== effectFn) {
              effectsToRun.add(effectFn)
            }
          })
      }
    })
  }
  // 对ownkeys处理
  if (type === TRIGGER_TYPE.ADD || type === TRIGGER_TYPE.DELETE) {
    const iteratorEffects = depsMap.get(ITERATOR_KEY)
    iteratorEffects &&
      iteratorEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToRun.push(effectFn)
        }
      })
  }

  effectsToRun &&
    effectsToRun.forEach((effectFn) => {
      if (effectFn?.options?.scheduler) {
        effectFn.options?.scheduler(effectFn)
      } else {
        effectFn()
      }
    })
}

function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      if (key === 'raw') {
        return target
      }

      if (!isReadonly) {
        track(target, key)
      }

      const res = Reflect.get(target, key, receiver)

      if (isShallow) {
        return res
      }

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
      const oldVal = target[key]
      let type
      if (Array.isArray(target)) {
        type =
          Number(key) >= target.length ? TRIGGER_TYPE.ADD : TRIGGER_TYPE.SET
      } else {
        type = Object.prototype.hasOwnProperty.call(target, key)
          ? TRIGGER_TYPE.SET
          : TRIGGER_TYPE.ADD
      }

      const res = Reflect.set(target, key, newVal, receiver)
      if (target === receiver.raw) {
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          trigger(target, key, type, newVal)
        }
      }

      return res
    },
    ownKeys(target) {
      // 遍历时收集依赖
      track(target, Array.isArray(target) ? 'length' : ITERATOR_KEY)
      return Reflect.ownKeys(target)
    },
    deleteProperty(target, key) {
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`, isReadonly)
        return true
      }
      const hadKey = Object.prototype.hasOwnProperty.call(target, key)
      const res = Reflect.defineProperty(target, key)
      if (res && hadKey) {
        track(target, ITERATOR_KEY, TRIGGER_TYPE.DELETE)
      }
      return res
    },
  })
}

function reactive(obj) {
  return createReactive(obj)
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

function computed(fn) {
  let value
  let dirty = true
  let effectFn = effect(fn, {
    scheduler() {
      dirty = true
      trigger(obj, 'value')
    },
    lazy: true,
  })

  let obj = {
    get value() {
      if (dirty) {
        dirty = false
        value = effectFn()
      }
      track(obj, 'value')
      return value
    },
  }
  return obj
}

function traverse(value, seen = new Set()) {
  if (typeof value !== 'object' || value === 'null' || seen.has(value)) {
    return
  }
  seen.add(value)
  for (const key in value) {
    traverse(value[key], seen)
  }
  return value
}

function watch(source, cb, options = {}) {
  let getter
  let newVal, oldVal
  let cleanup
  if (typeof source === 'function') {
    getter = source
  } else {
    getter = () => traverse(source)
  }

  function onInvalidate(fn) {
    cleanup = fn
  }
  function job() {
    newVal = effectFn()
    if (cleanup) {
      cleanup()
    }
    cb(newVal, oldVal, onInvalidate)
    oldVal = newVal
  }
  const effectFn = effect(() => getter(), {
    lazy: true,
    scheduler: () => {
      if (options?.flush === 'post') {
        let resolve = Promise.resolve()
        resolve.then(job)
      } else {
        job()
      }
    },
  })
  if (options?.immediate) {
    job()
  } else {
    oldVal = effectFn()
  }
}

const r = reactive({ a: { foo: 100 } })
const r2 = reactive({ hi: '你好' })
Object.setPrototypeOf(r, r2)
effect(() => {
  console.log(r.hi, '我调用了')
})
r.hi = 10

let obj = { a: 1, b: 2 }
let effectStack = []
const bucket = new WeakMap()
let activeEffect
let cleanup = (effectFn) => {
  effectFn.deps.forEach((depsSet) => {
    depsSet.delete(effectFn)
  })
  effectFn.deps.length = 0
}
let Effect = (fn, options) => {
  let effectFn = () => {
    cleanup(effectFn)
    activeEffect = effectFn
    effectStack.push(effectFn)
    const res = fn()
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }
  effectFn.deps = []
  effectFn.options = options
  if (!effectFn.options?.lazy) {
    effectFn()
  }
  return effectFn
}
function track(target, key) {
  if (!activeEffect) {
    return
  }
  let depsMap = bucket.get(target)
  if (!depsMap) bucket.set(target, (depsMap = new Map()))
  let depsSet = depsMap.get(key)
  if (!depsSet) depsMap.set(key, (depsSet = new Set()))
  depsSet.add(activeEffect)
  activeEffect.deps.push(depsSet)
}

function trigger(target, key, type) {
  let depsMap = bucket.get(target)
  if (!depsMap) return
  let depsSet = depsMap.get(key)
  let effectFnsToRun = new Set()

  depsSet &&
    depsSet.forEach((effectFn) => {
      if (effectFn !== activeEffect) {
        effectFnsToRun.add(effectFn)
      }
    })

  if (type === 'ADD' || type === 'DELETE') {
    // 将forin也触发
    let depsItrerator = depsMap.get(ITRERATOR_KEY)
    depsItrerator &&
      depsItrerator.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectFnsToRun.add(effectFn)
        }
      })
  }

  effectFnsToRun.forEach((effectFn) => {
    if (effectFn.options?.scheduler) {
      effectFn.options?.scheduler(effectFn)
    } else {
      effectFn()
    }
  })
}

let ITRERATOR_KEY = Symbol()

let data = new Proxy(obj, {
  get(target, key, receiver) {
    track(target, key)
    return Reflect.get(target, key, receiver)
  },
  set(target, key, value, receiver) {
    const type = Object.prototype.hasOwnProperty.call(target, key)
      ? 'SET'
      : 'ADD'
    const res = Reflect.set(target, key, value, receiver)
    trigger(target, key, type)
    return res
  },
  has(target, key) {
    return Reflect.has(target, key)
  },
  ownKeys(target) {
    track(target, ITRERATOR_KEY)
    return Reflect.ownKeys(target)
  },
  deleteProperty(target, key) {
    const hadKeys = Object.prototype.hasOwnProperty.call(target, key)
    const res = Reflect.deleteProperty(target, key)
    if (hadKeys && res) {
      trigger(target, key, 'DELETE')
    }
    return res
  },
})

const computed = (sources) => {
  let value
  let dirty = true
  const effectFn = Effect(sources, {
    scheduler() {
      dirty = true
      trigger(obj, 'value')
    },
    lazy: true,
  })

  const obj = {
    get value() {
      if (dirty) {
        value = effectFn()
        dirty = false
      }
      track(obj, 'value')
      return value
    },
  }

  return obj
}

function traverse(value, seen = new Set()) {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return
  }
  seen.add(value)
  for (const key in value) {
    traverse(value[key], seen)
  }
  return value
}

const watch = (sources, cb, options) => {
  let getter
  let cleanup
  if (typeof sources === 'function') {
    getter = sources
  } else {
    getter = () => traverse(sources)
  }
  function onInvalidate(fn) {
    cleanup = fn
  }

  let newVal, oldVal
  function job() {
    newVal = effectFn()
    if (cleanup) {
      cleanup()
    }
    cb(newVal, oldVal, onInvalidate)
    oldVal = newVal
  }
  const effectFn = Effect(getter, {
    lazy: true,
    scheduler: () => {
      if (options?.flush === 'post') {
        const p = Promise.resolve()
        p.then(job)
      } else {
        job()
      }
    },
  })
  if (options?.immediate) {
    job()
  }
  oldVal = effectFn()
}

watch(
  () => data.a,
  (newVal, oldVal, onInvalidate) => {
    onInvalidate(() => {})
    console.log(newVal, '===', oldVal)
  },
  {
    immediate: true,
    flush: 'post',
  }
)

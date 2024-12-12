let activeEffect
const bucket = new WeakMap()
const effectStack = []
const obj = { foo: 100, bar: 200 }

function effect(fn, options) {
  const effectFn = () => {
    cleanup(effectFn)
    activeEffect = effectFn
    effectStack.push(activeEffect)
    const res = fn()
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }
  effectFn.deps = []
  effectFn.options = options
  if (!effectFn?.options?.lazy) {
    effectFn()
  }
  return effectFn
}
// 清除副作用
function cleanup(effectFn) {
  effectFn.deps.forEach((depsSet) => {
    depsSet.delete(effectFn)
  })
  effectFn.deps.length = 0
}

function track(target, key) {
  if (!activeEffect) {
    return
  }
  let depsMap = bucket.get(target)
  if (!depsMap) bucket.set(target, (depsMap = new Map()))
  let depsSet = depsMap.get(key)
  if (!depsSet) depsMap.set(key, (depsSet = new Set()))
  //收集依赖
  depsSet.add(activeEffect)
  activeEffect.deps.push(depsSet)
}

function trigger(target, key) {
  const depsMap = bucket.get(target)
  if (!depsMap) {
    return
  }
  const depsSet = depsMap.get(key)
  const effectFnToRun = new Set()
  depsSet.forEach((effectFn) => {
    if (effectFn !== activeEffect) {
      effectFnToRun.add(effectFn)
    }
  })

  effectFnToRun.forEach((effectFn) => {
    if (effectFn?.options?.scheduler) {
      effectFn?.options?.scheduler(effectFn)
    } else {
      effectFn()
    }
  })
}

const p = new Proxy(obj, {
  get(target, key, receiver) {
    track(target, key)
    return Reflect.get(target, key, receiver)
  },
  set(target, key, newVal, receiver) {
    target[key] = newVal
    trigger(target, key)
    return Reflect.set(target, key, newVal, receiver)
  },
  ownKeys(target) {
    return Reflect.ownKeys(target)
  },
  has(target, key) {
    return Reflect.has(target, key)
  },
})

const computed = (fn) => {
  let value = null
  let dirty = true
  const effectFn = effect(fn, {
    scheduler() {
      if (!dirty) {
        dirty = true
        trigger(obj, 'value')
      }
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
  seen.set(value)
  for (const key in value) {
    traverse(value[key], seen)
  }
  return value
}

const watch = (sources, cb, options) => {
  let value, newVal, oldVal, cleanup
  if (typeof sources === 'function') {
    value = sources
  } else {
    value = () => traverse(sources)
  }
  const job = () => {
    newVal = effectFn()
    if (cleanup) {
      cleanup()
    }
    cb(newVal, oldVal, onInvaildate)
    oldVal = newVal
  }

  const onInvaildate = (cb) => {
    cleanup = cb
  }
  const effectFn = effect(value, {
    scheduler: () => {
      if (options?.post) {
        let p = Promise.resolve()
        p.then(job)
      } else {
        job()
      }
    },
    lazy: true,
  })
  if (options?.immediate) {
    job()
  }
  oldVal = effectFn()
}

let count = 0
watch(
  () => p.foo,
  (newVal, oldVal, onInvaildate) => {
    let flag = true
    onInvaildate(() => {
      flag = false
    })
    let res
    new Promise((resolve) => {
      if (count === 0) {
        setTimeout(() => {
          res = '2000的回调'
          resolve()
        }, 2000)
      } else if (count === 1) {
        setTimeout(() => {
          res = '3000的回调'
          resolve()
        }, 3000)
      }
    }).then(() => {
      if (flag) {
        console.log(res, 'res')
      }
    })
  },
  {
    // immediate: true,
    post: true,
  }
)
p.foo++
count++
p.foo++
count++

p.foo++

console.log('hello朋友们')

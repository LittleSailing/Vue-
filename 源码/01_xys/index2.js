let data = { a: 100, b: 200 }
let activeEffect
let effectStack = []

let effect = (fn, options = {}) => {
  let effectFn = () => {
    cleanup(effectFn)
    effectStack.push(effectFn)
    activeEffect = effectFn
    const res = fn()
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]

    return res
  }
  effectFn.options = options
  effectFn.deps = []

  if (options.lazy) {
    return effectFn
  }
  effectFn()
}

let cleanup = (effectFn) => {
  effectFn.deps.forEach((depSet) => {
    depSet.delete(effectFn)
  })
  effectFn.deps.length = 0
}

let bucket = new WeakMap()

let track = (target, key) => {
  if (!activeEffect) return
  let depsMap = bucket.get(target)
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()))
  }
  let depsSet = depsMap.get(key)
  if (!depsSet) depsMap.set(key, (depsSet = new Set()))
  depsSet.add(activeEffect)
  activeEffect.deps.push(depsSet)
}

let trigger = (target, key) => {
  let depsMap = bucket.get(target)
  if (!depsMap) {
    return
  }
  let depsSet = depsMap.get(key)
  let depSetToSet = new Set()
  depsSet &&
    depsSet.forEach((effectFn) => {
      if (effectFn !== activeEffect) {
        depSetToSet.add(effectFn)
      }
    })
  depSetToSet.forEach((effectFn) => {
    if (effectFn?.options?.scheduler) {
      effectFn.options.scheduler(effectFn)
    } else {
      effectFn()
    }
  })
}

let obj = new Proxy(data, {
  get(target, key) {
    track(target, key)
    return target[key]
  },
  set(target, key, value) {
    target[key] = value
    trigger(target, key)
    return true
  },
})

let jobQueue = new Set()
let p = Promise.resolve()
let isFlushing = false
function flushJob() {
  if (isFlushing) {
    return
  }
  isFlushing = true
  p.then(() => {
    jobQueue.forEach((job) => job())
  }).finally(() => {
    isFlushing = false
  })
}

function computed(fn) {
  let value
  let dirty = true
  const effectFn = effect(fn, {
    lazy: true,
    scheduler(fn) {
      dirty = true
      trigger(obj, 'value')
    },
  })

  const obj = {
    get value() {
      if (dirty) {
        value = effectFn()
        dirty = false
        track(obj, 'value')
      }
      return value
    },
  }
  return obj
}

function traverse(source, seen = new Set()) {
  if (typeof source !== 'object' || source === null || seen.has(source)) {
    return
  }
  seen.add(source)
  for (const key in source) {
    traverse(source[key], seen)
  }
  return source
}

function watch(source, cb, options = {}) {
  let getter
  // 存放过期回调
  let onCleanup
  function onInvalidate(fn) {
    onCleanup = fn
  }

  if (typeof source === 'function') {
    getter = source
  } else {
    getter = () => traverse(source)
  }

  let newValue, oldValue

  function job() {
    newValue = effectFn()
    if (onCleanup) {
      onCleanup()
    }
    if (newValue === oldValue) {
      return
    }
    cb(newValue, oldValue, onInvalidate)
    oldValue = newValue
  }

  let effectFn = effect(() => getter(), {
    lazy: true,
    scheduler: () => {
      // 调度函数中判断 flush 是否为 post .是post 放入微任务队列
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
  } else {
    oldValue = effectFn()
  }
}

let finalData
watch(
  () => obj.a,
  async (old, nv, onInvalidate) => {
    console.log('我更新了', old, nv)
    // 失效
    let expired = false
    onInvalidate(() => {
      // 过期设置为true
      expired = true
    })

    const res = await new Promise((resolve) => {
      setTimeout(() => {
        resolve('等待1秒')
      }, 1000)
    })
    if (!expired) {
      finalData = res
    }
  },
  {
    immediate: true,
    // flush: 'post', // 异步更新
  }
)

obj.a++
console.log(finalData)

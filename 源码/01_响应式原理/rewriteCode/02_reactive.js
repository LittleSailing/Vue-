let effectStack = []
const bucket = new WeakMap()
let activeEffect

let cleanup = (effectFn) => {
  effectFn.deps.forEach((depsSet) => {
    depsSet.delete(effectFn)
  })
  effectFn.deps.length = 0
}

let effect = (fn, options) => {
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
  if (!effectFn?.options?.lazy) {
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

function trigger(target, key, type, newVal) {
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

  if (Array.isArray(target) && type === 'ADD') {
    const depsLength = depsMap.get('length')
    depsLength &&
      depsLength.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectFnsToRun.add(effectFn)
        }
      })
  }

  if (Array.isArray(target) && key === 'length') {
    depsMap &&
      depsMap.forEach((effectFn, index) => {
        if (index >= newVal) {
          if (effectFn !== activeEffect) {
            effectFnsToRun.add(effectFn)
          }
        }
      })
  }

  if (type === 'ADD' || type === 'DELETE') {
    const depsIterator = depsMap.get(ITRERATOR_KEY)
    depsIterator &&
      depsIterator.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectFnsToRun.push(effectFn)
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

const arrayInstrumentations = {}
;[('includes', 'indexOf', 'lastIndexOf')].forEach((arrayFn) => {
  let originMethod = Array.prototype[arrayFn]
  arrayInstrumentations[arrayFn] = (...args) => {
    const res = originMethod.apply(this, args)
    if (res === false || res === -1) {
      // 代理对象没有找到，拿到raw原对象查找
      return originMethod.apply(this.raw, args)
    }
    return res
  }
})

const ITRERATOR_KEY = Symbol()
const createReactive = (obj, isShallow = false, isReadonly = false) => {
  return new Proxy(obj, {
    get(target, key, receiver) {
      if (key === 'raw') {
        return target
      }

      if (
        Array.isArray(target) &&
        Object.prototype.hasOwnProperty.call(arrayInstrumentations, key)
      ) {
        return Reflect.get(arrayInstrumentations, key, receiver)
      }

      const res = Reflect.get(target, key, receiver)
      if (!isReadonly && typeof key !== 'symbol') {
        track(target, key)
      }
      //   浅
      if (isShallow) {
        return res
      }
      //   深度监听
      if (typeof res === 'object' && res !== null) {
        return isReadonly ? readonly(res) : reactive(res)
      }
      return res
    },
    set(target, key, newValue, receiver) {
      if (isReadonly) {
        console.error(`${target}只读不可以修改`)
        return true
      }
      let oldValue = target[key]
      let type
      if (Array.isArray(target)) {
        type = Number(key) < target.length ? 'SET' : 'ADD'
      } else {
        type = Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD'
      }
      const set = Reflect.set(target, key, newValue, receiver)
      if (receiver['raw'] === target) {
        if (
          oldValue !== newValue &&
          (oldValue === oldValue || newValue === newValue)
        ) {
          trigger(target, key, type, newValue)
        }
      }
      return set
    },
    ownKeys(target) {
      track(target, Array.isArray(target) ? 'length' : ITRERATOR_KEY)
      return Reflect.ownKeys(target)
    },
    deleteProperty(target, key) {
      if (isReadonly) {
        console.error(`${target}只读不可以修改`)
        return true
      }
      const hadKeys = Object.prototype.hasOwnProperty.call(target, key)
      const res = Reflect.deleteProperty(target, key)
      if (hadKeys && res) {
        trigger(target, key, 'DELETE')
      }
      return res
    },
  })
}

const reactiveMap = new Map()
const reactive = (obj) => {
  const existionProxy = reactiveMap.get(obj)
  if (existionProxy) {
    return existionProxy
  }
  const proxy = createReactive(obj)
  reactiveMap.set(obj, proxy)
  return proxy
}

const shallowReactive = (obj) => {
  return createReactive(obj, true)
}

const readonly = (obj) => {
  return createReactive(obj, false, true)
}
const shallowReadonly = (obj) => {
  return createReactive(obj, true, true)
}
/* {
  a: 10,
  b: 20,
  c: {
    c1: 30,
    c2: 40,
  },
} */

// let obj = { a: 1 }
// let obj2 = { a: 1 }
// const arr = reactive([obj])
// const red = reactive([1, 2, 5])
// console.log(arr.includes(obj))
//
// Effect(() => {
//   for (const val of red.values()) {
//     console.log(val, 'key')
//   }
// })
// console.log('====')
// // red[3] = 25
// red.length = 0
const red = reactive([1, 2, 5])
effect(() => {
  console.log('red', red.push(1))
})

effect(() => {
  console.log('push2', red.push(1))
})

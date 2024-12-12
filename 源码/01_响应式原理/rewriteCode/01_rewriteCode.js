// 存放effect状态
let activeEffect
// 桶
const bucket = new WeakMap()
// effct 栈
const effectStack = []

// 副作用函数
function effect(fn, options) {
  const effectFn = () => {
    cleanup(effectFn)
    activeEffect = effectFn
    // 多层effect,当执行内部effect时将外部的activeEffect保存，避免被内部effect收集覆盖
    effectStack.push(effectFn)
    const res = fn()
    effectStack.pop(effectFn)
    // 将 activeEffect 还原
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }
  effectFn.deps = []
  // 调度执行、lazy、flush
  effectFn.options = options
  // 如果是lazy懒执行,返回出去交给外部调用执行
  if (effectFn?.options?.lazy) {
    return effectFn
  }
  effectFn()
}

// 清除遗留副作用函数
function cleanup(effectFn) {
  effectFn.deps.forEach((depsSet) => {
    // 在副作用桶中删除对应的 effectFn
    depsSet.delete(effectFn)
  })
  effectFn.deps.length = 0
}

// 收集依赖
function track(target, key) {
  //   如果 activeEffect 不存在直接 return
  if (!activeEffect) return
  // 依赖存入 weakMap => Map => Set() 的桶结构，方便调用指定副作用
  let depsMap = bucket.get(target)
  if (!depsMap) bucket.set(target, (depsMap = new Map()))
  let depsSet = depsMap.get(key)
  if (!depsSet) depsMap.set(key, (depsSet = new Set()))
  // 收集依赖
  depsSet.add(activeEffect)
  // 存入deps数组中，便于清除依赖
  activeEffect.deps.push(depsSet)
}

// 触发依赖
function trigger(target, key) {
  // 从 weakMap => Map => Set() 的桶中取出依赖
  let depsMap = bucket.get(target)
  //   没有依赖直接返回
  if (!depsMap) {
    return
  }
  let depsSet = depsMap.get(key)
  // 使用单个set执行时，会在 effectFn() 调用时执行副作用时调用cleanup（）删除依赖。
  // foreach没有结束同时触发 effect中get 导致 depsSet 收集依赖。set同时删除和添加就会一直执行下去
  // 需要存入一个新的 Set 通过新的Set 去执行收集的副作用
  let effectToRun = new Set()
  depsSet &&
    depsSet.forEach((effectFn) => {
      //守卫条件:如果执行的trigger和当前的正在执行的effect相同则不执行
      if (activeEffect !== effectFn) {
        effectToRun.add(effectFn)
      }
    })
  effectToRun &&
    effectToRun.forEach((effectFn) => {
      // 如果有 scheduler 调度执行 返回出去
      if (effectFn?.options?.scheduler) {
        effectFn?.options?.scheduler(effectFn)
      } else {
        effectFn()
      }
    })
}

const data = {
  a: '是a',
  b: '是b',
  c: 1,
}
// 响应式代理函数
const obj = new Proxy(data, {
  get(target, key, receiver) {
    track(target, key)
    return target[key]
  },
  set(target, key, newVal, receiver) {
    target[key] = newVal
    trigger(target, key)
    return true
  },
})

/* 
    computed特性:
    1.缓存
    2.返回副作用执行的结果
    3.内部的响应式需要在外部执行。（手动track和trigger）
*/
const computed = (fn) => {
  let value
  // 脏缓存
  let dirty = true
  //  设置了 lazy 会交由手动执行，内部只是收集了依赖
  const effectFn = effect(fn, {
    scheduler() {
      dirty = true
      //修改 fn 副作用函数绑定的属性时触发 obj依赖
      trigger(obj, 'value')
    },
    lazy: true,
  })

  // 返回副作用执行的结果
  const obj = {
    get value() {
      // 数据脏了调用effect重新执行
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

/* 
    watch 特性
*/
function traverse(value, seen = new Set()) {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return
  }
  seen.add(value)
  // 深度遍历
  for (const key in value) {
    traverse(value[key], seen)
  }
  return value
}

function watch(source, fn, options) {
  let getter
  // 清除上次任务
  let cleanup
  let newVal, oldVal
  // 如果是函数直接赋值，是对象包装成函数
  if (typeof source === 'function') {
    getter = source
  } else {
    getter = () => traverse(source)
  }

  // 无效函数
  function onInvalidate(fn) {
    cleanup = fn
  }

  // 调度器函数抽离出来
  function job() {
    newVal = effectFn()
    if (cleanup) {
      cleanup()
    }
    fn(newVal, oldVal, onInvalidate)
    oldVal = newVal
  }

  const effectFn = effect(getter, {
    // 调度器手动返回回调
    scheduler: () => {
      // flush 异步调用
      if (options.flush === 'post') {
        let p = Promise.resolve()
        p.then(job)
      } else {
        job()
      }
    },
    lazy: true,
  })

  // 如果 immediate 存在，立即执行一次
  if (options?.immediate) {
    job()
  } else {
    // oldvalue需要手动执行一次
    oldVal = effectFn()
  }
}

let time = 0

watch(
  () => obj.c,
  async (newVal, oldVal, onInvalidate) => {
    let expired = false
    // 异步任务只执行最后一次
    onInvalidate(() => {
      expired = true
    })

    let res
    if (time === 0) {
      res = await new Promise((resolve) => {
        setTimeout(() => {
          resolve('我是 2000 毫秒后的调用')
        }, 1000)
      })
    } else if (time === 1) {
      res = await new Promise((resolve) => {
        setTimeout(() => {
          resolve('我是 4000 毫秒后的调用')
        }, 4000)
      })
    } else if (time === 2) {
      res = await new Promise((resolve) => {
        setTimeout(() => {
          resolve('我是 6000 毫秒后的调用')
        }, 2000)
      })
    }

    if (!expired) {
      console.log(res, 'res')
    }
  },
  {
    immediate: true,
    // flush: 'post',
  }
)

obj.c++
time++
obj.c++
time++
obj.c++

let data = { a: 1, b: '100' }
// 存放副作用函数
let activeEffect = null

// effect栈 嵌套effect分别调用
let effectStack = []

// 副作用函数
function effect(fn, options) {
  const effectFn = () => {
    //清除副作用函数
    cleanup(effectFn)
    // 嵌套effect 分别存放
    activeEffect = effectFn
    effectStack.push(effectFn)
    // 将render的执行结果也返回出去
    const res = fn()
    effectStack.pop()
    // 还原上一层 effect
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }
  // 清除关联副作用
  effectFn.deps = []
  // 添加调度器
  effectFn.options = options

  // lazy不存在时立即执行，否则延迟执行
  if (!options?.lazy) {
    effectFn()
  }

  // lazy存在，返回副作用函数。手动执行
  return effectFn
}

// 清除副作用函数
function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    // 存放副作用函数的依赖 set
    const depSet = effectFn.deps[i]
    depSet.delete(effectFn)
  }
  effectFn.deps.length = 0
}

// effect 的桶
const bucket = new WeakMap()
// track
function track(target, key) {
  if (!activeEffect) return
  let depMap = bucket.get(target)
  // 存入桶中
  if (!depMap) bucket.set(target, (depMap = new Map()))
  let depSet = depMap.get(key)
  if (!depSet) depMap.set(key, (depSet = new Set()))
  depSet.add(activeEffect)
  // 存放副作用函数的依赖 set
  activeEffect.deps.push(depSet)
}
// trigger
function trigger(target, key) {
  let depMap = bucket.get(target)
  if (!depMap) return
  let depSet = depMap.get(key)
  let depSetToSet = new Set()
  // 当前执行的副作用函数相同则不执行
  depSet &&
    depSet.forEach((effectFn) => {
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

const obj = new Proxy(data, {
  get(target, key) {
    track(target, key)
    return target[key]
  },
  set(target, key, value) {
    // 修改target
    target[key] = value
    trigger(target, key)
    return true
  },
})

// 过度状态 ,不显示 1,2,3 显示 1,3
const jobQueue = new Set()
// 创建promise实例，将任务添加到微任务队列中
const p = Promise.resolve()
let isFlushing = false
function flushJob() {
  if (isFlushing) return
  isFlushing = true
  p.then(() => {
    jobQueue.forEach((job) => job())
  }).finally(() => {
    isFlushing = false
  })
}

function computed(getter) {
  //缓存
  let value
  // 脏标记
  let dirty = true

  // 副作用函数延迟执行 取到副作用函数
  const effectFn = effect(getter, {
    scheduler(fn) {
      // 副作用函数执行时设置为脏
      dirty = true
      // 添加到任务队列
      jobQueue.add(fn)
      // 通过异步队列减少任务执行次数
      flushJob()
      //  computed 内部的 effect 无法收集外部的effect响应式数据 需要手动触发和收集依赖
      // 手动触发依赖
      trigger(obj, 'value')
    },
    // 延迟执行
    lazy: true,
  })

  // 返回计算的值
  const obj = {
    get value() {
      // 值为脏时才重新计算
      if (dirty) {
        value = effectFn()
        dirty = false
        // 收集依赖
        track(obj, 'value')
      }
      return value
    },
  }
  return obj
}
// const sumRes = computed(() => obj.a + obj.b)
// effect(() => {
//   console.log(sumRes.value, '读取sumvalue')
// })

// 递归读取原始值
function traverse(value, seen = new Set()) {
  // 如果 value 原始值,或者value 为空，或者value 已经在seen中被读取过了，则不再遍历
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  // 将数据添加到 seen 中 ，代表遍历读过了
  seen.add(value)
  for (const k in value) {
    traverse(value[k], seen)
  }
  return value
}
// watch
function watch(source, cb, options = {}) {
  // 接收get函数
  let getter
  // 如果 source 是函数，直接给到get
  if (typeof value === 'function') {
    getter = source
  } else {
    // 如果 source 不是函数，递归读取操作
    getter = () => traverse(source)
  }

  // 定义旧值和新值
  let oldValue, newValue

  // 存储用户注册的过期回调
  let cleanup
  // 定义过期函数
  function onInvalidate(fn) {
    cleanup = fn
  }

  // 封装 scheduler 调度函数为单独函数
  function job() {
    // 在sheduler 中重新执行副作用函数得到的是新值
    newValue = effectFn()

    // 回调执行前过期回调
    if (cleanup) {
      cleanup()
    }
    // 回传新旧值
    cb(newValue, oldValue, onInvalidate)
    // 更新旧值，
    oldValue = newValue
  }

  // 使用 lazy 后拿到执行前的effectFn
  const effectFn = effect(() => getter(), {
    lazy: true,
    scheduler: () => {
      if (options.flush === 'post') {
        const p = Promise.resolve()
        p.then(job)
      } else {
        job()
      }
    },
  })

  // immediate 为 true 时立即执行
  if (options?.immediate) {
    job()
  } else {
    // 取到副作用函数执行后的值
    oldValue = effectFn()
  }
}

let finalData

watch(
  // () => obj.a,
  obj,
  async (newValue, oldValue, onInvalidate) => {
    console.log('变化了', newValue, oldValue)
    // 过期 flag ，表示当前副作用函数是否过期。默认false没过期
    let expired = false
    // 注册 onInvalidate() 函数注册一个过期回调
    onInvalidate(() => {
      expired = true
    })

    const res = await Promise.resolve(() => {
      setTimeout(() => {
        console.log('停顿2秒')
      }, 2000)
    })

    // 没过期时才执行后续操作
    if (!expired) {
      finalData = res
    }
  },
  {
    // 回调函数在watch创建时立即执行一次
    flush: 'pre',
    immediate: true,
  }
)

setTimeout(() => {
  obj.a++
  console.log('停顿一秒')
}, 1000)

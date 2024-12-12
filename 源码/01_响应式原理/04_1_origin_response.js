// 原始值的响应式方案
let data = {
  foo: 1,
  get bar() {
    return this.foo
  },
}

// 副作用函数状态
let activeEffect
let effectStack = []

// 副作用函数
let effect = (fn, options) => {
  // effectFn
  const effectFn = () => {
    // 修改时触发依赖，同时清空副作用函数
    cleanup(effectFn)
    // 只是赋值给 activeEffect 会覆盖副作用函数，需要一个栈压入栈中
    // activeEffect = effectFn
    activeEffect = effectFn
    // 压入
    effectStack.push(effectFn)
    const res = fn() //1、有多层 effect 先执行。
    //执行后进 effectfn 后清除
    effectStack.pop()
    // activeEffect 副作用函数值被设置为前一个
    activeEffect = effectStack[effectStack.length - 1]
    // 将 fn（真正的副作用函数） 的结果 return 出去，交给外部函数处理。
    return res
  }
  effectFn.deps = []
  // 挂载调度器
  effectFn.options = options
  // 懒加载,没有lazy字段。直接执行副作用。如果有交给外部处理
  if (!effectFn.options?.lazy) {
    effectFn()
  }
  return effectFn
}

// 清除副作用函数
function cleanup(effectFn) {
  effectFn.deps.forEach((dep) => {
    // set 中清除依赖
    dep.delete(effectFn)
  })
  effectFn.deps.length = 0
}

// 桶
const bucket = new WeakMap()
// 桶中添加依赖
function track(target, key) {
  console.log(target, key)
  // 没有副作用函数直接return
  if (!activeEffect) return
  // 我们希望维护一个 weakMap  =>  map => 副作用函数
  let desMap = bucket.get(target)
  if (!desMap) bucket.set(target, (desMap = new Map()))
  let desSet = desMap.get(key)
  if (!desSet) desMap.set(key, (desSet = new Set()))

  // 添加副作用函数
  desSet.add(activeEffect)
  // 副作用添加到自身属性 deps 数组中
  activeEffect.deps.push(desSet)
}
function trigger(target, key) {
  let depsMap = bucket.get(target)
  if (!depsMap) {
    return
  }
  let deps = depsMap.get(key)
  // 调用 set 中，所有的副作用函数
  // desSet && desSet.forEach((fn) => {fn()}) //弃用

  // 使用 cleanup 清除负作用域后，在 set 中foreach 同时添加删除子元素会触发重复掉用。嵌套两层 set 防止重复调用
  // const effectToRun = new Set(desSet)
  // effectToRun.forEach((fn) => fn()) // 自增赋值 存在栈溢出问题

  const effectToRun = new Set()
  deps &&
    deps.forEach((fn) => {
      // 如果桶中 fn 不是将要触发 get 的 fn ，将其放入桶中
      if (fn !== activeEffect) {
        effectToRun.add(fn)
      }
    })

  effectToRun.forEach((fn) => {
    if (fn?.options?.scheduler) {
      // 如果存在使用调度器
      fn.options.scheduler(fn)
    } else {
      fn()
    }
  })
}

// 代理
const obj = new Proxy(data, {
  // 读取时添加依赖
  get(target, key, receiver) {
    track(target, key)
    return Reflect.get(target, key, receiver)
  },

  // 修改时触发依赖
  set(target, key, value) {
    target[key] = value
    trigger(target, key)
    return true
  },
})

// 任务队列
const jobQueue = new Set()
const p = Promise.resolve()
let isFlushing = false
function flushJob() {
  // 如果队列正在刷新，什么都不做
  if (isFlushing) return

  // 设置为 true 代表正在刷新
  isFlushing = true
  // 在微任务队列中刷新 jobQueue 队列
  p.then(() => {
    jobQueue.forEach((job) => job())
  }).finally(() => {
    isFlushing = false
  })
}

effect(() => {
  console.log(obj.bar, '我调用了')
})

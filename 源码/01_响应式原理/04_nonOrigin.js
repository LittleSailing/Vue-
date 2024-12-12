// 非原始值响应方案
let data = { a: 10 }
// 迭代器
const ITERATE_KEY = Symbol()
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

// 触发器type
const triggerType = {
  SET: 'SET',
  ADD: 'ADD',
  DELETE: 'DELETE',
}

// trigger
function trigger(target, key, type) {
  let depsMap = bucket.get(target)
  if (!depsMap) return
  let depsSet = depsMap.get(key)

  let effectToRun = new Set()
  depsSet &&
    depsSet.forEach((effectFn) => {
      // 当前执行的副作用函数相同则不重复调用
      if (effectFn !== activeEffect) {
        effectToRun.add(effectFn)
      }
    })

  // 当操作类型为 ADD 或者 DELETE 时，forin的执行次数会有所变化，所以需要相关的副作用函数执行
  if (type === triggerType.ADD || type === triggerType.DELETE) {
    // 获取与 key 相关联的副作用函数
    const iterateEffects = depsMap.get(ITERATE_KEY)
    // 将与 ITERATE_KEY 相关的副作用也添加到副作用执行数组
    iterateEffects &&
      iterateEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectToRun.add(effectFn)
        }
      })
  }

  effectToRun.forEach((effectFn) => {
    if (effectFn?.options?.scheduler) {
      effectFn.options.scheduler(effectFn)
    } else {
      effectFn()
    }
  })
}

const obj = new Proxy(data, {
  get(target, key, receiver) {
    track(target, key)
    return Reflect.get(target, key, receiver)
  },
  set(target, key, newVal, receiver) {
    // 如果修改的值没有变化，也应该不去触发副作用函数
    // 获取旧的属性值
    let oldVal = target[key]
    // 修改属性不会对forin造成影响，所以在set拦截时需要能区分操作类型，到底是添加新属性还是设置已有属性
    const type = Object.prototype.hasOwnProperty.call(target, key)
      ? triggerType.SET
      : triggerType.ADD
    // 修改target
    const res = Reflect.set(target, key, newVal, receiver)
    // 修改的值和属性值不同时 触发副作用函数（有缺陷 NaN 需要特殊处理）
    // if (oldVal !== newVal) {
    // 处理 NaN 缺陷
    if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
      // 将状态也传入 trigger
      trigger(target, key, type)
    }

    return res
  },
  // 拦截 for in
  ownKeys(target) {
    // 将副作用函数与 ITERATE_KEY 关联
    track(target, ITERATE_KEY)
    return Reflect.ownKeys(target)
  },
  deleteProperty(target, k) {
    // 检测被操作的属性是否是自身的属性
    const hadKey = Object.prototype.hasOwnProperty.call(target, k)
    // 删除属性
    const res = Reflect.defineProperty(target, k)
    // 只有删除属性时对象自己的属性并且成功删除时触发依赖
    if (res && hadKey) {
      trigger(target, key, 'DELETE')
    }
    return res
  },
})

// effect(() => {
//   for (const key in obj) {
//     console.log(key, '我触发了')
//   }
// })
// // obj.b = 200
// obj.a = 20
// obj.a = 30

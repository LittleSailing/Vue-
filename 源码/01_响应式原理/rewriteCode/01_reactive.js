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
function trigger(target, key, type) {
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

  // 如果操作的是 添加和删除 将forin的依赖也存入执行队列
  if (type === TRIGGER_TYPE.ADD || type === TRIGGER_TYPE.DELETE) {
    // 如果ownkeys的依赖存在，将该依赖也加入到 effect 执行队列
    const iterateEffects = depsMap.get(ITERATOR_KEY)
    iterateEffects &&
      iterateEffects.forEach((effectFn) => {
        if (activeEffect !== effectFn) {
          effectToRun.add(effectFn)
        }
      })
  }
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

const ITERATOR_KEY = Symbol()
const TRIGGER_TYPE = {
  ADD: 'ADD',
  SET: 'SET',
  DELETE: 'DELETE',
}
function createReactive(obj, isShallow, isReadonly) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      //   如果需要原始数据返回raw
      if (key === 'raw') {
        return target
      }
      const res = Reflect.get(target, key, receiver)
              
      if (!isReadonly) {
        track(target, key)
      }
      return res
    },
    set(target, key, newVal, receiver) {
      //获取旧之
      const oldVal = target[key]
      // 只是修改属性forin长度不变不触发更新
      const type = Object.prototype.hasOwnProperty.call(target, key)
        ? TRIGGER_TYPE.SET
        : TRIGGER_TYPE.ADD
      Reflect.set(target, key, newVal, receiver)

      //   如果 target.raw === receiver 就是 target 代理对象.是当前代理对象才执行trigger防止原型或其它多次调用
      if (target.raw === receiver) {
        // 当新值不等于旧值，而且值不是 NaN 时执行
        if (newVal !== oldVal && (newVal === newVal || oldVal === oldVal)) {
          // 副作用桶中取出执行
          trigger(target, key, type)
        }
      }
      return true
    },
    // 代理 in
    has(target, key) {
      track(target, key)
      return Reflect.has(target, key)
    },
    // 代理delete
    deleteProperty(target, key) {
      // 查询删除对象是否存在
      const value = Object.prototype.hasOwnProperty.call(target, key)
      // 是否删除成功
      const res = Reflect.deleteProperty(target, key)
      if (value && res) {
        trigger(target, key, TRIGGER_TYPE.DELETE)
      }

      return res
    },
    // 代理 forin
    ownKeys(target) {
      // 收集依赖
      track(target, ITERATOR_KEY)
      return Reflect.ownKeys(target)
    },
  })
}

const obj = createReactive({ a: '啊', b: '额' })

effect(() => {
  for (const k in obj) {
    console.log('forin调用了', k)
  }
})
obj.a = '啊这'

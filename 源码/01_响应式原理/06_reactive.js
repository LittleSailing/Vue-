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
  // 没有副作用函数直接return
  if (!activeEffect || !shouldTrack) return
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

function trigger(target, key, type, newVal) {
  let depsMap = bucket.get(target)
  if (!depsMap) {
    return
  }
  // 对对象的处理
  let deps = depsMap.get(key)
  const effectToRun = new Set()
  deps &&
    deps.forEach((fn) => {
      // 如果桶中 fn 不是当前调用 activeEffect ，将其放入桶中
      if (fn !== activeEffect) {
        effectToRun.add(fn)
      }
    })

  //获取对象是否为数组
  let isArray = Array.isArray(target)
  if (type === TRIGGER_TYPE.ADD && isArray) {
    // 将length相关的副作用也添加到调用集合中
    const lengthEffect = depsMap.get('length')
    lengthEffect &&
      lengthEffect.forEach((effectFn) => {
        if (activeEffect !== effectFn) {
          effectToRun.add(effectFn)
        }
      })
  }

  // 获取对象是数组并且修改了length属性
  if (isArray && key === 'length') {
    // 如果是数组 effects 是通过数组下标创建的 new Set() 桶
    depsMap.forEach((effects, index) => {
      // newVal 是传入的 length 值，大于length值的副作用添加到effectToRun等待执行
      if (index >= newVal) {
        effects &&
          effects.forEach((effectFn) => {
            if (activeEffect !== effectFn) {
              effectToRun.add(effectFn)
            }
          })
      }
    })
  }

  // 添加或删除才触发依赖 (ownKeys),受影响: for in 、 Map、 Set
  if (type === TRIGGER_TYPE.ADD || type === TRIGGER_TYPE.DELELTE) {
    let effectsIterator = depsMap.get(TRIGGER_TYPE)
    effectsIterator &&
      effectsIterator.forEach((effectFn) => {
        effectToRun.add(effectFn)
      })
  }
  effectToRun.forEach((fn) => {
    if (fn?.options?.scheduler) {
      // 如果存在使用调度器
      fn.options.scheduler(fn)
    } else {
      fn()
    }
  })
}

const ITERATOR_KEY = Symbol()
const TRIGGER_TYPE = {
  ADD: 'ADD',
  SET: 'SET',
  DELELTE: 'DELETE',
}

// 一个标记变量代表是否进行跟踪
let shouldTrack = true

// 重写数组方法
const arrayInstrumentations = {}
// arrayInstrumentations 添加数组方法
;[('includes', 'indexOf', 'lastIndexOf')].forEach((arrayMethod) => {
  const originMethod = Array.prototype[arrayMethod]
  arrayInstrumentations[arrayMethod] = function (...args) {
    // 调用原始方法前,禁止追踪（禁止收集依赖）
    // 通过原始数组方法，查询proxy代理数组
    let res = originMethod.apply(this, args)
    // 如果 res 为 false 说明没有找到，通过 this.raw 拿到原始数组，更新 res 值
    if (res === false || res === -1) {
      res = originMethod.apply(this.raw, args)
    }

    // 返回最终结果
    return res
  }
})
;['push', 'pop', 'shift', 'unshift', 'splice'].forEach((arrayMethod) => {
  // 获取数组原型方法
  const originMethod = Array.prototype[arrayMethod]
  arrayInstrumentations[arrayMethod] = function (...args) {
    // 调用Array原始方法前,禁止追踪（禁止收集依赖）
    shouldTrack = false
    let res = originMethod.apply(this, args)
    // 调用Array原始方法后允许追踪
    shouldTrack = true
    return res
  }
})

// 创建 reactive
// isShallow:控制深浅响应式 isReadonly:控制只读和浅只读
function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    // 读取时添加依赖
    get(target, key, receiver) {
      // 如果读取的是 raw 返回当前target
      if (key === 'raw') return target
      // 如果重写数组方法上有该方法，则使用自定义数组方法处理原数据
      if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver)
      }
      if (!isReadonly && typeof key !== 'symbol') {
        // 不是只读的和symbol类型才需要建立响应联系
        track(target, key)
      }
      // Reflect.get 得到的是一个普通对象。
      // 如果要进行深层响应需要做一层封装
      let res = Reflect.get(target, key, receiver)
      // isShallow 为 true 浅响应直接返回
      if (isShallow) return res

      // 深响应
      if (typeof res === 'object' && res !== null) {
        //是否是只读
        return isReadonly ? readonly(res) : reactive(res)
      }
      // console.log(target, key, 'key')
      // target[key].bind(target)
      return res
    },

    // 修改时触发依赖
    set(target, key, newVal, receiver) {
      // 只读直接return
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`, isReadonly)
        return true
      }
      // 旧的属性
      let oldVal = target[key]

      // 获取要修改的属性，存在type设置为 SET 状态，否则为 ADD
      let type = Array.isArray(target)
        ? // 如果是数组类型 判断key的下标是否大于或等于原对象的length
          Number(key) >= target.length
          ? // 如果key大于了原对象的leng:执行ADD操作，否则执行SET
            TRIGGER_TYPE.ADD
          : TRIGGER_TYPE.SET
        : Object.prototype.hasOwnProperty.call(target, key)
        ? TRIGGER_TYPE.SET
        : TRIGGER_TYPE.ADD

      let res = Reflect.set(target, key, newVal, receiver)
      // set的时候读取 raw 判断 receiver是否为原始数据.屏蔽不需要的更新
      if (target === receiver.raw) {
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          trigger(target, key, type, newVal)
        }
      }
      return res
    },

    ownKeys(target) {
      // 如果是数组收集依赖的key是length
      track(target, Array.isArray(target) ? 'length' : ITERATOR_KEY)
      return Reflect.ownKeys(target)
    },
    deleteProperty(target, key) {
      // 只读
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`, isReadonly)
        return true
      }
      // 检测删除的是否是自身属性
      const hadkey = Object.prototype.hasOwnProperty.call(target, key)
      // 删除 成功返回true
      const res = Reflect.deleteProperty(target, key)
      if (hadkey && res) {
        trigger(target, key, TRIGGER_TYPE.DELELTE)
      }
    },
  })
}

const reactiveMap = new Map()
// 深响应  reactive 只是对 effect 的一层封装
function reactive(obj) {
  // 每次调用 reactive 都会创建新的对象.不利于数组方法
  //需要先通过原始对象 obj 寻找之前创建的代理对象，如果找到了，直接返回已有的代理对象
  const existionProxy = reactiveMap.get(obj)
  if (existionProxy) {
    return existionProxy
  }

  // 否则创建新的代理对象
  const proxy = createReactive(obj)
  reactiveMap.set(obj, proxy)

  return proxy
}

// 浅响应
function shallowReactive(obj) {
  return createReactive(obj, true)
}

// 深只读
function readonly(obj) {
  return createReactive(obj, false, true)
}

// 浅只读
function shallowReadonly(obj) {
  return createReactive(obj, true, true)
}

const arr = reactive([])
effect(() => {
  arr.push(1)
})
effect(() => {
  arr.push(1)
})
arr[1] = 100
console.log(arr)

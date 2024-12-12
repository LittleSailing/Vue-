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
      // 如果桶中 fn 不是将要触发 get 的 fn ，将其放入桶中
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

  // 添加或删除才触发依赖、 (ownKeys)、Set,Map 类型
  /* map的调用依赖与ITERATOR_KEY，
    所以在Map使用set()时函数时会触发proxy的get。而不是执行set
    set()的执行也应该把所有关于map的iterator拿出来执行
   */
  if (
    type === TRIGGER_TYPE.ADD ||
    type === TRIGGER_TYPE.DELELTE ||
    (type === TRIGGER_TYPE.SET &&
      Object.prototype.toString.call(target) === '[object Map]')
  ) {
    let effectsIterator = depsMap.get(ITERATOR_KEY)
    effectsIterator &&
      effectsIterator.forEach((effectFn) => {
        effectToRun.add(effectFn)
      })
  }

  // keys() 相关响应触发
  if (
    (type === TRIGGER_TYPE.ADD || type === TRIGGER_TYPE.DELELTE) &&
    Object.prototype.toString.call(target) === '[object Map]'
  ) {
    let effectsIterator = depsMap.get(MAP_KEY_ITERATER_KEY)
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

const MAP_KEY_ITERATER_KEY = Symbol()

// 重写 Map 和 Set 方法
const mutableInstrumentations = {
  // 相当于setter 需要触发trigger
  add(key) {
    // this仍是代理对象，通过raw获取原始对象
    const target = this.raw
    // 如果 key已经存在于 Set 中了，set长度不变不需要重复触发依赖
    const hadKey = target.has(key)
    // 只有值不存在是才需要触发响应式
    const res = target.add(key)
    if (!hadKey) {
      // 调用trigger触发依赖更新，执行操作类型是ADD
      trigger(target, key, 'ADD')
    }
    return res
  },
  //   set delete
  delete(key) {
    // this仍是代理对象，通过raw获取原始对象
    const target = this.raw
    // 如果key 存在于 Set 中，才能触发trigger（与 add 刚好相反）
    const hadKey = target.has(key)
    const res = target.add(key)

    if (hadKey) {
      // 调用trigger触发依赖更新，执行操作类型是ADD
      trigger(target, key, 'DELETE')
    }
    return res
  },
  get(key) {
    // 获取原始对象
    const target = this.raw
    // 判断key是否存在
    const had = target.has(key)
    // 收集依赖
    track(target, key)
    if (had) {
      //读取 map.get数据，如果它是对象
      //返回 reactive 包装后的响应式数据
      const res = target.get(key)
      return typeof res === 'object' ? reactive(res) : res
    }
  },
  set(key, newValue) {
    //获取原始对象
    const target = this.raw
    //获取当前set中是否存在key,
    const had = target.has(key)
    // 获取原始数据，如果是响应式数据身上会有raw属性.如果不是响应式数据直接获取原始数据
    const rawValue = newValue.raw || newValue
    // 获取旧值
    const oldValue = target.get(key)
    // 设置新值
    target.set(key, rawValue)
    if (!had) {
      trigger(target, key, 'ADD')
    } else if (
      oldValue !== newValue &&
      (oldValue === oldValue || newValue === newValue)
    ) {
      trigger(target, key, 'SET')
    }

    // return res
  },
  forEach(callback, thisArg) {
    // 取得原始对象
    const target = this.raw
    // 与ITERATOR_KEY建立联系
    track(target, ITERATOR_KEY)
    // 由于map类型effect中执行 foreach时。会直接进入该函数，所以需要在这里进行深度代理
    const wrap = (val) => {
      return typeof val === 'object' ? reactive(val) : val
    }

    // 通过原始数据对象调用 forEach，吧 callback传回去
    target.forEach((v, k) => {
      // map类型 如果k、v 是对象类型，对其使用reactive代理
      callback.call(thisArg, wrap(v), wrap(k), this)
    })
  },
  [Symbol.iterator]: iteratorMethod,
  entries: iteratorMethod,
  values: valuesIterationMethod,
  keys: keysIterationMethod,
}

// 抽离iterator给[Symbol.iterator] 和 entries 使用
function iteratorMethod() {
  // 获取原始对象
  const target = this.raw
  // 获取原对象的 iterator 对象
  const itr = target[Symbol.iterator]()

  // 定义wrap 判定对象深度监听
  const wrap = (val) =>
    typeof val === 'object' && val !== null ? reactive(val) : val
  track(target, ITERATOR_KEY)
  return {
    next() {
      // .next() 迭代器协议  [Symbol.iterator]() 可迭代协议
      const { value, done } = itr.next()
      return {
        value: value ? [wrap(value[0]), wrap(value[1])] : value,
        done,
      }
    },
    // 实现可迭代协议
    [Symbol.iterator]() {
      return this
    },
  }
}

// values()
function valuesIterationMethod() {
  // 获取原始类型
  const target = this.raw
  // 通过 target.values 获取原始数据类型
  const itr = target.values()

  track(target, ITERATOR_KEY)

  // 深度代理
  const wrap = (val) => (typeof val === 'object' ? reactive(val) : val)

  return {
    next() {
      const { value, done } = itr.next()
      return {
        value: wrap(value),
        done,
      }
    },
    [Symbol.iterator]() {
      return this
    },
  }
}
// keys()
function keysIterationMethod() {
  // 获取原始类型
  const target = this.raw
  // 通过 target.values 获取原始数据类型
  const itr = target.keys()

  // 通过 ITERATOR_KEY 收集依赖在SET时 会被trigger触发。
  // track(target, ITERATOR_KEY)
  // 对于keys来说它触发trigger的时机只需要关注主键变化而不是值的变化。
  // 所以另外定义一个主键在bucket存入keys触发的依赖
  track(target, MAP_KEY_ITERATER_KEY)

  // 深度代理
  const wrap = (val) => (typeof val === 'object' ? reactive(val) : val)

  return {
    next() {
      const { value, done } = itr.next()
      return {
        value: wrap(value),
        done,
      }
    },
    [Symbol.iterator]() {
      return this
    },
  }
}

// 创建 reactive
// isShallow:控制深浅响应式 isReadonly:控制只读和浅只读
function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    // 读取时添加依赖
    get(target, key, receiver) {
      // 读取的是 raw 返回原对象
      if (key === 'raw') return target
      if (key === 'size') {
        track(target, ITERATOR_KEY)
        return Reflect.get(target, key, target)
      }

      return mutableInstrumentations[key]
      //   return Reflect.get(mutableInstrumentations, key)
      // return target[key].bind(target)
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

const obj = reactive(
  new Map([
    ['key', 1],
    ['da', 32],
    ['gakey', 5],
  ])
)
// const obj = reactive([45, 2, 3])
const dom = document.querySelector('#app')

effect(() => {
  // obj.forEach((item, index, target) => {
  //   console.log(item, 'for循环')
  // })
  let str = ''
  for (const value of obj.keys()) {
    console.log(value, 'foof调用')
  }
  dom.textContent = str
})
obj.set('da', 100)

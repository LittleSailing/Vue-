import { MyEffect } from './01_effect.js'
const data = { foo: 1 }
const { obj, track, trigger, effect } = MyEffect(data)

// 创建 traverse 递归读取
function traverse(value, seen = new Set()) {
  // 读取是原始值，null，或者已经被读取过了什么都不做
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return
  }
  seen.add(value)
  for (const k in value) {
    traverse(value[k], seen)
  }
  return value
}

let finalData
watch(
  () => obj.foo,
  async (oldValue, newValue, onInvalidate) => {
    // console.log(obj.foo, '值变了', oldValue, newValue)
    let expired = false
    onInvalidate(() => {
      expired = true
    })
    const res = await new Promise((resolve) => {
      setTimeout(() => {
        resolve('ok')
      }, 5000)
    })
    finalData = res
  }
)

function watch(source, cb, option) {
  let getter
  // 是函数直接给到getter，不是函数用 traverse 递归读取
  if (typeof source === 'function') {
    getter = source
  } else {
    getter = () => traverse(source)
  }
  // 存储  新 旧  effect
  let oldValue, newValue
  // 存储过期回调
  let cleanup
  function onInvalidate(fn) {
    cleanup = fn
  }
  // 单独封装watch effect和cb方法
  const job = () => {
    // trigger 再次调用时获得新值
    newValue = effectFn()
    if (cleanup) {
      cleanup()
    }
    // 返回新值与旧值
    cb(oldValue, newValue, onInvalidate)
    //再次将新值变为旧值
    oldValue = newValue
  }

  // effect 回调
  const effectFn = effect(() => getter(), {
    // 开启懒加载，拿到 effectfn 返回的 effect
    lazy: true,
    scheduler: () => {
      // 在调度中判断 flush 是否为 post ，如果：是，放到微任务队列执行
      if (option?.flush === 'post') {
        const p = Promise.resolve()
        p.then(job)
      } else {
        job()
      }
    },
  })

  // immediate 存在立即执行 job
  if (option?.immediate) {
    job()
  } else {
    //  第一次调用 effect 获取副作用函数的返回值
    oldValue = effectFn()
  }
}
